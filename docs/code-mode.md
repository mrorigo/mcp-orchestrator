# Code Mode: A Better Way to Use MCP

Code mode is an innovative approach to using MCP tools where instead of direct tool calling, LLMs generate and execute TypeScript code that calls your tools.

## Why Code Mode?

### The Problem with Traditional Tool Calling

Most AI agents use MCP by directly exposing tools to the LLM through special "tool calling" tokens. This has limitations:

- **Limited training data**: LLMs have only seen synthetic tool-calling examples
- **Inefficient for multi-step operations**: Each tool call requires a full LLM round-trip
- **Struggles with complexity**: Complex tools and large tool sets confuse the LLM
- **Opaque execution**: Hard to debug or understand what the agent did

### The Code Mode Solution

LLMs are trained on millions of lines of real TypeScript code. Code mode leverages this by:

1. Converting MCP tools into a TypeScript API
2. Asking the LLM to write code using this API
3. Executing the code in a secure sandbox
4. Returning only the final results to the LLM

**Benefits:**
- ✅ **Better tool usage**: LLMs excel at writing code
- ✅ **More efficient**: Chain multiple tool calls without LLM round-trips
- ✅ **Reduced tokens**: Only final results feed back to the LLM
- ✅ **Inspectable**: Generated code can be logged, debugged, and reused
- ✅ **Handles complexity**: Works with many tools and complex operations

## Getting Started

### Basic Usage

```typescript
import { MCPOrchestrator } from 'mcp-orchestrator';
import { OpenAIProvider } from 'mcp-orchestrator/llm';

const orchestrator = new MCPOrchestrator({
  servers: {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', './']
    }
  },
  llm: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })
});

await orchestrator.connect();

// Let LLM generate and execute code
const result = await orchestrator.generateAndExecute(
  'List all TypeScript files and count them'
);

console.log(result.output); // Console logs from executed code
console.log(result.result); // Return value
```

### Direct Code Execution

You can also execute your own code directly:

```typescript
const code = `
  const files = await tools.list_directory({ path: './' });
  const tsFiles = files.content.filter(f => f.name.endsWith('.ts'));
  console.log('Found', tsFiles.length, 'TypeScript files');
  return tsFiles;
`;

const result = await orchestrator.executeCode(code, {
  timeout: 30000,
  requireApproval: false
});
```

## API Reference

### `executeCode(code, options?)`

Execute TypeScript code in a sandboxed environment with access to MCP tools.

**Parameters:**
- `code: string` - TypeScript code to execute
- `options?: CodeModeOptions` - Execution options

**Returns:** `Promise<CodeExecutionResult>`

**Example:**
```typescript
const result = await orchestrator.executeCode(`
  const data = await tools.fetch_data({ id: 123 });
  return data.value;
`);
```

### `generateAndExecute(prompt, options?)`

Generate code using LLM and execute it.

**Parameters:**
- `prompt: string` - Task description for the LLM
- `options?: CodeGenerationOptions` - Generation and execution options

**Returns:** `Promise<CodeExecutionResult>`

**Example:**
```typescript
const result = await orchestrator.generateAndExecute(
  'Find all JSON files and parse them',
  {
    maxRetries: 2,
    timeout: 30000,
    llmOptions: {
      temperature: 0.3
    }
  }
);
```

## Options

### `CodeModeOptions`

```typescript
interface CodeModeOptions {
  timeout?: number;           // Execution timeout in ms (default: 30000)
  maxRetries?: number;        // Max retries for invalid code (default: 2)
  requireApproval?: boolean;  // Require user approval before execution
  captureConsole?: boolean;   // Capture console output (default: true)
}
```

### `CodeGenerationOptions`

Extends `CodeModeOptions` with:

```typescript
interface CodeGenerationOptions extends CodeModeOptions {
  llmOptions?: GenerateOptions;  // Options for LLM provider
  systemPrompt?: string;         // Override default system prompt
  includeExamples?: boolean;     // Include few-shot examples
}
```

### `CodeExecutionResult`

```typescript
interface CodeExecutionResult {
  success: boolean;        // Whether execution was successful
  output: string[];        // Console.log outputs
  result?: any;            // Return value from the code
  error?: string;          // Error message if failed
  executionTime: number;   // Execution time in ms
  code?: string;           // Generated code (if applicable)
}
```

## How It Works

### 1. Tool API Generation

MCP tools are converted into a TypeScript API:

```typescript
// MCP Tool: list_directory
{
  name: "list_directory",
  description: "List files in a directory",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path" }
    }
  }
}

// Becomes TypeScript API:
interface ListDirectoryInput {
  /** Directory path */
  path: string;
}

declare const tools: {
  /**
   * List files in a directory
   * @param input.path - Directory path
   */
  list_directory: (input: ListDirectoryInput) => Promise<any>;
};
```

### 2. LLM Code Generation

The LLM receives:
- TypeScript API definitions
- Few-shot examples
- User's task description

And generates executable code:

```typescript
const files = await tools.list_directory({ path: './' });
const tsFiles = files.content.filter(f => f.name.endsWith('.ts'));
console.log('Found', tsFiles.length, 'TypeScript files');
return { count: tsFiles.length, files: tsFiles };
```

### 3. Sandboxed Execution

Code runs in a secure Node.js `vm` context:
- ✅ Access to tools via API
- ✅ Safe globals (Math, Date, JSON, etc.)
- ❌ No `process`, `require`, `__dirname`
- ❌ No file system access (except via tools)
- ❌ No network access (except via tools)

### 4. Results

Console output and return values are captured:

