import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { MegaMenuColumn, MegaMenuLink } from '@layout/navbar/nav.model';

@Component({
  selector: 'app-nav-mega-menu-editor',
  templateUrl: './nav-mega-menu-editor.component.html',
  imports: [
    FormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTooltipModule,
    SharedIconModule,
  ],
})
export class NavMegaMenuEditorComponent {
  readonly columns = input.required<readonly MegaMenuColumn[]>();

  readonly columnAdd = output<void>();
  readonly columnDelete = output<number>();
  readonly columnTitleChange = output<{ colIndex: number; title: string }>();
  readonly columnDrop = output<CdkDragDrop<MegaMenuColumn[]>>();

  readonly linkAdd = output<number>();
  readonly linkDelete = output<{ colIndex: number; linkIndex: number }>();
  readonly linkFieldChange = output<{
    colIndex: number;
    linkIndex: number;
    field: keyof MegaMenuLink;
    value: unknown;
  }>();
  readonly linkDrop = output<{ colIndex: number; event: CdkDragDrop<MegaMenuLink[]> }>();
  readonly linkGenerateSlug = output<{ colIndex: number; linkIndex: number }>();
}
