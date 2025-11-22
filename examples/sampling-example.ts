import { MCPOrchestrator } from '../dist/index.js';
import { OpenAIProvider } from '../dist/llm/index.js';
import { SamplingSecurityManager, SecurityPolicy } from '../dist/sampling/index.js';
import { z } from 'zod';

/**
 * Example demonstrating dual-level LLM sampling support
 * 
 * This example shows:
 * 1. Orchestrator-level sampling (direct MCP sampling)
 * 2. Sub-server sampling (via sampling proxy)
 * 3. Security features (approval, rate limiting, logging)
 * 4. Tool-enabled sampling
 */

// Define a schema for structured output
const AnalysisSchema = z.object({
  summary: z.string(),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  topics: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

/**
 * Example 1: Orchestrator-level sampling
 */
async function demonstrateOrchestratorSampling() {
  console.log('=== Example 1: Orchestrator-Level Sampling ===');
  
  const orchestrator = new MCPOrchestrator({
    servers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', './']
      }
    },
    llm: new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
    }),
    samplingOptions: {
      maxTokens: 500,
      temperature: 0.7,
      requireApproval: true, // Require user approval for sampling
      timeoutMs: 30000,
    }
  });

  await orchestrator.connect();
  
  // Check sampling capabilities
  const capabilities = orchestrator.getSamplingCapabilities();
  console.log('Sampling capabilities:', capabilities);

  try {
    // Perform orchestrator-level sampling
    const messages = [
      { role: 'user' as const, content: 'Analyze the benefits of MCP orchestration for AI applications' }
    ];

    const result = await orchestrator.sample(messages, {
      systemPrompt: 'You are an expert in AI and distributed systems.',
      maxTokens: 200,
      temperature: 0.5,
      origin: 'analysis-expert'
    });

    console.log('Sampling result:', {
      content: result.content.substring(0, 100) + '...',
      model: result.model,
      stopReason: result.stopReason
    });

    // Structured sampling with schema
    const structuredResult = await orchestrator.llm.generateStructured({
      schema: AnalysisSchema,
      prompt: 'Analyze this text: ' + result.content,
      systemPrompt: 'Provide structured analysis.',
    });

    console.log('Structured analysis:', structuredResult);

  } catch (error: any) {
    console.error('Sampling failed:', error.message);
    // Fallback will be used if MCP sampling is not supported
  }

  await orchestrator.disconnect();
}

/**
 * Example 2: Sub-server sampling with proxy
 */
async function demonstrateSubServerSampling() {
  console.log('\n=== Example 2: Sub-Server Sampling (Proxy) ===');
  
  const orchestrator = new MCPOrchestrator({
    servers: {
      travel: {
        command: 'node',
        args: ['./mock-travel-server.js'] // Would be a real MCP server
      }
    },
    llm: new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
    })
  });

  await orchestrator.connect();

  // Create sampling proxy for a sub-server
  const travelProxy = orchestrator.createSamplingProxy('travel', {
    origin: 'travel-expert',
    requireApproval: false, // Sub-server requests don't need approval
    maxTokens: 300,
  });

  try {
    // Simulate sub-server making sampling request
    const subServerMessages = [
      { role: 'user' as const, content: 'Plan a budget trip to Tokyo for 5 days' },
      { role: 'assistant' as const, content: 'I\'d be happy to help plan your trip to Tokyo!' }
    ];

    const travelAdvice = await travelProxy.createMessage({
      messages: subServerMessages,
      systemPrompt: 'You are a knowledgeable travel advisor specializing in budget travel.',
      maxTokens: 400,
    });

    console.log('Travel advice from sub-server:', {
      content: travelAdvice.content.substring(0, 150) + '...',
      model: travelAdvice.model,
      stopReason: travelAdvice.stopReason
    });

    // Structured sampling for sub-server
    const structuredAdvice = await travelProxy.createMessageStructured(
      {
        messages: subServerMessages,
        systemPrompt: 'Provide structured travel advice.',
      },
      undefined,
      z.object({
        destinations: z.array(z.string()),
        budget: z.object({
          total: z.number(),
          breakdown: z.record(z.number())
        }),
        recommendations: z.array(z.string())
      })
    );

    console.log('Structured travel advice:', structuredAdvice);

  } catch (error: any) {
    console.error('Sub-server sampling failed:', error.message);
  }

  await orchestrator.disconnect();
}

