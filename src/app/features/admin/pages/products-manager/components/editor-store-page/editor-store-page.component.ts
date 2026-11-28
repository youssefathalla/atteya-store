import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import { LogoComponent } from '@shared/ui/logo/logo.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { normalizeImageKitPath } from '@shared/utils/image';
import type { EditorPageView, PreviewDevice } from '../../models/editor-preview.model';

/**
 * The product page as shoppers see it, drawn from the unsaved editor (ATS-393): the store's own
 * classes (`product-page.css`) laid out for a computer or a phone, whatever the admin's screen is.
 * `compact` keeps only the text part (Product tab); `marked` draws the dashed lines that match the
 * Name, Description and Details boxes. The editor shows it inside an `inert` preview.
 */
@Component({
  selector: 'app-editor-store-page',
  host: { class: 'block w-full' },
  imports: [
    NgOptimizedImage,
    AppImageFallbackDirective,
    EgpPricePipe,
    LogoComponent,
    MatButtonModule,
    SharedIconModule,
  ],
  templateUrl: './editor-store-page.component.html',
})
export class EditorStorePageComponent {
  readonly page = input.required<EditorPageView>();
  readonly device = input<PreviewDevice>('computer');
  readonly compact = input(false);
  readonly marked = input(false);

  /** Two photos side by side on a computer, like the store from 80rem up; one on a phone. */
  readonly shownPhotos = computed(() => this.page().photos.slice(0, this.device() === 'computer' ? 2 : 1));

  readonly addLabel = computed(() => {
    const page = this.page();
    if (page.soldOut) return 'Out of Stock';
    return page.price === null ? 'Add to Bag' : `Add to Bag · EGP ${page.price.toLocaleString('en-US')}`;
  });

  imagePath(rawPath: string): string {
    return normalizeImageKitPath(rawPath);
  }
}
