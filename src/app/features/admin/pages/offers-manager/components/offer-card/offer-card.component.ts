import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule, type MatSlideToggleChange } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { SharedIconModule } from '@shared/ui/mat-icon';
import type { OfferCardView } from '../../models/offer-admin.model';

/**
 * One card on the admin Offers list (ATS-219): status line and switch, the deal in large text,
 * the names, Affected products / Who / When, and a footer pinned to the bottom (Edit, Run Again
 * or Open Group, then the ⋯ menu). Every card in a grid row has the same height.
 */
@Component({
  selector: 'app-offer-card',
  host: { class: 'block w-full h-full' },
  imports: [RouterLink, MatButtonModule, MatMenuModule, MatSlideToggleModule, SharedIconModule],
  templateUrl: './offer-card.component.html',
})
export class OfferCardComponent {
  readonly card = input.required<OfferCardView>();
  /** A switch or menu action for this card is still saving. */
  readonly busy = input(false);

  /** The switch was flipped; the page saves it and puts the switch back if that fails. */
  readonly switched = output<MatSlideToggleChange>();
  readonly duplicate = output<void>();
  readonly pauseResume = output<void>();
  readonly archive = output<void>();
  readonly remove = output<void>();
  readonly openGroup = output<void>();

  readonly isGroup = computed(() => this.card().items.length > 1);
  readonly offer = computed(() => this.card().items[0].offer);
  readonly ended = computed(() => this.card().bucket === 'ended');
  readonly archived = computed(() => this.card().bucket === 'archived');
  /** A single offer's coupon code, shown after the name. */
  readonly code = computed(() => (this.isGroup() ? null : (this.offer().code ?? null)));
}
