import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts', 'src/cli/generate-types.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    external: ['@modelcontextprotocol/sdk', '@anthropic-ai/sdk', 'zod', 'openai', 'commander', 'json-schema-to-typescript'],
});
