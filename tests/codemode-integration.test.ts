import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MCPOrchestrator } from '../src/orchestrator';
import { OpenAIProvider } from '../src/llm/openai';

import path from 'path';

describe('Code Mode Integration', () => {
    let orchestrator: MCPOrchestrator;

    beforeEach(async () => {
        const mockServerPath = path.join(process.cwd(), 'tests', 'mock-server.ts');
        orchestrator = new MCPOrchestrator({
            servers: {
                filesystem: {
                    command: 'npx',
                    args: ['ts-node', mockServerPath]
                }
            },
            llm: new OpenAIProvider({
                apiKey: 'test-key'
            }),
            connectionOptions: {
                autoConnect: false
            }
        });

        await orchestrator.connect();
    });

    afterEach(async () => {
        await orchestrator.disconnect();
    });

    describe('executeCode', () => {
        it('should execute code with access to MCP tools', async () => {
            const code = `
                const files = await tools.list_directory({ path: './' });
                console.log('Found', files.content.length, 'items');
                return files.content.slice(0, 3);
            `;

            const result = await orchestrator.executeCode(code);

            expect(result.success).toBe(true);
            expect(result.output.length).toBeGreaterThan(0);
            expect(result.result).toBeDefined();
        });

        it('should handle multi-step operations', async () => {
            const code = `
                // List directory
                const files = await tools.list_directory({ path: './' });
                console.log('Step 1: Listed directory');
                
                // Filter for TypeScript files
                const tsFiles = files.content.filter(f => 
                    f.type === 'file' && f.name.endsWith('.ts')
                );
                console.log('Step 2: Found', tsFiles.length, 'TS files');
                
                return {
                    total: files.content.length,
                    typescript: tsFiles.length
                };
            `;

            const result = await orchestrator.executeCode(code);

            expect(result.success).toBe(true);
            expect(result.output).toContain('Step 1: Listed directory');
            expect(result.output.some(o => o.includes('Step 2'))).toBe(true);
            expect(result.result).toHaveProperty('total');
            expect(result.result).toHaveProperty('typescript');
        });

        it('should respect timeout option', async () => {
            const code = 'while(true) {}';
            const result = await orchestrator.executeCode(code, { timeout: 100 });

            expect(result.success).toBe(false);
            expect(result.error).toContain('timed out');
        });

        it('should handle errors gracefully', async () => {
            const code = `
                try {
                    await tools.read_file({ path: '/nonexistent/file.txt' });
                } catch (error) {
                    console.error('Caught error:', error.message);
                    return { error: true, message: error.message };
                }
            `;

            const result = await orchestrator.executeCode(code);

            expect(result.success).toBe(true);
            expect(result.result).toHaveProperty('error', true);
        });
    });

    describe('generateAndExecute', () => {
        it('should generate and execute code from prompt', async () => {
            // Mock the LLM generate method
            const mockGenerate = vi.fn().mockResolvedValue(`
const files = await tools.list_directory({ path: './' });
console.log('Found', files.content.length, 'files');
return files.content.length;
            `);

            orchestrator.llm.generate = mockGenerate;

            const result = await orchestrator.generateAndExecute(
                'List all files in the current directory and return the count'
            );

            expect(mockGenerate).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.code).toBeDefined();
        });

        it('should retry on code execution failure', async () => {
            let callCount = 0;
            const mockGenerate = vi.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    // First attempt: invalid code
                    return Promise.resolve('this is invalid code');
                } else {
                    // Second attempt: valid code
                    return Promise.resolve('return 42');
                }
            });

            orchestrator.llm.generate = mockGenerate;

            const result = await orchestrator.generateAndExecute(
                'Return the number 42',
                { maxRetries: 2 }
            );

            expect(mockGenerate).toHaveBeenCalledTimes(2);
            expect(result.success).toBe(true);
            expect(result.result).toBe(42);
        });

        it('should extract code from markdown blocks', async () => {
            const mockGenerate = vi.fn().mockResolvedValue(`
Here's the code:

\`\`\`typescript
const result = await tools.list_directory({ path: './' });
return result.content.length;
\`\`\`

This will list the files.
            `);

            orchestrator.llm.generate = mockGenerate;

            const result = await orchestrator.generateAndExecute(
                'Count files in current directory'
            );

            expect(result.success).toBe(true);
            expect(result.code).not.toContain('```');
            expect(result.code).not.toContain("Here's the code");
        });

        it('should throw after max retries', async () => {
            const mockGenerate = vi.fn().mockResolvedValue('invalid code that will always fail');
            orchestrator.llm.generate = mockGenerate;

            await expect(
                orchestrator.generateAndExecute('Do something', { maxRetries: 1 })
            ).rejects.toThrow('Code execution failed after 1 retries');

            expect(mockGenerate).toHaveBeenCalledTimes(2); // Initial + 1 retry
        });
    });

    describe('API Generation', () => {
        it('should generate TypeScript API for available tools', async () => {
            const apiDef = orchestrator['apiGenerator'].generateTypeDefinitions();

            expect(apiDef).toContain('interface Tools');
            expect(apiDef).toContain('list_directory');
            expect(apiDef).toContain('read_file');
            expect(apiDef).toContain('write_file');
        });

        it('should generate runtime tools API', async () => {
            const toolsAPI = orchestrator['apiGenerator'].generateToolsAPI();

            expect(toolsAPI).toHaveProperty('list_directory');
            expect(typeof toolsAPI.list_directory).toBe('function');
        });
    });

    describe('Complex Workflows', () => {
        it('should handle data transformation pipeline', async () => {
            const code = `
                // Read package.json
                const pkgResult = await tools.read_file({ path: './package.json' });
                const pkg = JSON.parse(pkgResult.content[0].text);
                
                console.log('Package:', pkg.name);
                console.log('Version:', pkg.version);
                
                // Extract dependencies
                const deps = Object.keys(pkg.dependencies || {});
                const devDeps = Object.keys(pkg.devDependencies || {});
                
                return {
                    name: pkg.name,
                    totalDeps: deps.length + devDeps.length,
                    deps: deps.slice(0, 3)
                };
            `;

            const result = await orchestrator.executeCode(code);
            expect(result.success).toBe(true);
            expect(result.result).toHaveProperty('name');
            expect(result.result).toHaveProperty('totalDeps');
        });
    });
});
