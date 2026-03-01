import React, { useCallback, useState } from "react";
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
import { Colors } from "../../constants/Colors";

export default function ShopsTab(): React.JSX.Element {
  const { recommendations, isLoading, error, search, location } = useShopFinder();
  const [searchText, setSearchText] = useState("");

  const handleSearch = useCallback(() => {
    const terms = searchText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length === 0) return;
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

      {/* Results */}
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
            Zadajte produkty, ktoré chcete kúpiť, a porovnáme ceny v rôznych obchodoch.
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
              {recommendations.length === 1 ? "obchod nájdený" : "obchodov nájdených"}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchSection: { padding: 12 },
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: Colors.textSecondary, fontSize: 14, marginTop: 12 },
  errorText: { color: Colors.error, fontSize: 14, marginTop: 12, textAlign: "center" },
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
});
