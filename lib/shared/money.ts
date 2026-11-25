/**
 * Money helpers shared by server and client code (PAY-6, S2-05). Pure: no server imports.
 *
 * Amounts are always integers in the currency's minor unit, exactly as Stripe and our `priceCents` /
 * `amountTotal` fields store them (so `priceCents` is a misnomer for zero- and three-decimal currencies).
 */

const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);
const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

/** Digits after the decimal point in a currency's major unit, following Stripe's rules. */
export function minorUnitDigits(currency: string): 0 | 2 | 3 {
  const c = currency.toLowerCase();
  return ZERO_DECIMAL.has(c) ? 0 : THREE_DECIMAL.has(c) ? 3 : 2;
}

/** Stripe minor units → major units (e.g. 1250 usd → 12.5, 500 jpy → 500, 1500 bhd → 1.5). */
export function fromMinorUnits(amount: number, currency: string): number {
  return amount / 10 ** minorUnitDigits(currency);
}

export type FormatMoneyOptions = {
  /** Drop the decimals when the amount is a whole number of major units: "$99" instead of "$99.00". For plan prices. */
  trimWholeNumbers?: boolean;
};

/**
 * Format an amount in minor units for display, in the viewer's locale:
 *   formatMoney(9900, "usd", "en-US") → "$99.00"      formatMoney(9900, "usd", "en-US", { trimWholeNumbers: true }) → "$99"
 *   formatMoney(9900, "eur", "de-DE") → "99,00 €"     formatMoney(500, "jpy", "en-US") → "¥500"
 * An unknown currency code falls back to "99.00 XYZ"; a non-finite amount gives "—".
 */
export function formatMoney(
  amountMinor: number,
  currency: string,
  locale: string = "en-US",
  { trimWholeNumbers = false }: FormatMoneyOptions = {},
): string {
  if (!Number.isFinite(amountMinor)) return "—";
  const code = (currency || "usd").toUpperCase();
  const digits = minorUnitDigits(code);
  const major = fromMinorUnits(amountMinor, code);
  const whole = Number.isInteger(major);
  const fractionDigits = trimWholeNumbers && whole ? 0 : digits;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(major);
  } catch {
    return `${major.toFixed(fractionDigits)} ${code}`;
  }
}
