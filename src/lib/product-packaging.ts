import type { Product } from "@/lib/types";

export function getPackageValues(product: Pick<Product, "quantityPerBox" | "weightPerBox" | "pricePerBox">, isHalfBox: boolean) {
  const divisor = isHalfBox ? 2 : 1;
  return {
    unitQuantity: product.quantityPerBox / divisor,
    weight: product.weightPerBox / divisor,
    price: product.pricePerBox / divisor,
  };
}
