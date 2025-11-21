import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

describe('ToolRegistry', () => {
    let registry: ToolRegistry;

    beforeEach(() => {
        registry = new ToolRegistry();
    });

    const mockTool: Tool = {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
            type: 'object',
            properties: {
                arg: { type: 'string' }
            }
        }
    };

    it('should register a tool', () => {
        registry.register('server1', mockTool);
        expect(registry.has('test_tool')).toBe(true);
        const tool = registry.get('test_tool');
        expect(tool).toBeDefined();
        expect(tool?.serverName).toBe('server1');
    });

    it('should unregister a tool', () => {
        registry.register('server1', mockTool);
        registry.unregister('test_tool');
        expect(registry.has('test_tool')).toBe(false);
    });

    it('should unregister all tools for a server', () => {
        registry.register('server1', mockTool);
        registry.register('server1', { ...mockTool, name: 'test_tool_2' });
        registry.register('server2', { ...mockTool, name: 'test_tool_3' });

        registry.unregisterServer('server1');
        expect(registry.has('test_tool')).toBe(false);
        expect(registry.has('test_tool_2')).toBe(false);
        expect(registry.has('test_tool_3')).toBe(true);
    });

    it('should list all tools', () => {
        registry.register('server1', mockTool);
        registry.register('server2', { ...mockTool, name: 'test_tool_2' });
        const tools = registry.list();
        expect(tools).toHaveLength(2);
    });

    it('should filter tools', () => {
        registry.register('server1', mockTool);
        registry.register('server2', { ...mockTool, name: 'test_tool_2' });

        const server1Tools = registry.filter(t => t.serverName === 'server1');
        expect(server1Tools).toHaveLength(1);
        expect(server1Tools[0].name).toBe('test_tool');
    });
});
