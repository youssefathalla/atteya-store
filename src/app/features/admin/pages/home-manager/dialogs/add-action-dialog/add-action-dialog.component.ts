import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { HeroAction } from '../../models/home-manager.model';

export interface AddActionDialogData {
  readonly action?: HeroAction;
}

export type AddActionDialogResult = HeroAction;

@Component({
  selector: 'app-add-action-dialog',
  templateUrl: './add-action-dialog.component.html',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
})
export class AddActionDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<AddActionDialogComponent, AddActionDialogResult | null>);
  readonly data = inject<AddActionDialogData>(MAT_DIALOG_DATA, { optional: true });

  readonly isEdit = computed(() => !!this.data?.action);
  readonly label = signal<string>(this.data?.action?.label ?? '');
  readonly link = signal<string>(this.data?.action?.link ?? '/category/');

  readonly isValid = computed(() => {
    return this.label().trim().length > 0 && this.link().trim().length > 0;
  });

  submit(): void {
    if (!this.isValid()) return;
    this.#dialogRef.close({
      label: this.label().trim(),
      link: this.link().trim(),
    });
  }

  cancel(): void {
    this.#dialogRef.close(null);
  }
}
