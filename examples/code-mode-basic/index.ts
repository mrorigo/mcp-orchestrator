import { MCPOrchestrator } from '../../src/index.js';
import { OpenAIProvider } from '../../src/llm/index.js';

async function main() {
    console.log('=== Code Mode Basic Example ===\n');

    // Initialize orchestrator with filesystem server
    const orchestrator = new MCPOrchestrator({
        servers: {
            filesystem: {
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', './']
            }
        },
        llm: new OpenAIProvider({
            apiKey: process.env.OPENAI_API_KEY || 'dummy-key'
        })
    });

    await orchestrator.connect();
    console.log('✓ Connected to MCP servers\n');

    // Example 1: Direct code execution
    console.log('--- Example 1: Direct Code Execution ---');
    const code1 = `
        const files = await tools.list_directory({ path: './' });
        console.log('Found', files.content.length, 'items in current directory');
        
        // Filter for TypeScript files
        const tsFiles = files.content.filter(f => 
            f.type === 'file' && f.name.endsWith('.ts')
        );
        
        console.log('TypeScript files:', tsFiles.length);
        return {
            total: files.content.length,
            typescript: tsFiles.length,
            files: tsFiles.slice(0, 5).map(f => f.name)
        };
    `;

    const result1 = await orchestrator.executeCode(code1);
    console.log('Success:', result1.success);
    console.log('Console output:');
    result1.output.forEach(line => console.log('  ', line));
    console.log('Result:', JSON.stringify(result1.result, null, 2));
    console.log('Execution time:', result1.executionTime, 'ms\n');

    // Example 2: Multi-step data processing
    console.log('--- Example 2: Multi-Step Data Processing ---');
    const code2 = `
        // Read package.json
        const pkgResult = await tools.read_file({ path: './package.json' });
        const pkgContent = pkgResult.content[0].text;
        const pkg = JSON.parse(pkgContent);
        
        console.log('Package:', pkg.name);
        console.log('Version:', pkg.version);
        
        // Count dependencies
        const deps = Object.keys(pkg.dependencies || {});
        const devDeps = Object.keys(pkg.devDependencies || {});
        
        console.log('Dependencies:', deps.length);
        console.log('Dev Dependencies:', devDeps.length);
        
        return {
            name: pkg.name,
            version: pkg.version,
            totalDependencies: deps.length + devDeps.length,
            topDeps: deps.slice(0, 3)
        };
    `;

    const result2 = await orchestrator.executeCode(code2);
    console.log('Console output:');
    result2.output.forEach(line => console.log('  ', line));
    console.log('Result:', JSON.stringify(result2.result, null, 2));
    console.log();

    // Example 3: LLM-generated code (requires API key)
    if (process.env.OPENAI_API_KEY) {
        console.log('--- Example 3: LLM-Generated Code ---');
        const result3 = await orchestrator.generateAndExecute(
            'List all JavaScript and TypeScript files in the current directory and count them by extension'
        );

        console.log('Generated code:');
        console.log(result3.code);
        console.log('\nConsole output:');
        result3.output.forEach(line => console.log('  ', line));
        console.log('Result:', JSON.stringify(result3.result, null, 2));
    } else {
        console.log('--- Example 3: Skipped (no OPENAI_API_KEY) ---');
    }

    await orchestrator.disconnect();
    console.log('\n✓ Disconnected');
}

main().catch(console.error);
