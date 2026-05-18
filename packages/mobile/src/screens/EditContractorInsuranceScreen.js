// screens/EditContractorInsuranceScreen.js — Edit one insurance policy at a time.
// Route param: { policyType, profile }
// policyType: public_liability | professional_indemnity | workers_comp | equipment_insurance | vehicle_insurance
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
  StatusBar, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { contractorService } from '../api/services';
import { FilledInput, useToast } from '../components';

const POLICY_META = {
  public_liability: {
    title: 'Public liability',
    insurerField: 'public_liability_insurer',
    policyField: 'public_liability_policy_number',
    coverageField: 'public_liability_coverage_amount',
    expiryField: 'public_liability_expiry',
  },
  professional_indemnity: {
    title: 'Professional indemnity',
    insurerField: 'professional_indemnity_insurer',
    policyField: 'professional_indemnity_policy_number',
    coverageField: 'professional_indemnity_coverage_amount',
    expiryField: 'professional_indemnity_expiry',
  },
  workers_comp: {
    title: 'Workers compensation',
    insurerField: 'workers_comp_insurer',
    policyField: 'workers_comp_policy_number',
    coverageField: null, // not on the model
    expiryField: 'workers_comp_expiry',
    showRequiredToggle: true,
  },
  equipment_insurance: {
    title: 'Equipment insurance',
    insurerField: 'equipment_insurance_insurer',
    policyField: null,
    coverageField: 'equipment_insurance_coverage_amount',
    expiryField: 'equipment_insurance_expiry',
  },
  vehicle_insurance: {
    title: 'Vehicle insurance',
    insurerField: 'vehicle_insurance_insurer',
    policyField: 'vehicle_insurance_policy_number',
    coverageField: null,
    expiryField: 'vehicle_insurance_expiry',
  },
};

const toIsoDate = (d) => d ? d.toISOString().slice(0, 10) : null;
const parseDate = (iso) => iso ? new Date(iso) : null;
const formatDate = (d) =>
  d ? d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No expiry set';

export default function EditContractorInsuranceScreen({ route, navigation }) {
  const toast = useToast();
  const { policyType, profile = {} } = route.params || {};
  const meta = POLICY_META[policyType];

  const [insurer, setInsurer] = useState(meta?.insurerField ? (profile[meta.insurerField] || '') : '');
  const [policyNumber, setPolicyNumber] = useState(meta?.policyField ? (profile[meta.policyField] || '') : '');
  const [coverage, setCoverage] = useState(
    meta?.coverageField && profile[meta.coverageField] != null
      ? String(profile[meta.coverageField])
      : ''
  );
  const [expiry, setExpiry] = useState(meta?.expiryField ? parseDate(profile[meta.expiryField]) : null);
  const [workersRequired, setWorkersRequired] = useState(!!profile.workers_comp_required);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: meta?.title || 'Insurance' });
  }, [navigation, meta]);

  const onDateChange = (_, selected) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selected) setExpiry(selected);
  };

  const save = async () => {
    if (!meta) {
      toast.show('Unknown policy type', 'error');
      return;
    }
    setSaving(true);
    try {
      const patch = {};
      if (meta.insurerField) patch[meta.insurerField] = insurer.trim() || null;
      if (meta.policyField) patch[meta.policyField] = policyNumber.trim() || null;
      if (meta.coverageField) {
        const num = coverage.trim() ? Number(coverage.replace(/,/g, '')) : null;
        if (coverage.trim() && (isNaN(num) || num < 0)) {
          toast.show('Coverage must be a positive number', 'error');
          setSaving(false);
          return;
        }
        patch[meta.coverageField] = num;
      }
      if (meta.expiryField) patch[meta.expiryField] = toIsoDate(expiry);
      if (meta.showRequiredToggle) patch.workers_comp_required = workersRequired;

      await contractorService.updateMyInsurance(patch);
      toast.show('Insurance updated', 'success');
      navigation.goBack();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const insets = useSafeAreaInsets();

  if (!meta) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.textMuted }}>Unknown policy type</Text>
      </View>
    );
  }

  const workersDisabled = meta.showRequiredToggle && !workersRequired;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xxl + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        {meta.showRequiredToggle && (
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Workers comp required</Text>
              <Text style={styles.toggleHint}>Turn on if you employ staff who work on site.</Text>
            </View>
            <Switch
              value={workersRequired}
              onValueChange={setWorkersRequired}
              trackColor={{ false: colors.border, true: colors.primary + '88' }}
              thumbColor={workersRequired ? colors.primary : colors.borderLight}
            />
          </View>
        )}

        {meta.insurerField && (
          <FilledInput
            label="Insurer"
            value={insurer}
            onChangeText={setInsurer}
            editable={!workersDisabled}
            placeholder="e.g. NZI, AMI"
          />
        )}
        {meta.policyField && (
          <FilledInput
            label="Policy number"
            value={policyNumber}
            onChangeText={setPolicyNumber}
            editable={!workersDisabled}
          />
        )}
        {meta.coverageField && (
          <FilledInput
            label="Coverage amount (NZD)"
            value={coverage}
            onChangeText={setCoverage}
            keyboardType="numeric"
            editable={!workersDisabled}
            placeholder="e.g. 2000000"
          />
        )}

        {meta.expiryField && (
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.label}>Expiry date</Text>
            <TouchableOpacity
              style={[styles.dateBtn, workersDisabled && styles.dateBtnDisabled]}
              onPress={() => !workersDisabled && setShowDatePicker(true)}
              disabled={workersDisabled}
              activeOpacity={0.7}
            >
              <Feather name="calendar" size={16} color={workersDisabled ? colors.textMuted : colors.primary} />
              <Text style={[styles.dateText, workersDisabled && { color: colors.textMuted }]}>
                {formatDate(expiry)}
              </Text>
              {expiry && !workersDisabled && (
                <TouchableOpacity onPress={() => setExpiry(null)} hitSlop={8}>
                  <Feather name="x" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        )}

        {showDatePicker && (
          <DateTimePicker
            value={expiry || new Date()}
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
            disabled={saving}
          >
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Feather name={saving ? 'loader' : 'check'} size={16} color={colors.white} />
            <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },

  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.base,
  },
  toggleLabel: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  toggleHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
  },
  dateBtnDisabled: { backgroundColor: colors.borderLight },
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
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});
