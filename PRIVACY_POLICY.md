# Privacy Policy — PantryPal SK

_Last updated: 2026-03-01_

## 1. Overview

PantryPal SK is built on a **privacy-first** principle: **we do not collect, store, or transmit any personal data**. This document explains exactly what information the app uses and how it is handled.

## 2. Data We Do NOT Collect

- **No user accounts or identifiers** — there is no registration, no login, and no user ID.
- **No device identifiers** — the app never reads or transmits IMEI, advertising ID, or any other device-specific identifier.
- **No receipt numbers** — eKasa receipt UIDs are used only to fetch receipt data on-demand and are never persisted or sent to our backend.
- **No location data** — location access (used to rank nearby stores) is processed entirely on-device and is never sent to our servers.
- **No analytics or tracking** — we use no analytics SDKs, crash reporters, or advertising networks.

## 3. Data Stored Locally on Your Device

The following data is stored **only in your phone's local SQLite database** and never leaves your device:

| Table | Contents |
|---|---|
| `local_pantry` | Product names and purchase details from scanned receipts |
| `shopping_list` | Items you have manually added to your shopping list |
| `ingest_queue` | Temporary queue of price observations pending upload (cleared after successful send) |

You can delete all locally stored data by uninstalling the app.

## 4. Anonymous Price Data Sent to Our Backend

When you scan an eKasa receipt, the app sends the following **anonymous** price observations to our backend server:

```
(store IČO, normalised product name, price in EUR, purchase date)
```

- **No user ID, device ID, or receipt UID** is included in this payload.
- The store is identified only by its public **IČO** (company registration number), which is printed on every Slovak fiscal receipt and is publicly available in the Slovak business register.
- Product names are normalised (lowercased, diacritics removed) before transmission.

This data is used solely to build an anonymous, crowdsourced price database for Slovak grocery stores.

## 5. Flyer Promotion Data

Promotional price data is scraped from publicly accessible retail flyer PDFs by our automated Cloudflare Worker. This data is factual pricing information (product names and prices) from public advertising materials. No personal data is involved.

## 6. Data Retention

Anonymous price observations stored on our backend server are retained for as long as they remain useful for price comparison (typically one year). There is no way to delete your contributions because they contain no information that could be linked to you.

## 7. Third-Party Services

| Service | Purpose | Data Shared |
|---|---|---|
| Slovak eKasa API (`ekasa.financnasprava.sk`) | Fetching receipt item details by UID | Receipt UID only (no personal data) |
| Google Gemini AI | Extracting sale items from flyer PDFs | PDF content only (no personal data) |
| Cloudflare D1 | Edge database for promotional data | Normalised product names and prices only |
| Supabase / PostgreSQL | Central price database | Anonymous price observations only |

## 8. Children's Privacy

This app does not knowingly collect any data from children. Because we collect no personal data from anyone, there is no special handling required for minors.

## 9. Changes to This Policy

If we make changes that affect how data is handled, we will update this document and the "Last updated" date above.

## 10. Contact

For privacy-related questions, please open an issue at the project's GitHub repository.
