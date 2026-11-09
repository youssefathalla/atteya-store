import { Component, computed, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  formatCairoDateTimeInput,
  parseCairoDateTimeInput,
  type OfferSchedule,
} from '@core/services/offers/engine';

@Component({
  selector: 'app-schedule-editor',
  host: { class: 'block w-full' },
  imports: [MatButtonModule],
  templateUrl: './schedule-editor.component.html',
})
export class ScheduleEditorComponent {
  readonly schedule = model.required<OfferSchedule>();

  readonly startsAtInput = computed(() => formatCairoDateTimeInput(this.schedule().startsAt));

  readonly endsAtInput = computed(() => formatCairoDateTimeInput(this.schedule().endsAt));

  onStartChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const parsed = parseCairoDateTimeInput(raw, false);
    this.schedule.update((prev) => ({ ...prev, startsAt: parsed }));
  }

  onEndChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const parsed = parseCairoDateTimeInput(raw, true);
    this.schedule.update((prev) => ({ ...prev, endsAt: parsed }));
  }

  setStartsNow(): void {
    this.schedule.update((prev) => ({ ...prev, startsAt: null }));
  }

  setNoEndDate(): void {
    this.schedule.update((prev) => ({ ...prev, endsAt: null }));
  }
}
