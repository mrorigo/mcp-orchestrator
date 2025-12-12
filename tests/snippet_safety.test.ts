
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPOrchestrator } from '../src/orchestrator';
import { SnippetManager } from '../src/codemode/snippet-manager';
import { CodeExecutor } from '../src/codemode/executor';
import { LLMProvider } from '../src/llm/types';

// Mock Dependencies
vi.mock('../src/codemode/snippet-manager');
vi.mock('../src/codemode/executor');

describe('Snippet Safety Integration', () => {
    let orchestrator: MCPOrchestrator;
    let mockSnippetManager: any;
    let mockLLM: LLMProvider;

    beforeEach(() => {
        // Reset mocks
        vi.resetAllMocks();

        // Setup Mock SnippetManager
        mockSnippetManager = {
            saveSnippet: vi.fn(),
            init: vi.fn(),
            listSnippets: vi.fn(),
            getSnippet: vi.fn(),
        };
        (SnippetManager as any).mockImplementation(() => mockSnippetManager);

        // Setup Mock LLM
        mockLLM = {
            generate: vi.fn().mockResolvedValue('// @name: fail-snippet\nthrow new Error("fail")'),
        } as unknown as LLMProvider;

        // Setup Orchestrator
        orchestrator = new MCPOrchestrator({
            llm: mockLLM,
            servers: {},
            samplingOptions: {}
        });

        // Inject mocked manager manually as enableSnippetMode logic is in constructor and difficult to trigger via config mock in this scope without real config file
        // However, we can trick it by setting the property directly if we cast to any
        (orchestrator as any).snippetManager = mockSnippetManager;
    });

    it('should NOT save snippet if execution fails', async () => {
        // Mock CodeExecutor to fail
        const mockExecute = vi.fn().mockResolvedValue({
            success: false,
            error: 'Execution failed',
            output: [],
            executionTime: 10
        });

        (CodeExecutor as any).mockImplementation(() => ({
            execute: mockExecute
        }));

        // Execute
        await expect(orchestrator.generateAndExecute('make a tool', {
            saveToSnippets: true,
            maxRetries: 0 // Don't retry for this test
        })).rejects.toThrow();

        // Verification
        expect(mockSnippetManager.saveSnippet).not.toHaveBeenCalled();
    });

    it('should save snippet if execution succeeds', async () => {
        // Mock LLM to return good code
        mockLLM.generate = vi.fn().mockResolvedValue('// @name: good-snippet\nconsole.log("ok")');

        // Mock CodeExecutor to succeed
        const mockExecute = vi.fn().mockResolvedValue({
            success: true,
            result: 'ok',
            output: [],
            executionTime: 10
        });

        (CodeExecutor as any).mockImplementation(() => ({
            execute: mockExecute
        }));

        // Execute
        await orchestrator.generateAndExecute('make a tool', {
            saveToSnippets: true,
            maxRetries: 0
        });

        // Verification
        expect(mockSnippetManager.saveSnippet).toHaveBeenCalled();
        expect(mockSnippetManager.saveSnippet).toHaveBeenCalledWith(expect.objectContaining({
            name: 'good-snippet'
        }));
    });
});
