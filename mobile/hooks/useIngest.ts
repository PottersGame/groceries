import { useCallback, useState } from 'react'

import type { EKasaReceipt } from '../api/ekasa'
import { ingestReceipt, receiptToObservations, sendIngestionPayload } from '../api/ingest'
import type { IngestionPayload, IngestionSuccessResponse } from '../api/types'
import { getLocalDatabase } from '../db/schema'

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

async function enqueue(payload: IngestionPayload): Promise<void> {
  const db = await getLocalDatabase()
  await db.runAsync(
    'INSERT INTO ingest_queue (payload_json) VALUES (?)',
    [JSON.stringify(payload)],
  )
}

async function flushQueue(
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const db = await getLocalDatabase()
  const rows = await db.getAllAsync<{ id: number; payload_json: string }>(
    'SELECT id, payload_json FROM ingest_queue ORDER BY id ASC LIMIT 20',
  )

  let flushed = 0
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload_json) as IngestionPayload
      await sendIngestionPayload(payload, { fetchImpl })
      await db.runAsync('DELETE FROM ingest_queue WHERE id = ?', [row.id])
      flushed++
    } catch {
      await db.runAsync(
        `UPDATE ingest_queue
            SET attempts = attempts + 1,
                last_error_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?`,
        [row.id],
      )
    }
  }
  return flushed
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseIngestResult {
  ingest: (receipt: EKasaReceipt) => Promise<void>
  isLoading: boolean
  result: IngestionSuccessResponse | null
  error: string | null
  reset: () => void
  flushOfflineQueue: () => Promise<number>
}

export function useIngest(): UseIngestResult {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<IngestionSuccessResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  const ingest = useCallback(async (receipt: EKasaReceipt): Promise<void> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await ingestReceipt(receipt)
      setResult(response)
    } catch (err) {
      // Network or server error — queue the payload for later retry
      console.warn('ingestReceipt failed, queuing for later', err)
      try {
        const observations = receiptToObservations(receipt)
        if (observations.length > 0) {
          await enqueue({ observations })
        }
      } catch (queueErr) {
        console.error('Failed to enqueue payload', queueErr)
      }
      setError('Odoslanie cien zlyhalo. Bude opakované neskôr.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const flushOfflineQueue = useCallback(async (): Promise<number> => {
    return flushQueue()
  }, [])

  return { ingest, isLoading, result, error, reset, flushOfflineQueue }
}
