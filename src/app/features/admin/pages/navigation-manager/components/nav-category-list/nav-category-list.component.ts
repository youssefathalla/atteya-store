import { Component, input, output } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { NavCategory } from '@layout/navbar/nav.model';

@Component({
  selector: 'app-nav-category-list',
  templateUrl: './nav-category-list.component.html',
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    MatButtonModule,
    MatTooltipModule,
    SharedIconModule,
  ],
})
export class NavCategoryListComponent {
  readonly categories = input.required<readonly NavCategory[]>();
  readonly selectedCategoryId = input<string | null>(null);

  readonly categorySelect = output<string>();
  readonly categoryAdd = output<void>();
  readonly categoryDelete = output<string>();
  readonly categoryMove = output<{ index: number; direction: 'up' | 'down' }>();
  readonly categoryDrop = output<CdkDragDrop<NavCategory[]>>();
}
