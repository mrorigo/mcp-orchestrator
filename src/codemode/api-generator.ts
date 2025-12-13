import { MCPOrchestrator } from '../orchestrator';
import { ToolsAPI } from './types';
import { JSONSchema } from 'json-schema-to-typescript';

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
            tools[tool.name] = async (input: Record<string, unknown>) => {
                const result = await this.orchestrator.callTool(tool.name, input);
                // Check if result is an error and throw if so
                if ((result as { isError?: boolean }).isError) {
                    const content = (result as { content?: { text?: string }[] }).content || [];
                    const message = content.map((c) => c.text || '').join('\n') || 'Tool execution failed';
                    throw new Error(message);
                }
                return result;
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
            const inputSchema = tool.inputSchema as JSONSchema;

            // Generate input type
            const inputTypeName = this.toPascalCase(tool.name) + 'Input';
            const inputType = this.schemaToTypeScript(inputSchema, inputTypeName);
            definitions.push(inputType);

            // Generate tool function signature with JSDoc
            const jsdoc = this.generateJSDoc(tool.description || '', inputSchema);
            definitions.push(jsdoc);
            definitions.push(`${tool.name}: (input: ${inputTypeName}) => Promise<unknown>;`);
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
    private schemaToTypeScript(schema: JSONSchema, typeName: string): string {
        if (!schema || !schema.properties) {
            return `interface ${typeName} {\n  [key: string]: unknown;\n}`;
        }

        const properties: string[] = [];
        const required = schema.required || [];

        for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
            const isRequired = Array.isArray(required) ? required.includes(propName) : false;
            const optional = isRequired ? '' : '?';
            const type = this.jsonSchemaTypeToTS(propSchema as JSONSchema);

            // Add description as comment if available
            if ((propSchema as JSONSchema).description) {
                properties.push(`  /** ${(propSchema as JSONSchema).description} */`);
            }

            properties.push(`  ${propName}${optional}: ${type};`);
        }

        return `interface ${typeName} {\n${properties.join('\n')}\n}`;
    }

    /**
     * Convert JSON Schema type to TypeScript type
     */
    private jsonSchemaTypeToTS(schema: JSONSchema): string {
        if (!schema.type) {
            return 'any';
        }

        switch (schema.type) {
            case 'string':
                if (schema.enum) {
                    return schema.enum.map((v: unknown) => `'${v}'`).join(' | ');
                }
                return 'string';
            case 'number':
            case 'integer':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'array':
                const itemType = schema.items ? this.jsonSchemaTypeToTS(schema.items as JSONSchema) : 'unknown';
                return `${itemType}[]`;
            case 'object':
                return 'Record<string, unknown>';
            default:
                return 'unknown';
        }
    }

    /**
     * Generate JSDoc comment for a tool
     */
    private generateJSDoc(description: string, schema: JSONSchema): string {
        const lines = ['/**'];

        if (description) {
            lines.push(` * ${description}`);
        }

        if (schema?.properties) {
            lines.push(' *');
            for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
                if ((propSchema as JSONSchema).description) {
                    lines.push(` * @param input.${propName} - ${(propSchema as JSONSchema).description}`);
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
