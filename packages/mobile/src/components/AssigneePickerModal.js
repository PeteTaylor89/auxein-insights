// components/AssigneePickerModal.js — Bottom-sheet multi-select picker for
// company users. Used by CreateTaskScreen's template flow so a single task can
// be assigned to several team members (mirrors backend's assigned_user_ids:
// List[int]).
//
// Returns the selected user ids (numbers) via onConfirm. Parent owns state.

import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Modal, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { usersService } from '../api/services';

export default function AssigneePickerModal({ visible, selectedIds = [], onClose, onConfirm }) {
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  // Local working copy of the selection so the user can tap multiple times
  // before committing via Done. Resets on every open to the parent's value.
  const [working, setWorking] = useState(new Set());

  useEffect(() => {
    if (!visible) return;
    setWorking(new Set(selectedIds));
    setLoading(true);
    usersService.getCompanyUsers()
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const name = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase();
      return name.includes(q) || (u.email || '').toLowerCase().includes(q);
    });
  }, [users, search]);

  const toggle = (id) => {
    setWorking((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    // Pass the full users list along too so the parent can resolve ids to
    // display names without an extra fetch.
    onConfirm(Array.from(working), users);
    setSearch('');
    onClose();
  };

  const clearAll = () => setWorking(new Set());

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}
        >
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>
              Assign to{working.size > 0 ? ` (${working.size})` : ''}
            </Text>
            <TouchableOpacity onPress={clearAll} hitSlop={10} disabled={working.size === 0}>
              <Text style={[styles.clearText, working.size === 0 && styles.clearTextDisabled]}>
                Clear
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Feather name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or email"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Feather name="x" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="users" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {users.length === 0 ? 'No users available' : 'No users match your search'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(u) => String(u.id)}
              keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0 }}
              renderItem={({ item }) => {
                const checked = working.has(item.id);
                const display = [item.first_name, item.last_name].filter(Boolean).join(' ') || item.email || `User #${item.id}`;
                return (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => toggle(item.id)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                      {checked && <Feather name="check" size={14} color={colors.white} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>{display}</Text>
                      {item.email ? (
                        <Text style={styles.rowMeta} numberOfLines={1}>{item.email}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <TouchableOpacity style={styles.doneBtn} onPress={confirm} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>
              Done{working.size > 0 ? ` (${working.size})` : ''}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  clearText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '500' },
  clearTextDisabled: { color: colors.textMuted, opacity: 0.5 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.background, marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: fontSize.base, color: colors.text, paddingVertical: 0 },

  loadingWrap: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyWrap: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm },
  emptyText: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rowName: { fontSize: fontSize.base, color: colors.text, fontWeight: '500' },
  rowMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  doneBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  doneBtnText: { color: colors.white, fontSize: fontSize.base, fontWeight: '700' },
});
