import { useRef, useState, useCallback } from "react";
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
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";

const FILTERS = [
  { id: "monet", label: "Monet", tint: "rgba(180,210,230,0.28)" },
  { id: "renoir", label: "Renoir", tint: "rgba(240,180,150,0.22)" },
  { id: "seurat", label: "Seurat", tint: "rgba(200,220,180,0.20)" },
  { id: "turner", label: "Turner", tint: "rgba(255,220,100,0.25)" },
  { id: "pissarro", label: "Pissarro", tint: "rgba(160,200,170,0.22)" },
];

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [selectedFilter, setSelectedFilter] = useState(0);
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();

  const filter = FILTERS[selectedFilter];

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.92 });
      if (!photo) return;

      setLastPhoto(photo.uri);

      if (!mediaPermission?.granted) {
        const { granted } = await requestMediaPermission();
        if (!granted) {
          Alert.alert("Permission needed", "Allow photo library access to save impressions.");
          return;
        }
      }

      await MediaLibrary.saveToLibraryAsync(photo.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error(e);
    } finally {
      setCapturing(false);
    }
  }, [capturing, mediaPermission, requestMediaPermission]);

  const handleFlip = useCallback(() => {
    Haptics.selectionAsync();
    setFacing((f) => (f === "back" ? "front" : "back"));
  }, []);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionContainer]}>
        <Text style={styles.permissionTitle}>Impressionist</Text>
        <Text style={styles.permissionSubtitle}>a camera for painted moments</Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
      />

      {/* Impressionist tint overlay */}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: filter.tint }]}
        pointerEvents="none"
      />

      {/* Grain overlay */}
      <GrainOverlay />

      {/* Top title */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <BlurView intensity={18} tint="dark" style={styles.topBarBlur}>
          <Text style={styles.appTitle}>impressionist</Text>
        </BlurView>
      </View>

      {/* Filter selector */}
      <View style={[styles.filterStrip, { bottom: insets.bottom + 138 }]}>
        {FILTERS.map((f, i) => (
          <Pressable
            key={f.id}
            onPress={() => {
              setSelectedFilter(i);
              Haptics.selectionAsync();
            }}
            style={[
              styles.filterChip,
              i === selectedFilter && styles.filterChipActive,
            ]}
          >
            <View style={[styles.filterSwatch, { backgroundColor: f.tint }]} />
            <Text style={[styles.filterLabel, i === selectedFilter && styles.filterLabelActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Controls bar */}
      <BlurView
        intensity={28}
        tint="dark"
        style={[styles.controls, { paddingBottom: insets.bottom + 16 }]}
      >
        {/* Gallery thumbnail */}
        <Pressable style={styles.thumbnailButton} onPress={() => router.push("/gallery")}>
          {lastPhoto ? (
            <Image source={{ uri: lastPhoto }} style={styles.thumbnail} />
          ) : (
            <View style={styles.thumbnailEmpty} />
          )}
        </Pressable>

        {/* Shutter */}
        <Pressable
          onPress={handleCapture}
          style={({ pressed }) => [
            styles.shutter,
            pressed && styles.shutterPressed,
            capturing && styles.shutterCapturing,
          ]}
        >
          <View style={styles.shutterInner} />
        </Pressable>

        {/* Flip camera */}
        <Pressable onPress={handleFlip} style={styles.flipButton}>
          <Text style={styles.flipIcon}>⇄</Text>
        </Pressable>
      </BlurView>
    </View>
  );
}

function GrainOverlay() {
  const { width, height } = Dimensions.get("window");
  const dots = Array.from({ length: 280 }, (_, i) => ({
    key: i,
    x: Math.random() * width,
    y: Math.random() * height,
    size: Math.random() * 2.5 + 0.8,
    opacity: Math.random() * 0.06 + 0.02,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {dots.map((d) => (
        <View
          key={d.key}
          style={{
            position: "absolute",
            left: d.x,
            top: d.y,
            width: d.size,
            height: d.size,
            borderRadius: d.size / 2,
            backgroundColor: "white",
            opacity: d.opacity,
          }}
        />
      ))}
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
  filterStrip: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  filterChip: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  filterChipActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderColor: "rgba(255,255,255,0.38)",
  },
  filterSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  filterLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  filterLabelActive: {
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
  thumbnail: {
    width: 50,
    height: 50,
  },
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
    transform: [{ scale: 0.92 }],
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  shutterCapturing: {
    borderColor: "rgba(255,215,80,0.9)",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.9)",
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
});
