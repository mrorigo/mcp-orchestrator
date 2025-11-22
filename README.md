# MCP Orchestrator

A lightweight TypeScript library for composing and orchestrating [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers into domain-specific "experts".

## Features

- **Type-Safe Tool Calling**: Runtime validation and optional static type generation.
- **Multi-Server Management**: Connect to multiple MCP servers via Stdio or SSE.
- **Structured LLM Outputs**: Built-in support for OpenAI and Anthropic with Zod schema validation.
- **Dual-Level LLM Sampling**: Support for both orchestrator-level and sub-server LLM sampling via MCP protocol.
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

## Dual-Level LLM Sampling

The library supports **two levels of LLM sampling** through the Model Context Protocol (MCP):

### 1. Orchestrator-Level Sampling

Direct LLM sampling via MCP `sampling/createMessage` when supported by MCP clients.

```typescript
// Enable sampling with default options
const orchestrator = new MCPOrchestrator({
  servers: { /* your servers */ },
  llm: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }),
  samplingOptions: {
    maxTokens: 1000,
    temperature: 0.7,
    requireApproval: true, // Require user approval for sampling requests
    timeoutMs: 30000
  }
});

// Check sampling capabilities
const capabilities = orchestrator.getSamplingCapabilities();
console.log('Client supports sampling:', capabilities);

// Perform orchestrator-level sampling
const result = await orchestrator.sample(
  [
    { role: 'user', content: 'Analyze the benefits of MCP orchestration' }
  ],
  {
    systemPrompt: 'You are an expert in AI and distributed systems.',
    maxTokens: 500,
    origin: 'orchestrator'
  }
);

console.log('Sample result:', result);
```

### 2. Sub-Server Sampling via Proxy

Lightweight sampling proxy that forwards sub-server requests to the orchestrator's LLM provider.

```typescript
// Create sampling proxy for a sub-server
const expertProxy = orchestrator.createSamplingProxy('data-analyzer', {
  origin: 'data-expert',
  maxTokens: 300,
  requireApproval: false // Sub-server requests typically don't need approval
});

// Sub-server makes sampling request
const analysisResult = await expertProxy.createMessage({
  messages: [
    { role: 'user', content: 'Analyze this dataset for trends' },
    { role: 'assistant', content: 'I\'ll analyze the data for you.' }
  ],
  systemPrompt: 'You are a data analysis expert.',
  maxTokens: 400
});

// Structured sampling for type-safe results
const structuredResult = await expertProxy.createMessageStructured(
  {
    messages: [{ role: 'user', content: 'Provide analysis in JSON format' }],
    systemPrompt: 'Return structured analysis results.',
  },
  undefined,
  z.object({
    trends: z.array(z.string()),
    confidence: z.number(),
    recommendations: z.array(z.string())
  })
);
```

## Security & Trust Features

Built-in security and trust management for LLM sampling:

```typescript
import { SamplingSecurityManager, SecurityPolicy } from 'mcp-orchestrator/sampling';

// Configure security manager
const securityManager = new SamplingSecurityManager({
  maxQueueSize: 50,
  defaultRateLimit: {
    requestsPerMinute: 30,
    requestsPerHour: 500,
    requestsPerDay: 5000,
  }
});

// Add custom security policy
const costLimitPolicy: SecurityPolicy = {
  name: 'cost_limit_policy',
  description: 'Reject expensive requests',
  evaluate: async (request, options, context) => {
    const estimatedCost = estimateCost(request);
    if (estimatedCost > 1.00) {
      return { approved: false, reason: 'Cost exceeds limit' };
    }
    return { approved: true };
  }
};

securityManager.addPolicy(costLimitPolicy);

// Handle approval workflow (for UI integration)
securityManager.on('approval_requested', (approval) => {
  console.log('User approval needed:', approval.id);
  // Show approval dialog in your UI
});

// Check rate limits
const rateLimitStatus = securityManager.getRateLimitStatus('my-app');
console.log('Rate limit status:', rateLimitStatus);

// Access audit log
const auditLog = securityManager.getAuditLog({
  eventType: 'approved',
  startTime: Date.now() - 3600000 // Last hour
});
```

## Tool-Enabled Sampling

Support for LLM-to-tool reasoning loops when both client and server support it:

```typescript
// Define available tools for sampling
const tools = [
  {
    name: 'search_database',
    description: 'Search the database for information',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' }
      },
      required: ['query']
    }
  },
  {
    name: 'calculate_metrics',
    description: 'Calculate performance metrics',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'array' },
        operation: { type: 'string' }
      },
      required: ['data']
    }
  }
];

// Use tool-enabled sampling
const result = await orchestrator.sample(
  [
    { 
      role: 'user', 
      content: 'Find relevant data and calculate average performance' 
    }
  ],
  {
    tools,
    toolChoice: 'auto', // Let LLM choose which tools to use
    origin: 'analyst-expert'
  }
);

// The LLM will decide when to use tools and the system will handle the tool loop
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

## Best Practices

### Sampling Considerations

- **Cost Management**: Use security policies to limit expensive requests
- **User Approval**: Enable approval workflows for sensitive operations
- **Rate Limiting**: Implement appropriate rate limits to prevent abuse
- **Fallback Strategy**: Always provide fallback when MCP sampling isn't available

### Security Recommendations

- **Origin Tracking**: Use distinct origins for different components to track usage
- **Audit Logging**: Regularly review audit logs for unusual patterns
- **Policy Enforcement**: Implement content filtering and cost control policies
- **Timeout Handling**: Set appropriate timeouts to prevent hanging requests

### Tool-Enabled Sampling

- **Tool Design**: Keep tool schemas simple and well-documented
- **Error Handling**: Implement robust error handling for tool execution
- **Loop Prevention**: Set reasonable limits to prevent infinite tool loops
- **User Experience**: Provide clear feedback when tool-enabled sampling is used

## License

MIT
