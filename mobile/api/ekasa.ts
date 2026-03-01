export interface EKasaReceiptItem {
  name: string;
  price: number;
  quantity?: number;
}

export interface EKasaReceipt {
  uid: string;
  ico: string;
  issuedAt: string;
  items: EKasaReceiptItem[];
  source: "api" | "mock";
  raw?: unknown;
}

const UID_PATTERNS: RegExp[] = [
  /[?&](?:uid|receiptId|receipt_id|id)=([A-Za-z0-9_-]{8,128})/i,
  /\/(?:receipt|doklad|uid)\/([A-Za-z0-9_-]{8,128})(?:[/?#]|$)/i,
  /\b([A-Z0-9]{20,64})\b/,
];

const MOCK_RECEIPT: Omit<EKasaReceipt, "uid"> = {
  ico: "31636365",
  issuedAt: new Date().toISOString(),
  source: "mock",
  items: [
    { name: "Banány", price: 1.29, quantity: 1 },
    { name: "Mlieko 1L", price: 0.89, quantity: 1 },
  ],
};

function normalizeUid(uid: string): string | null {
  const trimmed = uid.trim();
  return /^(?=.*\d)[A-Za-z0-9_-]{8,128}$/.test(trimmed) ? trimmed : null;
}

export function extractUidFromQr(qrValue: string): string | null {
  if (!qrValue || typeof qrValue !== "string") {
    return null;
  }

  const raw = qrValue.trim();
  if (!raw) {
    return null;
  }

  const valuesToScan = [raw];
  try {
    valuesToScan.push(decodeURIComponent(raw));
  } catch {
    // ignore decoding errors; we still scan the original value
  }

  for (const candidate of valuesToScan) {
    const normalizedCandidate = normalizeUid(candidate);
    if (normalizedCandidate) {
      return normalizedCandidate;
    }

    for (const pattern of UID_PATTERNS) {
      const match = candidate.match(pattern);
      if (match?.[1]) {
        const normalized = normalizeUid(match[1]);
        if (normalized) {
          return normalized;
        }
      }
    }
  }

  return null;
}

function toReceiptItems(items: unknown): EKasaReceiptItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const name =
        typeof record.name === "string"
          ? record.name
          : typeof record.text === "string"
            ? record.text
            : null;
      const price =
        typeof record.price === "number"
          ? record.price
          : typeof record.amount === "number"
            ? record.amount
            : null;

      if (!name || price === null) {
        return null;
      }

      return {
        name,
        price,
        quantity: typeof record.quantity === "number" ? record.quantity : undefined,
      };
    })
    .filter((item): item is EKasaReceiptItem => item !== null);
}

export async function fetchEKasaReceipt(
  uid: string,
  options?: {
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    endpoint?: string;
  }
): Promise<EKasaReceipt> {
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid) {
    throw new Error("Invalid eKasa UID");
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const endpoint =
    options?.endpoint ?? "https://ekasa.financnasprava.sk/mdu/api/v1/opd/receipt";

  try {
    const response = await fetchImpl(
      `${endpoint}/${encodeURIComponent(normalizedUid)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: options?.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`eKasa API request failed with ${response.status}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const apiItems = toReceiptItems(json.items);

    return {
      uid: normalizedUid,
      ico: typeof json.ico === "string" ? json.ico : MOCK_RECEIPT.ico,
      issuedAt:
        typeof json.issuedAt === "string"
          ? json.issuedAt
          : typeof json.issued_at === "string"
            ? json.issued_at
            : new Date().toISOString(),
      items: apiItems.length > 0 ? apiItems : MOCK_RECEIPT.items,
      source: "api",
      raw: json,
    };
  } catch (error) {
    console.warn("fetchEKasaReceipt: API request failed, using mock data", error);
    return {
      uid: normalizedUid,
      ...MOCK_RECEIPT,
      issuedAt: new Date().toISOString(),
    };
  }
}
