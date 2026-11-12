import { Component, computed, ElementRef, model, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDatepicker,
  MatDatepickerModule,
  MatDateRangePicker,
  MatEndDate,
  MatStartDate,
} from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { SharedIconModule } from '@shared/ui/mat-icon';
import {
  ORDER_DATE_PRESETS,
  orderDateFieldLabel,
  pickedFilter,
  presetFilter,
  presetHint,
  startOfDay,
  type OrderDateFilter,
  type OrderDatePreset,
} from '../../utils/order-date-filter.utils';

/**
 * The Orders toolbar fields: "Search orders" (name in Arabic or English, phone, email or order
 * number) and the Date menu (quick choices, Pick a Day…, Pick a Range…). The page reads both
 * values and runs the search; this component only collects them.
 */
@Component({
  selector: 'app-orders-filter-bar',
  host: { class: 'block w-full' },
  imports: [
    MatButtonModule,
    MatDatepickerModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    SharedIconModule,
  ],
  templateUrl: './orders-filter-bar.component.html',
})
export class OrdersFilterBarComponent {
  /** What staff typed, as typed. */
  readonly search = model('');
  readonly date = model<OrderDateFilter | null>(null);

  readonly #now = new Date();
  /** The calendars stop at today: no order is placed in the future. */
  readonly today = startOfDay(this.#now);

  readonly presets = ORDER_DATE_PRESETS.map((preset) => ({
    ...preset,
    hint: presetHint(preset.id, this.#now),
  }));
  readonly fieldLabel = computed(() => orderDateFieldLabel(this.date(), this.#now));
  readonly selectedPreset = computed((): OrderDatePreset | 'any' | 'picked' => {
    const filter = this.date();
    if (!filter) return 'any';
    return filter.preset ?? 'picked';
  });

  private readonly dayPicker = viewChild.required<MatDatepicker<Date>>('dayPicker');
  private readonly rangePicker = viewChild.required<MatDateRangePicker<Date>>('rangePicker');
  private readonly rangeStart = viewChild.required<MatStartDate<Date>>(MatStartDate);
  private readonly rangeEnd = viewChild.required<MatEndDate<Date>>(MatEndDate);
  private readonly dateField = viewChild.required<ElementRef<HTMLInputElement>>('dateField');

  /** The calendars open from hidden inputs, so focus goes back to the Date field when they close. */
  focusDateField(): void {
    this.dateField().nativeElement.focus();
  }

  onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.search.set('');
  }

  chooseAnyDate(): void {
    this.date.set(null);
  }

  choosePreset(preset: OrderDatePreset): void {
    this.date.set(presetFilter(preset, new Date()));
  }

  /** Opened after the menu has closed and handed focus back, so the calendar keeps focus. */
  openDayPicker(): void {
    setTimeout(() => this.dayPicker().open());
  }

  openRangePicker(): void {
    setTimeout(() => this.rangePicker().open());
  }

  onDayPicked(day: Date | null): void {
    if (day) this.date.set(pickedFilter(day, null));
  }

  /** Apply keeps the picked days (one tap = one day); Cancel leaves the dates as they were. */
  onRangeClosed(): void {
    this.focusDateField();
    const start = this.rangeStart().value;
    if (!start) return;
    const picked = pickedFilter(start, this.rangeEnd().value);
    const current = this.date();
    if (
      current &&
      current.from.getTime() === picked.from.getTime() &&
      current.to.getTime() === picked.to.getTime()
    ) {
      return;
    }
    this.date.set(picked);
  }
}
