import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

async function main() {
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));

    const client = new Client(
        {
            name: "minimal-sampling-client",
            version: "1.0.0",
        },
        {
            capabilities: {
                sampling: {},
            },
        }
    );

    await client.connect(transport);
    console.log("Connected to Orchestrator via HTTP");

    // Send a sampling request immediately
    console.log("Sending sampling request...");
    try {
        const result = await client.request(
            {
                method: "sampling/createMessage",
                params: {
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: "Hello, are you working?",
                            },
                        },
                    ],
                    maxTokens: 100,
                    systemPrompt: "You are a helpful assistant.",
                },
            },
            z.any()
        );
        console.log("Sampling result received:", JSON.stringify(result, null, 2));
    } catch (error: any) {
        console.error("Sampling failed:", error);
    }

    console.log("Minimal Sampling Client finished.");
    process.exit(0);
}

main().catch(console.error);
