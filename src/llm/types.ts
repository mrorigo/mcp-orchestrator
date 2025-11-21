import { z } from 'zod';

export interface GenerateStructuredOptions<T> {
    schema: z.ZodSchema<T>;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    retry?: {
        maxAttempts: number;
        onError?: (error: Error, attempt: number) => void;
    };
    fallback?: T;
}

export interface GenerateOptions {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface LLMProvider {
    generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T>;
    generate(options: GenerateOptions): Promise<string>;
}
