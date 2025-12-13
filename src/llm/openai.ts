import { OpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { LLMProvider, GenerateStructuredOptions, GenerateOptions } from './types';
import { LLMParseError } from '../errors';

export interface OpenAIProviderConfig {
    apiKey: string;
    baseURL?: string;
    model?: string;
    defaultOptions?: {
        temperature?: number;
        maxTokens?: number;
    };
}

export class OpenAIProvider implements LLMProvider {
    private client: OpenAI;
    private model: string;
    private defaultOptions: Required<OpenAIProviderConfig>['defaultOptions'];

    constructor(config: OpenAIProviderConfig) {
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL || process.env.OPENAI_BASE_URL
        });
        this.model = config.model || 'gpt-4o';
        this.defaultOptions = {
            temperature: 0.7,
            maxTokens: 1000,
            ...config.defaultOptions
        };
    }

    async generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T> {
        const { schema, prompt, systemPrompt, retry } = options;
        const maxAttempts = retry?.maxAttempts || 1;

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const completion = await this.client.beta.chat.completions.parse({
                    model: this.model,
                    messages: [
                        { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
                        { role: 'user', content: prompt },
                    ],
                    response_format: zodResponseFormat(schema, "result"),
                    temperature: options.temperature ?? this.defaultOptions.temperature,
                    max_tokens: options.maxTokens ?? this.defaultOptions.maxTokens,
                });

                const result = completion.choices[0]?.message.parsed;
                if (!result) {
                    throw new Error("Failed to parse structured output");
                }
                return result;

            } catch (error: unknown) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (retry?.onError) {
                    retry.onError(lastError, attempt);
                }
                // If it's a parse error, we might want to distinguish it
                if (attempt === maxAttempts) {
                    if (options.fallback) return options.fallback;
                    // Wrap error if it's a parsing issue? 
                    // OpenAI's parse method throws specific errors usually.
                    throw new LLMParseError(lastError.message, lastError);
                }
            }
        }

        throw lastError || new Error('Failed to generate structured output');
    }

    async generate(options: GenerateOptions): Promise<string> {
        const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: options.systemPrompt || 'You are a helpful assistant.' },
                { role: 'user', content: options.prompt },
            ],
            temperature: options.temperature ?? this.defaultOptions.temperature,
            max_tokens: options.maxTokens ?? this.defaultOptions.maxTokens,
        });

        return completion.choices[0]?.message.content || '';
    }
}
