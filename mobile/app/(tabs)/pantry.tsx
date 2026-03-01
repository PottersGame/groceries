import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { usePantry, type PantryItem } from "../../hooks/usePantry";
import { Colors } from "../../constants/Colors";

export default function PantryTab(): React.JSX.Element {
  const {
    items,
    isLoading,
    refresh,
    addItem,
    updateQuantity,
    removeItem,
    addToShoppingList,
  } = usePantry();

  const [newItemName, setNewItemName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = searchQuery
    ? items.filter(
        (item) =>
          item.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.normalized_name.includes(searchQuery.toLowerCase())
      )
    : items;

  const handleAddItem = useCallback(async () => {
    const name = newItemName.trim();
    if (!name) return;
    await addItem({
      displayName: name,
      normalizedName: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim(),
    });
    setNewItemName("");
  }, [newItemName, addItem]);

  const handleRemoveItem = useCallback(
    (item: PantryItem) => {
      Alert.alert(
        "Odstrániť položku",
        `Naozaj chcete odstrániť "${item.display_name}"?`,
        [
          { text: "Zrušiť", style: "cancel" },
          {
            text: "Odstrániť",
            style: "destructive",
            onPress: () => void removeItem(item.id),
          },
        ]
      );
    },
    [removeItem]
  );

  const handleAddToShoppingList = useCallback(
    async (item: PantryItem) => {
      await addToShoppingList(item);
      Alert.alert("Pridané", `"${item.display_name}" bol pridaný do nákupného zoznamu.`);
    },
    [addToShoppingList]
  );

  const renderItem = useCallback(
    ({ item }: { item: PantryItem }) => (
      <View style={styles.itemCard}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.display_name}
          </Text>
          <View style={styles.itemMeta}>
            {item.category && (
              <Text style={styles.categoryBadge}>{item.category}</Text>
            )}
            {item.last_price_eur && (
              <Text style={styles.priceText}>
                {item.last_price_eur.toFixed(2)} €
              </Text>
            )}
            {item.last_purchased_on && (
              <Text style={styles.dateText}>{item.last_purchased_on}</Text>
            )}
          </View>
        </View>

        <View style={styles.quantityRow}>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => void updateQuantity(item.id, item.quantity - 1)}
          >
            <Ionicons name="remove" size={18} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.quantityText}>
            {item.quantity} {item.unit}
          </Text>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => void updateQuantity(item.id, item.quantity + 1)}
          >
            <Ionicons name="add" size={18} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.itemActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => void handleAddToShoppingList(item)}
          >
            <Ionicons name="cart-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleRemoveItem(item)}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    ),
    [updateQuantity, handleRemoveItem, handleAddToShoppingList]
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <Ionicons
          name="search-outline"
          size={20}
          color={Colors.textMuted}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Hľadať v špajzi..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Add new item */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Pridať položku..."
          placeholderTextColor={Colors.textMuted}
          value={newItemName}
          onChangeText={setNewItemName}
          onSubmitEditing={() => void handleAddItem()}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addButton, !newItemName.trim() && styles.addButtonDisabled]}
          onPress={() => void handleAddItem()}
          disabled={!newItemName.trim()}
        >
          <Ionicons name="add" size={24} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Items list */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cube-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            {searchQuery ? "Žiadne výsledky." : "Špajza je prázdna."}
          </Text>
          <Text style={styles.emptySubtext}>
            Naskenujte eKasa doklad alebo pridajte položky manuálne.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onRefresh={() => void refresh()}
          refreshing={isLoading}
        />
      )}

      {/* Item count footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {items.length} {items.length === 1 ? "položka" : "položiek"} v špajzi
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    margin: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    paddingVertical: 12,
  },
  addRow: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  addInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 15,
  },
  addButton: {
    backgroundColor: Colors.primary,
    width: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonDisabled: { opacity: 0.4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
    marginTop: 12,
  },
  emptySubtext: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  listContent: { paddingHorizontal: 12, paddingBottom: 16 },
  itemCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  itemInfo: { marginBottom: 8 },
  itemName: { color: Colors.text, fontSize: 16, fontWeight: "600" },
  itemMeta: { flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" },
  categoryBadge: {
    color: Colors.primary,
    fontSize: 12,
    backgroundColor: Colors.primaryDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  priceText: { color: Colors.warning, fontSize: 12 },
  dateText: { color: Colors.textMuted, fontSize: 12 },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityText: { color: Colors.text, fontSize: 15, minWidth: 60, textAlign: "center" },
  itemActions: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  footerText: { color: Colors.textMuted, fontSize: 12, textAlign: "center" },
});
