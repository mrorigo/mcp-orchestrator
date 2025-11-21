# MCP Orchestrator Use Cases

This document outlines several practical scenarios where `mcp-orchestrator` can be used to build powerful, domain-specific experts.

## 1. Intelligent Customer Support Triage

**Goal**: Automatically classify incoming support tickets, enrich them with customer CRM data, and draft an initial response.

**MCP Servers**:
- `zendesk-mcp`: For managing tickets.
- `salesforce-mcp`: For customer data.

**Implementation**:

```typescript
import { MCPOrchestrator } from 'mcp-orchestrator';
import { sequence } from 'mcp-orchestrator/patterns';
import { z } from 'zod';

const orchestrator = new MCPOrchestrator({ /* config */ });

// Define the workflow state
interface TriageState {
  ticketId: string;
  ticket?: any;
  customer?: any;
  analysis?: {
    category: 'billing' | 'technical' | 'feature-request';
    priority: 'low' | 'medium' | 'high';
    draftResponse: string;
  };
}

const triageExpert = async (ticketId: string) => {
  return sequence<TriageState>([
    // Step 1: Fetch Ticket Details
    async (ctx) => {
      const ticket = await orchestrator.callTool('zendesk_get_ticket', { id: ctx.ticketId });
      return { ...ctx, ticket };
    },

    // Step 2: Fetch Customer Context (Parallel to ticket analysis in a real app, but sequential here for simplicity)
    async (ctx) => {
      const customer = await orchestrator.callTool('salesforce_get_contact', { 
        email: ctx.ticket.requester.email 
      });
      return { ...ctx, customer };
    },

    // Step 3: Analyze with LLM
    async (ctx) => {
      const analysis = await orchestrator.llm.generateStructured({
        schema: z.object({
          category: z.enum(['billing', 'technical', 'feature-request']),
          priority: z.enum(['low', 'medium', 'high']),
          draftResponse: z.string()
        }),
        prompt: `
          Analyze this ticket from a ${ctx.customer.tier} tier customer.
          Ticket: ${JSON.stringify(ctx.ticket)}
          Customer History: ${JSON.stringify(ctx.customer.recent_notes)}
        `
      });
      return { ...ctx, analysis };
    },

    // Step 4: Update Ticket
    async (ctx) => {
      if (!ctx.analysis) return ctx;
      
      await orchestrator.callTool('zendesk_update_ticket', {
        id: ctx.ticketId,
        tags: [ctx.analysis.category, ctx.analysis.priority],
        internal_note: `AI Analysis: ${ctx.analysis.category} priority ${ctx.analysis.priority}`
      });
      
      // Optional: Post draft as private comment
      await orchestrator.callTool('zendesk_post_comment', {
        id: ctx.ticketId,
        body: ctx.analysis.draftResponse,
        public: false
      });
      
      return ctx;
    }
  ], { ticketId });
};
```

## 2. Cloud Infrastructure Cost Optimizer

**Goal**: Analyze running cloud resources, cross-reference with pricing APIs, and identify idle resources to stop.

**MCP Servers**:
- `aws-mcp`: For EC2/RDS management.
- `pricing-mcp`: For fetching current cloud pricing.

**Implementation**:

```typescript
import { MCPOrchestrator } from 'mcp-orchestrator';
import { parallel } from 'mcp-orchestrator/patterns';

const optimizerExpert = async (region: string) => {
  // Step 1: Gather Data in Parallel
  const [instances, pricing] = await parallel([
    () => orchestrator.callTool('aws_ec2_describe_instances', { region }),
    () => orchestrator.callTool('aws_pricing_get_products', { service: 'AmazonEC2', region })
  ]);

  // Step 2: Analyze Utilization & Cost
  const analysis = await orchestrator.llm.generateStructured({
    schema: z.object({
      idleInstanceIds: z.array(z.string()),
      estimatedMonthlySavings: z.number(),
      reasoning: z.string()
    }),
    prompt: `
      Identify idle instances based on these metrics: ${JSON.stringify(instances)}.
      Calculate potential savings using this pricing: ${JSON.stringify(pricing)}.
      Consider CPU utilization < 5% as idle.
    `
  });

  console.log(`Potential Savings: $${analysis.estimatedMonthlySavings}`);
  console.log(`Reasoning: ${analysis.reasoning}`);

  // Step 3: Action (with human approval simulation)
  if (analysis.idleInstanceIds.length > 0) {
    console.log('Stopping idle instances:', analysis.idleInstanceIds);
    // In a real app, you might wait for approval here
    for (const id of analysis.idleInstanceIds) {
      await orchestrator.callTool('aws_ec2_stop_instances', { instanceIds: [id] });
    }
  }
};
```

## 3. Automated Code Review & Refactoring

**Goal**: Review a pull request for style violations or bugs, and automatically submit a fix commit if the confidence is high.

**MCP Servers**:
- `github-mcp`: For reading PRs and comments.
- `git-local-mcp`: For checking out code and committing.
- `filesystem-mcp`: For reading/writing files.

**Implementation**:

```typescript
import { MCPOrchestrator } from 'mcp-orchestrator';
import { retry } from 'mcp-orchestrator/patterns';

const codeReviewExpert = async (repoUrl: string, prNumber: number) => {
  // Step 1: Get PR Diff
  const prDiff = await orchestrator.callTool('github_get_pr_diff', { 
    owner: 'my-org', repo: 'my-repo', pull_number: prNumber 
  });

  // Step 2: Analyze Code
  const review = await orchestrator.llm.generateStructured({
    schema: z.object({
      hasIssues: z.boolean(),
      criticalBugs: z.array(z.object({
        file: z.string(),
        line: z.number(),
        description: z.string(),
        suggestedFix: z.string()
      }))
    }),
    prompt: `Review this diff for critical bugs or security issues:\n${prDiff}`
  });

  if (!review.hasIssues) {
    await orchestrator.callTool('github_create_comment', {
      owner: 'my-org', repo: 'my-repo', issue_number: prNumber,
      body: "LGTM! 🚀"
    });
    return;
  }

  // Step 3: Apply Fixes (if critical)
  for (const bug of review.criticalBugs) {
    // Checkout code
    await orchestrator.callTool('git_clone', { url: repoUrl, path: './temp_repo' });
    
    // Read file
    const content = await orchestrator.callTool('fs_read_file', { path: `./temp_repo/${bug.file}` });
    
    // Apply fix (simplified text replacement)
    const newContent = await orchestrator.llm.generate({
      prompt: `Apply this fix to the code:\nCode: ${content}\nFix: ${bug.suggestedFix}`
    });
    
    // Write back
    await orchestrator.callTool('fs_write_file', { path: `./temp_repo/${bug.file}`, content: newContent });
    
    // Commit and Push (with retry for network flakes)
    await retry(async () => {
      await orchestrator.callTool('git_commit', { 
        path: './temp_repo', 
        message: `fix: ${bug.description}` 
      });
      await orchestrator.callTool('git_push', { path: './temp_repo' });
    }, { maxAttempts: 3 });
    
    // Notify
    await orchestrator.callTool('github_create_comment', {
      owner: 'my-org', repo: 'my-repo', issue_number: prNumber,
      body: `I've pushed a fix for: ${bug.description}`
    });
  }
};
```
