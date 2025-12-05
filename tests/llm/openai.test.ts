
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../../src/llm/openai';
import { OpenAI } from 'openai';

// Mock OpenAI client
vi.mock('openai', () => {
    return {
        OpenAI: vi.fn().mockImplementation(() => ({
            chat: {
                completions: {
                    create: vi.fn(),
                    parse: vi.fn()
                }
            },
            beta: {
                chat: {
                    completions: {
                        parse: vi.fn()
                    }
                }
            }
        }))
    };
});

describe('OpenAIProvider Configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...originalEnv };
        delete process.env.OPENAI_BASE_URL;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should use default baseURL when not specified', () => {
        new OpenAIProvider({ apiKey: 'test-key' });
        expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: 'test-key',
            baseURL: undefined
        }));
    });

    it('should use baseURL from config when provided', () => {
        new OpenAIProvider({
            apiKey: 'test-key',
            baseURL: 'https://api.custom.com/v1'
        });
        expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: 'test-key',
            baseURL: 'https://api.custom.com/v1'
        }));
    });

    it('should use OPENAI_BASE_URL env var when config is missing', () => {
        process.env.OPENAI_BASE_URL = 'https://api.env.com/v1';
        new OpenAIProvider({ apiKey: 'test-key' });
        expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: 'test-key',
            baseURL: 'https://api.env.com/v1'
        }));
    });

    it('should prioritize config baseURL over env var', () => {
        process.env.OPENAI_BASE_URL = 'https://api.env.com/v1';
        new OpenAIProvider({
            apiKey: 'test-key',
            baseURL: 'https://api.config.com/v1'
        });
        expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: 'test-key',
            baseURL: 'https://api.config.com/v1'
        }));
    });
});
