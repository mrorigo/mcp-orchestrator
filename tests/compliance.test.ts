
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPOrchestrator } from '../src/orchestrator';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

// Mock the SDK classes
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
    return {
        Client: vi.fn().mockImplementation(() => ({
            connect: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
            listTools: vi.fn().mockResolvedValue({ tools: [] }),
            getServerCapabilities: vi.fn().mockReturnValue({ sampling: {} }),
            setRequestHandler: vi.fn()
        }))
    };
});

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => {
    return {
        Server: vi.fn().mockImplementation(() => ({
            connect: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
            setRequestHandler: vi.fn(),
            addTool: vi.fn()
        }))
    };
});

// Mock other dependencies
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
    StdioClientTransport: vi.fn()
}));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
    StdioServerTransport: vi.fn()
}));

describe('MCP Compliance Verification', () => {
    let orchestrator: MCPOrchestrator;

    beforeEach(() => {
        orchestrator = new MCPOrchestrator({
            servers: {
                "test-server": {
                    command: "echo",
                    args: ["hello"]
                }
            },
            llm: {
                generate: vi.fn().mockResolvedValue("test response"),
                model: "test-model"
            } as any
        });
    });

    afterEach(async () => {
        await orchestrator.disconnect();
    });

    it('should advertise sampling capability in Client', async () => {
        await orchestrator.connect();

        // Check Client constructor arguments
        expect(Client).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "mcp-orchestrator",
                version: "0.1.0"
            }),
            expect.objectContaining({
                capabilities: expect.objectContaining({
                    sampling: {}
                })
            })
        );
    });

    it('should NOT advertise sampling capability in Server', async () => {
        await orchestrator.enableSamplingServer();

        // Check Server constructor arguments
        expect(Server).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "mcp-orchestrator",
                version: "0.1.0"
            }),
            expect.objectContaining({
                capabilities: expect.not.objectContaining({
                    sampling: expect.anything()
                })
            })
        );

        // Should advertise tools instead
        expect(Server).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                capabilities: expect.objectContaining({
                    tools: {}
                })
            })
        );
    });

    it('should register a sampling tool in Server', async () => {
        await orchestrator.enableSamplingServer();

        // Access the server session (private property, cast to any)
        const serverSession = (orchestrator as any).serverSession;

        // Check if setRequestHandler was called for tools/list
        // We can't easily check the implementation of the handler, but we can check it was registered
        expect(serverSession.setRequestHandler).toHaveBeenCalledWith(
            expect.objectContaining({
                shape: expect.objectContaining({
                    method: expect.objectContaining({
                        value: "tools/list"
                    })
                })
            }),
            expect.any(Function)
        );

        // Check if setRequestHandler was called for tools/call
        expect(serverSession.setRequestHandler).toHaveBeenCalledWith(
            expect.objectContaining({
                shape: expect.objectContaining({
                    method: expect.objectContaining({
                        value: "tools/call"
                    })
                })
            }),
            expect.any(Function)
        );
    });
});
