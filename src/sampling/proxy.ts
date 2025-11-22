import { LLMProvider } from '../llm/types.js';
import {
  SamplingCreateMessageRequest,
  SamplingResult,
  SamplingOptions,
  SamplingMessage,
  SamplingCapabilityError,
} from './types.js';

/**
 * SamplingProxy - A lightweight shim for sub-MCP-server sampling
 * 
 * This proxy allows sub-servers to make sampling requests that are
 * forwarded to the orchestrator's LLM provider, providing a simple
 * bridge between MCP sampling protocol and the existing LLM integration.
 */
export class SamplingProxy {
  constructor(
    private llmProvider: LLMProvider,
    private origin: string,
    private defaultOptions: SamplingOptions = {}
  ) {}

  /**
   * Create a sampling message - main entry point for sub-servers
   */
  async createMessage(request: SamplingCreateMessageRequest, options?: SamplingOptions): Promise<SamplingResult> {
    // Apply default options and merge with provided options
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    // Log the sampling request for debugging/tracking
    this.logSamplingRequest(request, mergedOptions);

    try {
      // Convert MCP sampling request to LLM provider format
      const llmRequest = this.convertToLLMRequest(request, mergedOptions);
      
      // Call the LLM provider
      const llmResponse = await this.llmProvider.generate(llmRequest);
      
      // Convert back to sampling result format
      const result: SamplingResult = {
        content: llmResponse,
        model: this.getModelName(),
        stopReason: 'stop',
      };

      // Log successful response
      this.logSamplingResponse(result, mergedOptions);

      return result;
    } catch (error: any) {
      // Log error and re-throw
      this.logSamplingError(error, request, mergedOptions);
      throw error;
    }
  }

  /**
   * Create a structured sampling message - for sub-servers that need typed output
   */
  async createMessageStructured<T>(
    request: SamplingCreateMessageRequest,
    options?: SamplingOptions,
    schema?: any
  ): Promise<T> {
    // Apply default options and merge with provided options
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    this.logSamplingRequest(request, mergedOptions);

    try {
      // If schema is provided, use structured generation
      if (schema) {
        const structuredRequest = this.convertToStructuredRequest(request, schema, mergedOptions);
        const result = await this.llmProvider.generateStructured(structuredRequest) as T;
        this.logSamplingResponse({ content: JSON.stringify(result), model: this.getModelName(), stopReason: 'stop' } as SamplingResult, mergedOptions);
        return result;
      } else {
        // Fallback to regular generation
        return await this.createMessage(request, options) as T;
      }
    } catch (error: any) {
      this.logSamplingError(error, request, mergedOptions);
      throw error;
    }
  }

  /**
   * Get the capabilities supported by this proxy
   */
  getCapabilities() {
    return {
      sampling: true,
      samplingTools: false, // Tool-enabled sampling not supported in proxy mode
      origin: this.origin,
    };
  }

  private convertToLLMRequest(request: SamplingCreateMessageRequest, options: SamplingOptions) {
    // Convert MCP sampling request format to LLM provider format
    const messages = this.convertMessages(request.messages);
    const systemPrompt = request.systemPrompt || options.systemPrompt;
    
    return {
      prompt: this.formatPrompt(messages, systemPrompt),
      systemPrompt,
      maxTokens: request.maxTokens || options.maxTokens,
      temperature: request.temperature || options.temperature,
      stopSequences: request.stopSequences || options.stopSequences,
    };
  }

  private convertToStructuredRequest(request: SamplingCreateMessageRequest, schema: any, options: SamplingOptions) {
    const messages = this.convertMessages(request.messages);
    const systemPrompt = request.systemPrompt || options.systemPrompt;
    
    return {
      prompt: this.formatPrompt(messages, systemPrompt),
      schema: schema,
      systemPrompt,
      maxTokens: request.maxTokens || options.maxTokens,
      temperature: request.temperature || options.temperature,
      retry: {
        maxAttempts: options.maxRetries || 1,
        onError: (error: Error, attempt: number) => {
          console.warn(`Sampling structured generation attempt ${attempt} failed:`, error.message);
        }
      }
    };
  }

  private convertMessages(messages: SamplingMessage[]): string {
    // Convert MCP message format to a simple prompt format
    // This is a simplified conversion - in practice, you might want more sophisticated formatting
    const formattedMessages = messages.map(msg => {
      const role = msg.role === 'assistant' ? 'Assistant' : 'User';
      return `${role}: ${msg.content}`;
    });
    
    return formattedMessages.join('\n\n');
  }

  private formatPrompt(messages: string, systemPrompt?: string): string {
    if (systemPrompt) {
      return `${systemPrompt}\n\n${messages}`;
    }
    return messages;
  }

  private getModelName(): string {
    // Extract model name from the LLM provider
    // This is provider-specific and might need adjustment
    if ('model' in this.llmProvider) {
      return (this.llmProvider as any).model || 'unknown';
    }
    return 'unknown';
  }

  private logSamplingRequest(request: SamplingCreateMessageRequest, options: SamplingOptions) {
    console.log(`[SamplingProxy:${this.origin}] Sampling request:`, {
      messageCount: request.messages.length,
      hasSystemPrompt: !!request.systemPrompt,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      hasTools: !!request.tools,
      origin: options.origin || this.origin,
    });
  }

  private logSamplingResponse(result: SamplingResult, options: SamplingOptions) {
    console.log(`[SamplingProxy:${this.origin}] Sampling response:`, {
      contentLength: result.content.length,
      model: result.model,
      stopReason: result.stopReason,
      origin: options.origin || this.origin,
    });
  }

  private logSamplingError(error: Error, request: SamplingCreateMessageRequest, options: SamplingOptions) {
    console.error(`[SamplingProxy:${this.origin}] Sampling error:`, {
      error: error.message,
      messageCount: request.messages.length,
      origin: options.origin || this.origin,
    });
  }
}

/**
 * Create a sampling proxy for a sub-server
 */
export function createSamplingProxy(
  llmProvider: LLMProvider,
  serverName: string,
  defaultOptions?: SamplingOptions
): SamplingProxy {
  return new SamplingProxy(llmProvider, serverName, defaultOptions);
}