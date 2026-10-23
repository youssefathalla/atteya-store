import { HttpsError } from 'firebase-functions/v2/https';

const REAL_BATCH_DEFAULT = 10;
const REAL_BATCH_MAX = 25;
const DRY_BATCH_DEFAULT = 104;
const DRY_BATCH_MAX = 104;
const RUN_ID_MAX = 80;

export interface ImportRequest {
  readonly dryRun: boolean;
  readonly runId?: string;
  readonly offset: number;
  readonly batchSize: number;
}

export interface ImportRow {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly brand: string;
  readonly modelGroup: string | null;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly images: number;
  readonly options: readonly string[];
  readonly action: 'create' | 'update' | 'unchanged';
  readonly warnings: readonly string[];
}

export interface ImportResponse {
  readonly runId: string;
  readonly dryRun: boolean;
  readonly total: number;
  readonly processed: number;
  readonly nextOffset: number | null;
  readonly counts: {
    readonly created: number;
    readonly updated: number;
    readonly unchanged: number;
    readonly skippedLocked: number;
    readonly imagesCopied: number;
    readonly imagesSkipped: number;
    readonly unpublishedMissing: number;
  };
  readonly rows: readonly ImportRow[];
  readonly errors: readonly string[];
}

export function parseImportRequest(data: unknown): ImportRequest {
  if (!isRecord(data) || typeof data['dryRun'] !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Choose preview or import before continuing.');
  }

  const dryRun = data['dryRun'];
  const offset = readOffset(data['offset']);
  const batchSize = readBatchSize(data['batchSize'], dryRun);
  const runId = readRunId(data['runId']);
  return { dryRun, offset, batchSize, runId };
}

export function createRunId(): string {
  return `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readOffset(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new HttpsError('invalid-argument', 'The import could not continue from that place.');
  }
  return value;
}

function readBatchSize(value: unknown, dryRun: boolean): number {
  const fallback = dryRun ? DRY_BATCH_DEFAULT : REAL_BATCH_DEFAULT;
  const max = dryRun ? DRY_BATCH_MAX : REAL_BATCH_MAX;
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    throw new HttpsError(
      'invalid-argument',
      dryRun ? 'Preview can read up to 104 products at a time.' : 'Import can copy up to 25 products at a time.',
    );
  }
  return value;
}

function readRunId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'The import session is not valid. Start again.');
  }
  const runId = value.trim();
  if (runId.length === 0 || runId.length > RUN_ID_MAX || !/^[\w-]+$/.test(runId)) {
    throw new HttpsError('invalid-argument', 'The import session is not valid. Start again.');
  }
  return runId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
