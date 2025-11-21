# MCP Orchestrator

A lightweight TypeScript library for composing and orchestrating [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers into domain-specific "experts".

## Features

- **Type-Safe Tool Calling**: Runtime validation and optional static type generation.
- **Multi-Server Management**: Connect to multiple MCP servers via Stdio or SSE.
- **Structured LLM Outputs**: Built-in support for OpenAI and Anthropic with Zod schema validation.
- **Expert Composition**: Helper patterns for sequential, parallel, retry, and conditional execution.
- **Zero-Opinion Orchestration**: Use plain async/await or integrate with any workflow engine (Temporal, etc.).

## Installation

```bash
npm install mcp-orchestrator
```

## Basic Usage

```typescript
import { MCPOrchestrator } from 'mcp-orchestrator';
import { OpenAIProvider } from 'mcp-orchestrator/llm';

const orchestrator = new MCPOrchestrator({
  servers: {
    'filesystem': {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', './']
    }
  },
  llm: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })
});

await orchestrator.connect();

// Call a tool
const result = await orchestrator.callTool('list_directory', { path: './' });

// Generate structured output
const analysis = await orchestrator.llm.generateStructured({
  schema: z.object({ summary: z.string() }),
  prompt: `Analyze these files: ${JSON.stringify(result)}`
});
```

## Type Generation

Generate TypeScript types for your tools to get full IDE autocomplete and type safety.

### 1. Create a Configuration File

Create a `mcp-config.json` file that defines your servers. This file supports both `stdio` (command-line tools) and `sse` (remote HTTP) servers.

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"]
    },
    "github": {
      "url": "https://api.github.com/mcp",
      "auth": {
        "token": "YOUR_GITHUB_TOKEN"
      }
    },
    "aws-tools": {
      "command": "node",
      "args": ["./dist/index.js"],
      "env": {
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

### 2. Run the Generator

Run the CLI tool to connect to the servers, discover tools, and generate a TypeScript file with interfaces.

```bash
npx mcp-orchestrator --config mcp-config.json --output src/types/mcp-tools.ts
```

### 3. Use Generated Types

Import the generated types to ensure type safety when calling tools.

```typescript
import { MCPOrchestrator } from 'mcp-orchestrator';
import './types/mcp-tools'; // Load type augmentations

const orchestrator = new MCPOrchestrator({ /* ... */ });

// TypeScript will now validate arguments and return types!
const result = await orchestrator.callTool('aws_ec2_run_instances', {
  instanceType: 't3.medium', // Type-checked
  region: 'us-east-1'
});
```

## Expert Composition Patterns

The library provides helper functions to compose tools into complex workflows.

### Sequential Execution

Pass state through a series of steps.

```typescript
import { sequence } from 'mcp-orchestrator/patterns';

const result = await sequence([
  async (ctx) => {
    const data = await orchestrator.callTool('fetch_data', { id: ctx.id });
    return { ...ctx, data };
  },
  async (ctx) => {
    const analysis = await orchestrator.llm.generateStructured({
      schema: AnalysisSchema,
      prompt: `Analyze: ${JSON.stringify(ctx.data)}`
    });
    return { ...ctx, analysis };
  }
], { id: '123' });
```

### Parallel Execution

Run multiple independent tasks concurrently.

```typescript
import { parallel } from 'mcp-orchestrator/patterns';

const [users, posts] = await parallel([
  () => orchestrator.callTool('get_users', {}),
  () => orchestrator.callTool('get_posts', {})
]);
```

### Retry Logic

Automatically retry transient failures with backoff.

```typescript
import { retry } from 'mcp-orchestrator/patterns';

const result = await retry(
  () => orchestrator.callTool('flaky_api', {}),
  { 
    maxAttempts: 3, 
    backoff: 'exponential',
    initialDelay: 1000 
  }
);
```

## License

MIT
