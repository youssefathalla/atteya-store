import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { NavCategory } from '@core/services/navigation';
import {
  NavTargetFieldComponent,
  type NavTargetChange,
} from '../nav-target-field/nav-target-field.component';

@Component({
  selector: 'app-nav-category-details',
  templateUrl: './nav-category-details.component.html',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, NavTargetFieldComponent],
})
export class NavCategoryDetailsComponent {
  readonly category = input.required<NavCategory>();

  readonly labelChange = output<string>();
  readonly targetChange = output<NavTargetChange>();
}
