import { } from './types';

/**
 * System prompt for code mode LLM generation
 */
export const CODE_MODE_SYSTEM_PROMPT = `You are a code generation assistant that writes TypeScript code to accomplish tasks using available MCP tools.

IMPORTANT RULES:
1. Write clean, executable TypeScript code
2. Use async/await for all tool calls
3. All tools are available via the 'tools' object (e.g., await tools.list_directory({path: './'}))
4. Use console.log() to output results and progress
5. Return the final result at the end of your code
6. Handle errors gracefully with try/catch
7. Do NOT use require(), import, or any Node.js modules - only use the provided tools
8. Keep code simple and focused on the task

Your code will be executed in a sandboxed environment with access only to the tools provided.`;

/**
 * Few-shot examples for code generation
 */
export const CODE_MODE_EXAMPLES = `
EXAMPLE 1 - Simple tool usage:
Task: List all files in the current directory
Code:
\`\`\`typescript
const files = await tools.list_directory({ path: './' });
console.log('Found', files.length, 'files');
return files;
\`\`\`

EXAMPLE 2 - Multi-step operation:
Task: Find all TypeScript files and count them
Code:
\`\`\`typescript
const files = await tools.list_directory({ path: './' });
const tsFiles = files.filter(f => f.name.endsWith('.ts'));
console.log('Found', tsFiles.length, 'TypeScript files:');
tsFiles.forEach(f => console.log(' -', f.name));
return { count: tsFiles.length, files: tsFiles };
\`\`\`

EXAMPLE 3 - Error handling:
Task: Read a file safely
Code:
\`\`\`typescript
try {
  const content = await tools.read_file({ path: './README.md' });
  console.log('File read successfully');
  return content;
} catch (error) {
  console.error('Failed to read file:', error.message);
  return null;
}
\`\`\`
`;

/**
 * Build complete code generation prompt
 */
export function buildCodeGenerationPrompt(
    toolsAPI: string,
    userPrompt: string,
    options?: { includeExamples?: boolean }
): string {
    const parts: string[] = [];

    // Add tools API definitions
    parts.push('AVAILABLE TOOLS:');
    parts.push('```typescript');
    parts.push(toolsAPI);
    parts.push('```');
    parts.push('');

    // Add examples if requested
    if (options?.includeExamples !== false) {
        parts.push('EXAMPLES:');
        parts.push(CODE_MODE_EXAMPLES);
        parts.push('');
    }

    // Add user task
    parts.push('TASK:');
    parts.push(userPrompt);
    parts.push('');
    parts.push('Write TypeScript code to accomplish this task. Output ONLY the code, no explanations.');

    return parts.join('\n');
}

/**
 * Extract code from LLM response (handles markdown code blocks)
 */
export function extractCodeFromResponse(response: string): string {
    // Remove markdown code blocks if present
    const codeBlockRegex = /```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);

    if (match) {
        return match[1].trim();
    }

    // If no code block, return the whole response trimmed
    return response.trim();
}
