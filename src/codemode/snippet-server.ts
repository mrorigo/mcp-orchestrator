
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { SnippetManager } from './snippet-manager';
import { CodeExecutionResult, CodeModeOptions } from './types';

export type ExecutorFn = (code: string, options?: CodeModeOptions) => Promise<CodeExecutionResult>;

/**
 * Virtual MCP server that exposes snippets as tools
 */
export class SnippetVirtualServer {
    private snippetManager: SnippetManager;
    private executor: ExecutorFn;

    constructor(snippetManager: SnippetManager, executor: ExecutorFn) {
        this.snippetManager = snippetManager;
        this.executor = executor;
    }

    /**
     * List snippets as MCP tools
     */
    async listTools(): Promise<Tool[]> {
        const snippets = await this.snippetManager.listSnippets();

        return snippets.map(snippet => ({
            name: snippet.name,
            description: snippet.description,
            inputSchema: (snippet.inputSchema as { type: "object"; properties?: Record<string, object> }) || {
                type: 'object',
                properties: {},
            },
        }));
    }

    /**
     * Call a snippet tool
     */
    async callTool(name: string, args?: Record<string, unknown>): Promise<unknown> {
        const snippet = await this.snippetManager.getSnippet(name);
        if (!snippet) {
            throw new Error(`Snippet tool '${name}' not found`);
        }

        const result = await this.executor(snippet.code, {
            args: args || {},
            saveToSnippets: false, // Don't save snippets called from snippets
        });

        if (!result.success) {
            throw new Error(`Snippet execution failed: ${result.error || 'Unknown error'}`);
        }

        return result.result;
    }

    /**
     * Check if a tool exists
     */
    async hasTool(name: string): Promise<boolean> {
        return !!(await this.snippetManager.getSnippet(name));
    }
}
