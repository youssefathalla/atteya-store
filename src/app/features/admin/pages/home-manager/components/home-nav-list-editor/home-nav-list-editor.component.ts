import { Component, computed, input, output } from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { ImagePickerComponent } from '@shared/ui/image-picker';
import { ImageAsset } from '@shared/schemas';
import { NAV_LIST_MAX_ITEMS } from '@features/home/data/home.data';
import { ActionMoveEvent, HomeNavListItem } from '../../models/home-manager.model';
import {
  NavTargetFieldComponent,
  type NavTargetChange,
} from '../../../navigation-manager/components/nav-target-field/nav-target-field.component';

@Component({
  selector: 'app-home-nav-list-editor',
  templateUrl: './home-nav-list-editor.component.html',
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
    ImagePickerComponent,
    NavTargetFieldComponent,
  ],
})
export class HomeNavListEditorComponent {
  readonly sectionTitle = input.required<string>();
  readonly items = input.required<readonly HomeNavListItem[]>();
  readonly activeItemIndex = input.required<number>();
  readonly activeItem = input.required<HomeNavListItem>();
  readonly isFull = input<boolean>(false);

  readonly activeItemChange = output<number>();
  readonly titleChange = output<string>();
  readonly labelChange = output<string>();
  readonly targetChange = output<NavTargetChange>();
  readonly imageUrlChange = output<string>();
  readonly imageAltChange = output<string>();
  readonly sessionUpload = output<string>();
  readonly itemAdd = output<void>();
  readonly itemRemove = output<number>();
  readonly itemMove = output<ActionMoveEvent>();
  readonly itemDrop = output<CdkDragDrop<HomeNavListItem[]>>();
  readonly importMenu = output<void>();

  readonly maxItems = NAV_LIST_MAX_ITEMS;

  readonly pickerLabel = computed(() => {
    const name = this.activeItem().label.trim() || `Link ${this.activeItemIndex() + 1}`;
    return `Photo for ${name}`;
  });

  readonly itemAsset = computed<ImageAsset>(() => ({
    path: this.activeItem().imageUrl,
    alt: this.activeItem().imageAlt ?? '',
  }));

  onAssetChange(asset: ImageAsset | null): void {
    const current = this.activeItem();
    const nextPath = asset?.path ?? '';
    const nextAlt = asset?.alt ?? '';
    if (nextPath !== current.imageUrl) this.imageUrlChange.emit(nextPath);
    if (nextAlt !== (current.imageAlt ?? '')) this.imageAltChange.emit(nextAlt);
  }
}
