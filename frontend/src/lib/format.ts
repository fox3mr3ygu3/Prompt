/** Render a cent-denominated amount for display. ``compact`` drops the
 *  fractional part — used in tight spots like the Browse cards and the
 *  seat-map labels where the precision isn't useful. */
export function fmtMoney(
  cents: number,
  ccy: string = "USD",
  opts: { compact?: boolean } = {},
): string {
  if (cents <= 0) return "Free";
  const fractionDigits = opts.compact ? 0 : 2;
  return `${(cents / 100).toFixed(fractionDigits)} ${ccy}`;
}
