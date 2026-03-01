import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  Camera,
  type Code,
  useCameraDevice,
  useCodeScanner,
} from "react-native-vision-camera";

import { extractUidFromQr, fetchEKasaReceipt, type EKasaReceipt } from "../../api/ekasa";
import { useIngest } from "../../hooks/useIngest";
import { usePantry } from "../../hooks/usePantry";
import { Colors } from "../../constants/Colors";

export default function ScannerTab(): React.JSX.Element {
  const device = useCameraDevice("back");
  const [hasPermission, setHasPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [receipt, setReceipt] = useState<EKasaReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { ingest, result: ingestResult, error: ingestError } = useIngest();
  const { addItem } = usePantry();

  const isProcessingRef = useRef(false);
  const lastUidRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const requestPermission = async (): Promise<void> => {
      const currentStatus = await Camera.getCameraPermissionStatus();
      if (currentStatus === "granted") {
        if (isMounted) setHasPermission(true);
        return;
      }
      const status = await Camera.requestCameraPermission();
      if (isMounted) setHasPermission(status === "granted");
    };
    requestPermission();
    return () => {
      isMounted = false;
    };
  }, []);

  const addReceiptToPantry = useCallback(
    async (r: EKasaReceipt) => {
      for (const item of r.items) {
        await addItem({
          displayName: item.name,
          normalizedName: item.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim(),
          quantity: item.quantity ?? 1,
          priceEur: item.price > 0 ? item.price : undefined,
          storeIco: r.ico,
          purchasedOn: r.issuedAt.slice(0, 10),
        });
      }
    },
    [addItem]
  );

  const onCodeScanned = useCallback(
    async (codes: Code[]) => {
      const rawValue = codes[0]?.value;
      if (!rawValue || isProcessingRef.current) return;

      const uid = extractUidFromQr(rawValue);
      if (!uid || uid === lastUidRef.current) return;

      isProcessingRef.current = true;
      lastUidRef.current = uid;
      setIsLoading(true);
      setError(null);

      try {
        const nextReceipt = await fetchEKasaReceipt(uid);
        setReceipt(nextReceipt);
        await Promise.all([
          ingest(nextReceipt),
          addReceiptToPantry(nextReceipt),
        ]);
      } catch (scanError) {
        console.warn(`Failed to fetch receipt for UID: ${uid}`, scanError);
        setError("Nepodarilo sa načítať eKasa doklad.");
      } finally {
        setIsLoading(false);
        isProcessingRef.current = false;
      }
    },
    [ingest, addReceiptToPantry]
  );

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned,
  });

  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  const statusText = useMemo(() => {
    if (!hasPermission) return "Povoľte prístup ku kamere.";
    if (isLoading) return "Načítavam eKasa doklad...";
    if (error) return error;
    if (receipt)
      return `IČO: ${receipt.ico} • Položky: ${receipt.items.length} (${receipt.source})`;
    return "Naskenujte eKasa QR kód.";
  }, [error, hasPermission, isLoading, receipt]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.cameraContainer}>
        {device && hasPermission ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={!isLoading}
            codeScanner={codeScanner}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Kamera nie je dostupná.</Text>
          </View>
        )}

        <Animated.View style={[styles.scanFrame, overlayStyle]} />

        {isLoading && (
          <View style={styles.loadingLayer}>
            <ActivityIndicator size="large" color={Colors.white} />
          </View>
        )}
      </View>

      {/* Receipt items preview */}
      {receipt && receipt.items.length > 0 && (
        <View style={styles.receiptPreview}>
          <Text style={styles.receiptTitle}>Položky z dokladu:</Text>
          <FlatList
            data={receipt.items}
            keyExtractor={(_, i) => String(i)}
            style={styles.receiptList}
            renderItem={({ item }) => (
              <View style={styles.receiptRow}>
                <Text style={styles.receiptItemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.receiptItemPrice}>
                  {item.price.toFixed(2)} €
                </Text>
              </View>
            )}
          />
        </View>
      )}

      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>{statusText}</Text>
        {ingestResult != null && (
          <Text style={styles.ingestSuccess}>
            ✓ Odoslané: {ingestResult.accepted} cien
          </Text>
        )}
        {ingestError != null && (
          <Text style={styles.ingestError}>{ingestError}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  cameraContainer: {
    flex: 1,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  placeholderText: { color: Colors.text, fontSize: 16 },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: Colors.primary,
    borderRadius: 20,
    backgroundColor: Colors.primaryDim,
  },
  loadingLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  receiptPreview: {
    maxHeight: 160,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  receiptTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  receiptList: { flexGrow: 0 },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  receiptItemName: { color: Colors.text, fontSize: 13, flex: 1 },
  receiptItemPrice: { color: Colors.warning, fontSize: 13, marginLeft: 8 },
  statusContainer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  statusText: { color: Colors.text, fontSize: 14 },
  ingestSuccess: { color: Colors.success, fontSize: 12, marginTop: 4 },
  ingestError: { color: Colors.error, fontSize: 12, marginTop: 4 },
});
