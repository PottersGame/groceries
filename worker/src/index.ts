/**
 * PantryPal SK — Cloudflare Worker: Flyer PDF Ingestion
 *
 * CRON-triggered worker that:
 *   1. Fetches supermarket flyer PDFs
 *   2. Converts pages to image buffers
 *   3. Calls the Gemini vision API to extract structured JSON sale data
 *   4. Persists the results to a Cloudflare D1 database
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
  /** 8-digit Slovak IČO of the store whose flyers are being processed */
  STORE_ICO?: string;
}

/** A single sale item extracted from a flyer page by the Gemini vision model. */
export interface SaleItem {
  product_name: string;
  sale_price: number;
  start_date: string;
  end_date: string;
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

const GEMINI_MODEL = "gemini-2.0-flash-lite";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ---------------------------------------------------------------------------
// Gemini Vision Extraction
// ---------------------------------------------------------------------------

/**
 * System prompt that instructs Gemini to return strictly structured JSON.
 *
 * The prompt enforces:
 *   - An array of sale item objects
 *   - Exact field names and types
 *   - Product name normalisation rules (lower-case, no diacritics)
 *   - ISO-8601 date formats
 */
const SYSTEM_PROMPT = `You are a data extraction assistant for a Slovak grocery price tracker.
Analyze the provided supermarket flyer image and extract every promotional sale item visible.

Return ONLY a JSON array where each element has exactly these fields:
- "product_name": string — the product name, normalized to lower-case with diacritics removed and extra whitespace collapsed (e.g. "zlaty bazant 0.5l")
- "sale_price": number — the promotional price in EUR as a positive number (e.g. 1.49)
- "start_date": string — the promotion start date in ISO-8601 format "YYYY-MM-DD"
- "end_date": string — the promotion end date in ISO-8601 format "YYYY-MM-DD"

Rules:
1. If a date range is shown on the flyer (e.g. "1.3. - 7.3.2026"), use it for start_date and end_date.
2. If only one date is visible, use it for both start_date and end_date.
3. If no dates are visible, use "1970-01-01" for both fields.
4. Always use the discounted/promotional price, not the original price.
5. Normalize product names: remove diacritics (š→s, č→c, ž→z, etc.), convert to lower-case, collapse whitespace.
6. Do not include non-food promotional items (electronics, clothing, etc.) unless they are clearly grocery items.
7. Return an empty array [] if no sale items are found.`;

/**
 * Calls the Gemini vision API to extract structured sale data from a
 * base64-encoded flyer page image.
 *
 * @param imageBase64 - Base64-encoded image (PNG or JPEG) of a single flyer page.
 * @param apiKey      - Google AI Studio API key.
 * @param mimeType    - MIME type of the image (default: "image/png").
 * @returns Parsed array of {@link SaleItem} objects.
 */
export async function extractSalesWithGemini(
  imageBase64: string,
  apiKey: string,
  mimeType = "image/png",
): Promise<SaleItem[]> {
  const requestBody = {
    contents: [
      {
        parts: [
          { text: SYSTEM_PROMPT },
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: "application/json",
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
      typeof item.start_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.start_date) &&
      typeof item.end_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.end_date);

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
 * @param db       - Cloudflare D1 database binding.
 * @param storeIco - 8-digit Slovak IČO of the store.
 * @param items    - Array of validated sale items from Gemini.
 * @returns Number of rows inserted.
 */
export async function insertPromotions(
  db: D1Database,
  storeIco: string,
  items: SaleItem[],
): Promise<number> {
  if (items.length === 0) return 0;

  const stmt = db.prepare(
    `INSERT INTO promotions (store_ico, product_name_normalized, sale_price, start_date, end_date)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const batch = items.map((item) =>
    stmt.bind(
      storeIco,
      item.product_name,
      item.sale_price,
      item.start_date,
      item.end_date,
    ),
  );

  const results = await db.batch(batch);
  return results.length;
}

// ---------------------------------------------------------------------------
// PDF → Image Helper
// ---------------------------------------------------------------------------

/**
 * Fetches a PDF from the given URL and returns its bytes as a base64 string.
 *
 * In a production pipeline this would render individual PDF pages to images
 * using a library such as pdf.js or a headless browser. For this initial
 * implementation the raw PDF bytes are sent to Gemini which can process
 * PDF content directly when provided as `application/pdf`.
 *
 * @param url - URL of the flyer PDF.
 * @returns Object containing the base64-encoded content and its MIME type.
 */
export async function fetchPdfAsBase64(
  url: string,
): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF from ${url}: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Convert to base64 in a Worker-safe way (no Node.js Buffer)
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return { base64, mimeType: "application/pdf" };
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

  const storeIco = env.STORE_ICO ?? "00000000";
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

      // 1. Fetch PDF and convert to base64
      const { base64, mimeType } = await fetchPdfAsBase64(url);

      // 2. Extract sale items via Gemini vision AI
      const items = await extractSalesWithGemini(base64, apiKey, mimeType);
      console.log(`Extracted ${items.length} sale items from ${url}`);

      // 3. Persist to D1
      const inserted = await insertPromotions(env.DB, storeIco, items);
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
