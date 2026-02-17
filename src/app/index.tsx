import { useRef, useState, useCallback } from "react";
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
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { PAINT_STYLES, PaintStyle, paintWithGemini } from "@/services/gemini-paint";

const { width, height } = Dimensions.get("window");

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [selectedStyle, setSelectedStyle] = useState<PaintStyle>(PAINT_STYLES[0]);
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  const [painting, setPainting] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const paintScale = useSharedValue(1);

  const paintStyle = useAnimatedStyle(() => ({
    transform: [{ scale: paintScale.value }],
  }));

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || processing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    paintScale.value = withSpring(0.94, {}, () => {
      paintScale.value = withSpring(1);
    });

    setProcessing(true);
    setPainting(null);
    setProgressMsg("Capturing…");

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.88 });
      if (!photo) return;
      setLastPhoto(photo.uri);

      const paintedUri = await paintWithGemini(
        photo.uri,
        selectedStyle,
        (msg) => setProgressMsg(msg)
      );

      setPainting(paintedUri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Save to library
      const perms = mediaPermission?.granted
        ? { granted: true }
        : await requestMediaPermission();
      if (perms.granted) {
        await MediaLibrary.saveToLibraryAsync(paintedUri);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert("Painting failed", e?.message ?? "Unknown error");
    } finally {
      setProcessing(false);
    }
  }, [processing, selectedStyle, mediaPermission, requestMediaPermission, paintScale]);

  const handleFlip = useCallback(() => {
    Haptics.selectionAsync();
    setFacing((f) => (f === "back" ? "front" : "back"));
  }, []);

  const handleDismissPainting = useCallback(() => {
    setPainting(null);
  }, []);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionContainer]}>
        <Text style={styles.permissionTitle}>Impressionist</Text>
        <Text style={styles.permissionSubtitle}>AI-painted moments</Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Live camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
      />

      {/* Subtle style tint on viewfinder */}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: selectedStyle.tint }]}
        pointerEvents="none"
      />

      {/* Painted result overlay */}
      {painting && (
        <Animated.View
          entering={FadeIn.duration(600)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleDismissPainting}>
            <Image source={{ uri: painting }} style={styles.paintingResult} resizeMode="cover" />
            <BlurView intensity={40} tint="dark" style={styles.paintingBadge}>
              <Text style={styles.paintingBadgeLabel}>{selectedStyle.label} · tap to dismiss</Text>
            </BlurView>
          </Pressable>
        </Animated.View>
      )}

      {/* Processing overlay */}
      {processing && (
        <Animated.View
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(300)}
          style={styles.processingOverlay}
        >
          <BlurView intensity={60} tint="dark" style={styles.processingCard}>
            <ActivityIndicator size="large" color="rgba(255,255,255,0.85)" />
            <Text style={styles.processingText}>{progressMsg}</Text>
            <Text style={styles.processingHint}>Gemini is painting your image…</Text>
          </BlurView>
        </Animated.View>
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <BlurView intensity={18} tint="dark" style={styles.topBarBlur}>
          <Text style={styles.appTitle}>impressionist</Text>
        </BlurView>
      </View>

      {/* Style selector */}
      {!painting && !processing && (
        <Animated.View
          entering={FadeIn}
          style={[styles.styleStrip, { bottom: insets.bottom + 136 }]}
        >
          {PAINT_STYLES.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => {
                setSelectedStyle(s);
                Haptics.selectionAsync();
              }}
              style={[
                styles.styleChip,
                s.id === selectedStyle.id && styles.styleChipActive,
              ]}
            >
              <View style={[styles.styleSwatch, { backgroundColor: s.tint }]} />
              <Text
                style={[
                  styles.styleLabel,
                  s.id === selectedStyle.id && styles.styleLabelActive,
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      )}

      {/* Bottom controls */}
      <BlurView
        intensity={28}
        tint="dark"
        style={[styles.controls, { paddingBottom: insets.bottom + 16 }]}
      >
        {/* Gallery */}
        <Pressable style={styles.thumbnailButton} onPress={() => router.push("/gallery")}>
          {painting ? (
            <Image source={{ uri: painting }} style={styles.thumbnail} />
          ) : lastPhoto ? (
            <Image source={{ uri: lastPhoto }} style={styles.thumbnail} />
          ) : (
            <View style={styles.thumbnailEmpty} />
          )}
        </Pressable>

        {/* Shutter */}
        <Animated.View style={paintStyle}>
          <Pressable
            onPress={handleCapture}
            disabled={processing}
            style={({ pressed }) => [
              styles.shutter,
              pressed && styles.shutterPressed,
              processing && styles.shutterProcessing,
            ]}
          >
            <View
              style={[
                styles.shutterInner,
                processing && styles.shutterInnerProcessing,
              ]}
            />
          </Pressable>
        </Animated.View>

        {/* Flip */}
        <Pressable
          onPress={handleFlip}
          disabled={processing}
          style={[styles.flipButton, processing && { opacity: 0.4 }]}
        >
          <Text style={styles.flipIcon}>⇄</Text>
        </Pressable>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  permissionContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  permissionTitle: {
    color: "#f0ede6",
    fontSize: 36,
    fontWeight: "200",
    letterSpacing: 3,
    fontStyle: "italic",
  },
  permissionSubtitle: {
    color: "#888480",
    fontSize: 14,
    letterSpacing: 0.5,
    marginBottom: 28,
  },
  permissionButton: {
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  permissionButtonText: {
    color: "#f0ede6",
    fontSize: 15,
    letterSpacing: 1,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  topBarBlur: {
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: 20,
    overflow: "hidden",
  },
  appTitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    fontWeight: "300",
    letterSpacing: 4,
    fontStyle: "italic",
  },
  styleStrip: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  styleChip: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  styleChipActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderColor: "rgba(255,255,255,0.38)",
  },
  styleSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  styleLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  styleLabelActive: {
    color: "rgba(255,255,255,0.92)",
  },
  controls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 22,
    paddingHorizontal: 40,
    overflow: "hidden",
  },
  thumbnailButton: {
    width: 50,
    height: 50,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  thumbnail: { width: 50, height: 50 },
  thumbnailEmpty: {
    width: 50,
    height: 50,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterPressed: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  shutterProcessing: {
    borderColor: "rgba(180,140,255,0.7)",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  shutterInnerProcessing: {
    backgroundColor: "rgba(180,140,255,0.6)",
  },
  flipButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  flipIcon: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 22,
    fontWeight: "200",
  },
  // Painting result
  paintingResult: {
    width,
    height,
  },
  paintingBadge: {
    position: "absolute",
    bottom: 160,
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    overflow: "hidden",
  },
  paintingBadgeLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    letterSpacing: 0.8,
    fontStyle: "italic",
  },
  // Processing
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  processingCard: {
    alignItems: "center",
    gap: 14,
    paddingVertical: 36,
    paddingHorizontal: 48,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  processingText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 16,
    fontWeight: "300",
    letterSpacing: 1,
  },
  processingHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    letterSpacing: 0.5,
    fontStyle: "italic",
  },
});
