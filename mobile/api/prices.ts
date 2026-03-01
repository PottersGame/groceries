import { BACKEND_BASE_URL } from "./ingest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoreInfo {
  id: number;
  ico: string;
  chain_name: string;
  branch_label: string | null;
  flyer_enabled: boolean;
  created_at: string;
}

export interface PriceResult {
  product_id: number;
  product_name: string;
  store_ico: string;
  store_chain: string;
  price_eur: number;
  observed_on: string;
  ingested_at: string;
}

export interface ProductSearchResult {
  id: number;
  normalized_name: string;
  display_name: string;
  category: string | null;
  unit: string;
  barcode: string | null;
}

// ---------------------------------------------------------------------------
// Store listing
// ---------------------------------------------------------------------------

export async function fetchStores(
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch }
): Promise<StoreInfo[]> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const response = await fetchImpl(`${BACKEND_BASE_URL}/api/v1/stores`, {
    headers: { Accept: "application/json" },
    signal: options?.signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch stores: ${response.status}`);
  }
  const json = (await response.json()) as { stores: StoreInfo[] };
  return json.stores;
}

// ---------------------------------------------------------------------------
// Price query
// ---------------------------------------------------------------------------

export async function queryPrices(
  params: {
    productName?: string;
    ico?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  },
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch }
): Promise<PriceResult[]> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const url = new URL(`${BACKEND_BASE_URL}/api/v1/prices`);

  if (params.productName) url.searchParams.set("product_name", params.productName);
  if (params.ico) url.searchParams.set("ico", params.ico);
  if (params.dateFrom) url.searchParams.set("date_from", params.dateFrom);
  if (params.dateTo) url.searchParams.set("date_to", params.dateTo);
  if (params.limit) url.searchParams.set("limit", String(params.limit));

  const response = await fetchImpl(url.toString(), {
    headers: { Accept: "application/json" },
    signal: options?.signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to query prices: ${response.status}`);
  }
  const json = (await response.json()) as { results: PriceResult[] };
  return json.results;
}

// ---------------------------------------------------------------------------
// Product search
// ---------------------------------------------------------------------------

export async function searchProducts(
  query: string,
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch }
): Promise<ProductSearchResult[]> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const url = new URL(`${BACKEND_BASE_URL}/api/v1/products/search`);
  url.searchParams.set("q", query);

  const response = await fetchImpl(url.toString(), {
    headers: { Accept: "application/json" },
    signal: options?.signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to search products: ${response.status}`);
  }
  const json = (await response.json()) as { products: ProductSearchResult[] };
  return json.products;
}

// ---------------------------------------------------------------------------
// Promotions (flyer deals)
// ---------------------------------------------------------------------------

export interface PromoResult {
  product_name: string;
  store_ico: string;
  store_chain: string;
  promo_price_eur: number;
  regular_price_eur: number | null;
  valid_from: string;
  valid_to: string;
  category: string | null;
}

export async function fetchPromotions(
  params?: {
    productName?: string;
    ico?: string;
    activeOnly?: boolean;
    limit?: number;
  },
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch }
): Promise<PromoResult[]> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const url = new URL(`${BACKEND_BASE_URL}/api/v1/promotions`);

  if (params?.productName) url.searchParams.set("product_name", params.productName);
  if (params?.ico) url.searchParams.set("ico", params.ico);
  if (params?.activeOnly === false) url.searchParams.set("active_only", "false");
  if (params?.limit) url.searchParams.set("limit", String(params.limit));

  const response = await fetchImpl(url.toString(), {
    headers: { Accept: "application/json" },
    signal: options?.signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch promotions: ${response.status}`);
  }
  const json = (await response.json()) as { results: PromoResult[] };
  return json.results;
}
