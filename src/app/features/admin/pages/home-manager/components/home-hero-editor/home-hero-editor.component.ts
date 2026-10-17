import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgOptimizedImage } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { StorageUploadService } from '@core/services/storage';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import {
  getFirebaseStorageUrl,
  isExternalUrl,
  normalizeImageKitPath,
} from '@shared/utils/image.utils';
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
    NgOptimizedImage,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    SharedIconModule,
  ],
})
export class HomeHeroEditorComponent {
  readonly #storageUpload = inject(StorageUploadService);
  readonly #snackbar = inject(SnackbarService);

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

  readonly #isImporting = signal(false);
  readonly #showManualUrlInput = signal(false);
  readonly #manualUrlInput = signal('');
  readonly #directFallbackUrl = signal<string | null>(null);
  readonly #hasImageLoadFailed = signal(false);

  readonly isUploading = this.#storageUpload.isUploading;
  readonly isImporting = this.#isImporting.asReadonly();
  readonly showManualUrlInput = this.#showManualUrlInput.asReadonly();
  readonly manualUrlInput = this.#manualUrlInput.asReadonly();

  readonly isExternalUrlInput = computed(() => {
    const raw = this.#manualUrlInput().trim();
    if (!raw) return false;
    const target = this.#looksLikeDomain(raw) ? `https://${raw}` : raw;
    return isExternalUrl(target);
  });

  readonly validPreviewPath = computed<string | null>(() => {
    if (this.#hasImageLoadFailed()) return null;
    const fallback = this.#directFallbackUrl();
    if (fallback) return fallback;

    const path = normalizeImageKitPath(this.slide().imageUrl);
    if (!path || path === 'hero/default-hero.jpg') {
      return null;
    }
    return path;
  });

  readonly isDirectPreviewFallback = computed<boolean>(() => this.#directFallbackUrl() !== null);

  readonly slotIndexes = computed<readonly number[]>(() =>
    Array.from({ length: this.layoutCount() }, (_, i) => i),
  );

  toggleManualUrl(): void {
    this.#showManualUrlInput.update((open) => !open);
  }

  setManualUrlInput(value: string): void {
    this.#manualUrlInput.set(value);
  }

  handlePreviewError(path: string): void {
    if (!path || this.#directFallbackUrl()) return;
    this.#directFallbackUrl.set(getFirebaseStorageUrl(path));
  }

  handleDirectPreviewError(): void {
    this.#hasImageLoadFailed.set(true);
  }

  #validateImageFile(file: File): string | null {
    if (!file.type.startsWith('image/')) {
      return 'Please select a valid image file (PNG, JPG, WebP, or AVIF).';
    }
    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return 'Image file size must be less than 10MB.';
    }
    return null;
  }

  async onFileSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    if (!file) return;

    const validationError = this.#validateImageFile(file);
    if (validationError) {
      this.#snackbar.error(validationError);
      inputEl.value = '';
      return;
    }

    try {
      this.#directFallbackUrl.set(null);
      this.#hasImageLoadFailed.set(false);
      const result = await this.#storageUpload.uploadImage(file, 'hero');
      this.sessionUpload.emit(result.path);
      this.imageUrlChange.emit(result.path);

      if (!this.slide().imageAlt) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        this.imageAltChange.emit(cleanName);
      }

      this.#snackbar.success('Image uploaded and ready in your live preview.');
    } catch {
      this.#snackbar.error('Unable to upload image. Please check your connection and try again.');
    } finally {
      inputEl.value = '';
    }
  }

  async importFromWebUrl(): Promise<void> {
    const rawUrl = this.#manualUrlInput().trim();
    if (!rawUrl) return;

    let targetUrl = rawUrl;
    // Auto-prefix https:// if user pasted a web address like 'images.unsplash.com/...'
    if (this.#looksLikeDomain(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    const isHttp = targetUrl.startsWith('http://') || targetUrl.startsWith('https://');

    if (isHttp) {
      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          this.#snackbar.error('Invalid link protocol. Please use an HTTP or HTTPS link.');
          return;
        }
      } catch {
        this.#snackbar.error('Invalid web link format. Please paste a full web link (e.g. https://images.unsplash.com/...).');
        return;
      }
    } else {
      // Relative path: must end with a standard image file extension
      if (!this.#hasImageExtension(targetUrl)) {
        this.#snackbar.error(
          'Invalid image URL or path. Please provide a web link (https://...) or an image file (.jpg, .png, .webp, .avif).',
        );
        return;
      }
    }

    this.#isImporting.set(true);
    try {
      if (isExternalUrl(targetUrl)) {
        const result = await this.#storageUpload.importFromUrl(targetUrl, 'hero');
        this.#directFallbackUrl.set(null);
        this.#hasImageLoadFailed.set(false);
        this.sessionUpload.emit(result.path);
        this.imageUrlChange.emit(result.path);
        this.#manualUrlInput.set('');
        this.#snackbar.success('Image imported and saved to your store library.');
      } else {
        const cleanPath = normalizeImageKitPath(targetUrl);
        const testUrl = cleanPath.startsWith('http')
          ? cleanPath
          : getFirebaseStorageUrl(cleanPath);

        const exists = await this.#probeImage(testUrl);
        if (!exists) {
          this.#snackbar.error(
            'Could not find or load an image at this path. Please verify the file path and try again.',
          );
          return;
        }

        this.#directFallbackUrl.set(null);
        this.#hasImageLoadFailed.set(false);
        this.imageUrlChange.emit(cleanPath);
        this.#manualUrlInput.set('');
        this.#snackbar.success('Image path updated and verified.');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '';
      if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        this.#snackbar.error(
          'Could not download this image directly (restricted by the host website). Please save the image and use "Upload Image" instead.',
        );
      } else if (errMsg) {
        this.#snackbar.error(errMsg);
      } else {
        this.#snackbar.error('Unable to import image. Please verify the link and try again.');
      }
    } finally {
      this.#isImporting.set(false);
    }
  }

  #probeImage(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  #looksLikeDomain(val: string): boolean {
    if (val.startsWith('http://') || val.startsWith('https://')) return false;
    const firstSlash = val.indexOf('/');
    const host = firstSlash === -1 ? val : val.slice(0, firstSlash);
    return host.includes('.') && !host.startsWith('.') && !host.endsWith('.');
  }

  #hasImageExtension(path: string): boolean {
    const clean = path.split('?')[0].split('#')[0].toLowerCase();
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg'];
    return validExtensions.some((ext) => clean.endsWith(ext));
  }
}
