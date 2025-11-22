import { MCPOrchestrator } from "../../src/orchestrator";
import { LLMProvider } from "../../src/llm/types";

// Mock LLM Provider
const mockLLM: LLMProvider = {
    generate: async (params) => {
        console.log("LLM Generate called with:", params);
        return `Mock response for: ${params.prompt.substring(0, 50)}...`;
    },
    generateStructured: async <T>() => ({} as T),
};

async function main() {
    const orchestrator = new MCPOrchestrator({
        servers: {}, // No sub-servers managed by orchestrator directly in this example
        llm: mockLLM,
        samplingOptions: {
            requireApproval: false,
        },
    });

    // Enable Sampling Server on port 3000
    await orchestrator.enableSamplingServer(3000);
    console.log("Orchestrator running with HTTP Sampling Server on port 3000");

    orchestrator.on('server:connected', async ({ serverName }) => {
        console.log(`Server connected: ${serverName}`);
        // Wait a bit for tools to be discovered
        setTimeout(async () => {
            try {
                console.log("Calling sample_llm tool...");
                const result = await orchestrator.callTool("sample_llm", { prompt: "Hello from verification" });
                console.log("Tool result:", JSON.stringify(result, null, 2));
            } catch (error) {
                console.error("Failed to call tool:", error);
            }
        }, 1000);
    });

    // Keep alive
    await new Promise(() => { });
}

main().catch(console.error);
