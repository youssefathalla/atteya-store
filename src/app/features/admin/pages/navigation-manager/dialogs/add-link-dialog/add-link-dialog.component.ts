import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { normalizePath, slugify } from '../../utils/navigation-manager.utils';

export interface AddLinkDialogData {
  columnTitle?: string;
  categoryPath?: string;
  isBrand?: boolean;
}

export interface AddLinkDialogResult {
  label: string;
  path: string;
  badge?: string;
  isBrand?: boolean;
}

@Component({
  selector: 'app-add-link-dialog',
  templateUrl: './add-link-dialog.component.html',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    SharedIconModule,
  ],
})
export class AddLinkDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<AddLinkDialogComponent, AddLinkDialogResult | null>);
  readonly data = inject<AddLinkDialogData>(MAT_DIALOG_DATA, { optional: true });

  readonly label = signal<string>('');
  readonly path = signal<string>(
    this.data?.isBrand ? '/brand/' : this.data?.categoryPath ? `${this.data.categoryPath}/` : '/category/',
  );
  readonly badge = signal<string>('');
  readonly isBrand = signal<boolean>(this.data?.isBrand ?? false);
  readonly isManualPath = signal<boolean>(false);

  readonly isValid = computed(() => {
    return this.label().trim().length > 0 && this.path().trim().length > 0;
  });

  onLabelChange(value: string): void {
    this.label.set(value);
    if (!this.isManualPath()) {
      const basePath = this.isBrand() ? '/brand' : this.data?.categoryPath || '/category';
      const slug = slugify(value);
      this.path.set(slug ? `${basePath}/${slug}` : `${basePath}/`);
    }
  }

  onIsBrandChange(checked: boolean): void {
    this.isBrand.set(checked);
    if (!this.isManualPath()) {
      const basePath = checked ? '/brand' : this.data?.categoryPath || '/category';
      const slug = slugify(this.label());
      this.path.set(slug ? `${basePath}/${slug}` : `${basePath}/`);
    }
  }

  onPathChange(value: string): void {
    this.path.set(value);
    this.isManualPath.set(true);
  }

  generateSlug(): void {
    const basePath = this.isBrand() ? '/brand' : this.data?.categoryPath || '/category';
    const slug = slugify(this.label());
    this.path.set(slug ? `${basePath}/${slug}` : `${basePath}/`);
    this.isManualPath.set(false);
  }

  submit(): void {
    if (!this.isValid()) return;
    this.#dialogRef.close({
      label: this.label().trim(),
      path: normalizePath(this.path().trim()),
      badge: this.badge().trim() || undefined,
      isBrand: this.isBrand() || undefined,
    });
  }

  cancel(): void {
    this.#dialogRef.close(null);
  }
}
