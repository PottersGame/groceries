import React, { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/Colors";

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const PRIVACY_SECTIONS = [
  {
    title: "Čo nezhromažďujeme",
    body:
      "Aplikácia nezbiera žiadne osobné údaje: žiadne používateľské účty, žiadne identifikátory zariadenia, žiadne čísla pokladničných dokladov ani polohu.",
  },
  {
    title: "Lokálne uložené údaje",
    body:
      "Položky špajze a nákupný zoznam sú uložené výhradne v lokálnej databáze vášho zariadenia. Tieto údaje nikdy neopustia váš telefón.",
  },
  {
    title: "Anonymné cenové pozorovania",
    body:
      "Po naskenovaní eKasa dokladu odošle aplikácia anonymné pozorovanie vo forme (IČO obchodu, normalizovaný názov produktu, cena v €, dátum nákupu). Žiadne osobné údaje, identifikátor zariadenia ani číslo dokladu nie sú zahrnuté.",
  },
  {
    title: "Tretie strany",
    body:
      "Aplikácia využíva verejné API eKasa (ekasa.financnasprava.sk) iba na načítanie položiek dokladu. Žiadne iné analytické ani reklamné služby tretích strán nie sú použité.",
  },
];

const TOS_SECTIONS = [
  {
    title: "Presnosť cien",
    body:
      "Cenové údaje pochádzajú od anonymných používateľov a z automatického spracovania letákov pomocou AI. Presnosť nie je zaručená. Ceny slúžia len na informačné účely — pred nákupom si vždy overte cenu priamo v obchode.",
  },
  {
    title: "eKasa API",
    body:
      "Skenujte iba doklady, ku ktorým máte oprávnený prístup. Aplikácia nie je pridružená k Finančnej správe SR ani ňou schválená.",
  },
  {
    title: "Akcie z letákov",
    body:
      "Propagačné ceny sú získavané automatickým spracovaním verejne dostupných letákových PDF. Prevádzkovateľ je zodpovedný za dodržiavanie podmienok používania príslušných webov jednotlivých maloobchodníkov.",
  },
  {
    title: "Obmedzenie zodpovednosti",
    body:
      "PantryPal SK a jeho prispievatelia nezodpovedajú za nepresnosti v zobrazených cenách, stratu lokálnych údajov ani za akékoľvek škody vzniknuté používaním aplikácie.",
  },
  {
    title: "Rozhodné právo",
    body: "Tieto podmienky sa riadia právom Slovenskej republiky.",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LegalScreen(): React.JSX.Element {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"privacy" | "tos">("privacy");

  const sections = activeTab === "privacy" ? PRIVACY_SECTIONS : TOS_SECTIONS;
  const heading =
    activeTab === "privacy"
      ? "Ochrana osobných údajov"
      : "Podmienky používania";

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Späť"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Právne informácie</Text>
      </View>

      {/* Tab toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[
            styles.toggleBtn,
            activeTab === "privacy" && styles.toggleBtnActive,
          ]}
          onPress={() => setActiveTab("privacy")}
        >
          <Text
            style={[
              styles.toggleText,
              activeTab === "privacy" && styles.toggleTextActive,
            ]}
          >
            Súkromie
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleBtn,
            activeTab === "tos" && styles.toggleBtnActive,
          ]}
          onPress={() => setActiveTab("tos")}
        >
          <Text
            style={[
              styles.toggleText,
              activeTab === "tos" && styles.toggleTextActive,
            ]}
          >
            Podmienky
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.sectionHeading}>{heading}</Text>

        {activeTab === "privacy" && (
          <View style={styles.callout}>
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color={Colors.success}
            />
            <Text style={styles.calloutText}>
              Nulový zber osobných údajov — aplikácia vás nesleduje.
            </Text>
          </View>
        )}

        {sections.map((sec) => (
          <View key={sec.title} style={styles.card}>
            <Text style={styles.cardTitle}>{sec.title}</Text>
            <Text style={styles.cardBody}>{sec.body}</Text>
          </View>
        ))}

        <Text style={styles.footer}>
          Aktualizované: 2026-03-01 · PantryPal SK
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backButton: { marginRight: 12 },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: "600" },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
  },
  toggleBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
  },
  toggleBtnActive: { backgroundColor: Colors.primary },
  toggleText: { color: Colors.textMuted, fontSize: 14, fontWeight: "600" },
  toggleTextActive: { color: Colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionHeading: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
  },
  callout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(74, 222, 128, 0.12)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  calloutText: { color: Colors.success, fontSize: 14, flex: 1 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  cardBody: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  footer: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 20,
  },
});
