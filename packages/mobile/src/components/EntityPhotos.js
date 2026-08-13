// components/EntityPhotos.js — photos the server already holds, for an entity.
//
// Nothing in the app displayed an uploaded photo before this: fileService
// .getEntityFiles existed but was never called, and every <Image> rendered
// either a fresh picker URI or a bundled logo. So a photo taken in the field
// was uploaded and then never seen again.
//
// The download endpoint needs a bearer token, so the URL can't go straight to
// <Image>. Bytes are fetched with auth and written to the cache directory, and
// the local copy is what renders — which also means photos already looked at
// stay visible with no signal.
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { fileService } from '../api/services';
import { getAccessToken } from '../services/tokenStore';
import { cacheRemotePhoto, cachedRemotePath, trimRemoteCache } from '../services/photoStore';
import { cacheGet, cacheSet } from '../services/offlineCache';

const API_URL = Constants.expoConfig?.extra?.apiUrl
  || Constants.manifest?.extra?.apiUrl
  || 'https://api.auxein.co.nz/api';

// download_url comes back as `/api/v1/files/{id}/download`, i.e. rooted at the
// host, while the axios baseURL already carries the `/api` segment. Strip it
// rather than concatenating the two and producing `/api/api/...`.
function absoluteUrl(downloadUrl, fileId) {
  const origin = API_URL.replace(/\/api\/?$/, '');
  if (downloadUrl) return `${origin}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`;
  return `${API_URL}/v1/files/${fileId}/download`;
}

export default function EntityPhotos({ entityType, entityId, label = 'Photos', emptyText = null, style }) {
  const [files, setFiles] = useState([]);
  const [localUris, setLocalUris] = useState({}); // fileId → on-disk uri
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);

  const cacheKey = `files.${entityType}:${entityId}`;

  const load = useCallback(async () => {
    if (!entityType || entityId == null) { setLoading(false); return; }
    setLoading(true);

    // Show the last-known list first so the strip isn't empty offline.
    const cached = await cacheGet(cacheKey);
    if (cached?.data) setFiles(cached.data);

    try {
      const fresh = await fileService.getEntityFiles(entityType, entityId);
      const list = Array.isArray(fresh) ? fresh : [];
      setFiles(list);
      await cacheSet(cacheKey, list);
    } catch {
      // Offline or the entity isn't on the server yet — the cached list stands.
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, cacheKey]);

  useEffect(() => { load(); }, [load]);

  // Pull the bytes for anything not already on disk, one at a time so a task
  // with a dozen photos doesn't open a dozen concurrent downloads on a weak
  // connection.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (files.length === 0) return;
      const token = await getAccessToken().catch(() => null);
      const auth = token ? `Bearer ${token}` : null;

      for (const f of files) {
        if (cancelled) return;
        const id = f.id ?? f.file_id;
        if (!id) continue;

        const onDisk = cachedRemotePath(id);
        if (onDisk) {
          setLocalUris(prev => (prev[id] ? prev : { ...prev, [id]: onDisk }));
          continue;
        }
        const uri = await cacheRemotePhoto(id, absoluteUrl(f.download_url, id), auth);
        if (cancelled) return;
        if (uri) setLocalUris(prev => ({ ...prev, [id]: uri }));
      }
      trimRemoteCache();
    })();
    return () => { cancelled = true; };
  }, [files]);

  // Nothing to show and nothing to say — render nothing at all, so a caller can
  // pass its card style here without leaving an empty card behind.
  if (!loading && files.length === 0) {
    if (!emptyText) return null;
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.empty}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>
        {label}{files.length > 0 ? ` (${files.length})` : ''}
      </Text>

      {loading && files.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {files.map((f) => {
            const id = f.id ?? f.file_id;
            const uri = localUris[id];
            return (
              <TouchableOpacity
                key={id}
                style={styles.thumbWrap}
                activeOpacity={0.8}
                onPress={() => uri && setViewing(uri)}
                accessibilityLabel={f.original_filename || 'Photo'}
              >
                {uri ? (
                  <Image source={{ uri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPending]}>
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <TouchableOpacity style={styles.viewer} activeOpacity={1} onPress={() => setViewing(null)}>
          {viewing && <Image source={{ uri: viewing }} style={styles.viewerImage} resizeMode="contain" />}
          <View style={styles.viewerClose}>
            <Feather name="x" size={22} color={colors.white} />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: {
    fontSize: fontSize.sm, fontWeight: '600',
    color: colors.textSecondary, marginBottom: spacing.xs,
  },
  empty: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: 'italic' },
  thumbWrap: { marginRight: spacing.sm },
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.borderLight },
  thumbPending: { alignItems: 'center', justifyContent: 'center' },
  viewer: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerImage: { width: '92%', height: '80%' },
  viewerClose: { position: 'absolute', top: 48, right: 24 },
});
