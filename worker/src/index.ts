/**
 * PantryPal SK — Cloudflare Worker: Flyer PDF Ingestion
 *
 * CRON-triggered worker that:
 *   1. Dynamically discovers the latest flyer PDF URL for each store
 *   2. Fetches the PDF with retry logic and exponential backoff
 *   3. Sends the PDF to the Gemini API for structured data extraction
 *   4. Upserts the extracted sale items into a Cloudflare D1 database
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Env {
  /** Cloudflare D1 database binding */
  DB: D1Database;
  /** Google AI Studio API key (set via `wrangler secret put GEMINI_API_KEY`) */
  GEMINI_API_KEY: string;
}

/** A single sale item extracted from a flyer by the Gemini model. */
export interface SaleItem {
  product_name: string;
  sale_price: number;
  original_price: number | null;
  category: string;
  start_date: string;
  end_date: string | null;
}

/** Shape of the Gemini API response content part. */
interface GeminiContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/** Minimal Gemini API response typing. */
interface GeminiApiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiContentPart[] };
  }>;
}

/** Store target descriptor used by the ingestion pipeline. */
interface StoreTarget {
  name: "lidl" | "kaufland";
  ico: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const STORE_TARGETS: StoreTarget[] = [
  { name: "lidl", ico: "31636365" },
  { name: "kaufland", ico: "31322832" },
];

// ---------------------------------------------------------------------------
// Fetch Utility with Retry
// ---------------------------------------------------------------------------

/**
 * Fetches a URL with exponential-backoff retry logic.
 *
 * Retries are skipped for 404 responses. A desktop User-Agent header is sent
 * on every request to avoid basic bot-detection blocks.
 *
 * @param url     - URL to fetch.
 * @param retries - Maximum number of attempts (default 3).
 * @returns The final {@link Response}.
 */
export async function fetchWithRetry(
  url: string,
  retries = 3,
): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": DESKTOP_UA },
    });

    // Success or permanent "not found" — no point retrying.
    if (response.ok || response.status === 404) {
      return response;
    }

    if (attempt < retries - 1) {
      // We won't use this response further; cancel its body to free resources
      response.body?.cancel().catch?.(() => {});

      // Also cancel any previously stored failed response body
      lastResponse?.body?.cancel().catch?.(() => {});

      lastResponse = response;
      console.warn(
        `fetchWithRetry: attempt ${attempt + 1}/${retries} failed for ${url} (${response.status})`,
      );

      // Exponential backoff: 1 s, 2 s, 4 s, …
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000),
      );
    } else {
      // Last attempt failed; return this response after the loop
      lastResponse = response;
    }
  }

  // All retries exhausted — return the last non-ok response.
  return lastResponse!;
}

// ---------------------------------------------------------------------------
// Dynamic Flyer URL Discovery
// ---------------------------------------------------------------------------

/**
 * Fetches the store's flyer listing page and extracts the first PDF URL found.
 *
 * @param store - Either `"lidl"` or `"kaufland"`.
 * @returns The PDF URL string, or `null` if none could be found.
 */
