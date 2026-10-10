import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { AdminNavCategory } from '../admin-nav.model';

@Component({
  selector: 'app-admin-sidebar',
  templateUrl: './admin-sidebar.component.html',
  imports: [RouterLink, RouterLinkActive, SharedIconModule],
  host: {
    class: 'block h-full',
  },
})
export class AdminSidebarComponent {
  readonly categories = input.required<readonly AdminNavCategory[]>();
}
