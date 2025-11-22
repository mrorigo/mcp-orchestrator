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
    Server: vi.fn().mockImplementation(() => ({
      setRequestHandler: mockSetRequestHandler,
      connect: mockConnect,
      close: mockClose
    }))
  };
});

// Mock StdioServerTransport
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: vi.fn().mockImplementation(() => ({}))
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

  it('should enable sampling server and register handler', async () => {
    await orchestrator.enableSamplingServer();

    expect(mockConnect).toHaveBeenCalled();
    expect(mockSetRequestHandler).toHaveBeenCalledWith(
      'sampling/createMessage',
      expect.any(Function)
    );
  });

  it('should handle sampling request via LLM', async () => {
    await orchestrator.enableSamplingServer();

    // Get the registered handler
    const handler = mockSetRequestHandler.mock.calls.find(
      call => call[0] === 'sampling/createMessage'
    )[1];

    const request: SamplingCreateMessageRequest = {
      messages: [
        { role: 'user', content: { type: 'text', text: 'Hello' } }
      ],
      maxTokens: 100,
      systemPrompt: 'System prompt'
    };

    const result = await handler(request);

    expect(mockLLM.generate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Hello'),
      systemPrompt: 'System prompt',
      maxTokens: 100
    }));

    expect(result).toEqual({
      content: 'Mock LLM Response',
      model: 'mock-model',
      stopReason: 'stop'
    });
  });

  it('should respect model preferences', async () => {
    await orchestrator.enableSamplingServer();

    const handler = mockSetRequestHandler.mock.calls.find(
      call => call[0] === 'sampling/createMessage'
    )[1];

    const request: SamplingCreateMessageRequest = {
      messages: [{ role: 'user', content: { type: 'text', text: 'Hi' } }],
      modelPreferences: {
        hints: ['preferred-model']
      }
    };

    await handler(request);

    expect(mockLLM.generate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'preferred-model'
    }));
  });
});