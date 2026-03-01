import assert from 'node:assert/strict'
import test from 'node:test'

import { ingestReceipt, receiptToObservations } from './ingest.ts'
import type { EKasaReceipt } from './ekasa.ts'

const BASE_RECEIPT: EKasaReceipt = {
  uid: 'ABC12345XYZ',
  ico: '12345678',
  issuedAt: '2024-06-10T14:30:00.000Z',
  source: 'api',
  items: [
    { name: 'Zlatý Bažant 0.5l', price: 0.89, quantity: 1 },
    { name: 'Chlieb celozrnný', price: 1.19, quantity: 1 },
  ],
}

test('receiptToObservations maps items and normalizes names', () => {
  const observations = receiptToObservations(BASE_RECEIPT)

  assert.equal(observations.length, 2)

  const first = observations[0]
  assert.equal(first?.ico, '12345678')
  assert.equal(first?.normalizedName, 'zlaty bazant 0 5l')
  assert.equal(first?.price, 0.89)
  assert.equal(first?.date, '2024-06-10')

  const second = observations[1]
  assert.equal(second?.normalizedName, 'chlieb celozrnny')
})

test('receiptToObservations strips Slovak diacritics', () => {
  const receipt: EKasaReceipt = {
    ...BASE_RECEIPT,
    items: [
      { name: 'Šunka Ďatelinka', price: 2.5 },
      { name: 'Šošovica ľahká', price: 1.99 },
    ],
  }

  const observations = receiptToObservations(receipt)
  assert.equal(observations[0]?.normalizedName, 'sunka datelinka')
  assert.equal(observations[1]?.normalizedName, 'sosovica lahka')
})

test('receiptToObservations filters out items with price <= 0', () => {
  const receipt: EKasaReceipt = {
    ...BASE_RECEIPT,
    items: [
      { name: 'Free item', price: 0 },
      { name: 'Negative item', price: -1 },
      { name: 'Valid item', price: 1.5 },
    ],
  }

  const observations = receiptToObservations(receipt)
  assert.equal(observations.length, 1)
  assert.equal(observations[0]?.normalizedName, 'valid item')
})

test('ingestReceipt calls correct URL with correct JSON body', async () => {
  let capturedUrl = ''
  let capturedBody: unknown = null

  const mockFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedUrl = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
    capturedBody = JSON.parse((init?.body as string) ?? '{}')
    return {
      ok: true,
      json: async () => ({ status: 'ok', accepted: 2, rejected: 0 }),
    } as Response
  }

  const result = await ingestReceipt(BASE_RECEIPT, { fetchImpl: mockFetch as typeof fetch })

  assert.ok(capturedUrl.endsWith('/api/v1/prices/ingest'))
  assert.equal(result.accepted, 2)
  assert.equal(result.status, 'ok')

  const body = capturedBody as { observations: { ico: string }[] }
  assert.equal(body.observations.length, 2)
  assert.equal(body.observations[0]?.ico, '12345678')
})

test('ingestReceipt throws on HTTP error response', async () => {
  const mockFetch = async (): Promise<Response> =>
    ({
      ok: false,
      json: async () => ({ status: 'error', code: 'VALIDATION_ERROR', message: 'Bad request' }),
    }) as Response

  await assert.rejects(
    () => ingestReceipt(BASE_RECEIPT, { fetchImpl: mockFetch as typeof fetch }),
    { message: 'Bad request' }
  )
})

test('ingestReceipt throws when all items are filtered out', async () => {
  const receipt: EKasaReceipt = {
    ...BASE_RECEIPT,
    items: [{ name: 'Free', price: 0 }],
  }

  await assert.rejects(() => ingestReceipt(receipt), {
    message: 'No valid observations to ingest',
  })
})
