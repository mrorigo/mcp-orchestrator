import { GenerateOptions } from '../llm/types';

/**
 * Options for code mode execution
 */
export interface CodeModeOptions {
    /** Execution timeout in milliseconds (default: 30000) */
    timeout?: number;
    /** Maximum retries for invalid code (default: 2) */
    maxRetries?: number;
    /** Require user approval before execution */
    requireApproval?: boolean;
    /** Whitelist of allowed Node modules (future feature) */
    allowedModules?: string[];
    /** Capture console output (default: true) */
    captureConsole?: boolean;
}

/**
 * Result of code execution
 */
export interface CodeExecutionResult {
    /** Whether execution was successful */
    success: boolean;
    /** Console.log outputs captured during execution */
    output: string[];
    /** Return value from the code */
    result?: any;
    /** Error message if execution failed */
    error?: string;
    /** Execution time in milliseconds */
    executionTime: number;
    /** Generated code (if applicable) */
    code?: string;
}

/**
 * Options for code generation and execution
 */
export interface CodeGenerationOptions extends CodeModeOptions {
    /** Options for LLM provider */
    llmOptions?: GenerateOptions;
    /** Override default system prompt */
    systemPrompt?: string;
    /** Include few-shot examples in prompt */
    includeExamples?: boolean;
}

/**
 * Internal options for CodeExecutor
 */
export interface CodeExecutorOptions {
    timeout?: number;
    captureConsole?: boolean;
}

/**
 * Tools API object passed to sandbox
 */
export interface ToolsAPI {
    [toolName: string]: (input: any) => Promise<any>;
}
