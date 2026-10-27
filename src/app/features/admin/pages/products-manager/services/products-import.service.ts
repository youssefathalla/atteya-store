import { computed, Service, signal } from '@angular/core';
import * as v from 'valibot';
import { callableFrom, injectFunctionsAsync } from '@core/firebase';
import type { ImportCountsView, ImportReport, ImportRowView } from '../models/product-admin.model';

interface MutableCounts {
  created: number;
  updated: number;
  unchanged: number;
  skippedLocked: number;
  imagesCopied: number;
  imagesSkipped: number;
  unpublishedMissing: number;
}

const wholeNumber = v.pipe(v.number(), v.integer(), v.minValue(0));

const ImportResponseSchema = v.object({
  runId: v.pipe(v.string(), v.minLength(1)),
  dryRun: v.boolean(),
  total: wholeNumber,
  processed: wholeNumber,
  nextOffset: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  counts: v.object({
    created: wholeNumber,
    updated: wholeNumber,
    unchanged: wholeNumber,
    skippedLocked: wholeNumber,
    imagesCopied: wholeNumber,
    imagesSkipped: wholeNumber,
    unpublishedMissing: wholeNumber,
  }),
  rows: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      type: v.string(),
      brand: v.string(),
      modelGroup: v.nullable(v.string()),
      price: wholeNumber,
      compareAtPrice: v.nullable(wholeNumber),
      images: wholeNumber,
      options: v.array(v.string()),
      action: v.picklist(['create', 'update', 'unchanged']),
      warnings: v.array(v.string()),
    }),
  ),
  errors: v.array(v.string()),
});

interface ImportPayload {
  readonly dryRun: boolean;
  readonly offset: number;
  readonly batchSize: number;
  readonly runId?: string;
}

type ImportResponse = v.InferOutput<typeof ImportResponseSchema>;

@Service()
export class ProductsImportService {
  readonly #functions = injectFunctionsAsync();
  readonly #mode = signal<'preview' | 'import' | null>(null);
  readonly #progress = signal<{ processed: number; total: number } | null>(null);

  readonly mode = this.#mode.asReadonly();
  readonly progressValue = computed(() => {
    const progress = this.#progress();
    if (!progress || progress.total === 0) return 0;
    return Math.round((progress.processed / progress.total) * 100);
  });
  readonly progressLabel = computed(() => {
    const progress = this.#progress();
    const mode = this.#mode();
    if (!progress || !mode) return '';
    const verb = mode === 'preview' ? 'Checked' : 'Copied';
    return `${verb} ${progress.processed} of ${progress.total}`;
  });

  async run(dryRun: boolean): Promise<ImportReport> {
    if (this.#mode() !== null) {
      throw new Error('An import is already running.');
    }
    this.#mode.set(dryRun ? 'preview' : 'import');
    this.#progress.set(null);
    try {
      return await this.#loop(dryRun);
    } finally {
      this.#mode.set(null);
      this.#progress.set(null);
    }
  }

  async #loop(dryRun: boolean): Promise<ImportReport> {
    let offset = 0;
    let runId: string | undefined;
    let last: ImportResponse | null = null;
    let seen = 0;
    const rows: ImportRowView[] = [];
    const errors: string[] = [];
    const dryCounts = emptyCounts();

    for (let step = 0; step < 30; step += 1) {
      const callable = await callableFrom<ImportPayload, unknown>(
        this.#functions(),
        'importEasyOrdersProducts',
        { timeout: 540_000 },
      );
      const result = await callable({
        dryRun,
        offset,
        batchSize: dryRun ? 104 : 10,
        ...(runId ? { runId } : {}),
      });
      const parsed = v.safeParse(ImportResponseSchema, result.data);
      if (!parsed.success) {
        throw new Error('The import finished, but the response was unexpected. Refresh the page.');
      }
      last = parsed.output;
      runId = last.runId;
      seen += last.processed;
      rows.push(...last.rows);
      errors.push(...last.errors);
      if (dryRun) addInto(dryCounts, last.counts);
      this.#progress.set({ processed: seen, total: last.total });
      if (last.nextOffset === null) break;
      if (last.nextOffset <= offset) {
        throw new Error('The import could not move forward. Please try again.');
      }
      offset = last.nextOffset;
    }

    if (!last || last.nextOffset !== null) {
      throw new Error('The import stopped early. Please try again.');
    }

    return {
      dryRun,
      total: last.total,
      counts: dryRun ? dryCounts : last.counts,
      rows,
      errors,
    };
  }
}

function emptyCounts(): MutableCounts {
  return {
    created: 0,
    updated: 0,
    unchanged: 0,
    skippedLocked: 0,
    imagesCopied: 0,
    imagesSkipped: 0,
    unpublishedMissing: 0,
  };
}

function addInto(target: MutableCounts, extra: ImportCountsView): void {
  target.created += extra.created;
  target.updated += extra.updated;
  target.unchanged += extra.unchanged;
  target.skippedLocked += extra.skippedLocked;
  target.imagesCopied += extra.imagesCopied;
  target.imagesSkipped += extra.imagesSkipped;
  target.unpublishedMissing += extra.unpublishedMissing;
}
