import { MCPOrchestrator } from "../orchestrator";
import {
    AgentCard,
    AgentSkill
} from "@a2a-js/sdk";
import {
    AgentExecutor,
    ExecutionEventBus,
    RequestContext,
    DefaultRequestHandler,
    InMemoryTaskStore
} from "@a2a-js/sdk/server";
import { jsonRpcHandler, agentCardHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { A2ASkillConfig, McpA2aBridgeOptions, SkillHandler } from "./types";
import { createCodeModeHandler, createToolHandler } from "./skills";

// The Executor that delegates to our registered skills
class BridgeExecutor implements AgentExecutor {
    private skills = new Map<string, SkillHandler>();
    private orchestrator: MCPOrchestrator;
    private defaultHandler?: SkillHandler;

    constructor(orchestrator: MCPOrchestrator, skills: Map<string, SkillHandler>, defaultHandler?: SkillHandler) {
        this.orchestrator = orchestrator;
        this.skills = skills;
        this.defaultHandler = defaultHandler;
    }

    async execute(ctx: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        const { taskId, contextId, userMessage, task } = ctx;

        // 1. Initialize Task if needed
        if (!task) {
            await eventBus.publish({
                kind: "task",
                id: taskId,
                contextId,
                status: {
                    state: "submitted",
                    timestamp: new Date().toISOString(),
                },
                history: userMessage ? [userMessage] : [],
            });
        }

        await eventBus.publish({
            kind: "status-update",
            taskId,
            contextId,
            status: {
                state: "working",
                timestamp: new Date().toISOString(),
            },
            final: false,
        });

        try {
            // 2. Select Skill
            // Let's grab the first registered skill as default for now if no smart routing.
            let handler = this.defaultHandler;
            if (!handler && this.skills.size > 0) {
                handler = this.skills.values().next().value;
            }

            if (!handler) {
                throw new Error("No skills configured for this A2A agent.");
            }

            // 3. Execute Logic
            const result = await handler(ctx, this.orchestrator);

            // 4. Return Output
            await eventBus.publish({
                kind: "artifact-update",
                taskId,
                contextId,
                artifact: {
                    artifactId: `result-${uuidv4()}`,
                    name: "Result",
                    parts: [
                        {
                            kind: "text",
                            text: result.content
                        }
                    ]
                },
                append: false,
                lastChunk: true
            });

            await eventBus.publish({
                kind: "status-update",
                taskId,
                contextId,
                status: {
                    state: "completed",
                    timestamp: new Date().toISOString(),
                },
                final: true
            });

        } catch {
            // const errorMessage = error instanceof Error ? error.message : String(error);
            await eventBus.publish({
                kind: "status-update",
                taskId,
                contextId,
                status: {
                    state: "failed",
                    timestamp: new Date().toISOString(),
                    // reason: errorMessage - apparently not in type
                },
                final: true
            });
        } finally {
            eventBus.finished();
        }
    }

    async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
        await eventBus.publish({
            kind: "status-update",
            taskId,
            contextId: "",
            status: {
                state: "canceled",
                timestamp: new Date().toISOString(),
            },
            final: true
        });
        eventBus.finished();
    }
}

export class McpA2aBridge {
    private orchestrator: MCPOrchestrator;
    private options: McpA2aBridgeOptions;
    private skills: Map<string, A2ASkillConfig> = new Map();
    private defaultSkillId?: string;

    constructor(orchestrator: MCPOrchestrator, options: McpA2aBridgeOptions) {
        this.orchestrator = orchestrator;
        this.options = options;
    }

    /**
     * Expose a specific MCP Tool as an A2A skill.
     */
    addToolSkill(toolName: string, config?: {
        skillName?: string,
        description?: string,
        argMapper?: (text: string) => unknown
    }) {
        const tool = this.orchestrator.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool '${toolName}' not found in Orchestrator registry.`);
        }

        const skillId = `tool-${toolName}`;
        this.skills.set(skillId, {
            skillDef: {
                id: skillId,
                name: config?.skillName || toolName,
                description: config?.description || tool.description || `Execute tool ${toolName}`,
                inputModes: ["text/plain"],
                outputModes: ["text/plain"],
                tags: ["tool", toolName]
            },
            handler: createToolHandler(toolName, config?.argMapper)
        });

        if (!this.defaultSkillId) this.defaultSkillId = skillId;
        return this;
    }

    /**
     * Expose Code Mode as an A2A skill
     */
    addCodeModeSkill(config?: {
        name?: string,
        description?: string,
        systemPrompt?: string
    }) {
        const skillId = "code-mode";
        this.skills.set(skillId, {
            skillDef: {
                id: skillId,
                name: config?.name || "Code Mode",
                description: config?.description || "Generate and execute code to solve tasks",
                inputModes: ["text/plain"],
                outputModes: ["text/plain"],
                tags: ["expert", "code-generation"]
            },
            handler: createCodeModeHandler(config?.systemPrompt)
        });

        // Code mode usually implies it's the main "brain", so make it default if added
        this.defaultSkillId = skillId;
        return this;
    }

    /**
     * Add a custom skill with its own handler
     */
    addCustomSkill(config: {
        skill: AgentSkill,
        handler: SkillHandler
    }) {
        this.skills.set(config.skill.id, {
            skillDef: config.skill,
            handler: config.handler
        });
        if (!this.defaultSkillId) this.defaultSkillId = config.skill.id;
        return this;
    }

    getAgentCard(): AgentCard {
        return {
            name: this.options.name,
            description: this.options.description || "MCP Orchestrator Bridge Agent",
            url: this.options.url || "http://localhost:3000/a2a",
            protocolVersion: "0.3.0",
            version: this.options.version || "1.0.0",
            capabilities: {
                streaming: true,
                pushNotifications: false,
                stateTransitionHistory: true
            },
            defaultInputModes: ["text/plain"],
            defaultOutputModes: ["text/plain"],
            skills: Array.from(this.skills.values()).map(s => s.skillDef),
            supportsAuthenticatedExtendedCard: false
        };
    }

    createAgentExecutor(): AgentExecutor {
        const handlerMap = new Map<string, SkillHandler>();
        for (const [id, config] of this.skills) {
            handlerMap.set(id, config.handler);
        }

        const defaultHandler = this.defaultSkillId ? handlerMap.get(this.defaultSkillId) : undefined;

        return new BridgeExecutor(this.orchestrator, handlerMap, defaultHandler);
    }

    createExpressRouter(): Router {
        const executor = this.createAgentExecutor();
        // Uses global map in reality or we pass it
        // Note: The SDK's DefaultRequestHandler takes a TaskStore.

        const taskStore = new InMemoryTaskStore(); // For now, new store per router instance. In prod, pass in.

        const requestHandler = new DefaultRequestHandler(
            this.getAgentCard(),
            taskStore,
            executor
        );

        const router = Router();

        // 1. Mount JSON-RPC handler (handles requests to root /)
        router.post("/", jsonRpcHandler({
            requestHandler,
            userBuilder: UserBuilder.noAuthentication
        }));

        // 2. Mount Agent Card handler
        router.get("/.well-known/agent-card.json", agentCardHandler({
            agentCardProvider: async () => this.getAgentCard()
        }));

        return router;
    }
}
