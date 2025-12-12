
import path from 'path';

// Load environment variables via process.env
// Ensure your application loads .env files before importing this module if needed


export interface AppConfig {
    enableSnippetMode: boolean;
    snippetStoragePath: string;
}

export const config: AppConfig = {
    enableSnippetMode: process.env.ENABLE_SNIPPET_MODE === 'true',
    snippetStoragePath: process.env.SNIPPET_STORAGE_PATH || path.resolve(process.cwd(), 'snippets'),
};
