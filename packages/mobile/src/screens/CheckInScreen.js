// screens/CheckInScreen.js — Contractor manually checks in to a property.
// Visit FAB target + "Sign in" CTA on ContractorHomeScreen's check-in card.
// Reuses the shared /contractor-movements/check-in endpoint via the contractor
// branch the backend already had.
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { contractorService } from '../api/services';
import { FilledInput, useToast } from '../components';

const csvFromArray = (arr) => Array.isArray(arr) ? arr.join(', ') : '';
const arrayFromCsv = (csv) =>
  (csv || '').split(',').map(s => s.trim()).filter(Boolean);

export default function CheckInScreen({ navigation }) {
  const toast = useToast();
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState(null);
  const [propertiesLoading, setPropertiesLoading] = useState(false);

  const [purpose, setPurpose] = useState('');
  const [equipment, setEquipment] = useState('');
  const [previousLocation, setPreviousLocation] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: 'Sign in to a property' });
    contractorService.listMyCompanies()
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setCompanies(list);
        if (list.length === 1) setCompanyId(list[0].id);
      })
      .catch(() => toast.show('Could not load companies', 'error'));
  }, [navigation, toast]);

  // Load properties whenever company changes
  useEffect(() => {
    if (companyId == null) {
      setProperties([]);
      setPropertyId(null);
      return;
    }
    setPropertiesLoading(true);
    contractorService.listMyScopedProperties(companyId)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setProperties(list);
        if (list.length === 1) setPropertyId(list[0].id);
        else setPropertyId(null);
      })
      .catch(() => toast.show('Could not load properties', 'error'))
      .finally(() => setPropertiesLoading(false));
  }, [companyId, toast]);

  const submit = async () => {
    if (companyId == null) {
      toast.show('Pick a company first', 'error');
      return;
    }
    if (purpose.trim().length < 4) {
      toast.show('Add a purpose (at least 4 characters)', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const notesParts = [];
      if (notes.trim()) notesParts.push(notes.trim());
      if (propertyId != null) {
        const prop = properties.find(p => p.id === propertyId);
        if (prop) notesParts.unshift(`Property: ${prop.name}`);
      }
      await contractorService.checkIn({
        company_id: companyId,
        property_id: propertyId,
        purpose: purpose.trim(),
        equipment_brought: arrayFromCsv(equipment),
        previous_location_name: previousLocation.trim() || null,
        vehicle_registration: vehicleReg.trim() || null,
        notes: notesParts.join(' — ') || null,
      });
      toast.show('Checked in', 'success');
      navigation.goBack();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Check-in failed', 'error');
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
        {/* Company */}
        <Text style={styles.label}>Company *</Text>
        {companies.length === 0 ? (
          <View style={styles.emptyHint}>
            <Feather name="info" size={14} color={colors.info} />
            <Text style={styles.emptyHintText}>
              No active companies — ask your contact to set up the relationship first.
            </Text>
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

        {/* Property (optional, informational) */}
        {companyId != null && (
          <>
            <Text style={[styles.label, { marginTop: spacing.lg }]}>Property</Text>
            {propertiesLoading ? (
              <Text style={styles.hintText}>Loading…</Text>
            ) : properties.length === 0 ? (
              <Text style={styles.hintText}>No properties on file for this company.</Text>
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

        {/* Purpose */}
        <FilledInput
          label="Purpose"
          required
          value={purpose}
          onChangeText={setPurpose}
          placeholder="e.g. Pruning block 4"
          style={{ marginTop: spacing.lg }}
        />

        <FilledInput
          label="Equipment brought"
          value={equipment}
          onChangeText={setEquipment}
          placeholder="tractor, sprayer, secateurs"
        />
        <Text style={styles.helpText}>Separate items with commas.</Text>

        <FilledInput
          label="Coming from"
          value={previousLocation}
          onChangeText={setPreviousLocation}
          placeholder="Last property / location"
        />

        <FilledInput
          label="Vehicle registration"
          value={vehicleReg}
          onChangeText={setVehicleReg}
        />

        <FilledInput
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />
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
            <Feather name="log-in" size={16} color={colors.white} />
            <Text style={styles.primaryBtnText}>{submitting ? 'Signing in…' : 'Sign in'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  hintText: { fontSize: fontSize.xs, color: colors.textMuted, paddingVertical: spacing.sm },
  helpText: { fontSize: 11, color: colors.textMuted, marginTop: -8, marginBottom: 14 },

  emptyHint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.infoBg, padding: spacing.sm,
    borderRadius: radius.md,
  },
  emptyHintText: { fontSize: fontSize.sm, color: colors.info, flex: 1, lineHeight: 18 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  pillTextActive: { color: colors.white, fontWeight: '700' },

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
