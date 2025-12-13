import { MCPOrchestrator } from "../orchestrator";
import { AgentSkill } from "@a2a-js/sdk";
import { RequestContext } from "@a2a-js/sdk/server";

export interface SkillResult {
    content: string; // Text content
    artifacts?: unknown[]; // Optional artifacts to attach
}

export type SkillHandler = (
    context: RequestContext,
    orchestrator: MCPOrchestrator
) => Promise<SkillResult>;

export interface A2ASkillConfig {
    skillDef: AgentSkill;
    handler: SkillHandler;
}

export interface McpA2aBridgeOptions {
    /**
     * Agent Card Name
     */
    name: string;
    /**
     * Agent Card Description
     */
    description?: string;
    /**
     * Agent Card Version
     */
    version?: string;
    /**
     * Base URL for the agent (e.g. "http://localhost:3000/a2a")
     */
    url?: string;
}
