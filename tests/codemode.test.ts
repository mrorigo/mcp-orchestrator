import { describe, it, expect, beforeEach } from 'vitest';
import { CodeExecutor } from '../src/codemode/executor';
import { ToolsAPI } from '../src/codemode/types';

describe('CodeExecutor', () => {
    let mockToolsAPI: ToolsAPI;

    beforeEach(() => {
        mockToolsAPI = {
            test_tool: async (input: any) => {
                return { success: true, data: input };
            },
            async_tool: async (input: any) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return { result: 'async result' };
            },
        };
    });

    describe('Basic Execution', () => {
        it('should execute simple code', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('console.log("Hello World")');

            expect(result.success).toBe(true);
            expect(result.output).toContain('Hello World');
        });

        it('should capture return value', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('return 42');

            expect(result.success).toBe(true);
            expect(result.result).toBe(42);
        });

        it('should support async/await', async () => {
            const executor = new CodeExecutor({}, {});
            const code = `
                const result = await Promise.resolve(123);
                return result;
            `;
            const result = await executor.execute(code);

            expect(result.success).toBe(true);
            expect(result.result).toBe(123);
        });
    });

    describe('Console Capture', () => {
        it('should capture console.log output', async () => {
            const executor = new CodeExecutor({}, {});
            const code = `
                console.log('Line 1');
                console.log('Line 2');
                console.log('Line 3');
            `;
            const result = await executor.execute(code);

            expect(result.output).toHaveLength(3);
            expect(result.output[0]).toBe('Line 1');
            expect(result.output[1]).toBe('Line 2');
            expect(result.output[2]).toBe('Line 3');
        });

        it('should capture console.error output', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('console.error("Error message")');

            expect(result.output[0]).toContain('[ERROR]');
            expect(result.output[0]).toContain('Error message');
        });

        it('should handle object logging', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('console.log({ foo: "bar", num: 42 })');

            expect(result.output[0]).toContain('foo');
            expect(result.output[0]).toContain('bar');
        });
    });

    describe('Tool API Access', () => {
        it('should provide access to tools', async () => {
            const executor = new CodeExecutor(mockToolsAPI, {});
            const code = `
                const result = await tools.test_tool({ value: 123 });
                return result;
            `;
            const result = await executor.execute(code);

            expect(result.success).toBe(true);
            expect(result.result).toEqual({ success: true, data: { value: 123 } });
        });

        it('should support multiple tool calls', async () => {
            const executor = new CodeExecutor(mockToolsAPI, {});
            const code = `
                const r1 = await tools.test_tool({ id: 1 });
                const r2 = await tools.test_tool({ id: 2 });
                return [r1, r2];
            `;
            const result = await executor.execute(code);

            expect(result.success).toBe(true);
            expect(result.result).toHaveLength(2);
        });
    });

    describe('Timeout Enforcement', () => {
        it('should enforce timeout', async () => {
            const executor = new CodeExecutor({}, { timeout: 100 });
            const code = 'while(true) {}';
            const result = await executor.execute(code);

            expect(result.success).toBe(false);
            expect(result.error).toContain('timed out');
        });

        it('should not timeout for valid code', async () => {
            const executor = new CodeExecutor(mockToolsAPI, { timeout: 1000 });
            const code = `
                await tools.async_tool({});
                return 'done';
            `;
            const result = await executor.execute(code);

            expect(result.success).toBe(true);
            expect(result.result).toBe('done');
        });
    });

    describe('Security Restrictions', () => {
        it('should block access to process', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('return typeof process');

            expect(result.success).toBe(true);
            expect(result.result).toBe('undefined');
        });

        it('should block access to require', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('return typeof require');

            expect(result.success).toBe(true);
            expect(result.result).toBe('undefined');
        });

        it('should block access to __dirname', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('return typeof __dirname');

            expect(result.success).toBe(true);
            expect(result.result).toBe('undefined');
        });
    });

    describe('Error Handling', () => {
        it('should handle syntax errors', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('this is not valid javascript');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle runtime errors', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('throw new Error("Test error")');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Test error');
        });

        it('should sanitize stack traces', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('throw new Error("Test")');

            expect(result.success).toBe(false);
            // Should not contain internal VM paths
            expect(result.error).not.toContain('node:vm:');
            expect(result.error).not.toContain('node:internal');
        });
    });

    describe('Execution Time', () => {
        it('should track execution time', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('return 42');

            expect(result.executionTime).toBeGreaterThanOrEqual(0);
            expect(result.executionTime).toBeLessThan(1000);
        });
    });

    describe('Safe Globals', () => {
        it('should provide Math', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('return Math.PI');

            expect(result.success).toBe(true);
            expect(result.result).toBeCloseTo(3.14159, 4);
        });

        it('should provide Date', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('return new Date().getFullYear()');

            expect(result.success).toBe(true);
            expect(result.result).toBeGreaterThan(2020);
        });

        it('should provide JSON', async () => {
            const executor = new CodeExecutor({}, {});
            const result = await executor.execute('return JSON.stringify({ test: true })');

            expect(result.success).toBe(true);
            expect(result.result).toBe('{"test":true}');
        });
    });
});
