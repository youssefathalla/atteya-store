import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { HeroSectionComponent } from '@features/home/components/hero-section/hero-section.component';
import { HeroLayoutCount, HomeHero } from '../../models/home-manager.model';

@Component({
  selector: 'app-home-hero-preview',
  imports: [MatButtonModule, SharedIconModule, HeroSectionComponent],
  templateUrl: './home-hero-preview.component.html',
})
export class HomeHeroPreviewComponent {
  readonly hero = input.required<HomeHero>();
  readonly isLoading = input<boolean>(false);
  readonly activeSlotIndex = input<number>(0);

  readonly layoutCountChange = output<HeroLayoutCount>();
  readonly activeSlotChange = output<number>();

  readonly layoutOptions: readonly { count: HeroLayoutCount; label: string; icon: string }[] = [
    { count: 1, label: '1 Full Banner', icon: 'crop_16_9' },
    { count: 2, label: '2 Side-by-Side', icon: 'view_column_2' },
    { count: 3, label: '3 Side-by-Side', icon: 'view_column' },
  ];
}
