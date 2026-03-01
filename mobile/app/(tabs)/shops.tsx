import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useShopFinder, type ShopRecommendation } from "../../hooks/useShopFinder";
import { fetchPromotions, type PromoResult } from "../../api/prices";
import { Colors } from "../../constants/Colors";

export default function ShopsTab(): React.JSX.Element {
  const { recommendations, isLoading, error, search, location } = useShopFinder();
  const [searchText, setSearchText] = useState("");
  const [promos, setPromos] = useState<PromoResult[]>([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [activeView, setActiveView] = useState<"compare" | "deals">("deals");

  // Fetch active promotions on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPromosLoading(true);
      try {
        const results = await fetchPromotions({ activeOnly: true, limit: 50 });
        if (!cancelled) setPromos(results);
      } catch {
        // Silently fail — deals are optional
      } finally {
        if (!cancelled) setPromosLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = useCallback(() => {
    const terms = searchText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length === 0) return;
    setActiveView("compare");
    void search(terms);
  }, [searchText, search]);

  const renderRecommendation = useCallback(
    ({ item, index }: { item: ShopRecommendation; index: number }) => (
      <View style={styles.shopCard}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>
        <View style={styles.shopInfo}>
          <Text style={styles.shopName}>{item.store.chain_name}</Text>
          <Text style={styles.shopIco}>IČO: {item.store.ico}</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="pricetag-outline" size={14} color={Colors.warning} />
              <Text style={styles.statText}>
                Ø {item.avgPrice.toFixed(2)} €
              </Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="layers-outline" size={14} color={Colors.primary} />
              <Text style={styles.statText}>
                {item.matchCount} {item.matchCount === 1 ? "produkt" : "produktov"}
              </Text>
            </View>
            {item.distanceKm != null && (
              <View style={styles.stat}>
                <Ionicons name="navigate-outline" size={14} color={Colors.success} />
                <Text style={styles.statText}>
                  {item.distanceKm.toFixed(1)} km
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    ),
    []
  );

  const renderPromo = useCallback(
    ({ item }: { item: PromoResult }) => (
      <View style={styles.promoCard}>
        <View style={styles.promoHeader}>
          <Text style={styles.promoName} numberOfLines={1}>
            {item.product_name}
          </Text>
          {item.category && (
            <Text style={styles.promoCategoryBadge}>{item.category}</Text>
          )}
        </View>
        <View style={styles.promoPriceRow}>
          <Text style={styles.promoSalePrice}>
            {item.promo_price_eur.toFixed(2)} €
          </Text>
          {item.regular_price_eur != null && item.regular_price_eur > 0 && (
            <Text style={styles.promoOriginalPrice}>
              {item.regular_price_eur.toFixed(2)} €
            </Text>
          )}
          {item.regular_price_eur != null && item.regular_price_eur > 0 && (
            <Text style={styles.promoDiscount}>
              -{Math.round((1 - item.promo_price_eur / item.regular_price_eur) * 100)}%
            </Text>
          )}
        </View>
        <View style={styles.promoFooter}>
          <Text style={styles.promoStore}>{item.store_chain}</Text>
          <Text style={styles.promoValidity}>
            {item.valid_from} — {item.valid_to}
          </Text>
        </View>
      </View>
    ),
    []
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Search input */}
      <View style={styles.searchSection}>
        <Text style={styles.searchLabel}>
          Zadajte produkty (oddelené čiarkou):
        </Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="napr. mlieko, chlieb, maslo"
            placeholderTextColor={Colors.textMuted}
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity
            style={[
              styles.searchButton,
              !searchText.trim() && styles.searchButtonDisabled,
            ]}
            onPress={handleSearch}
            disabled={!searchText.trim()}
          >
            <Ionicons name="search" size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>
        {location && (
          <Text style={styles.locationText}>
            📍 Poloha dostupná ({location.latitude.toFixed(4)},{" "}
            {location.longitude.toFixed(4)})
          </Text>
        )}
      </View>

      {/* View toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, activeView === "deals" && styles.toggleBtnActive]}
          onPress={() => setActiveView("deals")}
        >
          <Ionicons
            name="flame-outline"
            size={16}
            color={activeView === "deals" ? Colors.white : Colors.textMuted}
          />
          <Text
            style={[
              styles.toggleText,
              activeView === "deals" && styles.toggleTextActive,
            ]}
          >
            Akcie z letákov
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleBtn,
            activeView === "compare" && styles.toggleBtnActive,
          ]}
          onPress={() => setActiveView("compare")}
        >
          <Ionicons
            name="swap-horizontal-outline"
            size={16}
            color={activeView === "compare" ? Colors.white : Colors.textMuted}
          />
          <Text
            style={[
              styles.toggleText,
              activeView === "compare" && styles.toggleTextActive,
            ]}
          >
            Porovnanie cien
          </Text>
        </TouchableOpacity>
      </View>

      {/* Deals view */}
      {activeView === "deals" && (
        <>
          {promosLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Načítavam akcie...</Text>
            </View>
          ) : promos.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="flame-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Žiadne aktuálne akcie.</Text>
              <Text style={styles.emptySubtext}>
                Akcie z letákov sa aktualizujú automaticky každý týždeň.
              </Text>
            </View>
          ) : (
            <FlatList
              data={promos}
              keyExtractor={(item, i) =>
                `${item.store_ico}-${item.product_name}-${item.valid_from}`
              }
              renderItem={renderPromo}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                <Text style={styles.resultsHeader}>
                  🔥 {promos.length} akciových ponúk
                </Text>
              }
            />
          )}
        </>
      )}

      {/* Comparison view */}
      {activeView === "compare" && (
        <>
          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Porovnávam ceny...</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : recommendations.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="storefront-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyText}>
                Nájdite najlepší obchod pre váš nákup.
              </Text>
              <Text style={styles.emptySubtext}>
                Zadajte produkty, ktoré chcete kúpiť, a porovnáme ceny v rôznych
                obchodoch.
              </Text>
            </View>
          ) : (
            <FlatList
              data={recommendations}
              keyExtractor={(item) => item.store.ico}
              renderItem={renderRecommendation}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                <Text style={styles.resultsHeader}>
                  {recommendations.length}{" "}
                  {recommendations.length === 1
                    ? "obchod nájdený"
                    : "obchodov nájdených"}
                </Text>
              }
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchSection: { padding: 12, paddingBottom: 0 },
  searchLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 8,
  },
  searchRow: { flexDirection: "row", gap: 8 },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 15,
  },
  searchButton: {
    backgroundColor: Colors.primary,
    width: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButtonDisabled: { opacity: 0.4 },
  locationText: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 8,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  toggleBtnActive: {
    backgroundColor: Colors.primary,
  },
  toggleText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  toggleTextActive: {
    color: Colors.white,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: Colors.textSecondary, fontSize: 14, marginTop: 12 },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  emptyText: { color: Colors.textSecondary, fontSize: 16, marginTop: 12 },
  emptySubtext: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  listContent: { paddingHorizontal: 12, paddingBottom: 16 },
  resultsHeader: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  shopCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryDim,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  rankText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  shopInfo: { flex: 1 },
  shopName: { color: Colors.text, fontSize: 16, fontWeight: "600" },
  shopIco: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { color: Colors.textSecondary, fontSize: 12 },
  // Promo card styles
  promoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  promoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  promoName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  promoCategoryBadge: {
    color: Colors.primary,
    fontSize: 11,
    backgroundColor: Colors.primaryDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
    marginLeft: 8,
  },
  promoPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  promoSalePrice: {
    color: Colors.success,
    fontSize: 18,
    fontWeight: "700",
  },
  promoOriginalPrice: {
    color: Colors.textMuted,
    fontSize: 14,
    textDecorationLine: "line-through",
  },
  promoDiscount: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "rgba(248, 113, 113, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  promoFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  promoStore: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: "600",
  },
  promoValidity: {
    color: Colors.textMuted,
    fontSize: 11,
  },
});
