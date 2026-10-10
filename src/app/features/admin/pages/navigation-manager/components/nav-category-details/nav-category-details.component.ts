import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { NavCategory } from '@layout/navbar/nav.model';

@Component({
  selector: 'app-nav-category-details',
  templateUrl: './nav-category-details.component.html',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTooltipModule,
    SharedIconModule,
  ],
})
export class NavCategoryDetailsComponent {
  readonly category = input.required<NavCategory>();

  readonly labelChange = output<string>();
  readonly pathChange = output<string>();
  readonly generatePath = output<void>();
}
