import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { NavService } from '@layout/navbar/nav.service';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, SharedIconModule],
  templateUrl: './admin-layout.component.html',
  host: {
    class: 'block min-h-screen bg-surface-container-lowest',
  },
})
export class AdminLayoutComponent {
  readonly navService = inject(NavService);
}
