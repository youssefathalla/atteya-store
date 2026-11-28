import { NgOptimizedImage } from '@angular/common';
import { Component, input } from '@angular/core';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { normalizeImageKitPath } from '@shared/utils/image';
import type { EditorCardView } from '../../models/editor-preview.model';

/**
 * The Shop card as shoppers see it (same classes as `app-product-card`), drawn from the unsaved
 * editor (ATS-393). It never opens anything: the editor shows it inside an `inert` preview.
 * `marked` draws the dashed lines that match the Name and Short summary boxes.
 */
@Component({
  selector: 'app-editor-shop-card',
  host: { class: 'product-card block w-full', '[class.product-card--badged]': '!!card().badge' },
  imports: [NgOptimizedImage, AppImageFallbackDirective, EgpPricePipe, SharedIconModule],
  templateUrl: './editor-shop-card.component.html',
})
export class EditorShopCardComponent {
  readonly card = input.required<EditorCardView>();
  readonly marked = input(false);
  readonly sizes = input('16rem');

  imagePath(rawPath: string): string {
    return normalizeImageKitPath(rawPath);
  }
}
