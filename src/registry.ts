import { EventEmitter } from 'events';
import { RegisteredTool } from './types';
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export class ToolRegistry extends EventEmitter {
    private tools: Map<string, RegisteredTool> = new Map();

    constructor() {
        super();
    }

    register(serverName: string, tool: Tool) {
        const registeredTool: RegisteredTool = {
            ...tool,
            serverName,
        };
        this.tools.set(tool.name, registeredTool);
        this.emit('added', registeredTool);
    }

    unregister(toolName: string) {
        const tool = this.tools.get(toolName);
        if (tool) {
            this.tools.delete(toolName);
            this.emit('removed', tool);
        }
    }

    unregisterServer(serverName: string) {
        for (const [name, tool] of this.tools.entries()) {
            if (tool.serverName === serverName) {
                this.tools.delete(name);
                this.emit('removed', tool);
            }
        }
    }

    get(name: string): RegisteredTool | undefined {
        return this.tools.get(name);
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }

    list(): RegisteredTool[] {
        return Array.from(this.tools.values());
    }

    filter(predicate: (tool: RegisteredTool) => boolean): RegisteredTool[] {
        return this.list().filter(predicate);
    }

    clear() {
        this.tools.clear();
        this.emit('cleared');
    }
}
