// screens/CreateIncidentScreen.js — Incident report wizard
import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { incidentService, propertyService, fileService } from '../api/services';
import useImageCapture from '../hooks/useImageCapture';
import {
  StepIndicator, FilledInput, SeveritySelector,
  SectionCard, PhotoGrid, BottomActionBar, useToast,
} from '../components';

const STEPS = ['Type', 'Details', 'Injury', 'Actions'];
const STEPS_NO_INJURY = ['Type', 'Details', 'Actions'];

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

export default function CreateIncidentScreen({ navigation }) {
  const { user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [properties, setProperties] = useState([]);

  // Form state
  const [incidentType, setIncidentType] = useState('');
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [propertyId, setPropertyId] = useState(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationDesc, setLocationDesc] = useState('');
  const [coords, setCoords] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [witnessDetails, setWitnessDetails] = useState('');

  const [injuredName, setInjuredName] = useState('');
  const [injuredRole, setInjuredRole] = useState('');
  const [injuryType, setInjuryType] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [medicalReq, setMedicalReq] = useState(false);
  const [timeOffWork, setTimeOffWork] = useState(false);

  const [immediateActions, setImmediateActions] = useState('');

  const imageCapture = useImageCapture('incident', 'temp');

  const isInjury = incidentType === 'injury';
  const activeSteps = isInjury ? STEPS : STEPS_NO_INJURY;
  const totalSteps = activeSteps.length;

  useEffect(() => {
    propertyService.listProperties()
      .then(data => {
        const props = Array.isArray(data) ? data : [];
        setProperties(props);
        if (props.length === 1) setPropertyId(props[0].id);
      })
      .catch(() => {});
  }, []);

  const captureLocation = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.show('Location permission denied', 'warning');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
      });
      toast.show('Location captured', 'success');
    } catch (err) {
      toast.show('Could not get location', 'error');
    } finally {
      setGpsLoading(false);
    }
  };

  // Step validation
  const canAdvance = useMemo(() => {
    if (step === 0) {
      return !!incidentType && !!severity && !!category;
    }
    if (step === 1) {
      return title.trim().length > 0 && description.trim().length > 0 && locationDesc.trim().length > 0;
    }
    if (isInjury && step === 2) {
      return injuredName.trim().length > 0;
    }
    return true;
  }, [step, incidentType, severity, category, title, description, locationDesc, injuredName, isInjury]);

  const handleNext = () => {
    if (!canAdvance) {
      toast.show('Fill required fields to continue', 'warning');
      return;
    }
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step === 0) {
      navigation.goBack();
    } else {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        company_id: user.company_id,
        property_id: propertyId || undefined,
        incident_title: title.trim(),
        incident_description: description.trim(),
        incident_type: incidentType,
        severity,
        category,
        incident_date: new Date().toISOString(),
        location_description: locationDesc.trim(),
        location: coords ? {
          type: 'Point',
          coordinates: [coords.longitude, coords.latitude],
        } : undefined,
        witness_details: witnessDetails.trim() || undefined,
        immediate_actions_taken: immediateActions.trim() || undefined,
        investigation_required: severity === 'serious' || severity === 'critical' || severity === 'fatal',
        evidence_collected: imageCapture.images.length > 0,
        photos_taken: imageCapture.images.length > 0,
      };

      if (isInjury) {
        payload.injured_person_name = injuredName.trim() || undefined;
        payload.injured_person_role = injuredRole.trim() || undefined;
        payload.injury_type = injuryType.trim() || undefined;
        payload.body_part_affected = bodyPart.trim() || undefined;
        payload.medical_treatment_required = medicalReq;
        payload.time_off_work = timeOffWork;
      }

      const created = await incidentService.create(payload);

      if (imageCapture.images.length > 0 && created?.id) {
        for (const img of imageCapture.images) {
          try {
            await fileService.upload('incident', created.id, img.uri, 'photo');
          } catch (e) { /* non-fatal */ }
        }
      }

      toast.show('Incident reported', 'success');
      navigation.goBack();
    } catch (err) {
      const msg = err.response?.data?.detail;
      toast.show(typeof msg === 'string' ? msg : 'Failed to submit incident', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isNotifiable = severity === 'fatal' || severity === 'critical' || incidentType === 'dangerous_occurrence';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Report incident</Text>
            <Text style={styles.headerSub}>Step {step + 1} of {totalSteps}</Text>
          </View>
          <Feather name="alert-octagon" size={22} color={colors.white} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <StepIndicator steps={activeSteps} currentStep={step} />

          {/* Step 0 — Type + Severity + Category */}
          {step === 0 && (
            <>
              <SectionCard icon="layers" title="Incident type" subtitle="What happened?">
                <View style={styles.typeGrid}>
                  {TYPES.map(t => {
                    const selected = incidentType === t.value;
                    return (
                      <TouchableOpacity
                        key={t.value}
                        style={[styles.typeCard, selected && styles.typeCardActive]}
                        onPress={() => setIncidentType(t.value)}
                        activeOpacity={0.75}
                      >
                        <Feather
                          name={t.icon}
                          size={20}
                          color={selected ? colors.danger : colors.textMuted}
                        />
                        <Text style={[styles.typeLabel, selected && styles.typeLabelActive]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </SectionCard>

              <SectionCard icon="activity" title="Severity" subtitle="Potential or actual outcome">
                <SeveritySelector value={severity} onChange={setSeverity} />
                {isNotifiable && (
                  <View style={styles.alertBox}>
                    <Feather name="alert-triangle" size={16} color={colors.warningDark} />
                    <Text style={styles.alertText}>
                      This may be notifiable to WorkSafe NZ. You must still submit the report here —
                      contact WorkSafe separately if required.
                    </Text>
                  </View>
                )}
              </SectionCard>

              <SectionCard icon="tag" title="Category">
                <View style={styles.categoryGrid}>
                  {CATEGORIES.map(c => {
                    const selected = category === c.value;
                    return (
                      <TouchableOpacity
                        key={c.value}
                        style={[styles.chip, selected && styles.chipActive]}
                        onPress={() => setCategory(c.value)}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </SectionCard>

              {properties.length > 1 && (
                <SectionCard icon="map-pin" title="Property">
                  <View style={styles.propertyList}>
                    {properties.map(p => {
                      const selected = propertyId === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.propertyRow, selected && styles.propertyRowActive]}
                          onPress={() => setPropertyId(p.id)}
                        >
                          <Feather
                            name={selected ? 'check-circle' : 'circle'}
                            size={18}
                            color={selected ? colors.success : colors.textMuted}
                          />
                          <Text style={styles.propertyText}>{p.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </SectionCard>
              )}
            </>
          )}

          {/* Step 1 — Details */}
          {step === 1 && (
            <>
              <SectionCard icon="edit-3" title="Incident details">
                <FilledInput
                  label="Title"
                  required
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Short summary of what happened"
                />
                <FilledInput
                  label="Description"
                  required
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe what happened, when, and what led up to it"
                  multiline
                  numberOfLines={5}
                />
              </SectionCard>

              <SectionCard icon="map-pin" title="Location">
                <FilledInput
                  label="Location description"
                  required
                  value={locationDesc}
                  onChangeText={setLocationDesc}
                  placeholder="e.g. Block C, row 14, near pump station"
                />
                <TouchableOpacity
                  style={[styles.gpsBtn, coords && styles.gpsBtnCaptured]}
                  onPress={captureLocation}
                  disabled={gpsLoading}
                >
                  {gpsLoading ? (
                    <ActivityIndicator color={colors.success} size="small" />
                  ) : (
                    <Feather
                      name={coords ? 'check-circle' : 'crosshair'}
                      size={18}
                      color={coords ? colors.success : colors.primary}
                    />
                  )}
                  <Text style={[styles.gpsBtnText, coords && { color: colors.success }]}>
                    {coords
                      ? `GPS captured (±${Math.round(coords.accuracy || 0)}m)`
                      : 'Capture GPS coordinates'}
                  </Text>
                </TouchableOpacity>
              </SectionCard>

              <SectionCard icon="users" title="Witnesses (optional)">
                <FilledInput
                  label="Witness details"
                  value={witnessDetails}
                  onChangeText={setWitnessDetails}
                  placeholder="Names and contact info of anyone who saw the incident"
                  multiline
                  numberOfLines={3}
                />
              </SectionCard>
            </>
          )}

          {/* Step 2 — Injury details (conditional) */}
          {isInjury && step === 2 && (
            <SectionCard icon="user-x" title="Injury details" subtitle="Required for injury incidents">
              <FilledInput
                label="Injured person name"
                required
                value={injuredName}
                onChangeText={setInjuredName}
                placeholder="Full name"
              />
              <FilledInput
                label="Role / Position"
                value={injuredRole}
                onChangeText={setInjuredRole}
                placeholder="e.g. Vineyard worker, Contractor"
              />
              <FilledInput
                label="Injury type"
                value={injuryType}
                onChangeText={setInjuryType}
                placeholder="e.g. Laceration, Sprain, Chemical burn"
              />
              <FilledInput
                label="Body part affected"
                value={bodyPart}
                onChangeText={setBodyPart}
                placeholder="e.g. Left hand, Lower back"
              />

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Medical treatment required?</Text>
                </View>
                <YesNo value={medicalReq} onChange={setMedicalReq} />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Time off work expected?</Text>
                </View>
                <YesNo value={timeOffWork} onChange={setTimeOffWork} />
              </View>
            </SectionCard>
          )}

          {/* Final step — Actions + Evidence */}
          {step === totalSteps - 1 && (
            <>
              <SectionCard icon="check-square" title="Immediate actions taken">
                <FilledInput
                  label="What was done right away?"
                  value={immediateActions}
                  onChangeText={setImmediateActions}
                  placeholder="e.g. First aid applied, area isolated, equipment stopped"
                  multiline
                  numberOfLines={4}
                />
              </SectionCard>

              <SectionCard icon="camera" title="Photos & evidence">
                <PhotoGrid
                  photos={imageCapture.images}
                  onAddPhoto={imageCapture.showPicker}
                  onRemovePhoto={imageCapture.removeImage}
                  maxPhotos={6}
                  label="Evidence photos"
                />
              </SectionCard>
            </>
          )}

          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomActionBar
        secondaryLabel={step === 0 ? 'Cancel' : 'Back'}
        secondaryIcon={step === 0 ? 'x' : 'arrow-left'}
        onSecondary={handleBack}
        primaryLabel={submitting ? 'Submitting...' : (step === totalSteps - 1 ? 'Submit report' : 'Next step')}
        primaryIcon={step === totalSteps - 1 ? 'send' : 'arrow-right'}
        primaryColor="red"
        onPrimary={handleNext}
        disabled={submitting}
      />
    </View>
  );
}

function YesNo({ value, onChange }) {
  return (
    <View style={styles.yesNoRow}>
      <TouchableOpacity
        style={[styles.yesNoBtn, value === false && styles.yesNoBtnActive]}
        onPress={() => onChange(false)}
      >
        <Text style={[styles.yesNoText, value === false && styles.yesNoTextActive]}>No</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.yesNoBtn, value === true && styles.yesNoBtnActive]}
        onPress={() => onChange(true)}
      >
        <Text style={[styles.yesNoText, value === true && styles.yesNoTextActive]}>Yes</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header (red for incidents)
  headerSafe: { backgroundColor: colors.headerIncident },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.headerIncident,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.xs, marginTop: 2 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base },

  // Type grid
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeCard: {
    width: '31%', minWidth: 100, flexGrow: 1,
    alignItems: 'center', gap: 6,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  typeCardActive: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  typeLabel: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', fontWeight: '500' },
  typeLabelActive: { color: colors.danger, fontWeight: '700' },

  // Category chips
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  chipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: colors.danger, fontWeight: '700' },

  // Alert box
  alertBox: {
    flexDirection: 'row', gap: spacing.sm,
    backgroundColor: colors.warningBg, borderRadius: radius.md,
    padding: spacing.md, marginTop: spacing.md,
    borderLeftWidth: 3, borderLeftColor: colors.warning,
  },
  alertText: { flex: 1, fontSize: fontSize.xs, color: colors.warningDark, fontWeight: '500', lineHeight: 16 },

  // Property picker
  propertyList: { gap: spacing.xs },
  propertyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
  },
  propertyRowActive: { borderColor: colors.success, backgroundColor: colors.gpsBg },
  propertyText: { fontSize: fontSize.base, color: colors.text, fontWeight: '500' },

  // GPS
  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.base,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface, marginTop: spacing.xs,
    borderStyle: 'dashed',
  },
  gpsBtnCaptured: { borderColor: colors.success, backgroundColor: colors.gpsBg, borderStyle: 'solid' },
  gpsBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },

  // Yes/No toggle
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight,
    marginTop: spacing.sm,
  },
  toggleLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  yesNoRow: { flexDirection: 'row', gap: 4 },
  yesNoBtn: {
    paddingVertical: 6, paddingHorizontal: spacing.base,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  yesNoBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  yesNoText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  yesNoTextActive: { color: colors.white },
});
