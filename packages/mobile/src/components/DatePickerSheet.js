// components/DatePickerSheet.js — pick a date and CONFIRM it.
//
// The bug this exists to kill: `<DateTimePicker display="spinner">` on iOS
// fires `onChange` on every wheel movement, not when the user is finished. A
// caller that treats onChange as "the user picked a date" therefore acts on
// every intermediate value the wheels pass through. On the timesheet that meant
// spinning the month wheel created a day and navigated away from the picker
// mid-scroll. Android was always fine — `display="default"` is a modal dialog
// that reports once, on OK — which is exactly why the fault looked like an iOS
// quirk rather than a wrong assumption about the API.
//
// So the two platforms get what each already does well:
//
//   iOS      a calendar (`display="inline"`) in a sheet, with Cancel / Done.
//            Taps move a DRAFT date; nothing leaves this component until Done.
//   Android  the native dialog, unchanged, committing only on `type === 'set'`.
//
// `onConfirm` therefore means the same thing on both: the person has chosen
// this date and is finished. There is no onChange to misread.
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, fontSize, radius } from '../styles/theme';

export default function DatePickerSheet({
  visible,
  value,
  onConfirm,
  onClose,
  title = 'Choose a date',
  mode = 'date',
  minimumDate,
  maximumDate,
}) {
  const insets = useSafeAreaInsets();
  // Re-seeded on open, not on mount: reopening the picker should start from the
  // date in force now, not wherever the wheels were left last time.
  const [draft, setDraft] = useState(() => value || new Date());

  useEffect(() => {
    if (visible) setDraft(value || new Date());
  }, [visible, value]);

  if (!visible) return null;

  // ── Android: the OS dialog is already a confirm step. Rendering it inside a
  // Modal would put a dialog on top of a dialog.
  if (Platform.OS !== 'ios') {
    return (
      <DateTimePicker
        value={draft}
        mode={mode}
        display="default"
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onChange={(event, picked) => {
          // 'set' is OK, 'dismissed' is Cancel or the back button. Anything
          // else, and any missing date, is treated as a dismissal — never as a
          // silent confirmation.
          if (event?.type === 'set' && picked) onConfirm?.(picked);
          else onClose?.();
        }}
      />
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        {/* Swallow taps on the sheet itself so they don't dismiss it. */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={[styles.sheet, { paddingBottom: spacing.base + insets.bottom }]}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{title}</Text>

          <DateTimePicker
            value={draft}
            mode={mode}
            // The calendar, not the wheels. A month grid is one tap to a date
            // and shows the days either side of it, which is most of why the
            // wheels were wrong for picking a work day.
            display={mode === 'time' ? 'spinner' : 'inline'}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            themeVariant="light"
            accentColor={colors.primary}
            style={styles.picker}
            onChange={(_event, picked) => { if (picked) setDraft(picked); }}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.done} onPress={() => onConfirm?.(draft)}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
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
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  // The inline calendar needs room for six week rows plus its header; left to
  // size itself it collapses and starts scrolling internally.
  picker: { height: 340, width: '100%' },

  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  cancel: {
    flex: 1, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center',
    backgroundColor: colors.borderLight, borderWidth: 1, borderColor: colors.border,
  },
  cancelText: { color: colors.text, fontWeight: '700', fontSize: fontSize.md },
  done: {
    flex: 2, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center',
    backgroundColor: colors.primary,
  },
  doneText: { color: colors.white, fontWeight: '700', fontSize: fontSize.md },
});
