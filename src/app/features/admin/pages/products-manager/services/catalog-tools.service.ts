import { inject, Service, signal } from '@angular/core';
import * as v from 'valibot';
import { callableFrom, injectFunctionsAsync } from '@core/firebase';
import { SearchService } from '@core/services/search';
import type { MigratePass, MigrateReport, ReindexSearchReport } from '../models/product-admin.model';

const wholeNumber = v.pipe(v.number(), v.integer(), v.minValue(0));

const ReindexResponseSchema = v.object({
  dryRun: v.boolean(),
  indexName: v.string(),
  indexed: wholeNumber,
  deleted: wholeNumber,
});

const SeedCountsSchema = v.object({
  created: wholeNumber,
  repaired: wholeNumber,
  unchanged: wholeNumber,
});

const MigrateResponseSchema = v.object({
  dryRun: v.boolean(),
  pass: v.picklist(['add', 'dropLegacy']),
  categories: SeedCountsSchema,
  brands: SeedCountsSchema,
  products: v.object({
    updated: wholeNumber,
    unchanged: wholeNumber,
    missingNewFields: wholeNumber,
    colorsFromOptions: v.optional(wholeNumber, 0),
    colorsFromName: v.optional(wholeNumber, 0),
    colorsMissing: v.optional(wholeNumber, 0),
    colorsKept: v.optional(wholeNumber, 0),
    stockMissing: v.optional(wholeNumber, 0),
  }),
  shippingSeeded: v.optional(v.boolean(), false),
  sample: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      categoryId: v.string(),
      categoryIds: v.array(v.string()),
      brandId: v.string(),
      summary: v.string(),
    }),
  ),
});

const grams = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100_000));

const ProductWeightsSchema = v.object({
  categories: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      path: v.string(),
      savedGrams: v.optional(v.nullable(grams)),
      grams: v.nullable(grams),
      missing: wholeNumber,
    }),
  ),
  missingTotal: wholeNumber,
  missing: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      categoryId: v.string(),
      suggestedGrams: v.nullable(grams),
    }),
  ),
  filled: wholeNumber,
});

export type ProductWeightsReport = v.InferOutput<typeof ProductWeightsSchema>;

export type ProductWeightsRequest =
  | { readonly action: 'preview' | 'fillEmpty' }
  | { readonly action: 'saveDefaults'; readonly weights: Readonly<Record<string, number | null>> };

interface MigratePayload {
  readonly dryRun: boolean;
  readonly pass: MigratePass;
}

@Service()
export class CatalogToolsService {
  readonly #functions = injectFunctionsAsync();
  readonly #searchService = inject(SearchService);
  readonly #busy = signal(false);

  readonly busy = this.#busy.asReadonly();

  async migrateCatalog(pass: MigratePass, dryRun: boolean): Promise<MigrateReport> {
    if (this.#busy()) {
      throw new Error('A catalogue tool is already running.');
    }
    this.#busy.set(true);
    try {
      const migrate = await callableFrom<MigratePayload, unknown>(
        this.#functions(),
        'migrateCatalogStructure',
        { timeout: 300_000 },
      );
      const result = await migrate({ pass, dryRun });
      const parsed = v.safeParse(MigrateResponseSchema, result.data);
      if (!parsed.success) {
        throw new Error('The catalogue check finished, but the response was unexpected.');
      }
      return parsed.output;
    } finally {
      this.#busy.set(false);
    }
  }

  /**
   * Shipping weights (`productWeights` callable): preview, save category defaults, or fill the
   * products that have no weight. Every call returns the fresh report.
   */
  async productWeights(request: ProductWeightsRequest): Promise<ProductWeightsReport> {
    const call = await callableFrom<ProductWeightsRequest, unknown>(
      this.#functions(),
      'productWeights',
      { timeout: 300_000 },
    );
    const result = await call(request);
    const parsed = v.safeParse(ProductWeightsSchema, result.data);
    if (!parsed.success) {
      throw new Error('The shipping weights loaded, but the response was unexpected.');
    }
    return parsed.output;
  }

  async reindexSearch(dryRun: boolean): Promise<ReindexSearchReport> {
    if (this.#busy()) {
      throw new Error('A catalogue tool is already running.');
    }
    this.#busy.set(true);
    try {
      const reindex = await callableFrom<{ readonly dryRun: boolean }, unknown>(
        this.#functions(),
        'reindexSearch',
        { timeout: 300_000 },
      );
      const result = await reindex({ dryRun });
      const parsed = v.safeParse(ReindexResponseSchema, result.data);
      if (!parsed.success) {
        throw new Error('The search rebuild finished, but the response was unexpected.');
      }
      if (!dryRun) {
        await this.#searchService.clearCache();
      }
      return parsed.output;
    } finally {
      this.#busy.set(false);
    }
  }
}
