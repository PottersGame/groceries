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
// Shopping list item type
// ---------------------------------------------------------------------------

export interface ShoppingListItem {
  id: number;
  item_name: string;
  normalized_name: string;
  quantity: number;
  unit: string;
  is_checked: number;
  pantry_item_id: number | null;
  price_hint_eur: number | null;
  price_hint_store_ico: string | null;
  price_hint_fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// useShoppingList hook
// ---------------------------------------------------------------------------

export interface UseShoppingListResult {
  items: ShoppingListItem[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  addItem: (name: string, quantity?: number, unit?: string) => Promise<void>;
  toggleChecked: (id: number, currentValue: number) => Promise<void>;
  removeItem: (id: number) => Promise<void>;
  clearChecked: () => Promise<void>;
  estimatedTotal: number;
}

export function useShoppingList(): UseShoppingListResult {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
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
      const rows = await db.getAllAsync<ShoppingListItem>(
        "SELECT * FROM shopping_list ORDER BY is_checked ASC, created_at DESC"
      );
      if (isMounted.current) {
        setItems(rows);
      }
    } catch (e) {
      console.warn("useShoppingList.refresh failed", e);
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stripDiacritics = (str: string): string => {
    const map: Record<string, string> = {
      á: "a", Á: "a", č: "c", Č: "c", ď: "d", Ď: "d",
      é: "e", É: "e", í: "i", Í: "i", ľ: "l", Ľ: "l",
      ĺ: "l", Ĺ: "l", ň: "n", Ň: "n", ó: "o", Ó: "o",
      ô: "o", Ô: "o", ŕ: "r", Ŕ: "r", š: "s", Š: "s",
      ť: "t", Ť: "t", ú: "u", Ú: "u", ý: "y", Ý: "y",
      ž: "z", Ž: "z",
    };
    return str.replace(
      /[áÁčČďĎéÉíÍľĽĺĹňŇóÓôÔŕŔšŠťŤúÚýÝžŽ]/g,
      (ch) => map[ch] ?? ch
    );
  };

  const addItem = useCallback(
    async (name: string, quantity = 1, unit = "piece") => {
      const normalized = stripDiacritics(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/ {2,}/g, " ");

      const db = await getDb();
      await db.runAsync(
        `INSERT INTO shopping_list (item_name, normalized_name, quantity, unit)
         VALUES (?, ?, ?, ?)`,
        [name, normalized, quantity, unit]
      );
      await refresh();
    },
    [refresh]
  );

  const toggleChecked = useCallback(
    async (id: number, currentValue: number) => {
      const db = await getDb();
      await db.runAsync(
        "UPDATE shopping_list SET is_checked = ? WHERE id = ?",
        [currentValue === 0 ? 1 : 0, id]
      );
      await refresh();
    },
    [refresh]
  );

  const removeItem = useCallback(
    async (id: number) => {
      const db = await getDb();
      await db.runAsync("DELETE FROM shopping_list WHERE id = ?", [id]);
      await refresh();
    },
    [refresh]
  );

  const clearChecked = useCallback(async () => {
    const db = await getDb();
    await db.runAsync("DELETE FROM shopping_list WHERE is_checked = 1");
    await refresh();
  }, [refresh]);

  const estimatedTotal = items.reduce((sum, item) => {
    if (item.price_hint_eur && !item.is_checked) {
      return sum + item.price_hint_eur * item.quantity;
    }
    return sum;
  }, 0);

  return {
    items,
    isLoading,
    refresh,
    addItem,
    toggleChecked,
    removeItem,
    clearChecked,
    estimatedTotal,
  };
}
