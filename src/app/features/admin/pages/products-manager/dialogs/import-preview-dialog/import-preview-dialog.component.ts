import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import type { ImportReport } from '../../models/product-admin.model';
import { modelGroupLines, tallyRows } from '../../utils/product-admin.utils';

@Component({
  selector: 'app-import-preview-dialog',
  imports: [MatDialogModule, MatButtonModule, EgpPricePipe],
  templateUrl: './import-preview-dialog.component.html',
})
export class ImportPreviewDialogComponent {
  readonly report = inject<ImportReport>(MAT_DIALOG_DATA);
  readonly typeCounts = tallyRows(this.report.rows, 'type');
  readonly brandCounts = tallyRows(this.report.rows, 'brand');
  readonly groups = modelGroupLines(this.report.rows);
  readonly countLines = [
    `${this.report.counts.created} new`,
    `${this.report.counts.updated} updated`,
    `${this.report.counts.unchanged} unchanged`,
    `${this.report.counts.skippedLocked} kept your edits`,
    `${this.report.counts.imagesCopied} photos copied`,
    `${this.report.counts.imagesSkipped} photos skipped`,
    `${this.report.counts.unpublishedMissing} hidden because they were missing`,
  ];

  actionLabel(action: ImportReport['rows'][number]['action']): string {
    if (action === 'create') return 'New';
    if (action === 'update') return 'Update';
    return 'Unchanged';
  }
}
