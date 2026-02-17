import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  StyleSheet,
  Dimensions,
  Modal,
} from "react-native";
import * as MediaLibrary from "expo-media-library";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { BlurView } from "expo-blur";

const { width } = Dimensions.get("window");
const COLS = 3;
const CELL = (width - 4) / COLS;

export default function GalleryScreen() {
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selected, setSelected] = useState<MediaLibrary.Asset | null>(null);
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    if (!permission?.granted) return;
    const album = await MediaLibrary.getAlbumAsync("Camera");
    const result = album
      ? await MediaLibrary.getAssetsAsync({
          album,
          sortBy: MediaLibrary.SortBy.creationTime,
          mediaType: MediaLibrary.MediaType.photo,
          first: 60,
        })
      : await MediaLibrary.getAssetsAsync({
          sortBy: MediaLibrary.SortBy.creationTime,
          mediaType: MediaLibrary.MediaType.photo,
          first: 60,
        });
    setAssets(result.assets);
  }, [permission]);

  useEffect(() => {
    if (!permission) requestPermission();
    else if (permission.granted) load();
  }, [permission, load, requestPermission]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <BlurView intensity={20} tint="dark" style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>gallery</Text>
        <View style={{ width: 40 }} />
      </BlurView>

      {!permission?.granted ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No library access</Text>
          <Pressable style={styles.grantBtn} onPress={requestPermission}>
            <Text style={styles.grantBtnText}>Grant Access</Text>
          </Pressable>
        </View>
      ) : assets.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>no impressions yet</Text>
          <Text style={styles.emptyHint}>capture something beautiful</Text>
        </View>
      ) : (
        <FlatList
          data={assets}
          numColumns={COLS}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ paddingTop: 60 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => setSelected(item)} style={styles.cell}>
              <Image source={{ uri: item.uri }} style={styles.cellImage} />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
        />
      )}

      {/* Lightbox */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.lightbox} onPress={() => setSelected(null)}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          {selected && (
            <Image
              source={{ uri: selected.uri }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
          <Text style={styles.lightboxDismiss}>tap to close</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    overflow: "hidden",
  },
  headerTitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    fontWeight: "300",
    letterSpacing: 4,
    fontStyle: "italic",
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
  },
  cell: {
    width: CELL,
    height: CELL,
    margin: 1,
    overflow: "hidden",
  },
  cellImage: {
    width: CELL,
    height: CELL,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 16,
    fontStyle: "italic",
    letterSpacing: 1,
  },
  emptyHint: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  grantBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  grantBtnText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  lightbox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxImage: {
    width: width,
    height: width * 1.3,
  },
  lightboxDismiss: {
    position: "absolute",
    bottom: 60,
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    letterSpacing: 1,
  },
});
