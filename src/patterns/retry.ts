export interface RetryOptions {
    maxAttempts: number;
    backoff?: 'linear' | 'exponential';
    initialDelay?: number;
    retryIf?: (error: unknown) => boolean;
}

export async function retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions
): Promise<T> {
    const { maxAttempts, backoff = 'linear', initialDelay = 1000, retryIf } = options;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (retryIf && !retryIf(error)) {
                throw error;
            }
            if (attempt === maxAttempts) {
                throw error;
            }

            const delay = backoff === 'exponential'
                ? initialDelay * Math.pow(2, attempt - 1)
                : initialDelay;

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}
