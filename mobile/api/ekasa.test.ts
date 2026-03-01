import assert from "node:assert/strict";
import test from "node:test";

import { extractUidFromQr, fetchEKasaReceipt } from "./ekasa";

test("extractUidFromQr extracts UID from URL path", () => {
  assert.equal(
    extractUidFromQr("https://ekasa.example.sk/receipt/ABC12345XYZ"),
    "ABC12345XYZ"
  );
});

test("extractUidFromQr rejects non-UID free text", () => {
  assert.equal(extractUidFromQr("not-a-uid"), null);
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
