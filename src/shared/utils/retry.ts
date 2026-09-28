import { sleep } from './delay';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
  shouldRetry?: (error: Error) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxRetries, baseDelayMs = 2000, shouldRetry } = options;
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) break;

      if (shouldRetry && !shouldRetry(lastError)) break;

      const backoffDelay = baseDelayMs * Math.pow(2, attempt);
      await sleep(backoffDelay);
    }
  }

  throw lastError;
}
