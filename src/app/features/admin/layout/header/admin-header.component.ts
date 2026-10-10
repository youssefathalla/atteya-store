import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';

@Component({
  selector: 'app-admin-header',
  templateUrl: './admin-header.component.html',
  imports: [RouterLink, MatButtonModule, SharedIconModule],
  host: {
    class: 'block xl:sticky xl:top-0 xl:z-20 bg-surface-container-lowest',
  },
})
export class AdminHeaderComponent {
  readonly pageTitle = input.required<string>();
  readonly isSidebarOpen = input<boolean>(true);

  readonly toggleSidebar = output<void>();
}
