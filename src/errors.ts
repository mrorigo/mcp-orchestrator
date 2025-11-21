export class MCPError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MCPError';
    }
}

export class MCPToolCallError extends MCPError {
    constructor(
        public toolName: string,
        public cause: unknown,
        public retryable: boolean = false,
        public code?: string
    ) {
        super(`Tool call failed: ${toolName}`);
        this.name = 'MCPToolCallError';
    }
}

export class MCPConnectionError extends MCPError {
    constructor(public serverName: string, message: string) {
        super(`Connection error for server ${serverName}: ${message}`);
        this.name = 'MCPConnectionError';
    }
}

export class LLMParseError extends MCPError {
    constructor(
        public rawOutput: string,
        public zodErrors: unknown
    ) {
        super('Failed to parse LLM output');
        this.name = 'LLMParseError';
    }
}