```typescript
{
  success: true,
  output: ['Found 42 TypeScript files'],
  result: { count: 42, files: [...] },
  executionTime: 123
}
```

## Security

### Sandbox Isolation

Code executes in a V8 isolate with:
- **Blocked globals**: `process`, `require`, `module`, `Buffer`
- **Timeout enforcement**: Configurable execution timeout
- **No network access**: Only via MCP tools
- **No file system access**: Only via MCP tools

### Approval Workflow

Require user approval before execution:

```typescript
const result = await orchestrator.executeCode(code, {
  requireApproval: true
});

// Approval events
orchestrator.on('code_approval_requested', (approval) => {
  console.log('Code needs approval:', approval.code);
  // Show UI to user, then:
  orchestrator.securityManager.approveRequest(approval.id);
});
```

### Best Practices

1. **Always set timeouts**: Prevent infinite loops
2. **Use approval for sensitive operations**: Especially with LLM-generated code
3. **Validate results**: Check execution results before using them
4. **Monitor console output**: Helps debug issues
5. **Start with low temperature**: For LLM code generation (0.2-0.3)

## Examples

### Example 1: Data Processing Pipeline

```typescript
const code = `
  // Fetch data
  const data = await tools.fetch_data({ source: 'api' });
  console.log('Fetched', data.length, 'records');
  
  // Transform
  const transformed = data.map(item => ({
    id: item.id,
    value: item.value * 2
  }));
  console.log('Transformed data');
  
  // Save
  await tools.save_data({ data: transformed });
  console.log('Saved', transformed.length, 'records');
  
  return { processed: transformed.length };
`;

const result = await orchestrator.executeCode(code);
```

### Example 2: File Analysis

```typescript
const result = await orchestrator.generateAndExecute(`
  Analyze the package.json file and return:
  - Package name and version
  - Total number of dependencies
  - List of the top 5 dependencies
`);

console.log(result.code);    // See what code was generated
console.log(result.result);  // Get the analysis
```

### Example 3: Multi-Tool Workflow

```typescript
const code = `
  // Step 1: List files
  const files = await tools.list_directory({ path: './src' });
  
  // Step 2: Read each TypeScript file
  const contents = [];
  for (const file of files.content) {
    if (file.name.endsWith('.ts')) {
      const content = await tools.read_file({ path: file.path });
      contents.push({ name: file.name, content });
    }
  }
  
  // Step 3: Analyze
  const totalLines = contents.reduce((sum, f) => 
    sum + f.content.split('\\n').length, 0
  );
  
  console.log('Analyzed', contents.length, 'files');
  console.log('Total lines:', totalLines);
  
  return { files: contents.length, lines: totalLines };
`;

const result = await orchestrator.executeCode(code);
```

## Comparison: Tool Calling vs Code Mode

| Aspect | Traditional Tool Calling | Code Mode |
|--------|-------------------------|-----------|
| **Training Data** | Synthetic examples | Millions of real code examples |
| **Multi-step Operations** | Multiple LLM round-trips | Single execution |
| **Token Usage** | High (all intermediate results) | Low (only final results) |
| **Debugging** | Opaque tool calls | Inspectable code |
| **Complex Tools** | Struggles | Handles well |
| **Execution Speed** | Slower (multiple round-trips) | Faster (single execution) |
| **Use Case** | Simple, single tool calls | Complex, multi-step workflows |

## When to Use Code Mode

**Use Code Mode when:**
- ✅ Task requires multiple tool calls
- ✅ Complex data transformation needed
- ✅ You want to inspect/reuse generated logic
- ✅ Working with many tools
- ✅ Performance matters (reduce token usage)

**Use Traditional Tool Calling when:**
- ✅ Single, simple tool call
- ✅ Real-time interaction needed
- ✅ Tool calling is well-supported by your LLM

## Troubleshooting

### Code Execution Fails

**Problem**: Generated code has syntax errors

**Solution**: 
- Lower LLM temperature (0.2-0.3)
- Use `maxRetries` option
- Check console output for hints

### Timeout Errors

**Problem**: Code execution times out

**Solution**:
- Increase timeout: `{ timeout: 60000 }`
- Check for infinite loops in generated code
- Optimize tool calls

### Tool Not Found

**Problem**: `tools.some_tool is not a function`

**Solution**:
- Verify tool is registered: `orchestrator.tools.list()`
- Check tool name spelling
- Ensure server is connected

### Security Errors

**Problem**: Code tries to access blocked globals

**Solution**:
- This is expected behavior (security feature)
- Use tools instead of direct access
- Modify prompt to use available tools

## Advanced Usage

### Custom System Prompts

```typescript
const result = await orchestrator.generateAndExecute(
  'Process the data',
  {
    systemPrompt: `You are a data processing expert.
    Write efficient, well-commented TypeScript code.
    Always handle errors gracefully.`
  }
);
```

### Retry Logic

```typescript
const result = await orchestrator.generateAndExecute(
  'Complex task',
  {
    maxRetries: 3,  // Will retry up to 3 times on failure
  }
);
```

### Combining with Sampling

```typescript
// Use code mode for data processing
const data = await orchestrator.executeCode(`
  const result = await tools.fetch_data({});
  return result;
`);

// Use sampling for analysis
const analysis = await orchestrator.sample([
  { role: 'user', content: `Analyze this data: ${JSON.stringify(data.result)}` }
]);
```

## Credits

Code mode is inspired by [Cloudflare's implementation](https://blog.cloudflare.com/code-mode/) for their Agents SDK. This implementation adapts the concept for the MCP ecosystem using Node.js `vm` module for sandboxing.
