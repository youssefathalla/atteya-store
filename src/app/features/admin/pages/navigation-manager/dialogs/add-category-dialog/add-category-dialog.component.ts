import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { normalizePath, slugify } from '../../utils/navigation-manager.utils';

export interface AddCategoryDialogResult {
  label: string;
  path: string;
}

@Component({
  selector: 'app-add-category-dialog',
  templateUrl: './add-category-dialog.component.html',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    SharedIconModule,
  ],
})
export class AddCategoryDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<AddCategoryDialogComponent, AddCategoryDialogResult | null>);

  readonly label = signal<string>('');
  readonly path = signal<string>('/category');
  readonly isManualPath = signal<boolean>(false);

  readonly isValid = computed(() => {
    return this.label().trim().length > 0 && this.path().trim().length > 0;
  });

  onLabelChange(value: string): void {
    this.label.set(value);
    if (!this.isManualPath()) {
      const slug = slugify(value);
      this.path.set(slug ? `/category/${slug}` : '/category');
    }
  }

  onPathChange(value: string): void {
    this.path.set(value);
    this.isManualPath.set(true);
  }

  generateSlug(): void {
    const slug = slugify(this.label());
    this.path.set(slug ? `/category/${slug}` : '/category');
    this.isManualPath.set(false);
  }

  submit(): void {
    if (!this.isValid()) return;
    this.#dialogRef.close({
      label: this.label().trim(),
      path: normalizePath(this.path().trim()),
    });
  }

  cancel(): void {
    this.#dialogRef.close(null);
  }
}
