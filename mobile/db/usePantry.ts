import { useCallback } from "react";

import type { EKasaReceiptItem } from "../api/ekasa";
import { getLocalDatabase } from "./schema";
import type { PantryItem } from "../hooks/usePantry";
import { normalizeProductName } from "../utils/string";

// ---------------------------------------------------------------------------
// usePantry hook (receipt-ingestion flavour)
// ---------------------------------------------------------------------------

export interface UseReceiptPantryResult {
  /**
   * Upserts every item from a scanned receipt into the `local_pantry` table.
   * Uses ON CONFLICT … DO UPDATE so that re-scanning the same item increments
   * the stored quantity rather than creating a duplicate row.
   *
   * @returns The number of items processed.
   */
  addReceiptItemsToPantry: (
    items: EKasaReceiptItem[],
    storeIco: string,
    purchaseDate: string
  ) => Promise<number>;

  /** Fetches all pantry rows ordered by most-recently updated first. */
  getPantryItems: () => Promise<PantryItem[]>;
}

export function usePantry(): UseReceiptPantryResult {
  const addReceiptItemsToPantry = useCallback(
    async (
      items: EKasaReceiptItem[],
      storeIco: string,
      purchaseDate: string
    ): Promise<number> => {
      const db = await getLocalDatabase();
      // Keep only the date part (YYYY-MM-DD) – the schema stores ISO-8601 date strings
      const dateOnly = purchaseDate.slice(0, 10);

      let count = 0;
      await db.withTransactionAsync(async () => {
        for (const item of items) {
          const normalizedName = normalizeProductName(item.name);
          await db.runAsync(
            `INSERT INTO local_pantry
               (display_name, normalized_name, quantity, last_price_eur,
                last_purchased_on, last_store_ico)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(normalized_name) DO UPDATE SET
               display_name      = excluded.display_name,
               quantity          = quantity + excluded.quantity,
               last_price_eur    = excluded.last_price_eur,
               last_purchased_on = excluded.last_purchased_on,
               last_store_ico    = excluded.last_store_ico`,
            [
              item.name,
              normalizedName,
              item.quantity ?? 1,
              item.price,
              dateOnly,
              storeIco,
            ]
          );
          count++;
        }
      });
      return count;
    },
    []
  );

  const getPantryItems = useCallback(async (): Promise<PantryItem[]> => {
    const db = await getLocalDatabase();
    return db.getAllAsync<PantryItem>(
      "SELECT * FROM local_pantry ORDER BY updated_at DESC"
    );
  }, []);

  return { addReceiptItemsToPantry, getPantryItems };
}
