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
import { isExternalUrl, normalizeImageKitPath } from '@shared/utils/image.utils';
import { environment } from '@env/environment';
import { ActionMoveEvent, HeroAction, HomeHero } from '../../models/home-manager.model';

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

  readonly hero = input.required<HomeHero>();

  readonly headlineChange = output<string>();
  readonly subtitleChange = output<string>();
  readonly imageUrlChange = output<string>();
  readonly imageAltChange = output<string>();

  readonly actionAdd = output<void>();
  readonly actionEdit = output<{ index: number; action: HeroAction }>();
  readonly actionDelete = output<number>();
  readonly actionMove = output<ActionMoveEvent>();

  readonly isUploading = this.#storageUpload.isUploading;
  readonly isImporting = signal(false);
  readonly showManualUrlInput = signal(false);
  readonly manualUrlInput = signal('');
  readonly imageKitBaseUrl = environment.imageKitUrl;

  readonly isExternalUrlInput = computed(() => isExternalUrl(this.manualUrlInput()));
  readonly previewPath = computed(() => normalizeImageKitPath(this.hero().imageUrl));

  toggleManualUrl(): void {
    this.showManualUrlInput.update((open) => !open);
  }

  #stagedSessionUpload: string | null = null;

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];

    // File validation: type and size (<= 10MB)
    if (!file.type.startsWith('image/')) {
      this.#snackbar.error('Please select a valid image file (PNG, JPG, WebP, or AVIF).');
      input.value = '';
      return;
    }

    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.#snackbar.error('Image file size must be less than 10MB.');
      input.value = '';
      return;
    }

    try {
      const result = await this.#storageUpload.uploadImage(file, 'hero');

      // Clean up previous uncommitted upload in this session if replaced
      if (this.#stagedSessionUpload && this.#stagedSessionUpload !== result.path) {
        await this.#storageUpload.deleteImage(this.#stagedSessionUpload);
      }
      this.#stagedSessionUpload = result.path;

      this.imageUrlChange.emit(result.path);

      // Auto-suggest alt description if currently empty
      if (!this.hero().imageAlt) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        this.imageAltChange.emit(cleanName);
      }

      this.#snackbar.success('Image uploaded successfully and linked to ImageKit!');
    } catch {
      this.#snackbar.error('Failed to upload image. Please check your network and try again.');
    } finally {
      input.value = '';
    }
  }

  async importFromWebUrl(): Promise<void> {
    const rawUrl = this.manualUrlInput().trim();
    if (!rawUrl) return;

    if (!isExternalUrl(rawUrl)) {
      // It's a local or storage path, normalize and apply
      this.imageUrlChange.emit(normalizeImageKitPath(rawUrl));
      this.manualUrlInput.set('');
      this.#snackbar.success('Image path updated.');
      return;
    }

    this.isImporting.set(true);
    try {
      const result = await this.#storageUpload.importFromUrl(rawUrl, 'hero');

      // Clean up previous uncommitted upload in this session if replaced
      if (this.#stagedSessionUpload && this.#stagedSessionUpload !== result.path) {
        await this.#storageUpload.deleteImage(this.#stagedSessionUpload);
      }
      this.#stagedSessionUpload = result.path;

      this.imageUrlChange.emit(result.path);
      this.manualUrlInput.set('');
      this.#snackbar.success('Image downloaded and saved permanently to your Firebase Storage!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to import image from URL.';
      this.#snackbar.error(`${message} You can also download it to your device and use "Upload Image".`);
    } finally {
      this.isImporting.set(false);
    }
  }
}
