import { z } from 'zod';

// MCP Sampling Protocol Types
// Based on the Model Context Protocol specification for sampling

export const SamplingMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([
    z.string(),
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() })
  ]),
});

export const ModelPreferencesSchema = z.object({
  hints: z.array(z.union([z.string(), z.object({ name: z.string().optional() })])).optional(),
  intelligencePriority: z.number().min(0).max(1).optional(),
  speedPriority: z.number().min(0).max(1).optional(),
  costPriority: z.number().min(0).max(1).optional(),
});

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.any()),
});

export const SamplingCreateMessageRequestSchema = z.object({
  messages: z.array(SamplingMessageSchema),
  systemPrompt: z.string().optional(),
  modelPreferences: ModelPreferencesSchema.optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  stopSequences: z.array(z.string()).optional(),
  tools: z.array(ToolSchema).optional(),
  toolChoice: z.union([z.string(), z.object({ type: z.literal('tool'), toolName: z.string() })]).optional(),
});

export const SamplingMessageResponseSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  model: z.string(),
  stopReason: z.string(),
});

export type SamplingMessage = z.infer<typeof SamplingMessageSchema>;
export type ModelPreferences = z.infer<typeof ModelPreferencesSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type SamplingCreateMessageRequest = z.infer<typeof SamplingCreateMessageRequestSchema>;
export type SamplingMessageResponse = z.infer<typeof SamplingMessageResponseSchema>;

// Orchestrator-level sampling options
export interface SamplingOptions {
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  systemPrompt?: string;
  modelPreferences?: ModelPreferences;
  tools?: Tool[];
  toolChoice?: string | { type: 'tool'; toolName: string };
  // Security and trust options
  requireApproval?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  origin?: string; // For sub-server sampling tracking
}

// Sampling result
export interface SamplingResult {
  content: string;
  model: string;
  stopReason: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

// Sampling capabilities for client handshake
export interface SamplingCapabilities {
  sampling?: boolean;
  samplingTools?: boolean;
}

// Error types for sampling
export class SamplingError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SamplingError';
  }
}

export class SamplingTimeoutError extends SamplingError {
  constructor(timeoutMs: number) {
    super(`Sampling request timed out after ${timeoutMs}ms`, 'TIMEOUT', { timeoutMs });
    this.name = 'SamplingTimeoutError';
  }
}

export class SamplingRejectedError extends SamplingError {
  constructor(reason?: string) {
    super(`Sampling request was rejected${reason ? `: ${reason}` : ''}`, 'REJECTED', { reason });
    this.name = 'SamplingRejectedError';
  }
}

export class SamplingCapabilityError extends SamplingError {
  constructor(capability: string) {
    super(`Client does not support sampling capability: ${capability}`, 'CAPABILITY_MISSING', { capability });
    this.name = 'SamplingCapabilityError';
  }
}