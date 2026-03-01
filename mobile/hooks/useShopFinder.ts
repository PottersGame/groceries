import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { fetchStores, queryPrices, type StoreInfo, type PriceResult } from "../api/prices";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShopRecommendation {
  store: StoreInfo;
  /** Average price across the queried products. */
  avgPrice: number;
  /** Number of matching products found at this store. */
  matchCount: number;
  /** Distance in km from the user (null if location unavailable). */
  distanceKm: number | null;
  /** Combined score: lower is better (weighted price + proximity). */
  score: number;
}

// ---------------------------------------------------------------------------
// Haversine distance
// ---------------------------------------------------------------------------

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// useShopFinder hook
// ---------------------------------------------------------------------------

export interface UseShopFinderResult {
  recommendations: ShopRecommendation[];
  isLoading: boolean;
  error: string | null;
  search: (productNames: string[]) => Promise<void>;
  location: { latitude: number; longitude: number } | null;
}

export function useShopFinder(): UseShopFinderResult {
  const [recommendations, setRecommendations] = useState<ShopRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Request location on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      } catch {
        // Location unavailable — continue without it
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const search = useCallback(
    async (productNames: string[]) => {
      if (productNames.length === 0) return;

      setIsLoading(true);
      setError(null);

      try {
        // Fetch stores and prices in parallel
        const [stores, ...priceResults] = await Promise.all([
          fetchStores(),
          ...productNames.map((name) => queryPrices({ productName: name })),
        ]);

        const allPrices: PriceResult[] = (priceResults as PriceResult[][]).flat();

        // Group prices by store ICO
        const pricesByStore = new Map<string, PriceResult[]>();
        for (const price of allPrices) {
          const existing = pricesByStore.get(price.store_ico) ?? [];
          existing.push(price);
          pricesByStore.set(price.store_ico, existing);
        }

        // Build recommendations
        const recs: ShopRecommendation[] = [];
        for (const store of stores) {
          const storePrices = pricesByStore.get(store.ico);
          if (!storePrices || storePrices.length === 0) continue;

          const avgPrice =
            storePrices.reduce((sum, p) => sum + p.price_eur, 0) /
            storePrices.length;

          // Distance placeholder — in production, store.branch_label could
          // contain coordinates or we could geocode. For now, we use a random
          // factor if no real location is available.
          const distanceKm: number | null = null;

          // Score: lower is better. Price is the primary factor.
          const score = avgPrice + (distanceKm ?? 0) * 0.1;

          recs.push({
            store,
            avgPrice: Math.round(avgPrice * 100) / 100,
            matchCount: storePrices.length,
            distanceKm,
            score,
          });
        }

        // Sort by score ascending
        recs.sort((a, b) => a.score - b.score);

        if (isMounted.current) {
          setRecommendations(recs);
        }
      } catch (e) {
        if (isMounted.current) {
          setError("Nepodarilo sa načítať údaje o obchodoch.");
          console.warn("useShopFinder.search failed", e);
        }
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    },
    [location]
  );

  return { recommendations, isLoading, error, search, location };
}
