import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  SamplingCreateMessageRequest,
  SamplingMessageResponse,
  SamplingResult,
  SamplingOptions,
  SamplingCapabilities,
  SamplingCapabilityError,
  SamplingTimeoutError,
  SamplingRejectedError,
  Tool,
  SamplingMessage,
} from './types';

interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResult {
  toolUseId: string;
  content: { type: 'text'; text: string }[];
  isError: boolean;
}

interface MCPError {
  code: string;
  details?: {
    reason?: string;
  };
}

interface ClientWithSampling {
  getServerCapabilities?(): { sampling?: boolean };
  sampling?: {
    createMessage?(request: SamplingCreateMessageRequest): Promise<SamplingMessageResponse>;
  };
}

export class SamplingClient {
  constructor(private client: Client) { }

  /**
   * Check if the client supports sampling capabilities
   */
  async checkSamplingCapabilities(): Promise<SamplingCapabilities> {
    const capabilities: SamplingCapabilities = {};

    // Check if the server supports sampling
    // In MCP SDK, we can check the server capabilities exposed on the client
    const serverCapabilities = (this.client as unknown as ClientWithSampling).getServerCapabilities?.();

    if (serverCapabilities?.sampling) {
      capabilities.sampling = true;
      // Assume tool sampling is supported if sampling is supported, 
      // or check specific sub-capabilities if the spec defines them (it currently doesn't deeply)
      capabilities.samplingTools = true;
    }

    return capabilities;
  }

  /**
   * Send a sampling request via MCP protocol
   */
  async createMessage(request: SamplingCreateMessageRequest, options?: SamplingOptions): Promise<SamplingResult> {
    // Check if sampling is supported
    const capabilities = await this.checkSamplingCapabilities();
    if (!capabilities.sampling) {
      throw new SamplingCapabilityError('sampling');
    }

    // Set up timeout if specified
    const timeoutMs = options?.timeoutMs || 30000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new SamplingTimeoutError(timeoutMs)), timeoutMs);
    });

    try {
      // Make the sampling request via MCP protocol
      const response = await Promise.race([
        this.makeSamplingRequest(request),
        timeoutPromise
      ]);

      return {
        content: response.content,
        model: response.model,
        stopReason: response.stopReason,
      };
    } catch (error: unknown) {
      // Handle specific sampling errors
      if (typeof error === 'object' && error !== null && 'code' in error && (error as MCPError).code === 'REQUEST_REJECTED') {
        throw new SamplingRejectedError((error as MCPError).details?.reason);
      }
      throw error;
    }
  }

  /**
   * Create a message with tool support
   */
  async createMessageWithTools(
    request: SamplingCreateMessageRequest & { tools: Tool[] },
    options?: SamplingOptions
  ): Promise<SamplingResult> {
    // Check if tool sampling is supported
    const capabilities = await this.checkSamplingCapabilities();
    if (!capabilities.samplingTools) {
      throw new SamplingCapabilityError('sampling.tools');
    }

    // For tool-enabled sampling, we need to handle the tool loop
    return this.handleToolLoop(request, options);
  }

  private async testBasicSampling(): Promise<void> {
    // This is a placeholder - in reality, we'd need to check the SDK documentation
    // for the exact method to test sampling support
    // For now, we'll assume if the client is connected, basic sampling might work
  }

  private async testToolSampling(): Promise<void> {
    // Test tool sampling capability
    // This would test the sampling/createMessage with tools parameter
  }

  private async makeSamplingRequest(request: SamplingCreateMessageRequest): Promise<SamplingMessageResponse> {
    // Use the MCP client's sampling method
    // This assumes the MCP SDK has a sampling.createMessage method
    const result = await (this.client as unknown as ClientWithSampling).sampling?.createMessage?.(request);

    if (!result) {
      throw new SamplingCapabilityError('sampling');
    }

    return result;
  }

  private async handleToolLoop(
    request: SamplingCreateMessageRequest & { tools: Tool[] },
    options?: SamplingOptions
  ): Promise<SamplingResult> {
    // Handle the tool-enabled sampling loop as per MCP spec
    // 1. Send initial request with tools
    // 2. If LLM returns ToolUseContent, execute the tools
    // 3. Send ToolResultContent back to LLM
    // 4. Continue until final response

    let currentRequest = request;
    const maxIterations = options?.maxRetries || 5;

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.makeSamplingRequest(currentRequest);

      // Check if the response contains tool calls
      const toolUseContent = this.extractToolUseContent(response.content);

      if (!toolUseContent) {
        // No tool calls, return the final response
        return {
          content: response.content,
          model: response.model,
          stopReason: response.stopReason,
        };
      }

      // Execute the tools
      const toolResults = await this.executeTools(toolUseContent);

      // Add tool results to the conversation
      const toolResultContent = this.createToolResultContent(toolResults);

      // Continue the conversation with tool results
      currentRequest = {
        ...currentRequest,
        messages: [
          ...currentRequest.messages,
          response,
          toolResultContent
        ]
      };
    }

    throw new Error('Tool loop exceeded maximum iterations');
  }

  private extractToolUseContent(content: string): ToolUse[] | null {
    // Parse content to extract ToolUseContent
    // This is a simplified implementation
    try {
      const parsed = JSON.parse(content);
      return parsed.toolUse || null;
    } catch {
      return null;
    }
  }

  private async executeTools(toolUseContent: ToolUse[]): Promise<ToolResult[]> {
    // Execute the requested tools
    const results = [];

    for (const toolUse of toolUseContent) {
      try {
        const result = await this.client.callTool({
          name: toolUse.name,
          arguments: toolUse.input
        });
        results.push({
          toolUseId: toolUse.id,
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result)
          }],
          isError: false
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          toolUseId: toolUse.id,
          content: [{
            type: 'text' as const,
            text: `Error: ${errorMessage}`
          }],
          isError: true
        });
      }
    }

    return results;
  }

  private createToolResultContent(toolResults: ToolResult[]): SamplingMessage {
    return {
      role: 'user',
      content: JSON.stringify({
        type: 'tool_result',
        tool_results: toolResults
      })
    };
  }
}