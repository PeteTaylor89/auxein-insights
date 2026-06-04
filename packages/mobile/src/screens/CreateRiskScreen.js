// screens/CreateRiskScreen.js — Lightweight hazard / risk capture wizard
import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { riskService, propertyService, fileService } from '../api/services';
import useImageCapture from '../hooks/useImageCapture';
import {
  StepIndicator, FilledInput, SectionCard, PhotoGrid, BottomActionBar, KeyboardAvoider, useToast,
} from '../components';

const STEPS = ['Type', 'Detail'];

const CATEGORIES = [
  { value: 'personnel',     label: 'Personnel',     icon: 'user' },
  { value: 'equipment',     label: 'Equipment',     icon: 'tool' },
  { value: 'chemical',      label: 'Chemical',      icon: 'droplet' },
  { value: 'fire',          label: 'Fire',          icon: 'flame' },
  { value: 'structural',    label: 'Structural',    icon: 'home' },
  { value: 'environmental', label: 'Environmental', icon: 'cloud-rain' },
  { value: 'biological',    label: 'Biological',    icon: 'activity' },
  { value: 'security',      label: 'Security',      icon: 'shield' },
  { value: 'biosecurity',   label: 'Biosecurity',   icon: 'alert-octagon' },
  { value: 'weather',       label: 'Weather',       icon: 'wind' },
  { value: 'pests_diseases',label: 'Pests/Disease', icon: 'bug' },
  { value: 'other',         label: 'Other',         icon: 'more-horizontal' },
];

const TYPES = [
  { value: 'health_safety', label: 'Health & safety' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'production',    label: 'Production' },
  { value: 'operational',   label: 'Operational' },
];

