import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgOptimizedImage } from '@angular/common';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { ImageInputError, ImageSourceService } from '@core/services/storage';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { ImageAsset } from '@shared/schemas';
import {
  IMAGE_LIMITS,
  ImageFolderPath,
  isExternalUrl,
  looksLikeDomainUrl,
  normalizeImageKitPath,
  sanitizeAltFromFilename,
} from '@shared/utils/image';

@Component({
  selector: 'app-image-gallery-editor',
  templateUrl: './image-gallery-editor.component.html',
  imports: [
    FormsModule,
    NgOptimizedImage,
    AppImageFallbackDirective,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    SharedIconModule,
  ],
})
export class ImageGalleryEditorComponent {
  readonly #imageSource = inject(ImageSourceService);
  readonly #snackbar = inject(SnackbarService);

  readonly folder = input<ImageFolderPath>('products');
  readonly images = input<readonly ImageAsset[]>([]);
  readonly maxImages = input<number>(IMAGE_LIMITS.maxGallerySize);
  readonly title = input<string>('Product Image Gallery');
  readonly subtitle = input<string>(
    'Add up to 8 photos. Drag to reorder — the first photo is the Main Image used on cards and social sharing.',
  );
  readonly defaultAlt = input<string>('');

  readonly imagesChange = output<ImageAsset[]>();
  readonly uploaded = output<string>();

  readonly #isUploadingFiles = signal(false);
  readonly #isImportingUrl = signal(false);
  readonly #showWebLinkBar = signal(false);
  readonly #webLinkInput = signal('');

  protected readonly maxAltLength = IMAGE_LIMITS.maxAltLength;
  protected readonly isUploadingFiles = this.#isUploadingFiles.asReadonly();
  protected readonly isImportingUrl = this.#isImportingUrl.asReadonly();
  protected readonly showWebLinkBar = this.#showWebLinkBar.asReadonly();
  protected readonly webLinkInput = this.#webLinkInput.asReadonly();

  protected readonly isFull = computed(() => this.images().length >= this.maxImages());

  protected readonly remainingSlots = computed(() =>
    Math.max(0, this.maxImages() - this.images().length),
  );

  protected readonly isExternalUrlInput = computed(() => {
    const raw = this.#webLinkInput().trim();
    if (!raw) return false;
    const target = looksLikeDomainUrl(raw) ? `https://${raw}` : raw;
    return isExternalUrl(target);
  });

  protected getDisplayPath(asset: ImageAsset): string {
    return normalizeImageKitPath(asset.path);
  }

  protected toggleWebLinkBar(): void {
    this.#showWebLinkBar.update((open) => !open);
  }

  protected setWebLinkInput(value: string): void {
    this.#webLinkInput.set(value);
  }

  protected onDrop(event: CdkDragDrop<readonly ImageAsset[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.images()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.imagesChange.emit(next);
  }

  protected moveItem(index: number, direction: 'up' | 'down'): void {
    const target = direction === 'up' ? index - 1 : index + 1;
    const current = this.images();
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    moveItemInArray(next, index, target);
    this.imagesChange.emit(next);
  }

  protected promoteToMain(index: number): void {
    if (index <= 0 || index >= this.images().length) return;
    const next = [...this.images()];
    moveItemInArray(next, index, 0);
    this.imagesChange.emit(next);
  }

  protected updateAlt(index: number, alt: string): void {
    const trimmed = alt.slice(0, IMAGE_LIMITS.maxAltLength);
    const next = this.images().map((item, i) => (i === index ? { ...item, alt: trimmed } : item));
    this.imagesChange.emit(next);
  }

  protected removeImage(index: number): void {
    const next = this.images().filter((_, i) => i !== index);
    this.imagesChange.emit(next);
  }

  protected async onFilesSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const fileList = inputEl.files;
    if (!fileList || fileList.length === 0) return;

    const available = this.remainingSlots();
    if (available <= 0) {
      this.#snackbar.warning(`Maximum of ${this.maxImages()} images reached.`);
      inputEl.value = '';
      return;
    }

    const files = Array.from(fileList).slice(0, available);
    if (fileList.length > available) {
      this.#snackbar.info(`Only the first ${available} image(s) were added (limit ${this.maxImages()}).`);
    }

    this.#isUploadingFiles.set(true);
    const added: ImageAsset[] = [];

    try {
      for (const file of files) {
        const resolved = await this.#imageSource.uploadFile(file, this.folder());
        this.uploaded.emit(resolved.path);
        added.push({
          path: resolved.path,
          alt: sanitizeAltFromFilename(file.name) || 'Product image',
          width: resolved.width,
          height: resolved.height,
        });
      }

      if (added.length > 0) {
        this.imagesChange.emit([...this.images(), ...added]);
        this.#snackbar.success(
          added.length === 1
            ? 'Image added to gallery.'
            : `${added.length} images added to gallery.`,
        );
      }
    } catch (err: unknown) {
      if (added.length > 0) {
        this.imagesChange.emit([...this.images(), ...added]);
      }
      const message =
        err instanceof ImageInputError
          ? err.message
          : 'Unable to upload one or more images. Please try again.';
      this.#snackbar.error(message);
    } finally {
      this.#isUploadingFiles.set(false);
      inputEl.value = '';
    }
  }

  protected async importWebLink(): Promise<void> {
    const raw = this.#webLinkInput().trim();
    if (!raw || this.isFull()) return;

    this.#isImportingUrl.set(true);
    try {
      const resolved = await this.#imageSource.resolveInput(raw, this.folder());
      if (resolved.wasUploaded) {
        this.uploaded.emit(resolved.path);
      }

      const alt =
        this.defaultAlt().trim().split(/\s+/).filter(Boolean).join(' ').slice(0, IMAGE_LIMITS.maxAltLength) ||
        'Product image';
      const newAsset: ImageAsset = {
        path: resolved.path,
        alt,
        width: resolved.width,
        height: resolved.height,
      };

      this.imagesChange.emit([...this.images(), newAsset]);
      this.#webLinkInput.set('');
      this.#snackbar.success('Image added to gallery.');
    } catch (err: unknown) {
      const message =
        err instanceof ImageInputError
          ? err.message
          : 'Unable to add image from that link. Please check the URL and try again.';
      this.#snackbar.error(message);
    } finally {
      this.#isImportingUrl.set(false);
    }
  }
}
