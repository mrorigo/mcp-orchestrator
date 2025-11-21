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

export class MCPOrchestrator extends EventEmitter {
    public tools: ToolRegistry;
    private clients: Map<string, Client>;
    private config: OrchestratorConfig;
    public llm: LLMProvider; 

    constructor(config: OrchestratorConfig) {
        super();
        this.config = config;
        this.tools = new ToolRegistry();
        this.clients = new Map();
        this.llm = config.llm;

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
                    // Client capabilities
                }
            });

            await client.connect(transport);
            this.clients.set(name, client);
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
}
