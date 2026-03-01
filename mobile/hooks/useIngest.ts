import { useCallback, useState } from 'react'

import type { EKasaReceipt } from '../api/ekasa'
import { ingestReceipt } from '../api/ingest'
import type { IngestionSuccessResponse } from '../api/types'

export interface UseIngestResult {
  ingest: (receipt: EKasaReceipt) => Promise<void>
  isLoading: boolean
  result: IngestionSuccessResponse | null
  error: string | null
  reset: () => void
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
      console.warn('ingestReceipt failed', err)
      setError('Odoslanie cien zlyhalo.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { ingest, isLoading, result, error, reset }
}
