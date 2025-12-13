import { MCPOrchestrator } from "../src/orchestrator";
import { McpA2aBridge } from "../src/a2a/bridge";
import { AnthropicProvider } from "../src/llm/anthropic";
import express from "express";

async function main() {
    // 1. Initialize MCP Orchestrator
    const orchestrator = new MCPOrchestrator({
        servers: {
            // Add your MCP servers here
            // "math": { command: "python", args: ["math_server.py"] }
        },
        llm: new AnthropicProvider({
            apiKey: process.env.ANTHROPIC_API_KEY || '',
            model: 'claude-4-5-sonnet'
        })
    });

    try {
        await orchestrator.connect();
    } catch (e) {
        console.warn("Orchestrator connection warning:", e);
    }

    // 2. Initialize A2A Bridge
    const bridge = new McpA2aBridge(orchestrator, {
        name: "Orchestrator Expert",
        description: "An AI agent powered by MCP Orchestrator and Code Mode",
        url: "http://localhost:4000/a2a"
    });

    // 3. Configure A2A Skills

    // Skill 1: Code Mode (Natural Language -> Code -> Tools)
    bridge.addCodeModeSkill({
        name: "Code Expert",
        description: "Write and execute code to solve complex tasks",
        systemPrompt: "You are an expert coding assistant. Use the available tools to answer the user's request."
    });

    // Skill 2: Expose a specific tool (example)
    // bridge.addToolSkill("calculate_sum", { skillName: "Calculator" });

    // 4. Setup Express Server
    const app = express();
    app.use(express.json());

    // Mount A2A routes
    app.use("/a2a", bridge.createExpressRouter());

    const PORT = 4000;
    app.listen(PORT, () => {
        console.log(`A2A Server listening on http://localhost:${PORT}/a2a`);
        console.log(`Agent Card available at http://localhost:${PORT}/a2a/.well-known/agent-card.json`);
    });
}

main().catch(console.error);
