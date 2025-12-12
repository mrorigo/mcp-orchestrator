
import fs from 'fs/promises';
import path from 'path';
import { Snippet } from './types';

/**
 * Manages storage and retrieval of code snippets
 */
export class SnippetManager {
    private storagePath: string;

    constructor(storagePath: string) {
        this.storagePath = storagePath;
    }

    /**
     * Initialize storage directory
     */
    async init(): Promise<void> {
        try {
            await fs.mkdir(this.storagePath, { recursive: true });
        } catch (error) {
            // Ignore error if directory already exists
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw error;
            }
        }
    }

    /**
     * Save a snippet to storage
     */
    async saveSnippet(snippet: Snippet): Promise<void> {
        await this.init();
        const fileName = `${this.sanitizeName(snippet.name)}.json`;
        const filePath = path.join(this.storagePath, fileName);
        await fs.writeFile(filePath, JSON.stringify(snippet, null, 2), 'utf-8');
    }

    /**
     * Get a snippet by name
     */
    async getSnippet(name: string): Promise<Snippet | null> {
        try {
            const fileName = `${this.sanitizeName(name)}.json`;
            const filePath = path.join(this.storagePath, fileName);
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content) as Snippet;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    /**
     * List all available snippets
     */
    async listSnippets(): Promise<Snippet[]> {
        await this.init();
        const files = await fs.readdir(this.storagePath);
        const snippets: Snippet[] = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = await fs.readFile(path.join(this.storagePath, file), 'utf-8');
                    snippets.push(JSON.parse(content) as Snippet);
                } catch (error) {
                    console.error(`Failed to load snippet ${file}:`, error);
                }
            }
        }

        return snippets;
    }

    /**
     * Delete a snippet by name
     */
    async deleteSnippet(name: string): Promise<boolean> {
        try {
            const fileName = `${this.sanitizeName(name)}.json`;
            const filePath = path.join(this.storagePath, fileName);
            await fs.unlink(filePath);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Sanitize snippet name for filename
     */
    private sanitizeName(name: string): string {
        return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    }
}
