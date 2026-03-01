import type { EKasaReceipt } from './ekasa'
import type {
  IngestionErrorResponse,
  IngestionPayload,
  IngestionSuccessResponse,
  PriceObservation,
} from './types'

const DIACRITIC_MAP: Record<string, string> = {
  á: 'a', Á: 'a',
  č: 'c', Č: 'c',
  ď: 'd', Ď: 'd',
  é: 'e', É: 'e',
  í: 'i', Í: 'i',
  ľ: 'l', Ľ: 'l',
  ĺ: 'l', Ĺ: 'l',
  ň: 'n', Ň: 'n',
  ó: 'o', Ó: 'o',
  ô: 'o', Ô: 'o',
  ŕ: 'r', Ŕ: 'r',
  š: 's', Š: 's',
  ť: 't', Ť: 't',
  ú: 'u', Ú: 'u',
  ý: 'y', Ý: 'y',
  ž: 'z', Ž: 'z',
}

function stripDiacritics(str: string): string {
  return str.replace(/[áÁčČďĎéÉíÍľĽĺĹňŇóÓôÔŕŔšŠťŤúÚýÝžŽ]/g, (ch) => DIACRITIC_MAP[ch] ?? ch)
}

export function receiptToObservations(receipt: EKasaReceipt): PriceObservation[] {
  const date = receipt.issuedAt.slice(0, 10)

  return receipt.items
    .filter((item) => item.price > 0)
    .map((item) => {
      const normalizedName = stripDiacritics(item.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/ {2,}/g, ' ')

      return {
        ico: receipt.ico,
        normalizedName,
        price: item.price,
        date,
      }
    })
}

export const BACKEND_BASE_URL: string =
  (process.env['EXPO_PUBLIC_BACKEND_URL'] as string | undefined) ?? 'http://localhost:8000'

export async function ingestReceipt(
  receipt: EKasaReceipt,
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch }
): Promise<IngestionSuccessResponse> {
  const observations = receiptToObservations(receipt)

  if (observations.length === 0) {
    throw new Error('No valid observations to ingest')
  }

  const payload: IngestionPayload = { observations }
  const fetchImpl = options?.fetchImpl ?? fetch

  const response = await fetchImpl(`${BACKEND_BASE_URL}/api/v1/prices/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options?.signal,
  })

  if (!response.ok) {
    let detail = 'Ingestion failed'
    try {
      const errBody = (await response.json()) as Partial<IngestionErrorResponse>
      detail = errBody.message ?? detail
    } catch {
      // response body is not JSON; use generic message
    }
    throw new Error(detail)
  }

  return (await response.json()) as IngestionSuccessResponse
}
