import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
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
import { extractUidFromQr, fetchEKasaReceipt, type EKasaReceipt } from "./api/ekasa";
import { useIngest } from "./hooks/useIngest";
import { usePantry } from "./db/usePantry";

export default function ReceiptScannerScreen(): React.JSX.Element {
  const device = useCameraDevice("back");
  const [hasPermission, setHasPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [receipt, setReceipt] = useState<EKasaReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { ingest, result: ingestResult, error: ingestError } = useIngest();
  const { addReceiptItemsToPantry } = usePantry();

  const isProcessingRef = useRef(false);
  const lastUidRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const requestPermission = async (): Promise<void> => {
      const currentStatus = await Camera.getCameraPermissionStatus();
      if (currentStatus === "granted") {
        if (isMounted) {
          setHasPermission(true);
        }
        return;
      }

      const status = await Camera.requestCameraPermission();
      if (isMounted) {
        setHasPermission(status === "granted");
      }
    };

    requestPermission();

    return () => {
      isMounted = false;
    };
  }, []);

  const onCodeScanned = useCallback(async (codes: Code[]) => {
    const rawValue = codes[0]?.value;
    if (!rawValue || isProcessingRef.current) {
      return;
    }

    const uid = extractUidFromQr(rawValue);
    if (!uid || uid === lastUidRef.current) {
      return;
    }

    isProcessingRef.current = true;
    lastUidRef.current = uid;
    setIsLoading(true);
    setError(null);

    try {
      const nextReceipt = await fetchEKasaReceipt(uid);
      setReceipt(nextReceipt);
      void ingest(nextReceipt);
      const saved = await addReceiptItemsToPantry(
        nextReceipt.items,
        nextReceipt.ico,
        nextReceipt.issuedAt
      );
      Alert.alert(
        "Spajza aktualizovaná",
        `${saved} položiek bolo uložených do spajze.`
      );
    } catch (scanError) {
      console.warn(`Failed to fetch receipt for UID: ${uid}`, scanError);
      setError("Nepodarilo sa načítať eKasa doklad.");
    } finally {
      setIsLoading(false);
      isProcessingRef.current = false;
    }
  }, [ingest, addReceiptItemsToPantry]);

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned,
  });

  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 1000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [pulse]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  const statusText = useMemo(() => {
    if (!hasPermission) {
      return "Povoľte prístup ku kamere.";
    }

    if (isLoading) {
      return "Načítavam eKasa doklad...";
    }

    if (error) {
      return error;
    }

    if (receipt) {
      return `IČO: ${receipt.ico} • Položky: ${receipt.items.length} (${receipt.source})`;
    }

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

        {isLoading ? (
          <View style={styles.loadingLayer}>
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        ) : null}
      </View>

      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>{statusText}</Text>
        {ingestResult != null ? (
          <Text style={styles.ingestSuccess}>✓ Odoslané: {ingestResult.accepted} cien</Text>
        ) : null}
        {ingestError != null ? (
          <Text style={styles.ingestError}>{ingestError}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05060A",
  },
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
    backgroundColor: "#111827",
  },
  placeholderText: {
    color: "#E5E7EB",
    fontSize: 16,
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: "#22D3EE",
    borderRadius: 20,
    backgroundColor: "rgba(34, 211, 238, 0.05)",
  },
  loadingLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  statusContainer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#111827",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1F2937",
  },
  statusText: {
    color: "#E5E7EB",
    fontSize: 14,
  },
  ingestSuccess: {
    color: "#4ADE80",
    fontSize: 12,
    marginTop: 4,
  },
  ingestError: {
    color: "#F87171",
    fontSize: 12,
    marginTop: 4,
  },
});
