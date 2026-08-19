// components/DayTotalSheet.js — enter the day's UNCODED time.
//
// The day total is not typed and is not rolled up. It is
//
//     day total = hours coded to tasks + uncoded hours
//
// and it follows task completions on its own. The only thing a person enters
// here is the uncoded part: time worked that is not against any task.
//
// It used to be the other way round — you declared a total and the uncoded
// remainder was inferred. That inverted how a day actually happens. Hours
// arrive by completing tasks, all day, AFTER any total was declared, so the
// backend checked each completion against a number typed hours earlier and
// refused it once the day ran long — while the entry had already been written.
// A day could end up listing six hours of task entries under a two-hour total.
// Deriving the total removes the disagreement rather than validating it.
import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ActivityIndicator, Keyboard, TouchableWithoutFeedback, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';

// Backend enforces quarter-hour increments and a 24h ceiling on the total.
const STEP = 0.25;
const MAX_HOURS = 24;

const q = (n) => Math.round(n * 4) / 4;
const fmt = (n) => {
  const s = (Math.round(n * 100) / 100).toFixed(2);
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};

export default function DayTotalSheet({
  visible,
  entryHours = 0,
  uncodedHours = 0,
  saving = false,
  onSave,
  onClose,
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');

  // Re-seed on open rather than on mount, so reopening after a save shows the
  // saved figure and not a stale draft.
  useEffect(() => {
    if (!visible) return;
    setDraft(fmt(Number(uncodedHours || 0)));
  }, [visible, uncodedHours]);

  const parsed = useMemo(() => {
    const t = String(draft).trim();
    if (t === '') return 0; // blank means none, not invalid
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }, [draft]);

  const coded = Number(entryHours || 0);
  const total = Number.isFinite(parsed) ? coded + parsed : coded;

  const negative = Number.isFinite(parsed) && parsed < 0;
  const offStep = Number.isFinite(parsed) && Math.abs(parsed - q(parsed)) > 1e-9;
  const overCap = total > MAX_HOURS;
  const valid = Number.isFinite(parsed) && !negative && !offStep && !overCap;

  const bump = (delta) => {
    const base = Number.isFinite(parsed) ? parsed : 0;
    const next = Math.min(Math.max(q(base + delta), 0), MAX_HOURS - coded);
    setDraft(fmt(next));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, { paddingBottom: spacing.base + insets.bottom }]}>
            <View style={styles.grabber} />
            <Text style={styles.title}>Uncoded time</Text>
            <Text style={styles.sub}>
              {coded > 0
                ? `${fmt(coded)} h is already coded to tasks and counts automatically. Add only the time that wasn't against a task.`
                : "No task hours yet. Anything you add here is time that wasn't against a task."}
            </Text>

            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={[styles.stepBtn, (!Number.isFinite(parsed) || parsed <= 0) && styles.stepBtnOff]}
                onPress={() => bump(-STEP)}
                disabled={!Number.isFinite(parsed) || parsed <= 0}
                accessibilityLabel="Decrease uncoded time by a quarter hour"
              >
                <Feather name="minus" size={18} color={colors.primary} />
              </TouchableOpacity>

              <TextInput
                style={[styles.input, (negative || offStep || overCap) && styles.inputBad]}
                value={draft}
                onChangeText={setDraft}
                keyboardType="decimal-pad"
                selectTextOnFocus
                accessibilityLabel="Uncoded hours"
              />

              <TouchableOpacity
                style={[styles.stepBtn, total >= MAX_HOURS && styles.stepBtnOff]}
                onPress={() => bump(STEP)}
                disabled={total >= MAX_HOURS}
                accessibilityLabel="Increase uncoded time by a quarter hour"
              >
                <Feather name="plus" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Straight amounts, since uncoded time is nearly always a round
                block — a smoko, a yard tidy-up, a trip to town. */}
            <View style={styles.chipRow}>
              {[0, 0.5, 1, 2, 4].map((v) => {
                const active = Number.isFinite(parsed) && Math.abs(parsed - v) < 1e-9;
                return (
                  <TouchableOpacity
                    key={v}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setDraft(fmt(v))}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {v === 0 ? 'None' : `${fmt(v)} h`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.breakdown}>
              <View style={styles.breakCell}>
                <Text style={styles.breakLabel}>From tasks</Text>
                <Text style={styles.breakValue}>{fmt(coded)} h</Text>
              </View>
              <Feather name="plus" size={14} color={colors.textMuted} />
              <View style={styles.breakCell}>
                <Text style={styles.breakLabel}>Uncoded</Text>
                <Text style={styles.breakValue}>
                  {Number.isFinite(parsed) ? fmt(parsed) : '—'} h
                </Text>
              </View>
              <Feather name="chevron-right" size={14} color={colors.textMuted} />
              <View style={styles.breakCell}>
                <Text style={styles.breakLabel}>Day total</Text>
                <Text style={[styles.breakValue, styles.breakTotal]}>{fmt(total)} h</Text>
              </View>
            </View>

            <Text style={styles.note}>
              The day total updates by itself as you complete tasks — there is nothing to roll up.
            </Text>

            {negative && <Text style={styles.err}>Uncoded time can&apos;t be negative.</Text>}
            {offStep && !negative && (
              <Text style={styles.err}>Use quarter-hour steps — 0.25, 0.5, 0.75.</Text>
            )}
            {overCap && (
              <Text style={styles.err}>
                That would make the day {fmt(total)} h. A day can&apos;t exceed {MAX_HOURS} h.
              </Text>
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancel} onPress={onClose} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.save, (!valid || saving) && styles.saveOff]}
                onPress={() => valid && onSave?.(q(parsed))}
                disabled={!valid || saving}
              >
                {saving
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.base, paddingTop: spacing.sm,
  },
  grabber: {
    width: 36, height: 4, borderRadius: radius.pill,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.base,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  sub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4, marginBottom: spacing.base },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 44, height: 44, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary + '14',
    borderWidth: 1, borderColor: colors.primary + '30',
  },
  stepBtnOff: { opacity: 0.35 },
  input: {
    flex: 1, textAlign: 'center',
    fontSize: fontSize.xxl, fontWeight: '700', color: colors.text,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2, borderBottomColor: colors.border,
  },
  inputBad: { borderBottomColor: colors.danger, color: colors.danger },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.base },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: colors.borderLight, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' },
  chipText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: colors.primary },

  breakdown: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm, marginTop: spacing.base,
    backgroundColor: colors.borderLight, borderRadius: radius.lg, padding: spacing.md,
  },
  breakCell: { alignItems: 'center', flex: 1 },
  breakLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700' },
  breakValue: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginTop: 2 },
  breakTotal: { color: colors.primary },

  note: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
  err: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.sm },

  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  cancel: {
    flex: 1, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center',
    backgroundColor: colors.borderLight, borderWidth: 1, borderColor: colors.border,
  },
  cancelText: { color: colors.text, fontWeight: '700', fontSize: fontSize.md },
  save: {
    flex: 2, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center',
    backgroundColor: colors.primary,
  },
  saveOff: { opacity: 0.45 },
  saveText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
});
