import * as vm from 'vm';
import { CodeExecutorOptions, CodeExecutionResult, ToolsAPI } from './types';

/**
 * Executes TypeScript/JavaScript code in a sandboxed VM context
 * with access to MCP tools
 */
export class CodeExecutor {
    private context: vm.Context;
    private timeout: number;
    private captureConsole: boolean;
    private consoleOutput: string[] = [];

    constructor(toolsAPI: ToolsAPI, options: CodeExecutorOptions = {}) {
        this.timeout = options.timeout || 30000;
        this.captureConsole = options.captureConsole !== false;
        this.consoleOutput = [];

        // Create console proxy to capture output
        const consoleProxy = this.createConsoleProxy();

        // Create isolated context with restricted globals
        this.context = vm.createContext({
            // Provide tools API
            tools: toolsAPI,

            // Global arguments
            args: options.args || {},

            // Safe globals

            // Safe globals
            console: consoleProxy,
            Promise,
            setTimeout,
            setInterval,
            clearTimeout,
            clearInterval,

            // Math and basic utilities
            Math,
            Date,
            JSON,
            Array,
            Object,
            String,
            Number,
            Boolean,
            RegExp,
            Error,

            // Explicitly block dangerous globals
            process: undefined,
            require: undefined,
            __dirname: undefined,
            __filename: undefined,
            global: undefined,
            Buffer: undefined,
            module: undefined,
            exports: undefined,
        });
    }

    /**
     * Create a console proxy that captures output
     */
    private createConsoleProxy(): Console {
        const self = this;
        return {
            log(...args: unknown[]) {
                const message = args.map(arg =>
                    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                ).join(' ');
                self.consoleOutput.push(message);
            },
            error(...args: unknown[]) {
                const message = '[ERROR] ' + args.map(arg =>
                    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                ).join(' ');
                self.consoleOutput.push(message);
            },
            warn(...args: unknown[]) {
                const message = '[WARN] ' + args.map(arg =>
                    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                ).join(' ');
                self.consoleOutput.push(message);
            },
            info(...args: unknown[]) {
                const message = '[INFO] ' + args.map(arg =>
                    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                ).join(' ');
                self.consoleOutput.push(message);
            },
            debug(...args: unknown[]) {
                const message = '[DEBUG] ' + args.map(arg =>
                    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                ).join(' ');
                self.consoleOutput.push(message);
            },
        } as Console;
    }

    /**
     * Execute code in the sandbox
     */
    async execute(code: string): Promise<CodeExecutionResult> {
        this.consoleOutput = [];
        const startTime = Date.now();

        try {
            // Wrap code in async IIFE to support top-level await
            const wrappedCode = `
(async () => {
${code}
})()
`;

            // Compile the script
            const script = new vm.Script(wrappedCode, {
                filename: 'sandbox.js',
            });

            // Execute with timeout
            const result = await script.runInContext(this.context, {
                timeout: this.timeout,
            });

            const executionTime = Date.now() - startTime;

            return {
                success: true,
                output: this.consoleOutput,
                result,
                executionTime,
            };

        } catch (error: unknown) {
            const executionTime = Date.now() - startTime;

            // Sanitize error message and stack trace
            let errorMessage = error instanceof Error ? error.message : String(error);

            // Check for timeout
            if (errorMessage.includes('Script execution timed out')) {
                errorMessage = `Execution timed out after ${this.timeout}ms`;
            }

            // Remove internal VM paths from stack trace
            if (error instanceof Error && error.stack) {
                const stack = error.stack.split('\n')
                    .filter((line: string) => !line.includes('node:vm:') && !line.includes('node:internal'))
                    .join('\n');
                errorMessage = stack || errorMessage;
            }

            return {
                success: false,
                output: this.consoleOutput,
                error: errorMessage,
                executionTime,
            };
        }
    }

    /**
     * Get the current console output
     */
    getConsoleOutput(): string[] {
        return [...this.consoleOutput];
    }

    /**
     * Clear console output
     */
    clearConsoleOutput(): void {
        this.consoleOutput = [];
    }
}
