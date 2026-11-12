import { Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { generateId } from '@shared/utils/id.utils';
import { MatButtonModule } from '@angular/material/button';
import { SafeUrl } from '@angular/platform-browser';
import { BaseFormControl } from '../base-form-control.directive';
import { SharedIconModule } from '@shared/ui/mat-icon';

@Component({
  selector: 'app-file-input',
  imports: [MatButtonModule, SharedIconModule],
  templateUrl: './file-input.component.html',
  host: { class: 'block w-full' },
})
export class FileInputComponent extends BaseFormControl<File | string | null> {
  // Inputs
  readonly previewUrl = input<SafeUrl | string | null | undefined>(null);
  readonly fileName = input<string | null>(null); // Optional: to show name if not an image
  readonly accept = input<string>('image/*');
  // Validation Inputs
  readonly maxSizeBytes = input<number>(5 * 1024 * 1024); // 5MB
  readonly allowedMimeTypes = input<string[]>(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
  // Outputs
  readonly fileSelected = output<File>();
  readonly viewFile = output<void>();

  // Internal State
  readonly inputId = generateId('file-input');
  protected readonly localError = signal<string | null>(null);

  // Computed State
  protected override readonly invalid = computed(() => this.valueState().invalid() || !!this.localError());
  protected override readonly errorMessage = computed(
    () => this.localError() || this.valueState().errors()[0]?.message,
  );
  protected readonly hasFile = computed(() => {
    const val = this.valueState().value();
    const preview = this.previewUrl();
    return !!(val || preview);
  });

  protected readonly isImage = computed(() => {
    // Start simple: assume if we have a preview URL, it's an image.
    const preview = this.previewUrl();
    return !!preview;
  });

  readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  // Handlers
  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];

      // Validation
      if (file.size > this.maxSizeBytes()) {
        const maxMB = (this.maxSizeBytes() / (1024 * 1024)).toFixed(0);
        this.localError.set(`File size must be less than ${maxMB}MB.`);
        input.value = '';
        return;
      }

      if (this.allowedMimeTypes().length > 0 && !this.allowedMimeTypes().includes(file.type)) {
        this.localError.set('Invalid file type.');
        input.value = '';
        return;
      }

      this.localError.set(null);
      this.fileSelected.emit(file);
    }
    // Reset input value to allow selecting the same file again if needed
    input.value = '';
  }

  triggerUpload() {
    this.fileInput()?.nativeElement.click();
  }
}
