import { useCallback, useEffect, useRef, useState } from "react";
import * as SQLite from "expo-sqlite";
import { initLocalDatabase } from "../db/schema";

/** Singleton database promise shared across all hooks. */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = initLocalDatabase();
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Pantry item type
// ---------------------------------------------------------------------------

export interface PantryItem {
  id: number;
  normalized_name: string;
  display_name: string;
  category: string | null;
  quantity: number;
  unit: string;
  last_price_eur: number | null;
  last_purchased_on: string | null;
  last_store_ico: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// usePantry hook
// ---------------------------------------------------------------------------

export interface UsePantryResult {
  items: PantryItem[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  addItem: (item: {
    displayName: string;
    normalizedName: string;
    category?: string;
    quantity?: number;
    unit?: string;
    priceEur?: number;
    storeIco?: string;
    purchasedOn?: string;
  }) => Promise<void>;
  updateQuantity: (id: number, quantity: number) => Promise<void>;
  removeItem: (id: number) => Promise<void>;
  addToShoppingList: (item: PantryItem) => Promise<void>;
}

export function usePantry(): UsePantryResult {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const db = await getDb();
      const rows = await db.getAllAsync<PantryItem>(
        "SELECT * FROM local_pantry ORDER BY updated_at DESC"
      );
      if (isMounted.current) {
        setItems(rows);
      }
    } catch (e) {
      console.warn("usePantry.refresh failed", e);
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addItem = useCallback(
    async (item: {
      displayName: string;
      normalizedName: string;
      category?: string;
      quantity?: number;
      unit?: string;
      priceEur?: number;
      storeIco?: string;
      purchasedOn?: string;
    }) => {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO local_pantry
           (display_name, normalized_name, category, quantity, unit,
            last_price_eur, last_store_ico, last_purchased_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(normalized_name) DO UPDATE SET
           quantity = quantity + excluded.quantity,
           last_price_eur = COALESCE(excluded.last_price_eur, last_price_eur),
           last_store_ico = COALESCE(excluded.last_store_ico, last_store_ico),
           last_purchased_on = COALESCE(excluded.last_purchased_on, last_purchased_on)`,
        [
          item.displayName,
          item.normalizedName,
          item.category ?? null,
          item.quantity ?? 1,
          item.unit ?? "piece",
          item.priceEur ?? null,
          item.storeIco ?? null,
          item.purchasedOn ?? null,
        ]
      );
      await refresh();
    },
    [refresh]
  );

  const updateQuantity = useCallback(
    async (id: number, quantity: number) => {
      const db = await getDb();
      if (quantity <= 0) {
        await db.runAsync("DELETE FROM local_pantry WHERE id = ?", [id]);
      } else {
        await db.runAsync(
          "UPDATE local_pantry SET quantity = ? WHERE id = ?",
          [quantity, id]
        );
      }
      await refresh();
    },
    [refresh]
  );

  const removeItem = useCallback(
    async (id: number) => {
      const db = await getDb();
      await db.runAsync("DELETE FROM local_pantry WHERE id = ?", [id]);
      await refresh();
    },
    [refresh]
  );

  const addToShoppingList = useCallback(
    async (item: PantryItem) => {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO shopping_list
           (item_name, normalized_name, quantity, unit, price_hint_eur, price_hint_store_ico)
         VALUES (?, ?, 1, ?, ?, ?)`,
        [
          item.display_name,
          item.normalized_name,
          item.unit,
          item.last_price_eur ?? null,
          item.last_store_ico ?? null,
        ]
      );
    },
    []
  );

  return {
    items,
    isLoading,
    refresh,
    addItem,
    updateQuantity,
    removeItem,
    addToShoppingList,
  };
}
