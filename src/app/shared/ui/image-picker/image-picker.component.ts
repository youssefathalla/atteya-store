import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgOptimizedImage } from '@angular/common';
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

let nextPickerId = 0;

@Component({
  selector: 'app-image-picker',
  templateUrl: './image-picker.component.html',
  imports: [
    FormsModule,
    NgOptimizedImage,
    AppImageFallbackDirective,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    SharedIconModule,
  ],
})
export class ImagePickerComponent {
  readonly #imageSource = inject(ImageSourceService);
  readonly #snackbar = inject(SnackbarService);

  readonly folder = input<ImageFolderPath>('hero');
  readonly asset = model<ImageAsset | null>(null);
  readonly label = input<string>('Image');
  readonly subtitle = input<string>('Upload a photo or import from a web link.');
  readonly altPlaceholder = input<string>('e.g. Athlete training in performance sportswear');
  readonly aspectClass = input<string>('aspect-video');
  readonly allowRemove = input<boolean>(false);

  readonly uploaded = output<string>();

  readonly #uid = ++nextPickerId;
  readonly #isUploadingFile = signal(false);
  readonly #isResolvingUrl = signal(false);
  readonly #showManualUrlInput = signal(false);
  readonly #manualUrlInput = signal('');
  readonly #hasImageLoadFailed = signal(false);

  protected readonly urlInputId = `image-picker-url-${this.#uid}`;
  protected readonly altInputId = `image-picker-alt-${this.#uid}`;
  protected readonly maxAltLength = IMAGE_LIMITS.maxAltLength;

  protected readonly isUploadingFile = this.#isUploadingFile.asReadonly();
  protected readonly isResolvingUrl = this.#isResolvingUrl.asReadonly();
  protected readonly showManualUrlInput = this.#showManualUrlInput.asReadonly();
  protected readonly manualUrlInput = this.#manualUrlInput.asReadonly();

  protected readonly isExternalUrlInput = computed(() => {
    const raw = this.#manualUrlInput().trim();
    if (!raw) return false;
    const target = looksLikeDomainUrl(raw) ? `https://${raw}` : raw;
    return isExternalUrl(target);
  });

  protected readonly validPreviewPath = computed<string | null>(() => {
    if (this.#hasImageLoadFailed()) return null;
    const current = this.asset();
    if (!current?.path) return null;
    const path = normalizeImageKitPath(current.path);
    if (!path || path === 'hero/default-hero.jpg') {
      return null;
    }
    return path;
  });

  constructor() {
    effect(() => {
      const _currentPath = this.asset()?.path;
      this.#hasImageLoadFailed.set(false);
    });
  }

  protected toggleManualUrl(): void {
    this.#showManualUrlInput.update((open) => !open);
  }

  protected setManualUrlInput(value: string): void {
    this.#manualUrlInput.set(value);
  }

  protected onImageFailed(): void {
    this.#hasImageLoadFailed.set(true);
  }

  protected onAltChange(newAlt: string): void {
    const trimmedAlt = newAlt.slice(0, IMAGE_LIMITS.maxAltLength);
    const current = this.asset();
    this.asset.set({
      path: current?.path ?? '',
      alt: trimmedAlt,
      width: current?.width,
      height: current?.height,
    });
  }

  protected removeAsset(): void {
    this.asset.set(null);
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    if (!file) return;

    this.#isUploadingFile.set(true);
    try {
      this.#hasImageLoadFailed.set(false);
      const resolved = await this.#imageSource.uploadFile(file, this.folder());
      this.uploaded.emit(resolved.path);

      const currentAlt = this.asset()?.alt?.trim() ?? '';
      const fallbackAlt = sanitizeAltFromFilename(file.name) || 'Store image';
      const nextAlt = currentAlt || fallbackAlt;

      this.asset.set({
        path: resolved.path,
        alt: nextAlt,
        width: resolved.width,
        height: resolved.height,
      });

      if (resolved.cdnDelayed) {
        this.#snackbar.info('Image saved. It may take a moment to sync across the CDN.');
      } else {
        this.#snackbar.success('Image uploaded and ready in your live preview.');
      }
    } catch (err: unknown) {
      const message =
        err instanceof ImageInputError
          ? err.message
          : 'Unable to upload image. Please check your connection and try again.';
      this.#snackbar.error(message);
    } finally {
      this.#isUploadingFile.set(false);
      inputEl.value = '';
    }
  }

  protected async applyManualInput(): Promise<void> {
    const raw = this.#manualUrlInput().trim();
    if (!raw) return;

    this.#isResolvingUrl.set(true);
    try {
      this.#hasImageLoadFailed.set(false);
      const resolved = await this.#imageSource.resolveInput(raw, this.folder());
      if (resolved.wasUploaded) {
        this.uploaded.emit(resolved.path);
      }

      const currentAlt = this.asset()?.alt?.trim() ?? '';
      const lastSeg = resolved.path.split('/').pop() ?? '';
      const nextAlt = currentAlt || sanitizeAltFromFilename(lastSeg) || 'Store image';

      this.asset.set({
        path: resolved.path,
        alt: nextAlt,
        width: resolved.width,
        height: resolved.height,
      });

      this.#manualUrlInput.set('');
      if (resolved.cdnDelayed) {
        this.#snackbar.info('Image saved. It may take a moment to appear.');
      } else if (resolved.wasUploaded) {
        this.#snackbar.success('Image imported and saved to your store library.');
      } else {
        this.#snackbar.success('Image path verified and updated.');
      }
    } catch (err: unknown) {
      const message =
        err instanceof ImageInputError
          ? err.message
          : 'Unable to use that image link. Please verify the link and try again.';
      this.#snackbar.error(message);
    } finally {
      this.#isResolvingUrl.set(false);
    }
  }
}
