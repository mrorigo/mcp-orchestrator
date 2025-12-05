#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const server = new Server(
    {
        name: "mock-filesystem",
        version: "0.1.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_directory",
                description: "List directory contents",
                inputSchema: {
                    type: "object",
                    properties: {
                        path: { type: "string" }
                    },
                    required: ["path"]
                }
            },
            {
                name: "read_file",
                description: "Read file",
                inputSchema: {
                    type: "object",
                    properties: {
                        path: { type: "string" }
                    },
                    required: ["path"]
                }
            },
            {
                name: "write_file",
                description: "Write file",
                inputSchema: {
                    type: "object",
                    properties: {
                        path: { type: "string" },
                        content: { type: "string" }
                    },
                    required: ["path", "content"]
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "list_directory") {
        // Mimic filesystem server returning objects in content array
        // Note: This matches what the test expects, even if it might deviate from standard TextContent
        return {
            content: [
                { type: "text", text: "package.json" },
                { type: "text", text: "tsconfig.json" },
                { type: "text", text: "src/index.ts" },
                { type: "text", text: "src/utils.ts" }
            ]
        };
    }

    if (name === "read_file") {
        const path = (args as any).path;
        if (path.includes("nonexistent")) {
            throw new Error(`File not found: ${path}`);
        }

        if (path.endsWith("package.json")) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            name: "@mrorigo/mcp-orchestrator",
                            version: "0.3.0",
                            dependencies: {
                                "zod": "^3.23.8"
                            },
                            devDependencies: {
                                "vitest": "^2.1.5"
                            }
                        })
                    }
                ]
            };
        }

        return {
            content: [{ type: "text", text: "file content" }]
        };
    }

    if (name === "write_file") {
        return {
            content: [{ type: "text", text: "File written" }]
        };
    }

    throw new Error(`Tool not found: ${name}`);
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);
