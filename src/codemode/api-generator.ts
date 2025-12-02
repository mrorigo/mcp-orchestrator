import { MCPOrchestrator } from '../orchestrator';
import { ToolsAPI } from './types';

/**
 * Generates runtime TypeScript API from registered MCP tools
 */
export class APIGenerator {
    constructor(private orchestrator: MCPOrchestrator) { }

    /**
     * Generate runtime tools API object for sandbox
     */
    generateToolsAPI(): ToolsAPI {
        const tools: ToolsAPI = {};

        for (const tool of this.orchestrator.tools.list()) {
            // Create async wrapper function for each tool
            tools[tool.name] = async (input: any) => {
                return this.orchestrator.callTool(tool.name, input);
            };
        }

        return tools;
    }

    /**
     * Generate TypeScript type definitions string for LLM context
     */
    generateTypeDefinitions(): string {
        const tools = this.orchestrator.tools.list();

        if (tools.length === 0) {
            return '// No tools available';
        }

        const definitions: string[] = [];

        // Generate interface for each tool
        for (const tool of tools) {
            const inputSchema = tool.inputSchema as any;

            // Generate input type
            const inputTypeName = this.toPascalCase(tool.name) + 'Input';
            const inputType = this.schemaToTypeScript(inputSchema, inputTypeName);
            definitions.push(inputType);

            // Generate tool function signature with JSDoc
            const jsdoc = this.generateJSDoc(tool.description || '', inputSchema);
            definitions.push(jsdoc);
            definitions.push(`${tool.name}: (input: ${inputTypeName}) => Promise<any>;`);
            definitions.push('');
        }

        return `
/**
 * Available MCP Tools
 * Use these tools by calling: await tools.toolName(input)
 */
interface Tools {
${definitions.map(d => '  ' + d).join('\n')}
}

declare const tools: Tools;
`.trim();
    }

    /**
     * Convert JSON Schema to TypeScript interface
     */
    private schemaToTypeScript(schema: any, typeName: string): string {
        if (!schema || !schema.properties) {
            return `interface ${typeName} {\n  [key: string]: any;\n}`;
        }

        const properties: string[] = [];
        const required = schema.required || [];

        for (const [propName, propSchema] of Object.entries(schema.properties as any)) {
            const isRequired = required.includes(propName);
            const optional = isRequired ? '' : '?';
            const type = this.jsonSchemaTypeToTS(propSchema as any);

            // Add description as comment if available
            if ((propSchema as any).description) {
                properties.push(`  /** ${(propSchema as any).description} */`);
            }

            properties.push(`  ${propName}${optional}: ${type};`);
        }

        return `interface ${typeName} {\n${properties.join('\n')}\n}`;
    }

    /**
     * Convert JSON Schema type to TypeScript type
     */
    private jsonSchemaTypeToTS(schema: any): string {
        if (!schema.type) {
            return 'any';
        }

        switch (schema.type) {
            case 'string':
                if (schema.enum) {
                    return schema.enum.map((v: string) => `'${v}'`).join(' | ');
                }
                return 'string';
            case 'number':
            case 'integer':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'array':
                const itemType = schema.items ? this.jsonSchemaTypeToTS(schema.items) : 'any';
                return `${itemType}[]`;
            case 'object':
                return 'Record<string, any>';
            default:
                return 'any';
        }
    }

    /**
     * Generate JSDoc comment for a tool
     */
    private generateJSDoc(description: string, schema: any): string {
        const lines = ['/**'];

        if (description) {
            lines.push(` * ${description}`);
        }

        if (schema?.properties) {
            lines.push(' *');
            for (const [propName, propSchema] of Object.entries(schema.properties as any)) {
                if ((propSchema as any).description) {
                    lines.push(` * @param input.${propName} - ${(propSchema as any).description}`);
                }
            }
        }

        lines.push(' */');
        return lines.join('\n');
    }

    /**
     * Convert snake_case to PascalCase
     */
    private toPascalCase(str: string): string {
        return str
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
    }
}
