// screens/TimesheetScreen.js — month view of the current user's timesheet days.
// One row per existing day with status pill + hours summary. Days without
// activity in the month are not shown (created lazily by task completion or
// by the user adding entries on the detail screen).
//
// The day total is derived — hours coded to tasks plus uncoded time — so there
// is no roll-up step and nothing to keep in sync. The card action opens the
// uncoded sheet, which is the only figure anyone enters.
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, StatusBar, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../contexts/AuthContext';
import { timesheetService } from '../api/services';
import { useToast, DayTotalSheet } from '../components';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';

const STATUS_STYLE = {
  draft:     { bg: colors.borderLight, fg: colors.textMuted, label: 'Draft' },
  submitted: { bg: colors.info + '22',  fg: colors.info,      label: 'Submitted' },
  approved:  { bg: colors.success + '22', fg: colors.success, label: 'Approved' },
  rejected:  { bg: colors.danger + '22', fg: colors.danger,   label: 'Rejected' },
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function TimesheetScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [creatingDay, setCreatingDay] = useState(false);
  const [totalFor, setTotalFor] = useState(null);   // day whose total sheet is open
  const [savingTotal, setSavingTotal] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await timesheetService.listMyDays({ userId: user.id, year, month });
      setDays(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log('Timesheet load failed:', err.message);
      toast.show('Could not load timesheets', 'error');
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, year, month, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const goPrev = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const goNext = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  };

  // Set a day's uncoded time without leaving the list. The endpoint returns
  // the updated day, so splice it back in rather than refetching the whole
  // month — a refetch would scroll-jump and cost a round trip for one row.
  const handleSaveTotal = async (hours) => {
    if (!totalFor) return;
    setSavingTotal(true);
    try {
      const updated = await timesheetService.setUncodedHours(totalFor.id, hours);
      setDays(prev => prev.map(d => (d.id === updated.id ? updated : d)));
      setTotalFor(null);
      const uncoded = Number(updated.uncoded_hours || 0);
      toast.show(
        uncoded > 0
          ? `${fmtDate(updated.work_date)}: ${Number(updated.effective_total_hours).toFixed(2)} h, ${uncoded.toFixed(2)} h uncoded`
          : `${fmtDate(updated.work_date)}: ${Number(updated.effective_total_hours).toFixed(2)} h, all coded to tasks`,
        'success',
      );
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Could not save that', 'error');
    } finally {
      setSavingTotal(false);
    }
  };

  const monthTotal = days.reduce((s, d) => s + Number(d.effective_total_hours || 0), 0);

  const handleDatePicked = async (event, picked) => {
    // Android closes immediately; iOS keeps open. Dismiss either way.
    setShowDatePicker(false);
    if (event?.type === 'dismissed' || !picked) return;
    setCreatingDay(true);
    try {
      const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const work_date = fmt(picked);
      // Backend upserts by (user, date, company) — safe to call even if the
      // day already exists; we just navigate to wherever it lands.
      const day = await timesheetService.createDay({ work_date });
      navigation.navigate('TimesheetDayDetail', { dayId: day.id });
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Could not create day', 'error');
    } finally {
      setCreatingDay(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goPrev} hitSlop={12} activeOpacity={0.7}>
          <Feather name="chevron-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={styles.monthTitle}>{MONTH_NAMES[month - 1]} {year}</Text>
          <Text style={styles.monthTotal}>{monthTotal.toFixed(1)} h total</Text>
        </View>
        <TouchableOpacity onPress={goNext} hitSlop={12} activeOpacity={0.7}>
          <Feather name="chevron-right" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.headerActions}>
        <TouchableOpacity onPress={goToday} style={styles.todayBtn} activeOpacity={0.75}>
          <Text style={styles.todayBtnText}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          style={styles.newDayBtn}
          activeOpacity={0.85}
          disabled={creatingDay}
        >
          <Feather name="plus" size={14} color={colors.white} />
          <Text style={styles.newDayBtnText}>{creatingDay ? 'Opening…' : 'New day'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xxl + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
      >
        {loading && days.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : days.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="calendar" size={22} color={colors.textMuted} />
            <Text style={styles.emptyText}>No timesheet days yet this month</Text>
            <Text style={styles.emptyHint}>Add a day manually with the New day button, or complete a task with hours to seed one.</Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={[styles.newDayBtn, { marginTop: spacing.sm }]}
              activeOpacity={0.85}
              disabled={creatingDay}
            >
              <Feather name="plus" size={14} color={colors.white} />
              <Text style={styles.newDayBtnText}>{creatingDay ? 'Opening…' : 'New day'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          days.map(d => {
            const sty = STATUS_STYLE[d.status] || STATUS_STYLE.draft;
            const entryHours = Number(d.entry_hours || 0);
            const totalHours = Number(d.effective_total_hours || 0);
            // Editable days only. Unlike the old roll-up button this also shows
            // once a total exists, because adjusting it is the whole point —
            // uncoded time is often remembered after the tasks are ticked off.
            const isEditable = d.status === 'draft' || d.status === 'rejected';
            const uncoded = Number(d.uncoded_hours || 0);
            return (
              <TouchableOpacity
                key={d.id}
                style={styles.dayCard}
                onPress={() => navigation.navigate('TimesheetDayDetail', { dayId: d.id })}
                activeOpacity={0.85}
              >
                <View style={styles.dayCardHeader}>
                  <Text style={styles.dayDate}>{fmtDate(d.work_date)}</Text>
                  <View style={[styles.statusPill, { backgroundColor: sty.bg }]}>
                    <Text style={[styles.statusText, { color: sty.fg }]}>{sty.label}</Text>
                  </View>
                </View>
                <View style={styles.dayRow}>
                  {/* From tasks + uncoded = total. "Day total" and "Effective"
                      were two labels for one number under the old model, which
                      is half of why a mismatch was hard to read. */}
                  <View style={styles.dayCell}>
                    <Text style={styles.dayCellLabel}>From tasks</Text>
                    <Text style={styles.dayCellValue}>{entryHours.toFixed(2)} h</Text>
                  </View>
                  <View style={styles.dayCell}>
                    <Text style={styles.dayCellLabel}>Uncoded</Text>
                    <Text style={styles.dayCellValue}>{uncoded.toFixed(2)} h</Text>
                  </View>
                  <View style={styles.dayCell}>
                    <Text style={styles.dayCellLabel}>Day total</Text>
                    <Text style={[styles.dayCellValue, styles.dayCellTotal]}>{totalHours.toFixed(2)} h</Text>
                  </View>
                </View>
                {isEditable && (
                  <TouchableOpacity
                    style={styles.rollupInline}
                    onPress={() => setTotalFor(d)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Add uncoded time, ${entryHours.toFixed(2)} hours currently coded to tasks`}
                  >
                    <Feather name="clock" size={13} color={colors.primary} />
                    <Text style={styles.rollupInlineText}>
                      {uncoded > 0
                        ? `${uncoded.toFixed(2)} h uncoded`
                        : 'Add uncoded time'}
                    </Text>
                  </TouchableOpacity>
                )}
                <Feather name="chevron-right" size={18} color={colors.textMuted} style={styles.chev} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <DayTotalSheet
        visible={!!totalFor}
        entryHours={Number(totalFor?.entry_hours || 0)}
        uncodedHours={Number(totalFor?.uncoded_hours || 0)}
        saving={savingTotal}
        onSave={handleSaveTotal}
        onClose={() => !savingTotal && setTotalFor(null)}
      />

      {showDatePicker && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDatePicked}
          maximumDate={new Date()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  monthTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  monthTotal: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  headerActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, marginTop: spacing.sm,
  },
  todayBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    backgroundColor: colors.borderLight, borderRadius: radius.pill,
  },
  todayBtnText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.text },
  newDayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    backgroundColor: colors.primary, borderRadius: radius.pill,
  },
  newDayBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.white },

  loadingWrap: { padding: spacing.xl, alignItems: 'center' },
  emptyCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  emptyText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600', marginTop: spacing.sm },
  emptyHint: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center' },

  dayCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.base,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
    ...shadows.card, position: 'relative',
  },
  dayCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  dayDate: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  dayRow: { flexDirection: 'row', gap: spacing.md },
  dayCell: { flex: 1 },
  dayCellLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', fontWeight: '600' },
  dayCellValue: { fontSize: fontSize.base, color: colors.text, fontWeight: '600', marginTop: 2 },
  dayCellTotal: { color: colors.primary },
  chev: { position: 'absolute', right: spacing.sm, top: '50%' },
  rollupInline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 8, paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primary + '14',
    borderWidth: 1, borderColor: colors.primary + '30',
    alignSelf: 'flex-start',
  },
  rollupInlineText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700' },
});
