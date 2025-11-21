import { describe, it, expect, vi } from 'vitest';
import { sequence, parallel, retry, conditional } from '../src/patterns/index.js';

describe('Patterns', () => {
    describe('sequence', () => {
        it('should execute steps in order', async () => {
            const step1 = async (ctx: number) => ctx + 1;
            const step2 = async (ctx: number) => ctx * 2;

            const result = await sequence([step1, step2], 1);
            expect(result).toBe(4); // (1 + 1) * 2 = 4
        });
    });

    describe('parallel', () => {
        it('should execute tasks concurrently', async () => {
            const task1 = async () => 1;
            const task2 = async () => 2;

            const result = await parallel([task1, task2]);
            expect(result).toEqual([1, 2]);
        });
    });

    describe('retry', () => {
        it('should retry on failure', async () => {
            let attempts = 0;
            const fn = async () => {
                attempts++;
                if (attempts < 3) throw new Error('fail');
                return 'success';
            };

            const result = await retry(fn, { maxAttempts: 3, initialDelay: 10 });
            expect(result).toBe('success');
            expect(attempts).toBe(3);
        });

        it('should fail after max attempts', async () => {
            const fn = async () => { throw new Error('fail'); };

            await expect(retry(fn, { maxAttempts: 2, initialDelay: 10 }))
                .rejects.toThrow('fail');
        });
    });

    describe('conditional', () => {
        it('should execute then branch if condition is true', async () => {
            const result = await conditional({
                condition: () => true,
                then: async () => 'then',
                else: async () => 'else'
            });
            expect(result).toBe('then');
        });

        it('should execute else branch if condition is false', async () => {
            const result = await conditional({
                condition: () => false,
                then: async () => 'then',
                else: async () => 'else'
            });
            expect(result).toBe('else');
        });
    });
});
