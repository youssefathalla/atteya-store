import { algoliasearch, type SearchClient } from 'algoliasearch';
import { logger } from 'firebase-functions';
import { algoliaAppId, ALGOLIA_WRITE_KEY } from './algolia-config.js';

let cachedClient: SearchClient | null = null;
let cachedAppId = '';
let cachedKey = '';

const BACKOFF_MS = [500, 2000, 5000] as const;

export function getSearchClient(): SearchClient {
  const appId = algoliaAppId();
  const writeKey = ALGOLIA_WRITE_KEY.value().trim();
  if (!writeKey) {
    throw new Error('ALGOLIA_WRITE_KEY secret is not configured.');
  }
  if (cachedClient && cachedAppId === appId && cachedKey === writeKey) {
    return cachedClient;
  }
  cachedClient = algoliasearch(appId, writeKey);
  cachedAppId = appId;
  cachedKey = writeKey;
  return cachedClient;
}

export async function withRetry<T>(
  op: () => Promise<T>,
  label: string,
  objectID?: string,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= BACKOFF_MS.length; attempt += 1) {
    try {
      return await op();
    } catch (error: unknown) {
      lastError = error;
      const retryable = isRetryableAlgoliaError(error);
      logger.warn('Algolia operation attempt failed', {
        label,
        ...(objectID ? { objectID } : {}),
        attempt,
        retryable,
        status: readStatus(error),
        message: safeErrorMessage(error),
      });
      if (!retryable || attempt === BACKOFF_MS.length) {
        break;
      }
      await sleep(BACKOFF_MS[attempt - 1]);
    }
  }
  throw lastError;
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 240);
  }
  return 'Algolia request failed.';
}

function readStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;
  return typeof candidate === 'number' ? candidate : null;
}

function isRetryableAlgoliaError(error: unknown): boolean {
  const status = readStatus(error);
  if (status === null) return true;
  if (status === 429 || status >= 500) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
