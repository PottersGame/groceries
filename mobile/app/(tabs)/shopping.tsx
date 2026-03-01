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

import { useShoppingList, type ShoppingListItem } from "../../hooks/useShoppingList";
import { Colors } from "../../constants/Colors";

export default function ShoppingTab(): React.JSX.Element {
  const {
    items,
    isLoading,
    refresh,
    addItem,
    toggleChecked,
    removeItem,
    clearChecked,
    estimatedTotal,
  } = useShoppingList();

  const [newItemName, setNewItemName] = useState("");

  const handleAddItem = useCallback(async () => {
    const name = newItemName.trim();
    if (!name) return;
    await addItem(name);
    setNewItemName("");
  }, [newItemName, addItem]);

  const handleClearChecked = useCallback(() => {
    const checkedCount = items.filter((i) => i.is_checked === 1).length;
    if (checkedCount === 0) return;

    Alert.alert(
      "Vymazať zakúpené",
      `Odstrániť ${checkedCount} zakúpených položiek?`,
      [
        { text: "Zrušiť", style: "cancel" },
        {
          text: "Vymazať",
          style: "destructive",
          onPress: () => void clearChecked(),
        },
      ]
    );
  }, [items, clearChecked]);

  const handleRemoveItem = useCallback(
    (item: ShoppingListItem) => {
      Alert.alert(
        "Odstrániť",
        `Odstrániť "${item.item_name}"?`,
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

  const renderItem = useCallback(
    ({ item }: { item: ShoppingListItem }) => {
      const isChecked = item.is_checked === 1;
      return (
        <View style={[styles.itemCard, isChecked && styles.itemCardChecked]}>
          <TouchableOpacity
            style={styles.checkArea}
            onPress={() => void toggleChecked(item.id, item.is_checked)}
          >
            <Ionicons
              name={isChecked ? "checkmark-circle" : "ellipse-outline"}
              size={26}
              color={isChecked ? Colors.success : Colors.textMuted}
            />
          </TouchableOpacity>

          <View style={styles.itemInfo}>
            <Text
              style={[styles.itemName, isChecked && styles.itemNameChecked]}
              numberOfLines={1}
            >
              {item.item_name}
            </Text>
            <View style={styles.itemMeta}>
              <Text style={styles.quantityText}>
                {item.quantity} {item.unit}
              </Text>
              {item.price_hint_eur && (
                <Text style={styles.priceHint}>
                  ~{item.price_hint_eur.toFixed(2)} €
                </Text>
              )}
              {item.price_hint_store_ico && (
                <Text style={styles.storeHint}>
                  IČO: {item.price_hint_store_ico}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleRemoveItem(item)}
          >
            <Ionicons name="close-circle-outline" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      );
    },
    [toggleChecked, handleRemoveItem]
  );

  const checkedCount = items.filter((i) => i.is_checked === 1).length;
  const uncheckedCount = items.length - checkedCount;

  return (
    <SafeAreaView style={styles.container}>
      {/* Add new item */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Pridať do zoznamu..."
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

      {/* Summary bar */}
      {items.length > 0 && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {uncheckedCount} na kúpenie
            {estimatedTotal > 0 &&
              ` • ~${estimatedTotal.toFixed(2)} €`}
          </Text>
          {checkedCount > 0 && (
            <TouchableOpacity onPress={handleClearChecked}>
              <Text style={styles.clearText}>Vymazať zakúpené</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Items list */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cart-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Nákupný zoznam je prázdny.</Text>
          <Text style={styles.emptySubtext}>
            Pridajte položky manuálne alebo ich presuňte zo špajze.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onRefresh={() => void refresh()}
          refreshing={isLoading}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  addRow: {
    flexDirection: "row",
    margin: 12,
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
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  summaryText: { color: Colors.textSecondary, fontSize: 13 },
  clearText: { color: Colors.error, fontSize: 13, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.textSecondary, fontSize: 16, marginTop: 12 },
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
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  itemCardChecked: { opacity: 0.55 },
  checkArea: { marginRight: 12 },
  itemInfo: { flex: 1 },
  itemName: { color: Colors.text, fontSize: 15, fontWeight: "500" },
  itemNameChecked: { textDecorationLine: "line-through", color: Colors.textMuted },
  itemMeta: { flexDirection: "row", gap: 8, marginTop: 3 },
  quantityText: { color: Colors.textMuted, fontSize: 12 },
  priceHint: { color: Colors.warning, fontSize: 12 },
  storeHint: { color: Colors.textMuted, fontSize: 12 },
  deleteBtn: { marginLeft: 8 },
});
