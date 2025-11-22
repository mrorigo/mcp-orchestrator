import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
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
import {
    SamplingCreateMessageRequest,
    SamplingResult,
    SamplingOptions,
    SamplingCapabilities,
    SamplingCapabilityError
} from './sampling/types';

export class MCPOrchestrator extends EventEmitter {
    public tools: ToolRegistry;
    private clients: Map<string, Client>;
    private config: OrchestratorConfig;
    public llm: LLMProvider;
    private samplingClients: Map<string, SamplingClient>;
    private samplingCapabilities: Map<string, SamplingCapabilities>;
    private defaultSamplingOptions: SamplingOptions;

    constructor(config: OrchestratorConfig) {
        super();
        this.config = config;
        this.tools = new ToolRegistry();
        this.clients = new Map();
        this.samplingClients = new Map();
        this.samplingCapabilities = new Map();
        this.llm = config.llm;
        this.defaultSamplingOptions = config.samplingOptions || {};

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
                transport = new SSEClientTransport(new URL(config.url), {
                    eventSourceInit: {
                        // header auth not directly supported in EventSource standard, 
                        // but some polyfills or server implementations might handle it.
                        // For now, we assume URL param or standard SSE.
                        // If auth token is provided, it might need to be passed differently depending on the SDK version.
                    }
                });
            } else {
                throw new Error(`Invalid server config for ${name}: missing command or url`);
            }

            const client = new Client({
                name: "mcp-orchestrator",
                version: "0.1.0",
            }, {
                capabilities: {
                    // MCP sampling capabilities - use empty object for now
                    // This will be handled by the SamplingClient
                } as any
            });

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
                content,
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
}
