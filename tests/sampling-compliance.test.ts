import { describe, it, expect } from 'vitest';
import { SamplingResult, TextContent, ContentBlock } from '../src/sampling/types';

describe('Sampling Response Type Compliance', () => {
    it('should have correct structure for SamplingResult', () => {
        const result: SamplingResult = {
            role: 'assistant',
            content: {
                type: 'text',
                text: 'Hello, world!'
            },
            model: 'test-model',
            stopReason: 'stop'
        };

        // Verify role is correct
        expect(result.role).toBe('assistant');

        // Verify content is a TextContent object
        expect(result.content).toHaveProperty('type', 'text');
        expect(result.content).toHaveProperty('text');

        // Type-safe access
        if (!Array.isArray(result.content) && result.content.type === 'text') {
            expect(result.content.text).toBe('Hello, world!');
        }
    });

    it('should support array of content blocks', () => {
        const result: SamplingResult = {
            role: 'assistant',
            content: [
                { type: 'text', text: 'First block' },
                { type: 'text', text: 'Second block' }
            ],
            model: 'test-model',
            stopReason: 'stop'
        };

        expect(result.role).toBe('assistant');
        expect(Array.isArray(result.content)).toBe(true);

        if (Array.isArray(result.content)) {
            expect(result.content).toHaveLength(2);
            expect(result.content[0].type).toBe('text');
            if (result.content[0].type === 'text') {
                expect(result.content[0].text).toBe('First block');
            }
        }
    });

    it('should extract text from content block', () => {
        const extractText = (content: ContentBlock | ContentBlock[]): string => {
            if (Array.isArray(content)) {
                const textBlock = content.find(block => block.type === 'text');
                return textBlock?.type === 'text' ? textBlock.text : '';
            }
            return content.type === 'text' ? content.text : '';
        };

        // Single content block
        const singleContent: ContentBlock = { type: 'text', text: 'Hello' };
        expect(extractText(singleContent)).toBe('Hello');

        // Array of content blocks
        const arrayContent: ContentBlock[] = [
            { type: 'text', text: 'World' }
        ];
        expect(extractText(arrayContent)).toBe('World');

        // Image content (should return empty string)
        const imageContent: ContentBlock = {
            type: 'image',
            data: 'base64data',
            mimeType: 'image/png'
        };
        expect(extractText(imageContent)).toBe('');
    });

    it('should validate role values', () => {
        // Valid roles
        const assistantResult: SamplingResult = {
            role: 'assistant',
            content: { type: 'text', text: 'Response' },
            model: 'test',
            stopReason: 'stop'
        };
        expect(['user', 'assistant']).toContain(assistantResult.role);

        const userResult: SamplingResult = {
            role: 'user',
            content: { type: 'text', text: 'Query' },
            model: 'test',
            stopReason: 'stop'
        };
        expect(['user', 'assistant']).toContain(userResult.role);
    });
});
