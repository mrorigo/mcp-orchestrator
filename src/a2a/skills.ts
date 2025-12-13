import { MCPOrchestrator } from "../orchestrator";
import { SkillHandler, SkillResult } from "./types";
import { RequestContext } from "@a2a-js/sdk/server";

/**
 * Creates a handler that exposes a specific MCP tool as an A2A skill.
 * The user message text is assumed to be a JSON string of arguments, 
 * or if not JSON, mapped to a default argument if provided.
 */
export function createToolHandler(
    toolName: string,
    argMapper?: (text: string) => unknown
): SkillHandler {
    return async (ctx: RequestContext, orchestrator: MCPOrchestrator): Promise<SkillResult> => {
        const userMessage = ctx.userMessage;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const textPart = userMessage.parts.find((p: any) => p.kind === 'text');
        const text = textPart && textPart.kind === 'text' ? textPart.text : '';

        let args: unknown;

        if (argMapper) {
            args = argMapper(text);
        } else {
            try {
                // simple heuristic: if it looks like JSON, parse it
                if (text.trim().startsWith('{')) {
                    args = JSON.parse(text);
                } else {
                    // Fallback
                    args = { input: text };
                }
            } catch {
                throw new Error(`Failed to parse arguments for tool ${toolName}. Please provide valid JSON or use a custom argument mapper.`);
            }
        }

        const result = await orchestrator.callTool(toolName, args);

        // Convert MCP result to string
        let content = '';
        if (typeof result === 'string') {
            content = result;
        } else {
            content = JSON.stringify(result, null, 2);
        }

        return { content };
    };
}

/**
 * Creates a handler that uses the Orchestrator's Code Mode (generateAndExecute)
 */
export function createCodeModeHandler(
    systemPrompt?: string
): SkillHandler {
    return async (ctx: RequestContext, orchestrator: MCPOrchestrator): Promise<SkillResult> => {
        const userMessage = ctx.userMessage;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const textPart = userMessage.parts.find((p: any) => p.kind === 'text');
        const text = textPart && textPart.kind === 'text' ? textPart.text : '';

        if (!text) {
            return { content: "No input provided." };
        }

        // Use generateAndExecute
        const result = await orchestrator.generateAndExecute(text, {
            systemPrompt
        });

        if (!result.success) {
            throw new Error(`Code execution failed: ${result.error}`);
        }

        // Format the output
        let content = `Execution Successful.\n\nCode Generated:\n\`\`\`typescript\n${result.code}\n\`\`\`\n\nResult:\n${JSON.stringify(result.result, null, 2)}`;

        const anyResult = result as unknown as { logs?: string[] };
        if (anyResult.logs && anyResult.logs.length > 0) {
            content += `\n\nLogs:\n${anyResult.logs.join('\n')}`;
        }

        return { content };
    };
}
