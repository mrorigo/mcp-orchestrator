import { MCPOrchestrator } from '../src/index.js';
import { OpenAIProvider } from '../src/llm/index.js';
import { z } from 'zod';

async function main() {
    // Initialize orchestrator
    const orchestrator = new MCPOrchestrator({
        servers: {
            'filesystem': {
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', './']
            }
        },
        llm: new OpenAIProvider({
            apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
        })
    });

    try {
        console.log('Connecting to servers...');
        await orchestrator.connect();

        console.log('Available tools:');
        orchestrator.tools.list().forEach(t => console.log(`- ${t.name}`));

        // Example: Call a tool (if filesystem server exposes 'list_directory' or similar)
        // Note: The actual tool names depend on the server implementation.
        // For filesystem server, it might be 'list_directory'.

        if (orchestrator.tools.has('list_directory')) {
            const files = await orchestrator.callTool('list_directory', { path: './' });
            console.log('Files:', files);
        }

        // Example: Structured LLM generation
        const AnalysisSchema = z.object({
            summary: z.string(),
            sentiment: z.enum(['positive', 'neutral', 'negative'])
        });

        // This requires a valid API key to actually work
        if (process.env.OPENAI_API_KEY) {
            const analysis = await orchestrator.llm.generateStructured({
                schema: AnalysisSchema,
                prompt: 'This library is amazing and easy to use!',
            });
            console.log('Analysis:', analysis);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await orchestrator.disconnect();
    }
}

if (require.main === module) {
    main();
}
