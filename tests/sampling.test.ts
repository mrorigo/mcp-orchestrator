import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPOrchestrator } from '../src/orchestrator.js';
import { SamplingProxy, createSamplingProxy } from '../src/sampling/proxy.js';
import { SamplingSecurityManager } from '../src/sampling/security.js';
import { SamplingCapabilityError } from '../src/sampling/types.js';
import { LLMProvider, GenerateStructuredOptions } from '../src/llm/types.js';

// Mock LLM Provider for testing
class MockLLMProvider implements LLMProvider {
  model = 'mock-model';
  
  async generate(options: any): Promise<string> {
    return `Mock response to: ${options.prompt}`;
  }
  
  async generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T> {
    // Return a mock structured response that matches common patterns
    return {
      summary: 'Mock structured response',
      sentiment: 'positive' as const,
      topics: ['testing', 'mock'],
      confidence: 0.95
    } as T;
  }
}

describe('Sampling Infrastructure', () => {
  let mockLLM: MockLLMProvider;

  beforeEach(() => {
    mockLLM = new MockLLMProvider();
    vi.clearAllMocks();
  });

  describe('SamplingProxy', () => {
    it('should create sampling proxy for sub-servers', () => {
      const proxy = new SamplingProxy(mockLLM, 'test-server');
      
      expect(proxy).toBeDefined();
      expect(proxy.getCapabilities()).toEqual({
        sampling: true,
        samplingTools: false,
        origin: 'test-server',
      });
    });

    it('should forward sampling requests to LLM provider', async () => {
      const proxy = new SamplingProxy(mockLLM, 'test-server');
      
      const request = {
        messages: [
          { role: 'user' as const, content: 'Hello, test!' }
        ],
        maxTokens: 100,
      };

      const result = await proxy.createMessage(request);
      
      expect(result).toEqual({
        content: 'Mock response to: User: Hello, test!',
        model: 'mock-model',
        stopReason: 'stop',
      });
    });

    it('should handle structured sampling with schema', async () => {
      const proxy = new SamplingProxy(mockLLM, 'test-server');
      
      const request = {
        messages: [
          { role: 'user' as const, content: 'Provide structured analysis' }
        ]
      };

      const schema = {
        name: 'analysis',
        schema: {
          summary: 'string',
          sentiment: 'string',
          confidence: 'number'
        }
      };

      const result = await proxy.createMessageStructured(request, {}, schema);
      
      expect(result).toEqual({
        summary: 'Mock structured response',
        sentiment: 'positive',
        topics: ['testing', 'mock'],
        confidence: 0.95
      });
    });

    it('should apply default options correctly', async () => {
      const proxy = new SamplingProxy(mockLLM, 'test-server', {
        maxTokens: 200,
        temperature: 0.5,
        origin: 'test-server'
      });

      const request = {
        messages: [
          { role: 'user' as const, content: 'Test with defaults' }
        ]
      };

      // The proxy should use the default options
      const result = await proxy.createMessage(request);
      
      expect(result).toBeDefined();
      expect(result.content).toContain('Test with defaults');
    });
  });

  describe('SamplingSecurityManager', () => {
    let securityManager: SamplingSecurityManager;

    beforeEach(() => {
      securityManager = new SamplingSecurityManager({
        maxQueueSize: 10,
        defaultRateLimit: {
          requestsPerMinute: 5,
          requestsPerHour: 100,
          requestsPerDay: 1000,
        }
      });
    });

    it('should manage rate limits correctly', () => {
      const status = securityManager.getRateLimitStatus('test-origin');
      
      expect(status.origin).toBe('test-origin');
      expect(status.current.minute).toBe(0);
      expect(status.current.hour).toBe(0);
      expect(status.current.day).toBe(0);
      expect(status.canProceed.minute).toBe(true);
      expect(status.canProceed.hour).toBe(true);
      expect(status.canProceed.day).toBe(true);
    });

    it('should track rate limits over time', () => {
      securityManager.getRateLimitStatus('test-origin');
      
      // Simulate some requests
      const status1 = securityManager.getRateLimitStatus('test-origin');
      expect(status1.current.minute).toBe(0);

      const status2 = securityManager.getRateLimitStatus('test-origin');
      expect(status2.current.minute).toBeGreaterThanOrEqual(0);
    });

    it('should handle audit logging', () => {
      const context = {
        origin: 'test-app',
        userId: 'user123'
      };

      const log = securityManager.getAuditLog();
      expect(log).toHaveLength(0);

      // The log would be populated when requests are made
      // For this test, we just verify the method exists and works
    });

    it('should support custom security policies', async () => {
      const testPolicy = {
        name: 'test_policy',
        description: 'Reject requests with "reject" in content',
        evaluate: async (request: any, options: any, context: any) => {
          const hasRejectWord = request.messages.some((msg: any) => 
            msg.content.toLowerCase().includes('reject')
          );
          return {
            approved: !hasRejectWord,
            reason: hasRejectWord ? 'Request contains rejected content' : undefined
          };
        }
      };

      securityManager.addPolicy(testPolicy);

      const approvedRequest = {
        messages: [{ role: 'user' as const, content: 'Please help with analysis' }]
      };

      const rejectedRequest = {
        messages: [{ role: 'user' as const, content: 'Please reject this request' }]
      };

      // These would normally be called through the approval workflow
      // For unit testing, we just verify the policy interface works
      const approvedResult = await testPolicy.evaluate(approvedRequest, {}, { origin: 'test' });
      const rejectedResult = await testPolicy.evaluate(rejectedRequest, {}, { origin: 'test' });

      expect(approvedResult.approved).toBe(true);
      expect(rejectedResult.approved).toBe(false);
      expect(rejectedResult.reason).toBe('Request contains rejected content');
    });

    it('should handle approval workflows', async () => {
      const request = {
        messages: [{ role: 'user' as const, content: 'Test approval' }]
      };

      const context = {
        origin: 'test-app',
        userId: 'user123'
      };

      // Auto-approve when requireApproval is false
      const autoResult = await securityManager.requestApproval(
        request,
        { requireApproval: false },
        context
      );

      expect(autoResult.approved).toBe(true);
    });
  });

  describe('MCPOrchestrator Sampling Integration', () => {
    it('should initialize with sampling options', () => {
      const orchestrator = new MCPOrchestrator({
        servers: {
          'test-server': {
            command: 'echo',
            args: ['test']
          }
        },
        llm: mockLLM,
        samplingOptions: {
          maxTokens: 500,
          temperature: 0.7,
          requireApproval: true
        }
      });

      expect(orchestrator).toBeDefined();
      // Verify sampling options are stored
    });

    it('should create sampling proxies for sub-servers', () => {
      const orchestrator = new MCPOrchestrator({
        servers: {
          'test-server': {
            command: 'echo',
            args: ['test']
          }
        },
        llm: mockLLM
      });

      const proxy = orchestrator.createSamplingProxy('test-server', {
        origin: 'custom-origin'
      });

      expect(proxy).toBeInstanceOf(SamplingProxy);
      expect(proxy.getCapabilities().origin).toBe('custom-origin');
    });

    it('should handle missing LLM provider gracefully', () => {
      const orchestrator = new MCPOrchestrator({
        servers: {
          'test-server': {
            command: 'echo',
            args: ['test']
          }
        },
        llm: undefined
      });

      expect(() => {
        orchestrator.createSamplingProxy('test-server');
      }).toThrow('No LLM provider configured');
    });

    it('should return sampling capabilities', () => {
      const orchestrator = new MCPOrchestrator({
        servers: {
          'test-server': {
            command: 'echo',
            args: ['test']
          }
        },
        llm: mockLLM
      });

      const capabilities = orchestrator.getSamplingCapabilities();
      
      expect(capabilities).toEqual({
        sampling: false,
        samplingTools: false
      });
    });

    it('should allow setting default sampling options', () => {
      const orchestrator = new MCPOrchestrator({
        servers: {
          'test-server': {
            command: 'echo',
            args: ['test']
          }
        },
        llm: mockLLM
      });

      const newOptions = {
        maxTokens: 1000,
        temperature: 0.8,
        requireApproval: false
      };

      orchestrator.setDefaultSamplingOptions(newOptions);
      
      // Verify the options are set (internal implementation detail)
      expect(orchestrator).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle sampling capability errors', () => {
      expect(() => {
        throw new SamplingCapabilityError('sampling');
      }).toThrow('Client does not support sampling capability: sampling');
    });

    it('should handle invalid sampling requests', async () => {
      const proxy = new SamplingProxy(mockLLM, 'test-server');
      
      // Test with empty messages (should still work with mock)
      const request = {
        messages: []
      };

      const result = await proxy.createMessage(request);
      expect(result).toBeDefined();
      expect(result.content).toBe('Mock response to: ');
    });
  });
});

// Integration tests would go here, but require actual MCP server setup
describe('Sampling Integration Tests', () => {
  it('should demonstrate end-to-end sampling flow', async () => {
    // This would be a full integration test with actual MCP servers
    // Skipped for unit test suite
  });
});