// screens/ContractorCreateIncidentScreen.js — Contractor reports an incident
// at a company they have a relationship with. Single-page form (not a wizard
// like the company-user CreateIncidentScreen) — simpler scope for V1.
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { contractorService } from '../api/services';
import { FilledInput, SeveritySelector, KeyboardAvoider, useToast } from '../components';
import useActiveCheckIn from '../hooks/useActiveCheckIn';

const TYPES = [
  { value: 'injury',               label: 'Injury',               icon: 'user-x' },
  { value: 'near_miss',            label: 'Near miss',            icon: 'alert-triangle' },
  { value: 'property_damage',      label: 'Property damage',      icon: 'home' },
  { value: 'environmental',        label: 'Environmental',        icon: 'droplet' },
  { value: 'security',             label: 'Security',             icon: 'shield' },
  { value: 'dangerous_occurrence', label: 'Dangerous occurrence', icon: 'alert-octagon' },
];

const CATEGORIES = [
  { value: 'slip_trip_fall',       label: 'Slip / Trip / Fall' },
  { value: 'chemical_exposure',    label: 'Chemical exposure' },
  { value: 'equipment_failure',    label: 'Equipment failure' },
  { value: 'manual_handling',      label: 'Manual handling' },
  { value: 'cuts_lacerations',     label: 'Cuts / Lacerations' },
  { value: 'burns',                label: 'Burns' },
  { value: 'eye_injury',           label: 'Eye injury' },
  { value: 'respiratory',          label: 'Respiratory' },
  { value: 'electrical',           label: 'Electrical' },
  { value: 'vehicle_related',      label: 'Vehicle related' },
  { value: 'fire_explosion',       label: 'Fire / Explosion' },
  { value: 'structural_collapse',  label: 'Structural collapse' },
  { value: 'other',                label: 'Other' },
];

