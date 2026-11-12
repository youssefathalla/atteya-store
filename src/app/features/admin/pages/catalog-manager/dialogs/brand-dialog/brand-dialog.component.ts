import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { Brand } from '@core/services/products/product.model';
import type { ImageAsset } from '@shared/schemas';
import { ImagePickerComponent } from '@shared/ui/image-picker';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { callableMessage } from '@shared/utils/firebase/firebase-errors';
import {
  CatalogAdminService,
  type CatalogDialogResult,
  type MenuPlacement,
} from '../../services/catalog-admin.service';
import { MenuPlacementComponent } from '../../components/menu-placement/menu-placement.component';
import { MAX_CATALOG_NAME, previewSlug } from '../../utils/catalog-manager.utils';

export interface BrandDialogData {
  /** Null = Add Brand. */
  readonly brand: Brand | null;
  /** Every brand, for the address preview. */
  readonly brands: readonly Brand[];
}

/** What the window closes with: the save, or `'delete'` when Delete was pressed in Edit. */
export type BrandDialogResult = CatalogDialogResult | 'delete';

/** Add or edit one brand (Name, Logo, Show in the menu, Shown on the store; ATS-264). Saves through `saveBrand` and closes with its result. */
@Component({
  selector: 'app-brand-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    SharedIconModule,
    ImagePickerComponent,
    MenuPlacementComponent,
  ],
  templateUrl: './brand-dialog.component.html',
})
export class BrandDialogComponent {
  readonly #data = inject<BrandDialogData>(MAT_DIALOG_DATA);
  readonly #ref = inject<MatDialogRef<BrandDialogComponent, BrandDialogResult>>(MatDialogRef);
  readonly #catalog = inject(CatalogAdminService);

  readonly maxName = MAX_CATALOG_NAME;
  readonly isNew = this.#data.brand === null;
  readonly title = this.isNew ? 'Add Brand' : `Edit ${this.#data.brand?.name ?? 'Brand'}`;
  readonly saveLabel = this.isNew ? 'Add Brand' : 'Save Changes';

  readonly name = signal(this.#data.brand?.name ?? '');
  readonly logo = signal<ImageAsset | null>(this.#data.brand?.logo ?? null);
  readonly published = signal(this.#data.brand?.published ?? true);
  readonly addToMenu = signal(false);
  readonly menuId = signal<string | null>(null);
  readonly menuColumn = signal<number | null>(null);
  readonly isSaving = signal(false);
  readonly error = signal('');

  readonly savedName = this.#data.brand?.name ?? '';
  readonly renamed = computed(
    () =>
      !this.isNew && this.name().replace(/\s+/g, ' ').trim() !== this.savedName && this.name().trim() !== '',
  );

  readonly slug = computed(() =>
    this.isNew
      ? previewSlug(
          this.name(),
          'brands',
          this.#data.brands.map((item) => item.id),
        )
      : (this.#data.brand?.slug ?? ''),
  );

  readonly logoFolder = computed(() => `brands/${this.slug() || 'new'}` as const);

  /** Edit → Delete: the list runs the same checks as the ⋮ menu. */
  requestDelete(): void {
    this.#ref.close('delete');
  }

  textFrom(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  async save(): Promise<void> {
    if (this.isSaving()) return;
    const name = this.name().replace(/\s+/g, ' ').trim();
    if (!name) {
      this.error.set('Enter a name for the brand.');
      return;
    }
    if (this.isNew && !this.slug()) {
      this.error.set('Use at least one letter or number in the name.');
      return;
    }
    const logo = this.logo();
    if (logo && logo.path && !logo.alt.trim()) {
      this.error.set('Describe the logo in a few words.');
      return;
    }
    const menuId = this.menuId();
    const menuColumn = this.menuColumn();
    const wantsMenu = this.isNew && this.addToMenu();
    if (wantsMenu && (menuId === null || menuColumn === null)) {
      this.error.set('Pick a menu and a column, or turn off the menu switch.');
      return;
    }

    this.error.set('');
    this.isSaving.set(true);
    try {
      const result = await this.#catalog.saveBrand({
        id: this.#data.brand?.id ?? null,
        name,
        logo: logo && logo.path ? logo : null,
        published: this.published(),
      });
      this.#ref.close(
        wantsMenu && menuId !== null && menuColumn !== null
          ? await this.#addToMenu(result, name, { menuId, columnIndex: menuColumn })
          : result,
      );
    } catch (error: unknown) {
      this.error.set(callableMessage(error) ?? "We couldn't save the brand. Please try again.");
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Adds the new brand's link after it is saved; a failure keeps the brand (ATS-248). */
  async #addToMenu(
    result: CatalogDialogResult,
    name: string,
    placement: MenuPlacement,
  ): Promise<CatalogDialogResult> {
    try {
      await this.#catalog.addToMenu(placement, {
        label: name,
        path: `/brand/${result.id}`,
        target: { kind: 'brand', id: result.id },
        isBrand: true,
      });
      return result;
    } catch {
      return { ...result, menuFailed: true };
    }
  }
}
