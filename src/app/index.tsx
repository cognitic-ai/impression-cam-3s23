import { useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Pressable,
  Text,
  StyleSheet,
  Dimensions,
  Alert,
  Image,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions, CameraType } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { PAINT_STYLES, PaintStyle, paintWithGemini } from "@/services/gemini-paint";

const { width } = Dimensions.get("window");

const ZOOM_LEVELS = [
  { label: "1×", zoom: 0 },
  { label: "2×", zoom: 0.35 },
  { label: "3×", zoom: 0.6 },
];

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing] = useState<CameraType>("back");
  const [selectedStyle] = useState<PaintStyle>(PAINT_STYLES[0]);
  const [painting, setPainting] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [zoomIndex, setZoomIndex] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const shutterScale = useSharedValue(1);

  const shutterAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.value }],
  }));

  const cameraZoom = ZOOM_LEVELS[zoomIndex].zoom;

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || processing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    shutterScale.value = withSpring(0.88, { damping: 10 }, () => {
      shutterScale.value = withSpring(1);
    });

    setProcessing(true);
    setPainting(null);
    setProgressMsg("Capturing…");

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.88 });
      if (!photo) return;

      const paintedUri = await paintWithGemini(
        photo.uri,
        selectedStyle,
        (msg) => setProgressMsg(msg)
      );

      setPainting(paintedUri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Painting failed", e?.message ?? "Unknown error");
    } finally {
      setProcessing(false);
    }
  }, [processing, selectedStyle, shutterScale]);

  const handleSave = useCallback(async () => {
    if (!painting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const perms = mediaPermission?.granted
        ? { granted: true }
        : await requestMediaPermission();
      if (perms.granted) {
        await MediaLibrary.saveToLibraryAsync(painting);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: any) {
      Alert.alert("Save failed", e?.message);
    }
  }, [painting, mediaPermission, requestMediaPermission]);

  const handleDismiss = useCallback(() => {
    Haptics.selectionAsync();
    setPainting(null);
  }, []);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionContainer]}>
        <Text style={styles.permTitle}>impressionist</Text>
        <Text style={styles.permSub}>AI-painted moments</Text>
        <Pressable style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Zoom segmented control ── */}
      <ZoomControl
        zoomIndex={zoomIndex}
        onZoomChange={(i) => {
          setZoomIndex(i);
          Haptics.selectionAsync();
        }}
      />

      {/* ── Camera card ── */}
      <View style={styles.cardWrapper}>
        <View style={styles.card}>
          {painting ? (
            <Animated.Image
              entering={FadeIn.duration(500)}
              source={{ uri: painting }}
              style={styles.cardMedia}
              resizeMode="cover"
            />
          ) : (
            <CameraView
              ref={cameraRef}
              style={styles.cardMedia}
              facing={facing}
              zoom={cameraZoom}
            />
          )}

          {processing && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              style={styles.cardOverlay}
            >
              <ActivityIndicator size="large" color="#111" />
              <Text style={styles.processingText}>{progressMsg}</Text>
            </Animated.View>
          )}
        </View>
      </View>

      {/* ── Bottom toolbar ── */}
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.toolbarLeft}>
          {painting ? (
            <Image source={{ uri: painting }} style={styles.thumbnail} />
          ) : (
            <View style={styles.thumbnailEmpty} />
          )}
        </View>

        <View style={styles.toolbarCenter}>
          {painting && !processing ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.actionStack}>
              <Pressable
                onPress={handleSave}
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              >
                <Text style={styles.actionIcon}>↓</Text>
              </Pressable>
              <Pressable
                onPress={handleDismiss}
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              >
                <Text style={styles.actionIcon}>✕</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.toolbarRight}>
          <Animated.View style={shutterAnimStyle}>
            <Pressable
              onPress={handleCapture}
              disabled={processing}
              style={[styles.shutter, processing && styles.shutterDisabled]}
            />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

// ── Zoom Segmented Control ───────────────────────────────────
function ZoomControl({
  zoomIndex,
  onZoomChange,
}: {
  zoomIndex: number;
  onZoomChange: (i: number) => void;
}) {
  return (
    <View style={styles.segmentedWrapper}>
      <View style={styles.segmentedTrack}>
        {ZOOM_LEVELS.map((z, i) => {
          const active = i === zoomIndex;
          return (
            <Pressable
              key={z.label}
              onPress={() => onZoomChange(i)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                {z.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const CARD_H = width * 0.82;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f8f6",
  },
  permissionContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  permTitle: {
    color: "#111",
    fontSize: 32,
    fontWeight: "300",
    letterSpacing: 3,
    fontStyle: "italic",
  },
  permSub: {
    color: "#888",
    fontSize: 14,
    letterSpacing: 0.5,
    marginBottom: 24,
  },
  permBtn: {
    paddingVertical: 13,
    paddingHorizontal: 34,
    borderRadius: 28,
    backgroundColor: "#111",
  },
  permBtnText: {
    color: "#fff",
    fontSize: 15,
    letterSpacing: 0.5,
  },
  // Segmented control
  segmentedWrapper: {
    alignItems: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  segmentedTrack: {
    flexDirection: "row",
    backgroundColor: "#e8e8e4",
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    paddingVertical: 6,
    paddingHorizontal: 22,
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: "#fff",
    boxShadow: "0px 1px 4px rgba(0,0,0,0.12)",
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#888",
    fontVariant: ["tabular-nums"],
  },
  segmentLabelActive: {
    color: "#111",
  },
  // Camera card
  cardWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    width: width - 32,
    height: CARD_H,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#e0e0e0",
    boxShadow: "0px 4px 24px rgba(0,0,0,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  cardMedia: {
    width: "100%",
    height: "100%",
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(248,248,246,0.82)",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  processingText: {
    color: "#333",
    fontSize: 14,
    letterSpacing: 0.5,
    fontStyle: "italic",
  },
  // Bottom toolbar
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 20,
    paddingHorizontal: 24,
  },
  toolbarLeft: {
    flex: 1,
    alignItems: "flex-start",
  },
  toolbarCenter: {
    flex: 1,
    alignItems: "center",
  },
  toolbarRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  thumbnail: {
    width: 74,
    height: 74,
    borderRadius: 12,
  },
  thumbnailEmpty: {
    width: 74,
    height: 74,
    borderRadius: 12,
    backgroundColor: "#e4e4e0",
  },
  actionStack: {
    gap: 8,
    alignItems: "center",
  },
  actionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnPressed: {
    backgroundColor: "#444",
  },
  actionIcon: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  shutter: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#111",
  },
  shutterDisabled: {
    backgroundColor: "#aaa",
  },
});
