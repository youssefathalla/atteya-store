import { Component, input, output } from '@angular/core';
import { ShopCategoriesSectionComponent } from '@features/home/components/shop-categories-section/shop-categories-section.component';
import { HomeShopCategories } from '../../models/home-manager.model';

@Component({
  selector: 'app-home-categories-preview',
  imports: [ShopCategoriesSectionComponent],
  templateUrl: './home-categories-preview.component.html',
})
export class HomeCategoriesPreviewComponent {
  readonly shopCategories = input.required<HomeShopCategories>();
  readonly isLoading = input<boolean>(false);
  readonly activeCardIndex = input<number>(0);

  readonly activeCardChange = output<number>();
}
