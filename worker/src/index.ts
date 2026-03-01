/**
 * PantryPal SK — Cloudflare Worker: Flyer PDF Ingestion
 *
 * CRON-triggered worker that:
 *   1. Fetches supermarket flyer PDFs
 *   2. Sends the PDF to the Gemini API for structured data extraction
 *   3. Persists the extracted sale items to a Cloudflare D1 database
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Env {
  /** Cloudflare D1 database binding */
  DB: D1Database;
  /** Google AI Studio API key (set via `wrangler secret put GEMINI_API_KEY`) */
  GEMINI_API_KEY: string;
  /** Comma-separated list of flyer PDF URLs to process */
  FLYER_PDF_URLS?: string;
  /** Name of the store whose flyers are being processed */
  STORE_NAME?: string;
}

/** A single sale item extracted from a flyer by the Gemini model. */
export interface SaleItem {
  product_name: string;
  sale_price: number;
  original_price: number | null;
  category: string;
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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
 */
const SYSTEM_PROMPT = `You are a data extraction assistant. Extract all grocery items on sale from this Slovak supermarket flyer. Return ONLY a valid JSON array. Do not use markdown blocks.

Each element must have exactly these fields:
- "product_name": string (normalized, lowercase, no diacritics)
- "sale_price": number
- "original_price": a number, or null if the original non-discounted price is not shown or cannot be determined
- "category": string (e.g., "dairy", "meat", "bakery", "pantry")`;

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
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);

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
      item.category.length > 0;

    if (!valid) {
      console.warn("Skipping invalid sale item:", JSON.stringify(item));
    }
    return valid;
  });
}

// ---------------------------------------------------------------------------
// D1 Insertion
// ---------------------------------------------------------------------------

/**
 * Batch-inserts an array of sale items into the D1 `promotions` table.
 *
 * Uses D1's `batch()` API to execute all inserts in a single round-trip.
 *
 * @param db    - Cloudflare D1 database binding.
 * @param store - Name of the store.
 * @param items - Array of validated sale items from Gemini.
 * @returns Number of rows inserted.
 */
export async function insertPromotions(
  db: D1Database,
  store: string,
  items: SaleItem[],
): Promise<number> {
  if (items.length === 0) return 0;

  const stmt = db.prepare(
    `INSERT INTO promotions (store, product_name, sale_price, category)
     VALUES (?, ?, ?, ?)`,
  );

  const batch = items.map((item) =>
    stmt.bind(
      store,
      item.product_name,
      item.sale_price,
      item.category,
    ),
  );

  const results = await db.batch(batch);
  return results.length;
}

// ---------------------------------------------------------------------------
// PDF Fetching Utility
// ---------------------------------------------------------------------------

/**
 * Downloads a supermarket flyer PDF from the given URL.
 *
 * @param url - URL of the flyer PDF.
 * @returns The raw PDF bytes as an ArrayBuffer.
 */
export async function fetchSupermarketPdf(
  url: string,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF from ${url}: ${response.status}`);
  }
  return response.arrayBuffer();
}

// ---------------------------------------------------------------------------
// Ingestion Pipeline
// ---------------------------------------------------------------------------

/**
 * Core ingestion logic shared by the CRON handler and the manual HTTP trigger.
 *
 * @param env - Worker environment bindings.
 */
async function runIngestion(env: Env): Promise<void> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set. Aborting ingestion.");
    return;
  }

  const store = env.STORE_NAME ?? "unknown";
  const pdfUrls = (env.FLYER_PDF_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  if (pdfUrls.length === 0) {
    console.warn("No FLYER_PDF_URLS configured. Nothing to process.");
    return;
  }

  let totalInserted = 0;

  for (const url of pdfUrls) {
    try {
      console.log(`Processing flyer: ${url}`);

      // 1. Fetch PDF
      const pdfBuffer = await fetchSupermarketPdf(url);

      // 2. Extract sale items via Gemini AI
      const items = await extractPromotionsFromPdf(pdfBuffer, env);
      console.log(`Extracted ${items.length} sale items from ${url}`);

      // 3. Persist to D1
      const inserted = await insertPromotions(env.DB, store, items);
      totalInserted += inserted;
      console.log(`Inserted ${inserted} promotions from ${url}`);
    } catch (err) {
      console.error(`Error processing ${url}:`, err);
    }
  }

  console.log(`Ingestion complete. Total promotions inserted: ${totalInserted}`);
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
