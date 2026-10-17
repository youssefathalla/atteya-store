import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { ImagePickerComponent } from '@shared/ui/image-picker';
import { ImageAsset } from '@shared/schemas';
import {
  ActionMoveEvent,
  HeroAction,
  HeroLayoutCount,
  HeroSlide,
} from '../../models/home-manager.model';

@Component({
  selector: 'app-home-hero-editor',
  templateUrl: './home-hero-editor.component.html',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTooltipModule,
    SharedIconModule,
    ImagePickerComponent,
  ],
})
export class HomeHeroEditorComponent {
  readonly layoutCount = input.required<HeroLayoutCount>();
  readonly activeSlotIndex = input.required<number>();
  readonly slide = input.required<HeroSlide>();

  readonly activeSlotChange = output<number>();
  readonly headlineChange = output<string>();
  readonly subtitleChange = output<string>();
  readonly imageUrlChange = output<string>();
  readonly imageAltChange = output<string>();
  readonly sessionUpload = output<string>();

  readonly actionAdd = output<void>();
  readonly actionEdit = output<{ index: number; action: HeroAction }>();
  readonly actionDelete = output<number>();
  readonly actionMove = output<ActionMoveEvent>();

  protected readonly slotIndexes = computed<readonly number[]>(() =>
    Array.from({ length: this.layoutCount() }, (_, i) => i),
  );

  protected readonly pickerLabel = computed<string>(
    () => `1. Banner #${this.activeSlotIndex() + 1} Image`,
  );

  protected readonly slideAsset = computed<ImageAsset>(() => ({
    path: this.slide().imageUrl,
    alt: this.slide().imageAlt ?? '',
  }));

  protected onAssetChange(asset: ImageAsset | null): void {
    const current = this.slide();
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
