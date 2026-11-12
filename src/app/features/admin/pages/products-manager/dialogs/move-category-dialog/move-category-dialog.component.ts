import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { callableMessage } from '@shared/utils/firebase/firebase-errors';
import type { CategoryFilterOptionView, MoveProductsResult } from '../../models/product-admin.model';
import { moveSummary } from '../../utils/product-admin.utils';

export interface MoveCategoryDialogData {
  /** Product (colour) ids to move. */
  readonly productIds: readonly string[];
  /** Main categories, then the ones inside them ("Apparel › Socks"), hidden ones marked. */
  readonly options: readonly CategoryFilterOptionView[];
  /** "Apparel › Hoodies" for a category id, without the hidden mark. */
  readonly labelFor: (categoryId: string) => string;
  /** The current category labels of the chosen products. */
  readonly currentLabels: readonly string[];
  readonly move: (categoryId: string) => Promise<MoveProductsResult>;
}

export interface MoveCategoryDialogResult extends MoveProductsResult {
  readonly categoryLabel: string;
}

/** Move to Category on the admin Products list (ATS-266). */
@Component({
  selector: 'app-move-category-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatSelectModule, MatProgressSpinnerModule],
  templateUrl: './move-category-dialog.component.html',
})
export class MoveCategoryDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<MoveCategoryDialogComponent, MoveCategoryDialogResult | null>);
  readonly data = inject<MoveCategoryDialogData>(MAT_DIALOG_DATA);

  readonly categoryId = signal<string | null>(null);
  readonly isMoving = signal(false);
  readonly errorMessage = signal('');

  readonly count = this.data.productIds.length;
  readonly moveLabel = `Move ${this.count} ${this.count === 1 ? 'Product' : 'Products'}`;

  readonly summary = computed(() => {
    const id = this.categoryId();
    return id ? moveSummary(this.count, this.data.labelFor(id), this.data.currentLabels) : '';
  });

  pick(id: string): void {
    this.categoryId.set(id);
    this.errorMessage.set('');
  }

  async onMove(event: Event): Promise<void> {
    event.preventDefault();
    const id = this.categoryId();
    if (!id || this.isMoving()) return;
    this.isMoving.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.data.move(id);
      this.#dialogRef.close({ ...result, categoryLabel: this.data.labelFor(id) });
    } catch (error: unknown) {
      this.errorMessage.set(callableMessage(error) ?? "We couldn't move the products. Please try again.");
    } finally {
      this.isMoving.set(false);
    }
  }

  cancel(): void {
    if (!this.isMoving()) this.#dialogRef.close(null);
  }
}
