import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { CurrencyService } from '@core/services/currency/currency.service';

@Component({
  selector: 'app-currency-switcher',
  host: { class: 'inline-flex' },
  imports: [MatButtonModule, MatMenuModule],
  templateUrl: './currency-switcher.component.html',
})
export class CurrencySwitcherComponent {
  readonly currency = inject(CurrencyService);

  openMenu(): void {
    void this.currency.ensureOptions();
  }

  choose(code: string): void {
    void this.currency.select(code);
  }
}
