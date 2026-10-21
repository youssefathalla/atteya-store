import { Component, input, output } from '@angular/core';
import { NavigationListSectionComponent } from '@features/home/components/navigation-list-section/navigation-list-section.component';
import { HomeNavList } from '../../models/home-manager.model';

@Component({
  selector: 'app-home-nav-list-preview',
  imports: [NavigationListSectionComponent],
  templateUrl: './home-nav-list-preview.component.html',
})
export class HomeNavListPreviewComponent {
  readonly navList = input.required<HomeNavList>();
  readonly isLoading = input<boolean>(false);
  readonly activeItemIndex = input<number>(0);

  readonly activeItemChange = output<number>();
}
