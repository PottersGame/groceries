/**
 * Normalises a product name for use as a deduplication key.
 *
 * Steps applied (in order):
 *  1. NFD-decompose so that combining diacritical marks become separate code
 *     points (handles all Slovak/Czech accented letters: á č ď é í ľ ĺ ň ó ô ŕ š ť ú ý ž …).
 *  2. Strip every combining diacritical mark (U+0300–U+036F).
 *  3. Lower-case the result.
 *  4. Collapse consecutive whitespace to a single space and trim.
 *
 * @example
 *   normalizeProductName("Rožok")      // "rozok"
 *   normalizeProductName("Mlieko 1L")  // "mlieko 1l"
 *   normalizeProductName("  Šalát  ")  // "salat"
 */
export function normalizeProductName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
