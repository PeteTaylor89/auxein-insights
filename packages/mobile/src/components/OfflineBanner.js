// components/OfflineBanner.js — connection + unsynced-work status.
//
// The banner used to disappear the moment the connection returned, which is the
// exact moment the user most needs to know whether their work actually landed.
// It now stays up while anything is still queued, and confirms once the queue
// drains — so "changes will sync when online" is a promise the UI keeps.
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fontSize } from '../styles/theme';
import useNetworkStatus from '../hooks/useNetworkStatus';
import { onPendingCountChange } from '../services/writeQueue';
import { onSyncStatusChange, triggerSync } from '../services/syncCoordinator';

export default function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const [pending, setPending] = useState(0);
  const [status, setStatus] = useState('idle');
  const [justSynced, setJustSynced] = useState(false);
  const wasPending = useRef(0);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => onPendingCountChange(setPending), []);
  useEffect(() => onSyncStatusChange(s => setStatus(s.status)), []);

  // Everything that was waiting has landed — say so briefly, then get out of
  // the way. Without this the banner just vanishes and the user is left
  // guessing whether the work synced or was dropped.
  useEffect(() => {
    if (wasPending.current > 0 && pending === 0 && isOnline) {
      setJustSynced(true);
      const t = setTimeout(() => setJustSynced(false), 2600);
      wasPending.current = pending;
      return () => clearTimeout(t);
    }
    wasPending.current = pending;
  }, [pending, isOnline]);

  const visible = !isOnline || pending > 0 || justSynced;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, fade]);

  if (!visible) return null;

  let tone = styles.bannerOffline;
  let icon = 'wifi-off';
  let text = pending > 0
    ? `Offline — ${pending} change${pending === 1 ? '' : 's'} waiting to sync`
    : 'No connection — changes will sync when online';

  if (isOnline && justSynced && pending === 0) {
    tone = styles.bannerDone;
    icon = 'check-circle';
    text = 'All changes synced';
  } else if (isOnline && pending > 0) {
    tone = styles.bannerPending;
    icon = status === 'syncing' ? 'refresh-cw' : 'upload-cloud';
    text = status === 'syncing'
      ? `Syncing ${pending} change${pending === 1 ? '' : 's'}…`
      : `${pending} change${pending === 1 ? '' : 's'} waiting — tap to sync`;
  }

  const canTap = isOnline && pending > 0 && status !== 'syncing';

  return (
    <Animated.View style={{ opacity: fade }}>
      <TouchableOpacity
        style={[styles.banner, tone]}
        activeOpacity={canTap ? 0.75 : 1}
        onPress={canTap ? () => triggerSync().catch(() => {}) : undefined}
        disabled={!canTap}
        accessibilityRole={canTap ? 'button' : 'text'}
        accessibilityLabel={text}
      >
        {status === 'syncing'
          ? <ActivityIndicator size="small" color={colors.white} />
          : <Feather name={icon} size={14} color={colors.white} />}
        <Text style={styles.text}>{text}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  bannerOffline: { backgroundColor: colors.danger },
  bannerPending: { backgroundColor: colors.warning },
  bannerDone: { backgroundColor: colors.success },
  text: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
