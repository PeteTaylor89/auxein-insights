// screens/CreateContractorAssignmentScreen.js — Contractor self-logs work via
// the Task FAB. Creates a ContractorAssignment (no Task row) — appears in the
// Tasks tab via /me/assignments.
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { contractorService } from '../api/services';
import { FilledInput, useToast } from '../components';

const PRIORITIES = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const formatDate = (d) =>
  d ? d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Today (in progress)';

export default function CreateContractorAssignmentScreen({ navigation }) {
  const toast = useToast();
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [blockId, setBlockId] = useState(null);

  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [blocksLoading, setBlocksLoading] = useState(false);

  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [scheduledDate, setScheduledDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: 'Log work' });
    contractorService.listMyCompanies()
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setCompanies(list);
        if (list.length === 1) setCompanyId(list[0].id);
      })
      .catch(() => toast.show('Could not load companies', 'error'));
  }, [navigation, toast]);

  useEffect(() => {
    setPropertyId(null);
    setBlockId(null);
    setProperties([]);
    setBlocks([]);
    if (companyId == null) return;
    setPropertiesLoading(true);
    contractorService.listMyScopedProperties(companyId)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setProperties(list);
        if (list.length === 1) setPropertyId(list[0].id);
      })
      .catch(() => toast.show('Could not load properties', 'error'))
      .finally(() => setPropertiesLoading(false));
  }, [companyId, toast]);

  useEffect(() => {
    setBlockId(null);
    setBlocks([]);
    if (propertyId == null) return;
    setBlocksLoading(true);
    contractorService.listMyScopedBlocks(propertyId)
      .then(data => setBlocks(Array.isArray(data) ? data : []))
      .catch(() => toast.show('Could not load blocks', 'error'))
      .finally(() => setBlocksLoading(false));
  }, [propertyId, toast]);

  const onDateChange = (_, selected) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selected) setScheduledDate(selected);
  };

  const submit = async () => {
    if (companyId == null) {
      toast.show('Pick a company first', 'error');
      return;
    }
    if (!description.trim()) {
      toast.show('Describe the work', 'error');
      return;
    }
    let hours = null;
    if (estimatedHours.trim()) {
      const n = Number(estimatedHours.replace(/,/g, ''));
      if (isNaN(n) || n < 0) {
        toast.show('Hours must be a positive number', 'error');
        return;
      }
      hours = n;
    }
    setSubmitting(true);
    try {
      await contractorService.createMyAssignment({
        company_id: companyId,
        work_description: description.trim(),
        block_id: blockId,
        priority,
        estimated_hours: hours,
        scheduled_start: scheduledDate ? scheduledDate.toISOString() : null,
      });
      toast.show('Work logged', 'success');
      navigation.goBack();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Could not save', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xxl + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Company *</Text>
        {companies.length === 0 ? (
          <View style={styles.emptyHint}>
            <Feather name="info" size={14} color={colors.info} />
            <Text style={styles.emptyHintText}>No active companies yet.</Text>
          </View>
        ) : (
          <View style={styles.pillRow}>
            {companies.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.pill, companyId === c.id && styles.pillActive]}
                onPress={() => setCompanyId(c.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, companyId === c.id && styles.pillTextActive]}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {companyId != null && (
          <>
            <Text style={[styles.label, { marginTop: spacing.lg }]}>Property</Text>
            {propertiesLoading ? (
              <Text style={styles.hintText}>Loading…</Text>
            ) : properties.length === 0 ? (
              <Text style={styles.hintText}>No properties yet.</Text>
            ) : (
              <View style={styles.pillRow}>
                {properties.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.pill, propertyId === p.id && styles.pillActive]}
                    onPress={() => setPropertyId(propertyId === p.id ? null : p.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, propertyId === p.id && styles.pillTextActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {propertyId != null && (
          <>
            <Text style={[styles.label, { marginTop: spacing.lg }]}>Block</Text>
            {blocksLoading ? (
              <Text style={styles.hintText}>Loading…</Text>
            ) : blocks.length === 0 ? (
              <Text style={styles.hintText}>No blocks on this property.</Text>
            ) : (
              <View style={styles.pillRow}>
                {blocks.map(b => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.pill, blockId === b.id && styles.pillActive]}
                    onPress={() => setBlockId(blockId === b.id ? null : b.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, blockId === b.id && styles.pillTextActive]}>
                      {b.block_name || `Block #${b.id}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        <FilledInput
          label="Work description"
          required
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholder="What are you doing / did you do?"
          style={{ marginTop: spacing.lg }}
        />

        <Text style={styles.label}>Priority</Text>
        <View style={styles.pillRow}>
          {PRIORITIES.map(p => (
            <TouchableOpacity
              key={p.value}
              style={[styles.pill, priority === p.value && styles.pillActive]}
              onPress={() => setPriority(p.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, priority === p.value && styles.pillTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FilledInput
          label="Estimated hours"
          value={estimatedHours}
          onChangeText={setEstimatedHours}
          keyboardType="numeric"
          placeholder="e.g. 3.5"
          style={{ marginTop: spacing.base }}
        />

        <Text style={styles.label}>Scheduled date</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
          <Feather name="calendar" size={16} color={colors.primary} />
          <Text style={styles.dateText}>{formatDate(scheduledDate)}</Text>
          {scheduledDate && (
            <TouchableOpacity onPress={() => setScheduledDate(null)} hitSlop={8}>
              <Feather name="x" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        <Text style={styles.helpText}>Leave blank to mark the work as in progress now.</Text>

        {showDatePicker && (
          <DateTimePicker
            value={scheduledDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
            minimumDate={new Date(2020, 0, 1)}
          />
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.barWrap}>
        <View style={styles.bar}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.goBack()}
            disabled={submitting}
          >
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, (companyId == null || submitting) && styles.primaryBtnDisabled]}
            onPress={submit}
            disabled={companyId == null || submitting}
            activeOpacity={0.85}
          >
            <Feather name="check" size={16} color={colors.white} />
            <Text style={styles.primaryBtnText}>{submitting ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: spacing.sm },
  hintText: { fontSize: fontSize.xs, color: colors.textMuted, paddingVertical: spacing.sm },
  helpText: { fontSize: 11, color: colors.textMuted, marginTop: 4 },

  emptyHint: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.infoBg, padding: spacing.sm,
    borderRadius: radius.md,
  },
  emptyHintText: { fontSize: fontSize.sm, color: colors.info, flex: 1 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  pillTextActive: { color: colors.white, fontWeight: '700' },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
  },
  dateText: { flex: 1, fontSize: fontSize.base, color: colors.text },

  barWrap: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  bar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.base },
  secondaryBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.borderLight, borderRadius: radius.md,
  },
  secondaryBtnText: { color: colors.text, fontWeight: '600' },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.primary, borderRadius: radius.md,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});