/**
 * Example 3: Security features
 */
async function demonstrateSecurityFeatures() {
  console.log('\n=== Example 3: Security & Trust Features ===');
  
  const securityManager = new SamplingSecurityManager({
    maxQueueSize: 50,
    defaultRateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500,
      requestsPerDay: 5000,
    }
  });

  // Add a security policy
  const costLimitPolicy: SecurityPolicy = {
    name: 'cost_limit_policy',
    description: 'Reject requests that might exceed $1.00',
    evaluate: async (request, options, context) => {
      // Simple cost estimation
      const estimatedCost = request.messages.reduce((sum, msg) => sum + msg.content.length, 0) * 0.0001;
      if (estimatedCost > 1.00) {
        return { approved: false, reason: `Estimated cost ${estimatedCost.toFixed(2)} exceeds limit` };
      }
      return { approved: true };
    }
  };

  securityManager.addPolicy(costLimitPolicy);

  // Listen for approval events (for UI integration)
  securityManager.on('approval_requested', (approval) => {
    console.log('Approval requested:', {
      id: approval.id,
      origin: approval.context.origin,
      metadata: approval.metadata
    });
  });

  // Simulate approval workflow
  const testContext = {
    origin: 'test-app',
    userId: 'user123',
    sessionId: 'session456'
  };

  const result = await securityManager.requestApproval(
    {
      messages: [{ role: 'user' as const, content: 'Generate a detailed analysis of quantum computing' }],
      maxTokens: 2000,
    },
    { requireApproval: true },
    testContext
  );

  console.log('Approval result:', result);

  // Simulate giving approval (in real app, this would be done via UI)
  if (result.approved) {
    console.log('Request approved, proceeding with sampling...');
  }

  // Check rate limits
  const rateLimitStatus = securityManager.getRateLimitStatus('test-app');
  console.log('Rate limit status:', rateLimitStatus);

  // Check audit log
  const auditLog = securityManager.getAuditLog();
  console.log('Audit log entries:', auditLog.length);
}

/**
 * Example 4: Tool-enabled sampling
 */
async function demonstrateToolEnabledSampling() {
  console.log('\n=== Example 4: Tool-Enabled Sampling ===');
  
  const orchestrator = new MCPOrchestrator({
    servers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', './']
      }
    },
    llm: new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
    })
  });

  await orchestrator.connect();

  try {
    // Check if tool sampling is supported
    const capabilities = orchestrator.getSamplingCapabilities();
    if (!capabilities.samplingTools) {
      console.log('Tool-enabled sampling not supported by client');
      return;
    }

    // Define tools for sampling
    const tools = [
      {
        name: 'list_directory',
        description: 'List contents of a directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' }
          },
          required: ['path']
        }
      },
      {
        name: 'read_file',
        description: 'Read contents of a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' }
          },
          required: ['path']
        }
      }
    ];

    const messages = [
      { 
        role: 'user' as const, 
        content: 'List the files in the current directory and tell me what this project is about' 
      }
    ];

    // This would use the MCP tool loop if supported
    const result = await orchestrator.sample(messages, {
      tools,
      toolChoice: 'auto', // Allow LLM to choose tools
      origin: 'file-analyzer'
    });

    console.log('Tool-enabled sampling result:', {
      content: result.content.substring(0, 200) + '...',
      model: result.model,
      stopReason: result.stopReason
    });

  } catch (error: any) {
    console.error('Tool-enabled sampling failed:', error.message);
  }

  await orchestrator.disconnect();
}

/**
 * Main example runner
 */
async function main() {
  console.log('🚀 MCP Orchestrator Dual-Level LLM Sampling Demo\n');

  try {
    await demonstrateOrchestratorSampling();
    await demonstrateSubServerSampling();
    await demonstrateSecurityFeatures();
    await demonstrateToolEnabledSampling();
    
    console.log('\n✅ All examples completed successfully!');
  } catch (error: any) {
    console.error('\n❌ Demo failed:', error);
  }
}

export {
  demonstrateOrchestratorSampling,
  demonstrateSubServerSampling,
  demonstrateSecurityFeatures,
  demonstrateToolEnabledSampling,
  main
};

// Run the example if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}