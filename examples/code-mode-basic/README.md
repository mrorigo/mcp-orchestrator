# Code Mode Examples

This directory contains examples demonstrating the code mode feature of mcp-orchestrator.

## Basic Example

The basic example shows:
- Direct code execution with `executeCode()`
- Multi-step data processing
- LLM-generated code with `generateAndExecute()`

```bash
cd examples/code-mode-basic
OPENAI_API_KEY=your-key npm start
```

## What is Code Mode?

Instead of calling MCP tools directly, code mode lets LLMs write TypeScript code that calls your tools. This is better for:

- **Complex operations**: LLMs are trained on millions of lines of real code
- **Multi-step workflows**: Chain tool calls without LLM round-trips
- **Debugging**: Generated code can be inspected and reused
- **Efficiency**: Reduced token usage for complex tasks

## How It Works

1. **Tools → TypeScript API**: MCP tools are converted to a TypeScript API
2. **LLM writes code**: The LLM generates code using this API
3. **Sandbox execution**: Code runs in a secure VM with only tool access
4. **Results returned**: Console output and return values go back to the LLM
