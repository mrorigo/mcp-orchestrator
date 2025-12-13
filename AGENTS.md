# Agents in MCP Orchestrator

Agents in MCP Orchestrator are composable execution units that combine LLM capabilities with MCP tool access to perform specialized tasks. They enable domain-specific "experts" by orchestrating tools and reasoning in structured workflows.

## Creating an Agent

Agents extend the base orchestrator with predefined execution patterns and domain knowledge:

```typescript
import { BaseAgent } from 'mcp-orchestrator/patterns';

class DataAnalystAgent extends BaseAgent {
  async analyze(filePath: string) {
    // Domain-specific workflow
    const data = await this.callTool('read_file', { path: filePath });
    return this.llm.generateStructured({
      schema: z.object({ summary: z.string(), insights: z.array(z.string()) }),
      prompt: `Analyze this data: ${JSON.stringify(data)}`
    });
  }
}
```

## Agent Patterns

### Sequential Execution
Chain tools and LLM calls in order:

```typescript
const result = await orchestrator.execute('sequential', {
  steps: [
    { tool: 'list_directory', params: { path: './data' } },
    { llm: { prompt: 'Summarize these files', schema: summarySchema } }
  ]
});
```

### Parallel Execution
Run multiple tools concurrently:

```typescript
const results = await orchestrator.execute('parallel', {
  tasks: [
    { tool: 'search_files', params: { pattern: 'error' } },
    { tool: 'run_command', params: { cmd: 'ps aux' } }
  ]
});
```

### Conditional Execution
Branch based on results:

```typescript
const result = await orchestrator.execute('conditional', {
  condition: { tool: 'check_status', threshold: 0.8 },
  ifTrue: { llm: { prompt: 'Process success result' } },
  ifFalse: { llm: { prompt: 'Handle failure case' } }
});
```

### Retry Logic
Automatic retry on failures:

```typescript
const result = await orchestrator.execute('retry', {
  task: { tool: 'unreliable_api' },
  maxAttempts: 3,
  backoff: 'exponential'
});
```

## Best Practices

- **Modular Design**: Create focused agents for specific domains
- **Error Handling**: Always include retry patterns for unreliable tools
- **Type Safety**: Use generated types for tool parameters
- **Testing**: Test agents with mocked MCP servers using the test utilities
- **Monitoring**: Log execution traces for debugging

## Example Agents

- **CodeReviewer**: Analyzes code quality, runs tests, suggests improvements
- **DataProcessor**: Ingests files, validates schema, generates reports
- **APITester**: Calls APIs, validates responses, generates documentation
- **DevOpsAgent**: Manages infrastructure, monitors health, handles deployments

See the `examples/` directory for complete implementations.

## Using Saved Snippets

Agents can utilize tools created via the Snippet System just like any other MCP tool.

```typescript
class MyAgent extends BaseAgent {
  async performTask() {
    // Call a snippet-generated tool
    const result = await this.callTool('my-custom-snippet-tool', { 
      param: 'value' 
    });
    return result;
  }
}

## Exposing Agents via A2A

Turn any orchestrator-powered agent into an A2A-compliant server to enable multi-agent collaboration.

```typescript
import { McpA2aBridge } from 'mcp-orchestrator/a2a';

const bridge = new McpA2aBridge(orchestrator, { name: "AgentName" });

// Route A2A tasks to your agent logic, Code Mode, or specific tools
bridge.addCodeModeSkill({ 
    systemPrompt: "You are a specialized agent for..." 
});
```

See the main README or `examples/a2a_server.ts` for full details.