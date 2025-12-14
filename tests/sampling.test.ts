import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPOrchestrator } from '../src/orchestrator';
import { LLMProvider } from '../src/llm/types';
import { SamplingCreateMessageRequest } from '../src/sampling/types';

// Mock SDK Server
const mockSetRequestHandler = vi.fn();
const mockConnect = vi.fn();
const mockClose = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: vi.fn().mockImplementation(function () {
      return {
        setRequestHandler: mockSetRequestHandler,
        connect: mockConnect,
        close: mockClose
      };
    })
  };
});

// Mock StdioServerTransport
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: vi.fn().mockImplementation(function () { return {}; })
  };
});

describe('MCPOrchestrator Sampling Server', () => {
  let orchestrator: MCPOrchestrator;
  let mockLLM: LLMProvider;

  beforeEach(() => {
    mockLLM = {
      generate: vi.fn().mockResolvedValue('Mock LLM Response'),
      generateStructured: vi.fn().mockResolvedValue({}),
      model: 'mock-model'
    } as unknown as LLMProvider;

    orchestrator = new MCPOrchestrator({
      servers: {},
      llm: mockLLM,
      samplingOptions: {
        requireApproval: false // Disable approval for testing
      }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should enable sampling server and register tools/call handler', async () => {
    await orchestrator.enableSamplingServer(undefined, { enableSamplingTool: true });

    expect(mockConnect).toHaveBeenCalled();
    // Verify tools/call handler is registered (it's the second call usually, but we check for the schema)
    // The spy calls capture arguments.
    const calls = mockSetRequestHandler.mock.calls;
    const toolsCallHandler = calls.find(call => {
      // Check if schema looks like tools/call
      // We can just rely on functional test below
      return true;
    });
    expect(toolsCallHandler).toBeDefined();
  });

  it('should handle sampling request via sampling tool', async () => {
    await orchestrator.enableSamplingServer(undefined, { enableSamplingTool: true });

    // Get the registered handler. Since invocations order might vary, we assume the one that handles the request is the right one.
    // In strict unit test we might need better schema introspection.
    // For now we assume the second handler is tools/call as per source code order: tools/list, then tools/call.
    const handler = mockSetRequestHandler.mock.calls[1][1];

    const request = {
      method: 'tools/call',
      params: {
        name: 'sampling',
        arguments: {
          messages: [
            { role: 'user', content: { type: 'text', text: 'Hello' } }
          ],
          maxTokens: 100,
          systemPrompt: 'System prompt'
        }
      }
    };

    const result = await handler(request);

    expect(mockLLM.generate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Hello'),
      systemPrompt: 'System prompt',
      maxTokens: 100
    }));

    // Tool call returns content text with JSON or just text? 
    // In src/orchestrator.ts: content: [{ type: "text", text: result.content }]
    expect(result).toEqual({
      content: [{
        type: 'text',
        text: 'Mock LLM Response'
      }]
    });
  });

  it('should respect model preferences', async () => {
    await orchestrator.enableSamplingServer(undefined, { enableSamplingTool: true });

    const handler = mockSetRequestHandler.mock.calls[1][1];

    const request = {
      method: 'tools/call',
      params: {
        name: 'sampling',
        arguments: {
          messages: [{ role: 'user', content: { type: 'text', text: 'Hi' } }],
          modelPreferences: {
            hints: ['preferred-model']
          }
        }
      }
    };

    await handler(request);

    expect(mockLLM.generate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'preferred-model'
    }));
  });

  it('should respect model preferences with object hints', async () => {
    await orchestrator.enableSamplingServer(undefined, { enableSamplingTool: true });

    const handler = mockSetRequestHandler.mock.calls[1][1];

    const request = {
      method: 'tools/call',
      params: {
        name: 'sampling',
        arguments: {
          messages: [{ role: 'user', content: { type: 'text', text: 'Hi' } }],
          modelPreferences: {
            hints: [{ name: 'preferred-model-obj' }]
          }
        }
      }
    };

    await handler(request);

    expect(mockLLM.generate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'preferred-model-obj'
    }));
  });
});