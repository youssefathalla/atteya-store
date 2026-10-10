import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SharedIconModule } from '@shared/ui/mat-icon';

export interface AddColumnDialogData {
  categoryLabel?: string;
}

export interface AddColumnDialogResult {
  title: string;
}

@Component({
  selector: 'app-add-column-dialog',
  templateUrl: './add-column-dialog.component.html',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    SharedIconModule,
  ],
})
export class AddColumnDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<AddColumnDialogComponent, AddColumnDialogResult | null>);
  readonly data = inject<AddColumnDialogData>(MAT_DIALOG_DATA, { optional: true });

  readonly title = signal<string>('');

  readonly isValid = computed(() => this.title().trim().length > 0);

  submit(): void {
    if (!this.isValid()) return;
    this.#dialogRef.close({ title: this.title().trim() });
  }

  cancel(): void {
    this.#dialogRef.close(null);
  }
}
