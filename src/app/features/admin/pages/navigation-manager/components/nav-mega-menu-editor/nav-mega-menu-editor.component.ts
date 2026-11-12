import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SharedIconModule } from '@shared/ui/mat-icon';
import {
  MegaMenuColumn,
  MegaMenuLink,
  NAV_AUTO_DEFAULT_LIMIT,
  NAV_AUTO_KIND_LABELS,
  NAV_AUTO_KINDS,
  NAV_AUTO_MAX_LIMIT,
  type NavAutoColumn,
  type NavAutoKind,
} from '@core/services/navigation';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import {
  NavTargetFieldComponent,
  type NavTargetChange,
} from '../nav-target-field/nav-target-field.component';

/** A category a "Sub-categories of …" column can fill from. */
export interface NavAutoParentOption {
  readonly id: string;
  readonly name: string;
}

@Component({
  selector: 'app-nav-mega-menu-editor',
  templateUrl: './nav-mega-menu-editor.component.html',
  imports: [
    FormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    MatTooltipModule,
    MatDividerModule,
    MatSelectModule,
    MatSlideToggleModule,
    SharedIconModule,
    NavTargetFieldComponent,
  ],
})
export class NavMegaMenuEditorComponent {
  readonly columns = input.required<readonly MegaMenuColumn[]>();
  /** Per column, what a Fill Automatically column shows on the store now (empty otherwise). */
  readonly previews = input<readonly (readonly MegaMenuLink[])[]>([]);
  /** Top-level categories for "Sub-categories of …". */
  readonly parentOptions = input<readonly NavAutoParentOption[]>([]);

  readonly columnAutoChange = output<{ colIndex: number; auto: NavAutoColumn | null }>();

  readonly autoKinds = NAV_AUTO_KINDS;
  readonly autoKindLabels = NAV_AUTO_KIND_LABELS;
  readonly maxLimit = NAV_AUTO_MAX_LIMIT;

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
  readonly linkTargetChange = output<{ colIndex: number; linkIndex: number; change: NavTargetChange }>();
  readonly linkGenerateSlug = output<{ colIndex: number; linkIndex: number }>();

  /** Fill Automatically switched: on starts as "All Brands"; off keeps the column's links. */
  toggleAuto(colIndex: number, on: boolean): void {
    this.columnAutoChange.emit({
      colIndex,
      auto: on ? { kind: 'brands', limit: NAV_AUTO_DEFAULT_LIMIT } : null,
    });
  }

  changeKind(colIndex: number, current: NavAutoColumn, kind: NavAutoKind): void {
    const limit =
      current.kind === 'children' ? NAV_AUTO_DEFAULT_LIMIT : (current.limit ?? NAV_AUTO_DEFAULT_LIMIT);
    let auto: NavAutoColumn | null = null;
    if (kind === 'brands') auto = { kind, limit };
    if (kind === 'newest-brands') auto = { kind, limit };
    if (kind === 'children') {
      const categoryId = this.parentOptions()[0]?.id;
      if (categoryId) auto = { kind, categoryId };
    }
    if (auto) this.columnAutoChange.emit({ colIndex, auto });
  }

  changeCategory(colIndex: number, categoryId: string): void {
    if (categoryId) this.columnAutoChange.emit({ colIndex, auto: { kind: 'children', categoryId } });
  }

  /** "Show at most": a whole number from 1 to 20; anything else leaves the saved number. */
  changeLimit(colIndex: number, current: NavAutoColumn, value: unknown): void {
    if (current.kind === 'children') return;
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1 || limit > NAV_AUTO_MAX_LIMIT) return;
    this.columnAutoChange.emit({ colIndex, auto: { kind: current.kind, limit } });
  }

  limitOf(auto: NavAutoColumn): number {
    return auto.kind === 'children' ? NAV_AUTO_DEFAULT_LIMIT : (auto.limit ?? NAV_AUTO_DEFAULT_LIMIT);
  }
}
