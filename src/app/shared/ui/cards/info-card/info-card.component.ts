import { Component, input } from '@angular/core';
import { BaseCardComponent } from '../base-card/base-card.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { InfoCardData } from './info-card.model';

@Component({
  selector: 'app-info-card',
  imports: [BaseCardComponent, SharedIconModule],
  template: `
    <app-base-card>
      <ng-container card-header>
        <div class="bg-circle mb-4">
          <mat-icon [name]="infoCard().iconName" size="4xl" iconColor="primary" />
        </div>
        <h3 class="font-title-lg">{{ infoCard().title }}</h3>
      </ng-container>
      <ng-container card-content>
        @if (infoCard().items; as items) {
          <ul class="flex flex-col gap-3">
            @for (item of items; track item) {
              <li class="flex items-start gap-2 text-secondary font-body-md">
                <span class="mt-1.5 size-1.5 rounded-full bg-primary"></span>
                <span>{{ item }}</span>
              </li>
            }
          </ul>
        } @else {
          <p class="font-body-md">{{ infoCard().description }}</p>
        }
      </ng-container>
    </app-base-card>
  `,
})
export class InfoCardComponent {
  readonly infoCard = input.required<InfoCardData>();
}
