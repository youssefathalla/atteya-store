import { Service, signal } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import * as v from 'valibot';
import { injectFunctions } from '@core/firebase';
import type { MigratePass, MigrateReport } from '../models/product-admin.model';

const wholeNumber = v.pipe(v.number(), v.integer(), v.minValue(0));

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
  }),
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

interface MigratePayload {
  readonly dryRun: boolean;
  readonly pass: MigratePass;
}

@Service()
export class CatalogToolsService {
  readonly #functions = injectFunctions();
  readonly #migrateCallable = httpsCallable<MigratePayload, unknown>(
    this.#functions,
    'migrateCatalogStructure',
    { timeout: 300_000 },
  );
  readonly #busy = signal(false);

  readonly busy = this.#busy.asReadonly();

  async migrateCatalog(pass: MigratePass, dryRun: boolean): Promise<MigrateReport> {
    if (this.#busy()) {
      throw new Error('A catalogue tool is already running.');
    }
    this.#busy.set(true);
    try {
      const result = await this.#migrateCallable({ pass, dryRun });
      const parsed = v.safeParse(MigrateResponseSchema, result.data);
      if (!parsed.success) {
        throw new Error('The catalogue check finished, but the response was unexpected.');
      }
      return parsed.output;
    } finally {
      this.#busy.set(false);
    }
  }
}
