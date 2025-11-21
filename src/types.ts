import { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface RegisteredTool extends Tool {
    serverName: string;
}

export interface ServerConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    auth?: {
        token?: string;
    };
}

export interface OrchestratorConfig {
    servers: Record<string, ServerConfig>;
    connectionOptions?: {
        autoConnect?: boolean;
        reconnect?: boolean;
        reconnectDelay?: number;
        maxReconnectAttempts?: number;
    };
    llm?: any; // To be defined properly in llm/types.ts
}

export interface HealthCheckResult {
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency?: number;
    toolCount?: number;
    error?: string;
}
