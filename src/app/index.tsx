import { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Pressable,
  Text,
  StyleSheet,
  Dimensions,
  Alert,
  Image,
} from "react-native";
import { CameraView, useCameraPermissions, CameraType } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { PAINT_STYLES, PaintStyle, paintWithGemini } from "@/services/gemini-paint";

const { width } = Dimensions.get("window");
const CARD_H = width * 0.82;
const CARD_W = width - 32;

const ZOOM_LEVELS = [
  { label: "0.5×", scale: 0.7 },
  { label: "1×",   scale: 1   },
  { label: "2×",   scale: 2   },
];

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing] = useState<CameraType>("back");
  const [selectedStyle] = useState<PaintStyle>(PAINT_STYLES[0]);
  const [frozenPhoto, setFrozenPhoto] = useState<string | null>(null);
  const [painting, setPainting] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(1);
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();

  const shutterScale = useSharedValue(1);
  const shutterAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.value }],
  }));

  // Gradient wipe: animates 0 → 1 repeatedly while processing
  const wipeProgress = useSharedValue(0);

  useEffect(() => {
    if (processing) {
      wipeProgress.value = 0;
      wipeProgress.value = withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      wipeProgress.value = withTiming(0, { duration: 300 });
    }
  }, [processing]);

  const wipeStyle = useAnimatedStyle(() => {
    const translateX = interpolate(wipeProgress.value, [0, 1], [-CARD_W, CARD_W]);
    const translateY = interpolate(wipeProgress.value, [0, 1], [CARD_H, -CARD_H]);
    return { transform: [{ translateX }, { translateY }] };
  });

  const digitalScale = ZOOM_LEVELS[zoomIndex].scale;

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || processing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    shutterScale.value = withSpring(0.88, { damping: 10 }, () => {
      shutterScale.value = withSpring(1);
    });

    setProcessing(true);
    setPainting(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.88 });
      if (!photo) return;

      // Freeze the captured frame
      setFrozenPhoto(photo.uri);

      const paintedUri = await paintWithGemini(photo.uri, selectedStyle);

      setPainting(paintedUri);
      setFrozenPhoto(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      console.error(e);
      setFrozenPhoto(null);
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

          {/* Live camera — hidden while frozen/painting */}
          {!frozenPhoto && !painting && (
            <CameraView
              ref={cameraRef}
              style={[styles.cardMedia, { transform: [{ scale: digitalScale }] }]}
              facing={facing}
            />
          )}

          {/* Frozen photo + blur + gradient wipe while processing */}
          {frozenPhoto && (
            <View style={StyleSheet.absoluteFill}>
              <Image source={{ uri: frozenPhoto }} style={styles.cardMedia} resizeMode="cover" />
              {/* Blur overlay */}
              <BlurView intensity={18} tint="light" style={StyleSheet.absoluteFill} />
              {/* Gradient wipe shimmer */}
              <Animated.View style={[styles.wipeTrack, wipeStyle]}>
                <View style={styles.wipeGradient} />
              </Animated.View>
            </View>
          )}

          {/* Final painting — fade in */}
          {painting && (
            <Animated.Image
              entering={FadeIn.duration(600)}
              source={{ uri: painting }}
              style={styles.cardMedia}
              resizeMode="cover"
            />
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
    width: CARD_W,
    height: CARD_H,
    borderRadius: 8,
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
  // Gradient wipe
  wipeTrack: {
    ...StyleSheet.absoluteFillObject,
    width: CARD_W * 2,
  },
  wipeGradient: {
    flex: 1,
    experimental_backgroundImage: "linear-gradient(45deg, transparent 0%, rgba(255,255,255,0.45) 40%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0.45) 60%, transparent 100%)",
    backgroundColor: "rgba(255,255,255,0.15)",
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
