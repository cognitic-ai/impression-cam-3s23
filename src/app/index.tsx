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
  PanResponder,
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
  runOnJS,
} from "react-native-reanimated";
import { PAINT_STYLES, PaintStyle, paintWithGemini } from "@/services/gemini-paint";

const { width } = Dimensions.get("window");

// Zoom ruler config
const ZOOM_STOPS = [
  { label: "0.5x", value: 0 },
  { label: "1x", value: 0.5 },
  { label: "2x", value: 1 },
];
const RULER_WIDTH = width - 40;
const TICK_COUNT = 13;

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing] = useState<CameraType>("back");
  const [selectedStyle] = useState<PaintStyle>(PAINT_STYLES[0]);
  const [painting, setPainting] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [zoomIndex, setZoomIndex] = useState(1); // default 1x
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const shutterScale = useSharedValue(1);

  const shutterAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.value }],
  }));

  // Map zoom stop index → expo-camera zoom (0–1)
  const cameraZoom = useMemo(() => {
    const map = [0, 0, 0.5]; // 0.5x≈0, 1x≈0, 2x≈0.5 (device dependent)
    return map[zoomIndex] ?? 0;
  }, [zoomIndex]);

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
      {/* ── Zoom ruler ── */}
      <ZoomRuler
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

          {/* Processing overlay inside card */}
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
        {/* Left: thumbnail */}
        <View style={styles.toolbarLeft}>
          {painting ? (
            <Image source={{ uri: painting }} style={styles.thumbnail} />
          ) : (
            <View style={styles.thumbnailEmpty} />
          )}
        </View>

        {/* Center: action buttons (save + dismiss) when painting ready */}
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

        {/* Right: shutter */}
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

// ── Zoom Ruler ──────────────────────────────────────────────
function ZoomRuler({
  zoomIndex,
  onZoomChange,
}: {
  zoomIndex: number;
  onZoomChange: (i: number) => void;
}) {
  const segmentWidth = RULER_WIDTH / (ZOOM_STOPS.length - 1);

  // dot x position = index * segmentWidth
  const dotX = zoomIndex * segmentWidth;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const x = e.nativeEvent.locationX;
          const i = Math.round((x / RULER_WIDTH) * (ZOOM_STOPS.length - 1));
          const clamped = Math.max(0, Math.min(ZOOM_STOPS.length - 1, i));
          onZoomChange(clamped);
        },
        onPanResponderMove: (e) => {
          const x = e.nativeEvent.locationX;
          const i = Math.round((x / RULER_WIDTH) * (ZOOM_STOPS.length - 1));
          const clamped = Math.max(0, Math.min(ZOOM_STOPS.length - 1, i));
          onZoomChange(clamped);
        },
      }),
    [onZoomChange]
  );

  return (
    <View style={styles.rulerWrapper}>
      {/* Tick marks */}
      <View style={styles.rulerTicks} {...panResponder.panHandlers}>
        {Array.from({ length: TICK_COUNT }).map((_, i) => {
          const isStop = i % ((TICK_COUNT - 1) / (ZOOM_STOPS.length - 1)) === 0;
          return (
            <View
              key={i}
              style={[
                styles.tick,
                isStop ? styles.tickMajor : styles.tickMinor,
              ]}
            />
          );
        })}
      </View>

      {/* Labels */}
      <View style={styles.rulerLabels}>
        {ZOOM_STOPS.map((s) => (
          <Text key={s.label} style={styles.rulerLabel}>
            {s.label}
          </Text>
        ))}
      </View>

      {/* Indicator dot */}
      <View style={styles.rulerDotRow}>
        <View style={[styles.rulerDot, { marginLeft: dotX - 5 }]} />
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
  // Permission
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
  // Zoom ruler
  rulerWrapper: {
    marginTop: 8,
    marginHorizontal: 20,
    width: RULER_WIDTH,
  },
  rulerTicks: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 28,
  },
  tick: {
    width: 1.5,
    backgroundColor: "#999",
    borderRadius: 1,
  },
  tickMajor: {
    height: 18,
    backgroundColor: "#444",
  },
  tickMinor: {
    height: 10,
  },
  rulerLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  rulerLabel: {
    fontSize: 12,
    color: "#555",
    fontVariant: ["tabular-nums"],
  },
  rulerDotRow: {
    height: 20,
    marginTop: 2,
  },
  rulerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#111",
    marginTop: 5,
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
  // Action stack (save + dismiss)
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
  // Shutter
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
