import { Component, computed, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { cairoWallTimeToDate, dateToCairoWallTime, type OfferSchedule } from '@core/services/offers/engine';
import { QUICK_ENDS, quickEndDate, type QuickEnd } from '../../models/offer-admin.model';

/** A Cairo date shown in the date picker (a local midnight with the Cairo calendar day) and its time. */
interface PickedDateTime {
  readonly day: Date;
  readonly time: string;
}

function toPicked(date: Date | null): PickedDateTime | null {
  if (!date) return null;
  const wall = dateToCairoWallTime(date);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return {
    day: new Date(wall.year, wall.month - 1, wall.day),
    time: `${pad(wall.hour)}:${pad(wall.minute)}`,
  };
}

/** Builds the exact moment from a picked calendar day and "HH:MM", in Cairo time. */
function fromPicked(day: Date, time: string, isEnd: boolean): Date {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  const hour = match ? Math.min(23, Number.parseInt(match[1], 10)) : isEnd ? 23 : 0;
  const minute = match ? Math.min(59, Number.parseInt(match[2], 10)) : isEnd ? 59 : 0;
  return cairoWallTimeToDate({
    year: day.getFullYear(),
    month: day.getMonth() + 1,
    day: day.getDate(),
    hour,
    minute,
    second: isEnd && hour === 23 && minute === 59 ? 59 : 0,
  });
}

/** Step 3 "Starts" and "Ends" (Cairo time). */
@Component({
  selector: 'app-schedule-editor',
  host: { class: 'block w-full' },
  imports: [MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatInputModule, MatRadioModule],
  templateUrl: './schedule-editor.component.html',
})
export class ScheduleEditorComponent {
  readonly schedule = model.required<OfferSchedule>();

  readonly quickEnds = QUICK_ENDS;
  readonly start = computed(() => toPicked(this.schedule().startsAt));
  readonly end = computed(() => toPicked(this.schedule().endsAt));

  onStartMode(mode: 'now' | 'date'): void {
    if (mode === 'now') {
      this.schedule.update((prev) => ({ ...prev, startsAt: null }));
      return;
    }
    // Tomorrow at 00:00, Cairo time.
    const tomorrow = toPicked(new Date(Date.now() + 24 * 60 * 60 * 1000));
    if (!tomorrow) return;
    this.schedule.update((prev) => ({ ...prev, startsAt: fromPicked(tomorrow.day, '00:00', false) }));
  }

  onEndMode(mode: 'off' | 'date'): void {
    if (mode === 'off') {
      this.schedule.update((prev) => ({ ...prev, endsAt: null }));
      return;
    }
    this.onQuickEnd('1w');
  }

  onDay(which: 'start' | 'end', day: Date | null): void {
    if (!day) return;
    const current = which === 'start' ? this.start() : this.end();
    const time = current?.time ?? (which === 'end' ? '23:59' : '00:00');
    this.#set(which, fromPicked(day, time, which === 'end'));
  }

  onTime(which: 'start' | 'end', event: Event): void {
    const current = which === 'start' ? this.start() : this.end();
    if (!current) return;
    const time = (event.target as HTMLInputElement).value;
    this.#set(which, fromPicked(current.day, time, which === 'end'));
  }

  onQuickEnd(quick: QuickEnd): void {
    const from = this.schedule().startsAt ?? new Date();
    this.schedule.update((prev) => ({ ...prev, endsAt: quickEndDate(quick, from) }));
  }

  #set(which: 'start' | 'end', date: Date): void {
    this.schedule.update((prev) =>
      which === 'start' ? { ...prev, startsAt: date } : { ...prev, endsAt: date },
    );
  }
}
