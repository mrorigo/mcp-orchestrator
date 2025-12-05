import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { z } from "zod";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as http from 'http';
import * as crypto from 'crypto';
import {
    OrchestratorConfig,
    ServerConfig,
    HealthCheckResult
} from "./types";
import { ToolRegistry } from "./registry";
import { MCPConnectionError, MCPToolCallError } from "./errors";
import { EventEmitter } from "events";
import { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { LLMProvider } from './llm/types';
import { SamplingClient } from './sampling/client';
import { SamplingProxy, createSamplingProxy } from './sampling/proxy';
import { SamplingSecurityManager } from './sampling/security';
import {
    SamplingCreateMessageRequest,
    SamplingResult,
    SamplingOptions,
    SamplingCapabilities,
    SamplingCapabilityError,
    SamplingRejectedError,
    ModelPreferences,
    SamplingCreateMessageRequestSchema
} from './sampling/types';
import { CodeExecutor } from './codemode/executor';
import { APIGenerator } from './codemode/api-generator';
import {
    CodeModeOptions,
    CodeExecutionResult,
    CodeGenerationOptions
} from './codemode/types';
import {
    CODE_MODE_SYSTEM_PROMPT,
    buildCodeGenerationPrompt,
    extractCodeFromResponse
} from './codemode/prompts';

export class MCPOrchestrator extends EventEmitter {
    public tools: ToolRegistry;
    private clients: Map<string, Client>;
    private config: OrchestratorConfig;
    public llm: LLMProvider;
    private samplingClients: Map<string, SamplingClient>;
    private samplingCapabilities: Map<string, SamplingCapabilities>;
    private defaultSamplingOptions: SamplingOptions;
    private serverSession?: Server;
    private securityManager: SamplingSecurityManager;
    private httpServer?: http.Server;
    private apiGenerator: APIGenerator;

    constructor(config: OrchestratorConfig) {
        super();
        this.config = config;
        this.tools = new ToolRegistry();
        this.clients = new Map();
        this.samplingClients = new Map();
        this.samplingCapabilities = new Map();
        this.llm = config.llm;
        this.defaultSamplingOptions = config.samplingOptions || {};
        this.securityManager = new SamplingSecurityManager({
            // requireApproval is handled per-request in SamplingOptions, not in constructor
        });
        this.apiGenerator = new APIGenerator(this);

        if (config.connectionOptions?.autoConnect) {
            this.connect().catch(err => {
                console.error("Failed to auto-connect:", err);
            });
        }
    }

    async connect() {
        const promises = Object.entries(this.config.servers).map(([name, config]) =>
            this.connectToServer(name, config)
        );
        await Promise.all(promises);
    }

    private async connectToServer(name: string, config: ServerConfig) {
        try {
            let transport;
            if (config.command) {
                transport = new StdioClientTransport({
                    command: config.command,
                    args: config.args,
                    env: config.env
                });
            } else if (config.url) {
                // Create the transport URL pointing to the /mcp endpoint
                const mcpUrl = new URL('/mcp', config.url);

                // Prepare request initialization with headers if provided
                const requestInit: RequestInit = {};

                // Add authentication headers if provided in config
                if (config.headers) {
                    requestInit.headers = {
                        ...config.headers
                    };
                }

                transport = new StreamableHTTPClientTransport(mcpUrl, {
                    requestInit
                });
            } else {
                throw new Error(`Invalid server config for ${name}: missing command or url`);
            }

            const client = new Client({
                name: "mcp-orchestrator",
                version: "0.1.0",
            }, {
                capabilities: {
                    sampling: {},
                }
            });

            // Register sampling handler for this client (so sub-server can request sampling)
            const SamplingCreateMessageJsonRpcSchema = z.object({
                method: z.literal("sampling/createMessage"),
                params: SamplingCreateMessageRequestSchema,
            });

            client.setRequestHandler(
                SamplingCreateMessageJsonRpcSchema,
                async (request) => {
                    return this.handleSubSampling(request.params) as any;
                }
            );

            await client.connect(transport);
            this.clients.set(name, client);

            // Initialize sampling client for this server connection
            const samplingClient = new SamplingClient(client);
            this.samplingClients.set(name, samplingClient);

            // Check and store sampling capabilities
            try {
                const capabilities = await samplingClient.checkSamplingCapabilities();
                this.samplingCapabilities.set(name, capabilities);
            } catch (error) {
                console.warn(`Sampling capabilities check failed for ${name}:`, error);
                this.samplingCapabilities.set(name, {});
            }

            this.emit('server:connected', { serverName: name });

            // Discover tools immediately upon connection
            await this.discoverToolsForServer(name, client);

        } catch (error: any) {
            const mcpError = new MCPConnectionError(name, error.message);
            this.emit('server:error', { serverName: name, error: mcpError });
            throw mcpError;
        }
    }

    private async discoverToolsForServer(serverName: string, client: Client) {
        try {
            const result = await client.listTools() as ListToolsResult;
            for (const tool of result.tools) {
                this.tools.register(serverName, tool);
            }
        } catch (error) {
            console.error(`Failed to discover tools for ${serverName}:`, error);
        }
    }

    async disconnect() {
        for (const [name, client] of this.clients.entries()) {
            try {
                await client.close();
                this.tools.unregisterServer(name);
                this.samplingClients.delete(name);
                this.samplingCapabilities.delete(name);
                this.emit('server:disconnected', { serverName: name, reason: 'Manual disconnect' });
            } catch (error) {
                console.error(`Error disconnecting ${name}:`, error);
            }
        }
        this.clients.clear();
        this.tools.clear();

        if (this.serverSession) {
            await this.serverSession.close();
        }

        if (this.httpServer) {
            this.httpServer.close();
        }
    }

    async callTool<T = any>(name: string, args: any): Promise<T> {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool ${name} not found`);
        }

        const client = this.clients.get(tool.serverName);
        if (!client) {
            throw new MCPConnectionError(tool.serverName, "Client not connected");
        }

        try {
            const result = await client.callTool({
                name: tool.name,
                arguments: args
            });

            // MCP result content is an array of Content objects (TextContent | ImageContent | EmbeddedResource)
            // For simplicity, we'll try to parse the first text content as JSON if possible, or return the raw content
            // But typically tool calls return structured data. 
            // The SDK types might define result as { content: ... }

            // If the tool returns a JSON string in text, we might want to parse it?
            // Or if the tool returns a direct object?
            // Standard MCP `callTool` returns `CallToolResult` which has `content`.

            return result as unknown as T;
        } catch (error: any) {
            throw new MCPToolCallError(name, error, true, error.code);
        }
    }

    /**
     * Orchestrator-level sampling - main API for LLM sampling
     */
    async sample(
        messages: SamplingCreateMessageRequest['messages'],
        options?: SamplingOptions
    ): Promise<SamplingResult> {
        // Merge default options with provided options
        const mergedOptions = { ...this.defaultSamplingOptions, ...options };
        mergedOptions.origin = mergedOptions.origin || 'orchestrator';

        // Try to use MCP sampling if supported by any connected client
        const primaryClient = this.getPrimarySamplingClient();

        if (primaryClient) {
            try {
                const request: SamplingCreateMessageRequest = {
                    messages,
                    systemPrompt: mergedOptions.systemPrompt,
                    maxTokens: mergedOptions.maxTokens,
                    temperature: mergedOptions.temperature,
                    stopSequences: mergedOptions.stopSequences,
                    modelPreferences: mergedOptions.modelPreferences,
                    tools: mergedOptions.tools,
                    toolChoice: mergedOptions.toolChoice,
                };

                // Use MCP sampling protocol
                if (mergedOptions.tools && mergedOptions.toolChoice) {
                    const toolRequest = { ...request, tools: mergedOptions.tools } as any;
                    return await primaryClient.createMessageWithTools(toolRequest, mergedOptions);
                } else {
                    return await primaryClient.createMessage(request, mergedOptions);
                }
            } catch (error: any) {
                // If MCP sampling fails, fallback to direct LLM provider
                console.warn('MCP sampling failed, falling back to direct LLM:', error.message);
            }
        }

        // Fallback to direct LLM provider usage
        return await this.fallbackSampling(messages, mergedOptions);
    }

    /**
     * Get sampling capabilities for a specific server
     */
    getSamplingCapabilities(serverName?: string): SamplingCapabilities {
        if (serverName) {
            return this.samplingCapabilities.get(serverName) || {};
        }

        // Return combined capabilities from all servers
        const combinedCapabilities: SamplingCapabilities = {
            sampling: false,
            samplingTools: false,
        };

        for (const capabilities of this.samplingCapabilities.values()) {
            if (capabilities.sampling) combinedCapabilities.sampling = true;
            if (capabilities.samplingTools) combinedCapabilities.samplingTools = true;
        }

        return combinedCapabilities;
    }

    /**
     * Create a sampling proxy for a sub-server
     */
    createSamplingProxy(serverName: string, options?: SamplingOptions): SamplingProxy {
        if (!this.llm) {
            throw new Error('No LLM provider configured');
        }

        const mergedOptions = { ...this.defaultSamplingOptions, ...options };
        mergedOptions.origin = mergedOptions.origin || serverName;

        return createSamplingProxy(this.llm, mergedOptions.origin || serverName, mergedOptions);
    }

    /**
     * Set default sampling options for the orchestrator
     */
    setDefaultSamplingOptions(options: SamplingOptions): void {
        this.defaultSamplingOptions = { ...this.defaultSamplingOptions, ...options };
    }

    getServerStatus(name: string): 'connected' | 'disconnected' {
        return this.clients.has(name) ? 'connected' : 'disconnected';
    }

    async checkHealth(): Promise<Record<string, HealthCheckResult>> {
        const results: Record<string, HealthCheckResult> = {};

        for (const [name, client] of this.clients.entries()) {
            try {
                // Simple ping by listing tools or resources to check responsiveness
                const start = Date.now();
                await client.listTools();
                const latency = Date.now() - start;

                results[name] = {
                    status: 'healthy',
                    latency,
                    toolCount: this.tools.filter(t => t.serverName === name).length
                };
            } catch (error: any) {
                results[name] = {
                    status: 'unhealthy',
                    error: error.message
                };
            }
        }

        return results;
    }

    /**
     * Enable the Orchestrator to act as an MCP server for sampling requests
     */
    async enableSamplingServer(mode: 'stdio' | 'http' | number = 'stdio', options: { enableSamplingTool?: boolean } = {}) {
        let transport: any;
        if (mode === 'stdio') {
            transport = new StdioServerTransport();
        } else {
            const port = typeof mode === 'number' ? mode : 3000;

            // Create HTTP transport
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => crypto.randomUUID(),
                enableJsonResponse: true,
                enableDnsRebindingProtection: false // For development/testing ease
            });

            // Create and start HTTP server
            this.httpServer = http.createServer(async (req, res) => {
                // CORS headers for browser clients
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                // Handle MCP requests
                // The transport expects requests to be at /mcp or similar, but handleRequest checks the path?
                // Actually handleRequest handles everything passed to it.
                // We'll mount it on /mcp to be safe/standard
                if (req.url?.startsWith('/mcp')) {
                    try {
                        await transport.handleRequest(req, res);
                    } catch (error) {
                        console.error('Error handling MCP request:', error);
                        if (!res.headersSent) {
                            res.writeHead(500);
                            res.end('Internal Server Error');
                        }
                    }
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            });

            await new Promise<void>((resolve) => {
                this.httpServer?.listen(port, () => {
                    console.error(`MCP Sampling Server listening on port ${port}`);
                    resolve();
                });
            });
        }

        this.serverSession = new Server({
            name: 'mcp-orchestrator',
            version: '0.1.0'
        }, {
            capabilities: {
                tools: {}
            }
        });

        // Register tool handlers
        this.serverSession.setRequestHandler(
            z.object({ method: z.literal("tools/list") }),
            async () => {
                const tools = [];
                if (options.enableSamplingTool) {
                    tools.push({
                        name: "sampling",
                        description: "Request LLM sampling from the orchestrator",
                        inputSchema: {
                            type: "object",
                            properties: {
                                messages: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            role: { type: "string", enum: ["user", "assistant"] },
                                            content: {
                                                anyOf: [
                                                    { type: "string" },
                                                    {
                                                        type: "object",
                                                        properties: {
                                                            type: { type: "string", const: "text" },
                                                            text: { type: "string" }
                                                        },
                                                        required: ["type", "text"]
                                                    }
                                                ]
                                            }
                                        },
                                        required: ["role", "content"]
                                    }
                                },
                                systemPrompt: { type: "string" },
                                maxTokens: { type: "number" },
                                temperature: { type: "number" },
                                modelPreferences: { type: "object" }
                            },
                            required: ["messages"]
                        }
                    });
                }
                return { tools };
            }
        );

        this.serverSession.setRequestHandler(
            z.object({
                method: z.literal("tools/call"),
                params: z.object({
                    name: z.string(),
                    arguments: z.record(z.unknown())
                })
            }),
            async (request) => {
                if (request.params.name === "sampling") {
                    // Validate arguments against schema manually or cast
                    // For now, we cast to SamplingCreateMessageRequest-like structure
                    const args = request.params.arguments as any;

                    // Adapt tool arguments to SamplingCreateMessageRequest
                    const samplingRequest: SamplingCreateMessageRequest = {
                        messages: args.messages,
                        systemPrompt: args.systemPrompt,
                        maxTokens: args.maxTokens,
                        temperature: args.temperature,
                        modelPreferences: args.modelPreferences
                    };

                    const result = await this.handleSubSampling(samplingRequest);

                    // Extract text from the structured content
                    const textContent = Array.isArray(result.content)
                        ? result.content.find(block => block.type === 'text')?.text || ''
                        : result.content.type === 'text' ? result.content.text : '';

                    return {
                        content: [{
                            type: "text",
                            text: textContent
                        }]
                    };
                }
                throw new Error(`Tool ${request.params.name} not found`);
            }
        );

        await this.serverSession.connect(transport);
        this.emit('sampling-server:started', { mode });
    }

    private async handleSubSampling(request: SamplingCreateMessageRequest): Promise<SamplingResult> {
        // 1. Security/Approval (spec HITL)
        // We don't have the origin in the request directly usually, but let's assume we can infer it or it's passed
        // For now, we'll use a default context
        const context = { origin: 'unknown-sub-server' };

        // In a real implementation, we might want to map the transport/connection to a server name

        const approval = await this.securityManager.requestApproval(request, {}, context);
        if (!approval.approved) {
            throw new SamplingRejectedError(approval.reason || 'Policy violation');
        }

        // 2. Format Prompt (spec: messages + systemPrompt + includeContext)
        const prompt = this.formatSamplingPrompt(request);

        // 3. Map modelPreferences (spec hints → LLM model)
        const llmOptions = this.mapModelPreferences(request.modelPreferences || {});

        // 4. Call LLM
        let content: string;
        // Note: Structured output (schema) is not yet standard in SamplingCreateMessageRequest in our types
        // but if it were, we would handle it here.

        content = await this.llm.generate({
            prompt,
            systemPrompt: request.systemPrompt,
            maxTokens: request.maxTokens,
            temperature: request.temperature,
            ...llmOptions
        });

        // 5. Return spec response - MCP SDK compliant
        return {
            role: 'assistant',
            content: {
                type: 'text',
                text: content
            },
            model: this.getLLMModelName(),
            stopReason: 'stop',
            // usage: { ... } // Add usage if available from LLM provider
        };
    }

    private formatSamplingPrompt(request: SamplingCreateMessageRequest): string {
        const messagesText = request.messages.map(m => {
            let content = '';
            if (typeof m.content === 'string') {
                content = m.content;
            } else if (typeof m.content === 'object' && m.content !== null) {
                if ('text' in m.content) {
                    content = m.content.text;
                } else if ('type' in m.content && m.content.type === 'image') {
                    content = '[Image Content]';
                }
            }
            return `${m.role.toUpperCase()}: ${content}`;
        }).join('\n\n');
        return request.systemPrompt ? `${request.systemPrompt}\n\n${messagesText}` : messagesText;
    }

    private mapModelPreferences(prefs: ModelPreferences) {
        // Simple mapping: use the first hint if available
        if (prefs.hints?.[0]) {
            const hint = prefs.hints[0];
            const modelName = typeof hint === 'string' ? hint : hint.name;
            return modelName ? { model: modelName } : {};
        }
        return {};
    }

    /**
     * Get the primary sampling client (first one that supports sampling)
     */
    private getPrimarySamplingClient(): SamplingClient | null {
        for (const [name, capabilities] of this.samplingCapabilities.entries()) {
            if (capabilities.sampling) {
                const client = this.samplingClients.get(name);
                if (client) return client;
            }
        }
        return null;
    }

    /**
     * Fallback sampling using direct LLM provider
     */
    private async fallbackSampling(
        messages: SamplingCreateMessageRequest['messages'],
        options: SamplingOptions
    ): Promise<SamplingResult> {
        if (!this.llm) {
            throw new SamplingCapabilityError('sampling and no LLM provider available');
        }

        // Convert MCP messages to LLM provider format
        const prompt = this.convertMessagesToPrompt(messages, options.systemPrompt);

        try {
            const content = await this.llm.generate({
                prompt,
                systemPrompt: options.systemPrompt,
                maxTokens: options.maxTokens,
                temperature: options.temperature,
            });

            return {
                role: 'assistant',
                content: {
                    type: 'text',
                    text: content
                },
                model: this.getLLMModelName(),
                stopReason: 'stop',
            };
        } catch (error: any) {
            throw new Error(`Fallback sampling failed: ${error.message}`);
        }
    }

    private convertMessagesToPrompt(messages: SamplingCreateMessageRequest['messages'], systemPrompt?: string): string {
        const formattedMessages = messages.map(msg => {
            const role = msg.role === 'assistant' ? 'Assistant' : 'User';
            return `${role}: ${msg.content}`;
        });

        if (systemPrompt) {
            return `${systemPrompt}\n\n${formattedMessages.join('\n\n')}`;
        }
        return formattedMessages.join('\n\n');
    }

    private getLLMModelName(): string {
        if ('model' in this.llm) {
            return (this.llm as any).model || 'unknown';
        }
        return 'unknown';
    }

    /**
     * Execute TypeScript code in a sandboxed environment with access to MCP tools
     */
    async executeCode(
        code: string,
        options?: CodeModeOptions
    ): Promise<CodeExecutionResult> {
        const toolsAPI = this.apiGenerator.generateToolsAPI();
        const executor = new CodeExecutor(toolsAPI, options || {});
        return executor.execute(code);
    }

    /**
     * Generate and execute code using LLM
     */
    async generateAndExecute(
        prompt: string,
        options?: CodeGenerationOptions
    ): Promise<CodeExecutionResult> {
        if (!this.llm) {
            throw new Error('No LLM provider configured for code generation');
        }

        // Generate TypeScript API context
        const apiContext = this.apiGenerator.generateTypeDefinitions();

        // Build full prompt
        const fullPrompt = buildCodeGenerationPrompt(apiContext, prompt, options);

        // Generate code
        let codeResponse = await this.llm.generate({
            prompt: fullPrompt,
            systemPrompt: options?.systemPrompt || CODE_MODE_SYSTEM_PROMPT,
            ...options?.llmOptions
        });

        // Extract code from response (handles markdown code blocks)
        let code = extractCodeFromResponse(codeResponse);

        // Execute with retries
        let lastError: string | undefined;
        const maxRetries = options?.maxRetries ?? 2;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const result = await this.executeCode(code, options);

            if (result.success) {
                // Add the generated code to the result
                return { ...result, code };
            }

            lastError = result.error;

            // If failed and retries remain, ask LLM to fix
            if (attempt < maxRetries) {
                const fixPrompt = `The previous code failed with this error:

${result.error}

Previous code:
\`\`\`typescript
${code}
\`\`\`

Please fix the code to handle this error. Output ONLY the corrected code.`;

                codeResponse = await this.llm.generate({
                    prompt: fixPrompt,
                    systemPrompt: options?.systemPrompt || CODE_MODE_SYSTEM_PROMPT,
                    ...options?.llmOptions
                });

                code = extractCodeFromResponse(codeResponse);
            }
        }

        throw new Error(`Code execution failed after ${maxRetries} retries: ${lastError}`);
    }
}
