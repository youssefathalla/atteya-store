import type { VariantFacts } from '@core/services/offers/engine';
import type { Product, ProductVariant } from '../product.model';

export function toVariantFacts(
  product: Pick<Product, 'options'>,
  variant: ProductVariant,
): VariantFacts {
  const size = product.options
    .find((option) => option.key === 'size')
    ?.values.find((val) => val.id === variant.values['size']);
  const colour = product.options
    .find((option) => option.key === 'colour')
    ?.values.find((val) => val.id === variant.values['colour']);
  return {
    id: variant.id,
    size: size?.label ?? null,
    color: colour?.color ?? null,
    stock: variant.stock,
  };
}
