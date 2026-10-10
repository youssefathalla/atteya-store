import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';

@Component({
  selector: 'app-nav-manager-header',
  templateUrl: './nav-manager-header.component.html',
  imports: [MatButtonModule, SharedIconModule],
})
export class NavManagerHeaderComponent {
  readonly isSaving = input<boolean>(false);
  readonly isSeeding = input<boolean>(false);

  readonly seedDefaults = output<void>();
  readonly discard = output<void>();
  readonly publish = output<void>();
}