export async function getLatestFlyerUrl(
  store: "lidl" | "kaufland",
): Promise<string | null> {
  const listingUrls: Record<"lidl" | "kaufland", string> = {
    lidl: "https://www.lidl.sk/c/letaky/s10017541",
    kaufland: "https://www.kaufland.sk/letaky.html",
  };

  try {
    const response = await fetchWithRetry(listingUrls[store]);
    if (!response.ok) {
      console.error(
        `getLatestFlyerUrl: failed to fetch ${store} listing page (${response.status})`,
      );
      return null;
    }

    const html = await response.text();
    const match = html.match(/(https:\/\/[^"']+\.pdf)/i);
    if (!match) {
      console.warn(`getLatestFlyerUrl: no PDF URL found on ${store} listing page`);
      return null;
    }

    return match[1];
  } catch (err) {
    console.error(`getLatestFlyerUrl: error fetching ${store} listing page:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gemini PDF Extraction
// ---------------------------------------------------------------------------

/**
 * System prompt that instructs Gemini to return strictly structured JSON.
 *
 * The prompt enforces:
 *   - An array of sale item objects
 *   - Exact field names and types
 *   - Product name normalisation rules (lower-case, no diacritics)
 *   - Category classification
 *   - Promotion validity dates
 */
const SYSTEM_PROMPT = `You are a data extraction assistant. Extract all grocery items on sale from this Slovak supermarket flyer. Return ONLY a valid JSON array. Do not use markdown blocks.

Each element must have exactly these fields:
- "product_name": string (normalized, lowercase, no diacritics)
- "sale_price": number
- "original_price": a number, or null if the original non-discounted price is not shown or cannot be determined
- "category": string (e.g., "dairy", "meat", "bakery", "pantry")
- "start_date": string (ISO 8601 date, e.g. "2024-01-15"; use today's date if not shown)
- "end_date": string or null (ISO 8601 date, or null if not shown)`;

/**
 * Sends a PDF buffer to the Gemini API and extracts structured sale data.
 *
 * @param pdfBuffer - Raw PDF bytes as an ArrayBuffer.
 * @param env       - Worker environment bindings (provides GEMINI_API_KEY).
 * @returns Parsed array of {@link SaleItem} objects.
 */
export async function extractPromotionsFromPdf(
  pdfBuffer: ArrayBuffer,
  env: Env,
): Promise<SaleItem[]> {
  const apiKey = env.GEMINI_API_KEY;

  // Convert ArrayBuffer to base64
  const bytes = new Uint8Array(pdfBuffer);
  const CHUNK_SIZE = 8192;
  const binaryChunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binaryChunks.push(String.fromCharCode(...chunk));
  }
  const base64 = btoa(binaryChunks.join(""));

  const requestBody = {
    contents: [
      {
        parts: [
          { text: SYSTEM_PROMPT },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data: GeminiApiResponse = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.warn("Gemini returned no text content; assuming no sale items.");
    return [];
  }

  const items: SaleItem[] = JSON.parse(text);

  // Validate each item's structure
  return items.filter((item) => {
    const valid =
      typeof item.product_name === "string" &&
      item.product_name.length > 0 &&
      typeof item.sale_price === "number" &&
      item.sale_price > 0 &&
      (item.original_price === null || typeof item.original_price === "number") &&
      typeof item.category === "string" &&
      item.category.length > 0 &&
      typeof item.start_date === "string" &&
      item.start_date.length > 0 &&
      (item.end_date === null || typeof item.end_date === "string");

    if (!valid) {
      console.warn("Skipping invalid sale item:", JSON.stringify(item));
    }
    return valid;
  });
}

// ---------------------------------------------------------------------------
// D1 Upsert
// ---------------------------------------------------------------------------

/**
 * Batch-upserts an array of sale items into the D1 `promotions` table.
 *
 * Uses SQLite's ON CONFLICT … DO UPDATE syntax so the operation is idempotent:
 * re-running the pipeline for the same flyer updates prices/dates rather than
 * creating duplicate rows.
 *
 * @param db       - Cloudflare D1 database binding.
 * @param storeIco - ICO (company registration number) of the store.
 * @param items    - Array of validated sale items from Gemini.
 * @returns Number of statements executed.
 */
export async function insertPromotions(
  db: D1Database,
  storeIco: string,
  items: SaleItem[],
): Promise<number> {
  if (items.length === 0) return 0;

  const stmt = db.prepare(
    `INSERT INTO promotions (store_ico, product_name_normalized, start_date, end_date, sale_price, category)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_ico, product_name_normalized, start_date)
     DO UPDATE SET sale_price = excluded.sale_price,
                   end_date   = excluded.end_date`,
  );

  const batch = items.map((item) =>
    stmt.bind(
      storeIco,
      item.product_name,
      item.start_date,
      item.end_date,
      item.sale_price,
      item.category,
    ),
  );

  const results = await db.batch(batch);
  return results.length;
}

// ---------------------------------------------------------------------------
// Ingestion Pipeline
// ---------------------------------------------------------------------------

/**
 * Core ingestion logic shared by the CRON handler and the manual HTTP trigger.
 *
 * Loops through the hard-coded store targets, dynamically discovers the latest
 * flyer PDF URL for each, fetches the PDF with retry logic, extracts sale items
 * via Gemini, and upserts the results into D1.
 *
 * @param env - Worker environment bindings.
 */
async function runIngestion(env: Env): Promise<void> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set. Aborting ingestion.");
    return;
  }

  let totalUpserted = 0;

  for (const target of STORE_TARGETS) {
    try {
      console.log(`[${target.name}] Discovering latest flyer URL…`);
      const pdfUrl = await getLatestFlyerUrl(target.name);

      if (!pdfUrl) {
        console.warn(`[${target.name}] No flyer URL found; skipping.`);
        continue;
      }

      console.log(`[${target.name}] Fetching PDF: ${pdfUrl}`);
      const pdfResponse = await fetchWithRetry(pdfUrl);
      if (!pdfResponse.ok) {
        console.error(
          `[${target.name}] Failed to fetch PDF (${pdfResponse.status}): ${pdfUrl}`,
        );
        continue;
      }
      const pdfBuffer = await pdfResponse.arrayBuffer();

      // Extract sale items via Gemini AI
      const items = await extractPromotionsFromPdf(pdfBuffer, env);
      console.log(`[${target.name}] Extracted ${items.length} sale items`);

      // Upsert into D1
      const upserted = await insertPromotions(env.DB, target.ico, items);
      totalUpserted += upserted;
      console.log(`[${target.name}] Upserted ${upserted} promotions`);
    } catch (err) {
      console.error(`[${target.name}] Unexpected error during ingestion:`, err);
    }
  }

  console.log(`Ingestion complete. Total promotions upserted: ${totalUpserted}`);
}

// ---------------------------------------------------------------------------
// Worker Entry Point
// ---------------------------------------------------------------------------

export default {
  /**
   * CRON trigger handler — the main ingestion pipeline.
   */
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await runIngestion(env);
  },

  /**
   * HTTP handler — returns a simple health-check response and can trigger
   * ingestion manually via POST for testing.
   */
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({ status: "ok", worker: "pantrypal-sk-ingestion" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // POST — manual trigger for testing
    if (request.method === "POST") {
      try {
        await runIngestion(env);
        return new Response(
          JSON.stringify({ status: "ok", message: "Ingestion triggered" }),
          { headers: { "Content-Type": "application/json" } },
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ status: "error", message: String(err) }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    return new Response("Method not allowed", { status: 405 });
  },
} satisfies ExportedHandler<Env>;
