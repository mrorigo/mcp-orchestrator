
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SnippetManager } from '../src/codemode/snippet-manager';
import { SnippetVirtualServer } from '../src/codemode/snippet-server';
import { extractSnippetMetadata } from '../src/codemode/prompts';
import fs from 'fs/promises';
import path from 'path';

const TEST_STORAGE_PATH = path.join(__dirname, 'test-snippets');

describe('Snippet System', () => {
    describe('SnippetManager', () => {
        let manager: SnippetManager;

        beforeEach(async () => {
            manager = new SnippetManager(TEST_STORAGE_PATH);
            await manager.init();
        });

        afterEach(async () => {
            await fs.rm(TEST_STORAGE_PATH, { recursive: true, force: true });
        });

        it('should save and retrieve a snippet', async () => {
            const snippet = {
                name: 'test-snippet',
                description: 'A test snippet',
                code: 'console.log("hello")',
                createdAt: new Date().toISOString()
            };

            await manager.saveSnippet(snippet);
            const retrieved = await manager.getSnippet('test-snippet');

            expect(retrieved).toBeDefined();
            expect(retrieved?.name).toBe('test-snippet');
            expect(retrieved?.code).toBe('console.log("hello")');
        });

        it('should list snippets', async () => {
            await manager.saveSnippet({ name: 's1', description: 'd1', code: 'c1', createdAt: '' });
            await manager.saveSnippet({ name: 's2', description: 'd2', code: 'c2', createdAt: '' });

            const list = await manager.listSnippets();
            expect(list).toHaveLength(2);
            expect(list.map(s => s.name).sort()).toEqual(['s1', 's2']);
        });

        it('should delete a snippet', async () => {
            await manager.saveSnippet({ name: 's1', description: 'd1', code: 'c1', createdAt: '' });
            await manager.deleteSnippet('s1');
            const retrieved = await manager.getSnippet('s1');
            expect(retrieved).toBeNull();
        });
    });

    describe('SnippetVirtualServer', () => {
        let manager: SnippetManager;
        let server: SnippetVirtualServer;
        let executorMock: any;

        beforeEach(async () => {
            manager = new SnippetManager(TEST_STORAGE_PATH);
            await manager.init();
            executorMock = vi.fn().mockResolvedValue({ success: true, result: 'ok' });
            server = new SnippetVirtualServer(manager, executorMock);
        });

        afterEach(async () => {
            await fs.rm(TEST_STORAGE_PATH, { recursive: true, force: true });
        });

        it('should list snippets as tools', async () => {
            await manager.saveSnippet({
                name: 'my-tool',
                description: 'My cool tool',
                code: '...',
                createdAt: '',
                inputSchema: { type: 'object', properties: { foo: { type: 'string' } } }
            });

            const tools = await server.listTools();
            expect(tools).toHaveLength(1);
            expect(tools[0].name).toBe('my-tool');
            expect(tools[0].description).toBe('My cool tool');
            expect(tools[0].inputSchema).toEqual({ type: 'object', properties: { foo: { type: 'string' } } });
        });

        it('should execute snippet via executor with args', async () => {
            await manager.saveSnippet({
                name: 'my-tool',
                description: 'My cool tool',
                code: 'const x = 1;',
                createdAt: ''
            });

            const args = { foo: 'bar' };
            await server.callTool('my-tool', args);

            expect(executorMock).toHaveBeenCalledWith('const x = 1;', {
                args: { foo: 'bar' },
                saveToSnippets: false
            });
        });
    });

    describe('Metadata Extraction', () => {
        it('should extract metadata from comments', () => {
            const code = `
                // @name: magic-script
                // @description: Does magic
                // @input: {"type": "object", "properties": {"wand": {"type": "string"}}}
                
                const { wand } = args;
            `;

            const meta = extractSnippetMetadata(code);
            expect(meta.name).toBe('magic-script');
            expect(meta.description).toBe('Does magic');
            expect(meta.inputSchema).toEqual({
                type: 'object',
                properties: { wand: { type: 'string' } }
            });
        });

        it('should handle missing metadata', () => {
            const code = 'console.log("no metadata")';
            const meta = extractSnippetMetadata(code);
            expect(meta.name).toBeUndefined();
        });
    });
});
