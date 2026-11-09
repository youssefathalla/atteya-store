import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { BaseCardComponent } from '@shared/ui/cards/base-card/base-card.component';
import { InfoCardComponent } from '@shared/ui/cards/info-card/info-card.component';
import { InfoCardData } from '@shared/ui/cards/info-card/info-card.model';
import { ReviewCardComponent } from '@shared/ui/cards/review-card/review-card.component';
import { Review } from '@shared/ui/cards/review-card/review.model';

@Component({
  selector: 'app-cards-tab',
  imports: [MatButtonModule, SharedIconModule, BaseCardComponent, InfoCardComponent, ReviewCardComponent],
  templateUrl: './cards-tab.component.html',
})
export class CardsTabComponent {
  protected readonly infoCardFeature: InfoCardData = {
    title: 'Modern Zoneless Architecture',
    iconName: 'bolt',
    items: [
      '100% Signal-based state reactivity (Zoneless runtime)',
      'Native Material 3 styling tokens with zero ::ng-deep',
      'Tailwind CSS v4 engine with semantic utility classes',
      'High-performance @defer blocks and SSR hydration',
    ],
  };

  protected readonly sampleReview: Review = {
    firstName: 'Sophia',
    lastName: 'Martinez',
    date: 'August 2026',
    stars: 5,
    serviceType: 'high',
    description:
      'The component playground made our design review and token verification effortless. Clean, responsive, and blazing fast!',
  };
}
