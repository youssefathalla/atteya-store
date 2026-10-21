import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SeoService } from '@core/services/seo';

@Component({
  selector: 'app-settings',
  host: { class: 'block w-full' },
  imports: [RouterLink, RouterOutlet, MatButtonModule, SharedIconModule],
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements OnInit {
  readonly #seo = inject(SeoService);

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Settings | Atteya Admin',
      description: 'Choose who can manage the Atteya store.',
      noindex: true,
    });
  }
}
