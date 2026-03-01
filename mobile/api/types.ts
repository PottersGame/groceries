/**
 * PantryPal SK — API Contract: Anonymous Ingestion
 *
 * Defines the TypeScript types for the payload the mobile app sends to the
 * backend's Anonymous Ingestion API endpoint.
 *
 * Privacy guarantee: no user ID, device ID, receipt number, or any other
 * personal identifier may appear in this payload.
 */

// ---------------------------------------------------------------------------
// Single price observation
// ---------------------------------------------------------------------------

/**
 * One line-item from a scanned eKasa receipt, stripped of all personal data.
 *
 * @example
 * ```ts
 * const observation: PriceObservation = {
 *   ico: "35532773",           // Lidl Slovenská republika, v.o.s.
 *   normalizedName: "zlaty bazant 0.5l",
 *   price: 0.89,
 *   date: "2024-06-10",
 * };
 * ```
 */
export interface PriceObservation {
  /**
   * 8-digit Slovak IČO (company registration number) of the store.
   * Sourced directly from the eKasa receipt QR code.
   * Must match the pattern `/^[0-9]{8}$/`.
   */
  ico: string;

  /**
   * Normalised product name: lower-cased, diacritics stripped, extra
   * whitespace collapsed.  Used as the deduplication key in the backend.
   *
   * @example "zlaty bazant 0.5l"
   */
  normalizedName: string;

  /**
   * Price paid in EUR, rounded to 2 decimal places.
   * Must be strictly positive.
   */
  price: number;

  /**
   * ISO-8601 calendar date of the purchase (`YYYY-MM-DD`).
   * No time component is included to prevent purchase-time fingerprinting.
   *
   * @example "2024-06-10"
   */
  date: string;
}

// ---------------------------------------------------------------------------
// Request payload
// ---------------------------------------------------------------------------

/**
 * Request body for `POST /api/v1/prices/ingest`.
 *
 * The mobile app batches all items from a single eKasa receipt into one
 * request to minimise round-trips.  Multiple receipts may be included if
 * the app was offline and is catching up.
 *
 * @example
 * ```ts
 * const payload: IngestionPayload = {
 *   observations: [
 *     { ico: "35532773", normalizedName: "rye bread 500g", price: 1.19, date: "2024-06-10" },
 *     { ico: "35532773", normalizedName: "whole milk 1l",  price: 0.79, date: "2024-06-10" },
 *   ],
 * };
 * ```
 */
export interface IngestionPayload {
  /**
   * Array of anonymised price observations.
   * Must contain at least one item.
   */
  observations: PriceObservation[];
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/**
 * Successful response from `POST /api/v1/prices/ingest`.
 */
export interface IngestionSuccessResponse {
  /** Always `"ok"` on success. */
  status: "ok";

  /** Number of observations that were accepted and queued for persistence. */
  accepted: number;

  /** Number of observations that were rejected due to validation errors. */
  rejected: number;

  /**
   * Per-observation validation errors, keyed by the zero-based index in the
   * submitted `observations` array.  Omitted when all observations pass.
   */
  errors?: Record<number, string>;
}

/**
 * Error response returned when the request itself is malformed.
 */
export interface IngestionErrorResponse {
  /** Always `"error"` on failure. */
  status: "error";

  /** Machine-readable error code. */
  code: string;

  /** Human-readable description of the error. */
  message: string;
}

/** Union of all possible responses from the ingestion endpoint. */
export type IngestionResponse = IngestionSuccessResponse | IngestionErrorResponse;

// ---------------------------------------------------------------------------
// Validation helpers (client-side, no runtime dependencies)
// ---------------------------------------------------------------------------

/** Regex for a valid Slovak IČO. */
const ICO_REGEX = /^[0-9]{8}$/;

/** Regex for a valid ISO-8601 calendar date. */
const ISO_DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

/**
 * Returns `true` when the given string is a syntactically valid Slovak IČO.
 *
 * Note: this performs only a format check, not a checksum validation.
 */
export function isValidIco(ico: string): boolean {
  return ICO_REGEX.test(ico);
}

/**
 * Returns `true` when the given string is a valid ISO-8601 calendar date
 * (`YYYY-MM-DD`).
 */
export function isValidIsoDate(date: string): boolean {
  return ISO_DATE_REGEX.test(date);
}

/**
 * Validates a single {@link PriceObservation} and returns an array of
 * human-readable error messages.  Returns an empty array when valid.
 */
export function validatePriceObservation(obs: PriceObservation): string[] {
  const errors: string[] = [];

  if (!isValidIco(obs.ico)) {
    errors.push(`"ico" must be an 8-digit string; got ${JSON.stringify(obs.ico)}`);
  }

  if (!obs.normalizedName || obs.normalizedName.trim().length === 0) {
    errors.push('"normalizedName" must be a non-empty string');
  }

  if (typeof obs.price !== "number" || !isFinite(obs.price) || obs.price <= 0) {
    errors.push(`"price" must be a positive finite number; got ${obs.price}`);
  }

  if (!isValidIsoDate(obs.date)) {
    errors.push(`"date" must be a YYYY-MM-DD string; got ${JSON.stringify(obs.date)}`);
  }

  return errors;
}

/**
 * Validates a full {@link IngestionPayload}.
 *
 * @returns An object with an `isValid` flag and a map of per-observation
 *          errors (index → error messages).
 */
export function validateIngestionPayload(payload: IngestionPayload): {
  isValid: boolean;
  observationErrors: Record<number, string[]>;
} {
  const observationErrors: Record<number, string[]> = {};

  if (!Array.isArray(payload.observations) || payload.observations.length === 0) {
    // Treat as a single top-level error at index 0
    observationErrors[0] = ['"observations" must be a non-empty array'];
    return { isValid: false, observationErrors };
  }

  payload.observations.forEach((obs, idx) => {
    const errs = validatePriceObservation(obs);
    if (errs.length > 0) {
      observationErrors[idx] = errs;
    }
  });

  return {
    isValid: Object.keys(observationErrors).length === 0,
    observationErrors,
  };
}
