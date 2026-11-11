import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { LoaderComponent } from '@shared/ui/loader/loader.component';
import { LoaderHeight } from '@shared/ui/loader/loader.model';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { ImageGalleryEditorComponent } from '@shared/ui/image-gallery-editor';
import { ImageAsset } from '@shared/schemas';

@Component({
  selector: 'app-loaders-tab',
  imports: [FormsModule, SharedIconModule, LoaderComponent, SkeletonComponent, ImageGalleryEditorComponent],
  templateUrl: './loaders-tab.component.html',
})
export class LoadersTabComponent {
  protected readonly loaderDiameter = signal(60);
  protected readonly loaderHeight = signal<LoaderHeight>('20');
  protected readonly loaderMessage = signal('Processing design tokens...');
  protected readonly loaderSectionSpace = signal(false);

  protected readonly demoGallery = signal<readonly ImageAsset[]>([]);

  protected updateDemoGallery(images: ImageAsset[]): void {
    this.demoGallery.set(images);
  }
}
