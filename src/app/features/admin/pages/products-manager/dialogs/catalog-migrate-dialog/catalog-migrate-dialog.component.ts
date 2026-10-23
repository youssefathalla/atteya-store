import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import type { MigrateReport } from '../../models/product-admin.model';

@Component({
  selector: 'app-catalog-migrate-dialog',
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './catalog-migrate-dialog.component.html',
})
export class CatalogMigrateDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<CatalogMigrateDialogComponent, boolean>);
  readonly report = inject<MigrateReport>(MAT_DIALOG_DATA);

  readonly title =
    this.report.pass === 'add' ? 'Check catalogue structure' : 'Remove old fields';

  readonly description =
    this.report.pass === 'add'
      ? 'This adds categories and brands to every product. Nothing is deleted.'
      : 'This removes the old single category and brand fields now that every product has the new structure.';

  apply(): void {
    this.#dialogRef.close(true);
  }
}
