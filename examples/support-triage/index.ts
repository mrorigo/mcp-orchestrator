import { MCPOrchestrator } from '../../src/index';
import { sequence } from '../../src/patterns/index';
import { OpenAIProvider } from '../../src/llm/index';
import { z } from 'zod';

// Mock server setup for demonstration
// In a real scenario, these would be actual MCP servers
const mockZendeskServer = {
    command: 'node',
    args: ['-e', `
    const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
    const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
    const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

    const server = new Server({ name: 'zendesk-mock', version: '1.0.0' }, { capabilities: { tools: {} } });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        { name: 'zendesk_get_ticket', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
        { name: 'zendesk_update_ticket', inputSchema: { type: 'object', properties: { id: { type: 'string' }, tags: { type: 'array' }, internal_note: { type: 'string' } } } },
        { name: 'zendesk_post_comment', inputSchema: { type: 'object', properties: { id: { type: 'string' }, body: { type: 'string' }, public: { type: 'boolean' } } } }
      ]
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'zendesk_get_ticket') {
        return { content: [{ type: 'text', text: JSON.stringify({ id: request.params.arguments.id, subject: 'Login failed', requester: { email: 'vip@example.com' } }) }] };
      }
      return { content: [{ type: 'text', text: 'success' }] };
    });

    server.connect(new StdioServerTransport());
  `]
};

const mockSalesforceServer = {
    command: 'node',
    args: ['-e', `
    const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
    const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
    const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

    const server = new Server({ name: 'salesforce-mock', version: '1.0.0' }, { capabilities: { tools: {} } });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        { name: 'salesforce_get_contact', inputSchema: { type: 'object', properties: { email: { type: 'string' } } } }
      ]
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return { content: [{ type: 'text', text: JSON.stringify({ tier: 'platinum', recent_notes: ['Customer complained about downtime', 'Upgraded plan last month'] }) }] };
    });

    server.connect(new StdioServerTransport());
  `]
};

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

async function main() {
    const orchestrator = new MCPOrchestrator({
        servers: {
            'zendesk': mockZendeskServer,
            'salesforce': mockSalesforceServer
        },
        llm: new OpenAIProvider({
            apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
        })
    });

    // Mock LLM for demonstration if no key provided
    if (!process.env.OPENAI_API_KEY) {
        orchestrator.llm.generateStructured = async () => ({
            category: 'technical',
            priority: 'high',
            draftResponse: 'We are investigating the login issue immediately.'
        });
    }

    try {
        console.log('Connecting to servers...');
        await orchestrator.connect();

        console.log('Starting triage workflow...');
        const result = await sequence<TriageState>([
            // Step 1: Fetch Ticket Details
            async (ctx) => {
                console.log('Fetching ticket...');
                const response: any = await orchestrator.callTool('zendesk_get_ticket', { id: ctx.ticketId });
                // Parse the JSON content from the mock server response
                const ticket = JSON.parse(response.content[0].text);
                console.log('Ticket found:', ticket.subject);
                return { ...ctx, ticket };
            },

            // Step 2: Fetch Customer Context
            async (ctx) => {
                console.log('Fetching customer context...');
                const response: any = await orchestrator.callTool('salesforce_get_contact', {
                    email: ctx.ticket.requester.email
                });
                const customer = JSON.parse(response.content[0].text);
                console.log('Customer tier:', customer.tier);
                return { ...ctx, customer };
            },

            // Step 3: Analyze with LLM
            async (ctx) => {
                console.log('Analyzing with LLM...');
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
                console.log('Analysis:', analysis);
                return { ...ctx, analysis };
            },

            // Step 4: Update Ticket
            async (ctx) => {
                if (!ctx.analysis) return ctx;

                console.log('Updating ticket...');
                await orchestrator.callTool('zendesk_update_ticket', {
                    id: ctx.ticketId,
                    tags: [ctx.analysis.category, ctx.analysis.priority],
                    internal_note: `AI Analysis: ${ctx.analysis.category} priority ${ctx.analysis.priority}`
                });

                console.log('Posting draft response...');
                await orchestrator.callTool('zendesk_post_comment', {
                    id: ctx.ticketId,
                    body: ctx.analysis.draftResponse,
                    public: false
                });

                return ctx;
            }
        ], { ticketId: 'T-12345' });

        console.log('Workflow completed successfully!');

    } catch (error) {
        console.error('Workflow failed:', error);
    } finally {
        await orchestrator.disconnect();
    }
}

main();