export default function ContractorCreateIncidentScreen({ navigation }) {
  const toast = useToast();
  const checkIn = useActiveCheckIn();
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState(null);
  // Pre-fill scope only once so manual edits aren't clobbered on focus refresh.
  const [didPrefill, setDidPrefill] = useState(false);

  const [incidentType, setIncidentType] = useState('');
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationDesc, setLocationDesc] = useState('');
  const [coords, setCoords] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [injuredName, setInjuredName] = useState('');
  const [witnessDetails, setWitnessDetails] = useState('');
  const [immediateActions, setImmediateActions] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: 'Report incident' });
    contractorService.listMyCompanies()
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setCompanies(list);
        if (checkIn.companyId && list.some(c => c.id === checkIn.companyId)) {
          setCompanyId(checkIn.companyId);
        } else if (list.length === 1) {
          setCompanyId(list[0].id);
        }
      })
      .catch(() => toast.show('Could not load companies', 'error'));
  }, [navigation, toast, checkIn.companyId]);

  useEffect(() => {
    setPropertyId(null);
    setProperties([]);
    if (companyId == null) return;
    contractorService.listMyScopedProperties(companyId)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setProperties(list);
        if (
          !didPrefill
          && checkIn.companyId === companyId
          && checkIn.propertyId
          && list.some(p => p.id === checkIn.propertyId)
        ) {
          setPropertyId(checkIn.propertyId);
          setDidPrefill(true);
        } else if (list.length === 1) {
          setPropertyId(list[0].id);
        }
      })
      .catch(() => toast.show('Could not load properties', 'error'));
  }, [companyId, toast, checkIn.companyId, checkIn.propertyId, didPrefill]);

  const captureGps = async () => {
    setGpsLoading(true);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        toast.show('Location permission denied', 'error');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords([pos.coords.longitude, pos.coords.latitude]);
      toast.show('GPS captured', 'success');
    } catch {
      toast.show('Could not get GPS', 'error');
    } finally {
      setGpsLoading(false);
    }
  };

  const isInjury = incidentType === 'injury';
  const isNotifiable = severity === 'fatal' || severity === 'critical' || incidentType === 'dangerous_occurrence';

  const submit = async () => {
    if (companyId == null) return toast.show('Pick a company', 'error');
    if (!incidentType) return toast.show('Pick an incident type', 'error');
    if (!severity) return toast.show('Pick a severity', 'error');
    if (!category) return toast.show('Pick a category', 'error');
    if (!title.trim()) return toast.show('Add a title', 'error');
    if (!description.trim()) return toast.show('Describe what happened', 'error');
    if (!locationDesc.trim()) return toast.show('Describe where it happened', 'error');

    setSubmitting(true);
    try {
      await contractorService.createMyIncident({
        company_id: companyId,
        property_id: propertyId,
        incident_title: title.trim(),
        incident_description: description.trim(),
        incident_type: incidentType,
        severity,
        category,
        incident_date: new Date().toISOString(),
        location_description: locationDesc.trim(),
        location: coords ? { type: 'Point', coordinates: coords } : null,
        injured_person_name: isInjury ? injuredName.trim() || null : null,
        witness_details: witnessDetails.trim() || null,
        immediate_actions_taken: immediateActions.trim() || null,
        is_notifiable: isNotifiable,
      });
      toast.show('Incident reported', 'success');
      navigation.goBack();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Could not report', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoider>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xxl + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Company *</Text>
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

        {companyId != null && properties.length > 0 && (
          <>
            <Text style={[styles.label, { marginTop: spacing.lg }]}>Property</Text>
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
          </>
        )}

        <Text style={[styles.label, { marginTop: spacing.lg }]}>Type *</Text>
        <View style={styles.pillRow}>
          {TYPES.map(t => (
            <TouchableOpacity
              key={t.value}
              style={[styles.iconPill, incidentType === t.value && styles.pillActive]}
              onPress={() => setIncidentType(t.value)}
              activeOpacity={0.7}
            >
              <Feather
                name={t.icon}
                size={14}
                color={incidentType === t.value ? colors.white : colors.danger}
              />
              <Text style={[styles.pillText, incidentType === t.value && styles.pillTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.lg }]}>Severity *</Text>
        <SeveritySelector value={severity} onChange={setSeverity} />

        <Text style={[styles.label, { marginTop: spacing.lg }]}>Category *</Text>
        <View style={styles.pillRow}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.value}
              style={[styles.pill, category === c.value && styles.pillActive]}
              onPress={() => setCategory(c.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, category === c.value && styles.pillTextActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isNotifiable && (
          <View style={styles.warningBox}>
            <Feather name="alert-triangle" size={14} color={colors.warning} />
            <Text style={styles.warningText}>
              WorkSafe NZ notification likely required. The company will be alerted.
            </Text>
          </View>
        )}

        <FilledInput
          label="Title"
          required
          value={title}
          onChangeText={setTitle}
          placeholder="Short summary"
          style={{ marginTop: spacing.lg }}
        />

        <FilledInput
          label="What happened"
          required
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <FilledInput
          label="Where (description)"
          required
          value={locationDesc}
          onChangeText={setLocationDesc}
          placeholder="e.g. Block 4, west fence line"
        />

        <TouchableOpacity style={styles.gpsBtn} onPress={captureGps} disabled={gpsLoading} activeOpacity={0.7}>
          <Feather name="map-pin" size={14} color={coords ? colors.success : colors.primary} />
          <Text style={[styles.gpsText, coords && { color: colors.success }]}>
            {coords ? 'GPS captured' : (gpsLoading ? 'Locating…' : 'Capture GPS')}
          </Text>
          {coords && (
            <TouchableOpacity onPress={() => setCoords(null)} hitSlop={8}>
              <Feather name="x" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {isInjury && (
          <FilledInput
            label="Injured person (name)"
            value={injuredName}
            onChangeText={setInjuredName}
          />
        )}

        <FilledInput
          label="Witness details"
          value={witnessDetails}
          onChangeText={setWitnessDetails}
          multiline
          numberOfLines={2}
        />

        <FilledInput
          label="Immediate actions taken"
          value={immediateActions}
          onChangeText={setImmediateActions}
          multiline
          numberOfLines={3}
          placeholder="First aid, isolation, cleanup, etc."
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
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={submit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            <Feather name="alert-octagon" size={16} color={colors.white} />
            <Text style={styles.primaryBtnText}>{submitting ? 'Reporting…' : 'Report'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </KeyboardAvoider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  iconPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  pillTextActive: { color: colors.white, fontWeight: '700' },

  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.warningBg, padding: spacing.sm,
    borderRadius: radius.md, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.warningBorder,
  },
  warningText: { fontSize: fontSize.xs, color: colors.warningDark, flex: 1, lineHeight: 16 },

  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.base,
  },
  gpsText: { flex: 1, fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },

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
    backgroundColor: colors.danger, borderRadius: radius.md,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.base },
});