const LIKELIHOOD_LABELS = ['Very unlikely', 'Unlikely', 'Possible', 'Likely', 'Very likely'];
const SEVERITY_LABELS = ['Minimal', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

function riskLevel(score) {
  if (score <= 4) return { level: 'low', color: colors.success, label: 'Low' };
  if (score <= 9) return { level: 'medium', color: colors.warning, label: 'Medium' };
  if (score <= 16) return { level: 'high', color: colors.danger, label: 'High' };
  return { level: 'critical', color: colors.headerIncident, label: 'Critical' };
}

export default function CreateRiskScreen({ navigation }) {
  const { user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [properties, setProperties] = useState([]);

  const [category, setCategory] = useState('');
  const [riskType, setRiskType] = useState('health_safety');
  const [likelihood, setLikelihood] = useState(0);
  const [severity, setSeverity] = useState(0);
  const [propertyId, setPropertyId] = useState(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationDesc, setLocationDesc] = useState('');
  const [coords, setCoords] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [existingControls, setExistingControls] = useState('');

  const imageCapture = useImageCapture('risk', 'temp');

  const score = likelihood && severity ? likelihood * severity : 0;
  const level = score > 0 ? riskLevel(score) : null;

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
    } catch {
      toast.show('Could not get location', 'error');
    } finally {
      setGpsLoading(false);
    }
  };

  const canAdvance = useMemo(() => {
    if (step === 0) return !!category;
    if (step === 1) {
      return title.trim().length > 0
        && description.trim().length > 0
        && likelihood > 0
        && severity > 0;
    }
    return true;
  }, [step, category, likelihood, severity, title, description]);

  const handleBack = () => {
    if (step === 0) navigation.goBack();
    else setStep(step - 1);
  };

  const handleNext = () => {
    if (!canAdvance) {
      toast.show('Fill required fields to continue', 'warning');
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
    else handleSubmit();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        company_id: user.company_id,
        property_id: propertyId || undefined,
        risk_title: title.trim(),
        risk_description: description.trim(),
        risk_category: category,
        risk_type: riskType,
        inherent_likelihood: likelihood,
        inherent_severity: severity,
        location: coords ? {
          type: 'Point',
          coordinates: [coords.longitude, coords.latitude],
        } : undefined,
        location_description: locationDesc.trim() || undefined,
        existing_controls: existingControls.trim() || undefined,
        custom_fields: { source: 'mobile', logged_by_username: user.username },
      };

      const created = await riskService.create(payload);

      if (imageCapture.images.length > 0 && created?.id) {
        for (const img of imageCapture.images) {
          try {
            await fileService.upload('risk', created.id, img.uri, 'photo');
          } catch { /* non-fatal */ }
        }
      }

      toast.show('Risk logged', 'success');
      navigation.goBack();
    } catch (err) {
      const msg = err.response?.data?.detail;
      toast.show(typeof msg === 'string' ? msg : 'Failed to log risk', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Log risk</Text>
            <Text style={styles.headerSub}>Step {step + 1} of {STEPS.length}</Text>
          </View>
          <Feather name="alert-triangle" size={22} color={colors.white} />
        </View>
      </SafeAreaView>

      <KeyboardAvoider>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <StepIndicator steps={STEPS} currentStep={step} />

          {step === 0 && (
            <>
              <SectionCard icon="layers" title="Category" subtitle="Where the risk originates from">
                <View style={styles.grid}>
                  {CATEGORIES.map(c => {
                    const selected = category === c.value;
                    return (
                      <TouchableOpacity
                        key={c.value}
                        style={[styles.tile, selected && styles.tileActive]}
                        onPress={() => setCategory(c.value)}
                        activeOpacity={0.75}
                      >
                        <Feather
                          name={c.icon}
                          size={20}
                          color={selected ? colors.warningDark : colors.textMuted}
                        />
                        <Text style={[styles.tileLabel, selected && styles.tileLabelActive]}>
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </SectionCard>

              <SectionCard icon="bar-chart-2" title="Type" subtitle="What kind of impact this risk could have">
                <View style={styles.chipRow}>
                  {TYPES.map(t => {
                    const selected = riskType === t.value;
                    return (
                      <TouchableOpacity
                        key={t.value}
                        style={[styles.chip, selected && styles.chipActive]}
                        onPress={() => setRiskType(t.value)}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                          {t.label}
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

          {step === 1 && (
            <>
              <SectionCard icon="edit-3" title="Risk detail">
                <FilledInput
                  label="Title"
                  required
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Loose handrail on tank platform"
                />
                <FilledInput
                  label="Description"
                  required
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What is the risk? Who/what is exposed?"
                  multiline
                  numberOfLines={4}
                />
              </SectionCard>

              <SectionCard icon="trending-up" title="Likelihood" subtitle="How likely is this to happen?">
                <Scale value={likelihood} onChange={setLikelihood} labels={LIKELIHOOD_LABELS} />
              </SectionCard>

              <SectionCard icon="alert-circle" title="Severity" subtitle="If it happens, how bad could it be?">
                <Scale value={severity} onChange={setSeverity} labels={SEVERITY_LABELS} />
              </SectionCard>

              {level && (
                <View style={[styles.scoreBox, { borderLeftColor: level.color, backgroundColor: level.color + '14' }]}>
                  <View>
                    <Text style={[styles.scoreLabel, { color: level.color }]}>{level.label} risk</Text>
                    <Text style={styles.scoreSub}>Inherent score {score} ({likelihood} × {severity})</Text>
                  </View>
                  <Feather
                    name={level.level === 'critical' || level.level === 'high' ? 'alert-octagon' : 'info'}
                    size={26}
                    color={level.color}
                  />
                </View>
              )}

              <SectionCard icon="map-pin" title="Location">
                <FilledInput
                  label="Location description"
                  value={locationDesc}
                  onChangeText={setLocationDesc}
                  placeholder="e.g. Block C, near gate 3"
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

              <SectionCard icon="shield" title="Existing controls (optional)">
                <FilledInput
                  label="What is already in place?"
                  value={existingControls}
                  onChangeText={setExistingControls}
                  placeholder="e.g. Warning sign present, area cordoned"
                  multiline
                  numberOfLines={3}
                />
              </SectionCard>

              <SectionCard icon="camera" title="Photos">
                <PhotoGrid
                  photos={imageCapture.images}
                  onAddPhoto={imageCapture.showPicker}
                  onRemovePhoto={imageCapture.removeImage}
                  maxPhotos={6}
                  label="Risk photos"
                />
              </SectionCard>
            </>
          )}

          <View style={{ height: spacing.xxl }} />
        </ScrollView>

        <BottomActionBar
          secondaryLabel={step === 0 ? 'Cancel' : 'Back'}
          secondaryIcon={step === 0 ? 'x' : 'arrow-left'}
          onSecondary={handleBack}
          primaryLabel={submitting ? 'Logging...' : (step === STEPS.length - 1 ? 'Log risk' : 'Next step')}
          primaryIcon={step === STEPS.length - 1 ? 'send' : 'arrow-right'}
          primaryColor="red"
          onPrimary={handleNext}
          disabled={submitting}
        />
      </KeyboardAvoider>
    </View>
  );
}

function Scale({ value, onChange, labels }) {
  return (
    <View style={styles.scaleRow}>
      {[1, 2, 3, 4, 5].map(n => {
        const selected = value === n;
        return (
          <TouchableOpacity
            key={n}
            style={styles.scaleCol}
            onPress={() => onChange(n)}
            activeOpacity={0.7}
          >
            <View style={[styles.scaleBtn, selected && styles.scaleBtnActive]}>
              <Text style={[styles.scaleNum, selected && styles.scaleNumActive]}>{n}</Text>
            </View>
            <Text
              style={[styles.scaleLabel, selected && styles.scaleLabelActive]}
              numberOfLines={2}
            >
              {labels[n - 1]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

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

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '31%', minWidth: 96, flexGrow: 1,
    alignItems: 'center', gap: 6,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  tileActive: { borderColor: colors.warning, backgroundColor: colors.warningBg },
  tileLabel: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', fontWeight: '500' },
  tileLabelActive: { color: colors.warningDark, fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: colors.white, fontWeight: '700' },

  scaleRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  scaleCol: { flex: 1, alignItems: 'center', gap: 4 },
  scaleBtn: {
    width: '100%', aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  scaleBtnActive: { borderColor: colors.warning, backgroundColor: colors.warningBg },
  scaleNum: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textMuted },
  scaleNumActive: { color: colors.warningDark },
  scaleLabel: {
    fontSize: 10, lineHeight: 12,
    color: colors.textMuted, textAlign: 'center',
    minHeight: 24,
  },
  scaleLabelActive: { color: colors.warningDark, fontWeight: '700' },

  scoreBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.base, borderRadius: radius.md, borderLeftWidth: 4,
    marginBottom: spacing.md,
  },
  scoreLabel: { fontSize: fontSize.lg, fontWeight: '700' },
  scoreSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  propertyList: { gap: spacing.xs },
  propertyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
  },
  propertyRowActive: { borderColor: colors.success, backgroundColor: colors.gpsBg },
  propertyText: { fontSize: fontSize.base, color: colors.text, fontWeight: '500' },

  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.base,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface, marginTop: spacing.xs,
    borderStyle: 'dashed',
  },
  gpsBtnCaptured: { borderColor: colors.success, backgroundColor: colors.gpsBg, borderStyle: 'solid' },
  gpsBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
});
