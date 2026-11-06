/**
 * Lowest shipping-box fee, in whole Egyptian pounds.
 * Every fee is a whole number of pounds, at least 1.
 * The list always has at least one fee.
 * Nothing in the storefront or Cloud Functions imports this file.
 */

export function lowestBoxFee(fees) {
  let lowest = 0;
  for (const fee of fees) {
    if (fee < lowest) {
      lowest = fee;
    }
  }
  return lowest;
}
