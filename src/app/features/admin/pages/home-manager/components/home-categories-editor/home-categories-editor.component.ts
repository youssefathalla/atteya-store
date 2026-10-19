import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { ImagePickerComponent } from '@shared/ui/image-picker';
import { ImageAsset } from '@shared/schemas';
import { ShopCategoryCard } from '../../models/home-manager.model';

@Component({
  selector: 'app-home-categories-editor',
  templateUrl: './home-categories-editor.component.html',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    SharedIconModule,
    ImagePickerComponent,
  ],
})
export class HomeCategoriesEditorComponent {
  readonly sectionTitle = input.required<string>();
  readonly cards = input.required<readonly ShopCategoryCard[]>();
  readonly activeCardIndex = input.required<number>();
  readonly activeCard = input.required<ShopCategoryCard>();

  readonly activeCardChange = output<number>();
  readonly titleChange = output<string>();
  readonly imageUrlChange = output<string>();
  readonly imageAltChange = output<string>();
  readonly buttonLabelChange = output<string>();
  readonly buttonLinkChange = output<string>();
  readonly sessionUpload = output<string>();

  readonly pickerLabel = computed<string>(() => {
    const idx = this.activeCardIndex() + 1;
    const label = this.activeCard().buttonLabel || `Card #${idx}`;
    return `1. Card #${idx} (${label}) Image`;
  });

  readonly cardAsset = computed<ImageAsset>(() => ({
    path: this.activeCard().imageUrl,
    alt: this.activeCard().imageAlt ?? '',
  }));

  onAssetChange(asset: ImageAsset | null): void {
    const current = this.activeCard();
    const nextPath = asset?.path ?? '';
    const nextAlt = asset?.alt ?? '';

    if (nextPath !== current.imageUrl) {
      this.imageUrlChange.emit(nextPath);
    }
    if (nextAlt !== (current.imageAlt ?? '')) {
      this.imageAltChange.emit(nextAlt);
    }
  }
}
