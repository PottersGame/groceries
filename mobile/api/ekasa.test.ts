import assert from "node:assert/strict";
import test from "node:test";

import { extractUidFromQr, fetchEKasaReceipt } from "./ekasa.ts";

test("extractUidFromQr extracts UID from URL path", () => {
  assert.equal(
    extractUidFromQr("https://ekasa.example.sk/receipt/ABC12345XYZ"),
    "ABC12345XYZ"
  );
});

test("extractUidFromQr rejects non-UID free text", () => {
  assert.equal(extractUidFromQr("not-a-uid"), null);
});

test("extractUidFromQr extracts UID from query parameter", () => {
  assert.equal(
    extractUidFromQr("https://ekasa.example.sk/doc?uid=ABC12345XYZ"),
    "ABC12345XYZ"
  );
});

test("fetchEKasaReceipt returns mock fallback when offline", async () => {
  const offlineFetch = async () => {
    throw new Error("offline");
  };

  const receipt = await fetchEKasaReceipt("ABC12345XYZ", {
    fetchImpl: offlineFetch as typeof fetch,
  });

  assert.equal(receipt.source, "mock");
  assert.equal(receipt.ico, "31636365");
  assert.ok(receipt.items.length > 0);
});

test("fetchEKasaReceipt maps successful API response", async () => {
  const apiFetch = async () =>
    ({
      ok: true,
      json: async () => ({
        ico: "12345678",
        issuedAt: "2026-03-01T00:00:00.000Z",
        items: [{ name: "Rohlík", price: 0.39, quantity: 2 }],
      }),
    }) as Response;

  const receipt = await fetchEKasaReceipt("ABC12345XYZ", {
    fetchImpl: apiFetch as typeof fetch,
  });

  assert.equal(receipt.source, "api");
  assert.equal(receipt.ico, "12345678");
  assert.equal(receipt.items[0]?.name, "Rohlík");
});
