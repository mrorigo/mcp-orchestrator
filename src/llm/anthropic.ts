import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, GenerateStructuredOptions, GenerateOptions } from './types';
import { LLMParseError } from '../errors';

export interface AnthropicProviderConfig {
    apiKey: string;
    model?: string;
}

export class AnthropicProvider implements LLMProvider {
    private client: Anthropic;
    private model: string;

    constructor(config: AnthropicProviderConfig) {
        this.client = new Anthropic({ apiKey: config.apiKey });
        this.model = config.model || 'claude-3-5-sonnet-20241022';
    }

    async generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<T> {
        // Anthropic doesn't have native JSON mode like OpenAI's `parse` yet in the same way,
        // but we can prompt for JSON and validate with Zod.
        // Or use tool use to force structure.

        // Using tool use is the most reliable way for structured output on Claude.


        // We need to convert Zod schema to JSON schema. 
        // For simplicity in this implementation, we'll assume the user might need a library like `zod-to-json-schema`
        // But since we don't want to add too many dependencies, we might try a simpler prompt approach or 
        // assume the schema is simple.

        // Actually, `zod-to-json-schema` is standard for this. 
        // Since I didn't install it, I will use a prompt-based approach for now, 
        // OR I can use the `tools` API if I can construct the tool definition.

        // Let's stick to a prompt-based approach with JSON extraction for this MVP 
        // to avoid extra dependencies, but acknowledge it's less robust than OpenAI's native parse.
        // BETTER: Use a tool definition if possible.

        // For this implementation, I will just prompt for JSON and parse it.

        const { schema, prompt, systemPrompt } = options;

        const jsonPrompt = `${prompt}\n\nRespond with valid JSON matching this schema. Output ONLY the JSON.`;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: options.maxTokens || 1024,
                system: systemPrompt,
                messages: [{ role: 'user', content: jsonPrompt }],
            });

            const firstBlock = response.content[0];
            const text = (firstBlock?.type === 'text') ? firstBlock.text : '';
            const json = JSON.parse(text); // This is risky without robust extraction
            return schema.parse(json);
        } catch (error: unknown) {
            if (options.fallback) return options.fallback;
            throw new LLMParseError("Failed to parse Anthropic output", error instanceof Error ? error : new Error(String(error)));
        }
    }

    async generate(options: GenerateOptions): Promise<string> {
        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: options.maxTokens || 1024,
            system: options.systemPrompt,
            messages: [{ role: 'user', content: options.prompt }],
        });

        const firstBlock = response.content[0];
        return (firstBlock?.type === 'text') ? firstBlock.text : '';
    }
}
