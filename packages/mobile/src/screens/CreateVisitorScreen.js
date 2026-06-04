// screens/CreateVisitorScreen.js — 4-step visitor sign-in wizard.
// Mirrors the web visitor portal flow (packages/web/src/pages/VisitorRegistration.jsx)
// and posts to the same backend endpoint (POST /visitors/register?company_id=X).
// On success the visitor is registered, a visit row is created, and they're signed in
// automatically. Hosts get a notification via the backend service.
import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { visitorService } from '../api/services';
import {
  StepIndicator, FilledInput, SectionCard, BottomActionBar, KeyboardAvoider, useToast,
} from '../components';

const STEPS = ['Details', 'Emergency', 'H&S', 'Review'];

const PURPOSES = [
  { value: 'Meeting',     label: 'Business Meeting' },
  { value: 'Delivery',    label: 'Delivery / Pickup' },
  { value: 'Maintenance', label: 'Maintenance / Service' },
  { value: 'Inspection',  label: 'Inspection' },
  { value: 'Tour',        label: 'Site Tour' },
  { value: 'Other',       label: 'Other' },
];

const DURATIONS = [
  { value: '1',  label: '< 1 hour' },
  { value: '2',  label: '1–2 hours' },
  { value: '4',  label: '2–4 hours' },
  { value: '8',  label: 'Half day' },
  { value: '24', label: 'Full day' },
];

const PPE_ITEMS = [
  'Safety Helmet', 'Safety Glasses', 'Hi-Vis Vest',
  'Steel Cap Boots', 'Gloves', 'Hearing Protection',
];

export default function CreateVisitorScreen({ navigation }) {
  const { user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 — personal + visit purpose
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [purpose, setPurpose] = useState('');
  const [hostName, setHostName] = useState('');

  // Step 2 — emergency contact + vehicle + duration
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [driverLicense, setDriverLicense] = useState('');
  const [expectedDuration, setExpectedDuration] = useState('');

  // Step 3 — induction + PPE + safety
  const [inductionCompleted, setInductionCompleted] = useState(false);
  const [safetyBriefingAccepted, setSafetyBriefingAccepted] = useState(false);
  const [ppeRequired, setPpeRequired] = useState([]);

  const togglePpe = (item) => {
    setPpeRequired(prev => prev.includes(item) ? prev.filter(p => p !== item) : [...prev, item]);
  };

  // Per-field hints mirror the backend VisitorCreate rules. Only show once the
  // user has typed something — a pristine field stays quiet (the disabled
  // primary button + the "*" already signal that it's required).
  const errors = useMemo(() => ({
    firstName: firstName.trim() && firstName.trim().length < 2 ? 'At least 2 characters' : null,
    lastName: lastName.trim() && lastName.trim().length < 2 ? 'At least 2 characters' : null,
    phone: phone.trim() && phone.trim().length < 7 ? 'At least 7 digits' : null,
    email: email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Enter a valid email' : null,
    emergencyName: emergencyName.trim() && emergencyName.trim().length < 2 ? 'At least 2 characters' : null,
    emergencyPhone: emergencyPhone.trim() && emergencyPhone.trim().length < 7 ? 'At least 7 digits' : null,
  }), [firstName, lastName, phone, email, emergencyName, emergencyPhone]);

  const canAdvance = useMemo(() => {
    if (step === 0) {
      // Match backend VisitorCreate rules: names >= 2 chars, phone >= 7 chars,
      // valid email. Catches the visitor on this step instead of failing at submit.
      return firstName.trim().length >= 2 && lastName.trim().length >= 2
        && phone.trim().length >= 7 && /^\S+@\S+\.\S+$/.test(email.trim()) && purpose;
    }
    // Emergency phone is also validated server-side (>= 7 chars).
    if (step === 1) return emergencyName.trim().length >= 2 && emergencyPhone.trim().length >= 7;
    if (step === 2) return inductionCompleted && safetyBriefingAccepted;
    return true;
  }, [step, firstName, lastName, phone, email, purpose, emergencyName, emergencyPhone, inductionCompleted, safetyBriefingAccepted]);

  const handleNext = () => {
    if (!canAdvance) {
      toast.show('Fill required fields to continue', 'warning');
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
    else handleSubmit();
  };

  const handleBack = () => {
    if (step === 0) navigation.goBack();
    else setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!user?.company_id) {
      toast.show('Unable to determine your company. Try again or contact reception.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      // Field names match the web portal payload — backend service accepts a free-form dict
      // and maps these to Visitor + VisitorVisit fields.
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        company: company.trim(),
        position: position.trim(),
        emergencyName: emergencyName.trim(),
        emergencyPhone: emergencyPhone.trim(),
        vehicleReg: vehicleReg.trim().toUpperCase(),
        driverLicense: driverLicense.trim(),
        purpose,
        hostName: hostName.trim(),
        // Omit when unselected so the backend default (4h) applies — sending ''
        // makes the service's int('') call throw a validation error.
        ...(expectedDuration ? { expectedDuration } : {}),
        inductionCompleted,
        safetyBriefingAccepted,
        ppeRequired,
      };
      const result = await visitorService.registerPortal(payload, user.company_id);
      toast.show(`Signed in: ${result.visitor_name || `${firstName} ${lastName}`}`, 'success');
      navigation.goBack();
    } catch (err) {
      const msg = err.response?.data?.detail;
      toast.show(typeof msg === 'string' ? msg : 'Failed to sign visitor in', 'error');
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
            <Text style={styles.headerTitle}>Sign in visitor</Text>
            <Text style={styles.headerSub}>Step {step + 1} of {STEPS.length}</Text>
          </View>
          <Feather name="user-plus" size={22} color={colors.white} />
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
              <SectionCard icon="user" title="Visitor details" subtitle="Who's coming on site?">
                <View style={styles.row}>
                  <View style={styles.col}>
                    <FilledInput label="First name *" value={firstName} onChangeText={setFirstName} placeholder="First name" error={errors.firstName} />
                  </View>
                  <View style={styles.col}>
                    <FilledInput label="Last name *" value={lastName} onChangeText={setLastName} placeholder="Last name" error={errors.lastName} />
                  </View>
                </View>
                <FilledInput label="Phone *" value={phone} onChangeText={setPhone} placeholder="Mobile number" keyboardType="phone-pad" error={errors.phone} />
                <FilledInput label="Email *" value={email} onChangeText={setEmail} placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" error={errors.email} />
                <View style={styles.row}>
                  <View style={styles.col}>
                    <FilledInput label="Company" value={company} onChangeText={setCompany} placeholder="Company name" />
                  </View>
                  <View style={styles.col}>
                    <FilledInput label="Position" value={position} onChangeText={setPosition} placeholder="Job title" />
                  </View>
                </View>
              </SectionCard>

              <SectionCard icon="briefcase" title="Visit purpose" subtitle="Why are they here?">
                <View style={styles.chipGrid}>
                  {PURPOSES.map(p => {
                    const sel = purpose === p.value;
                    return (
                      <TouchableOpacity
                        key={p.value}
                        style={[styles.chip, sel && styles.chipActive]}
                        onPress={() => setPurpose(p.value)}
                      >
                        <Text style={[styles.chipText, sel && styles.chipTextActive]}>{p.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <FilledInput
                  label="Host (who they're visiting)"
                  value={hostName}
                  onChangeText={setHostName}
                  placeholder="Host name or department"
                />
              </SectionCard>
            </>
          )}

          {step === 1 && (
            <>
              <SectionCard icon="phone" title="Emergency contact" subtitle="In case something goes wrong">
                <FilledInput label="Contact name *" value={emergencyName} onChangeText={setEmergencyName} placeholder="Emergency contact name" error={errors.emergencyName} />
                <FilledInput label="Contact phone *" value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="Emergency contact phone" keyboardType="phone-pad" error={errors.emergencyPhone} />
              </SectionCard>

              <SectionCard icon="truck" title="Vehicle (optional)">
                <FilledInput
                  label="Vehicle registration"
                  value={vehicleReg}
                  onChangeText={(v) => setVehicleReg(v.toUpperCase())}
                  placeholder="License plate"
                  autoCapitalize="characters"
                />
                <FilledInput label="Driver license" value={driverLicense} onChangeText={setDriverLicense} placeholder="License number" />
              </SectionCard>

              <SectionCard icon="clock" title="Expected duration">
                <View style={styles.chipGrid}>
                  {DURATIONS.map(d => {
                    const sel = expectedDuration === d.value;
                    return (
                      <TouchableOpacity
                        key={d.value}
                        style={[styles.chip, sel && styles.chipActive]}
                        onPress={() => setExpectedDuration(d.value)}
                      >
                        <Text style={[styles.chipText, sel && styles.chipTextActive]}>{d.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </SectionCard>
            </>
          )}

          {step === 2 && (
            <>
              <SectionCard icon="check-circle" title="Site induction" subtitle="Required before entry">
                <Text style={styles.helperText}>
                  Confirm the visitor has been given a verbal site induction by a staff member.
                </Text>
                <TouchableOpacity
                  style={[styles.confirmBtn, inductionCompleted && styles.confirmBtnActive]}
                  onPress={() => setInductionCompleted(!inductionCompleted)}
                  activeOpacity={0.75}
                >
                  <Feather
                    name={inductionCompleted ? 'check-square' : 'square'}
                    size={20}
                    color={inductionCompleted ? colors.success : colors.textMuted}
                  />
                  <Text style={[styles.confirmText, inductionCompleted && styles.confirmTextActive]}>
                    Visitor has received a site induction
                  </Text>
                </TouchableOpacity>
              </SectionCard>

              <SectionCard icon="shield" title="PPE issued" subtitle="Tick anything they're wearing">
                <View style={styles.ppeGrid}>
                  {PPE_ITEMS.map(item => {
                    const sel = ppeRequired.includes(item);
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.ppeChip, sel && styles.ppeChipActive]}
                        onPress={() => togglePpe(item)}
                      >
                        <Feather
                          name={sel ? 'check' : 'plus'}
                          size={12}
                          color={sel ? colors.white : colors.textMuted}
                        />
                        <Text style={[styles.ppeText, sel && styles.ppeTextActive]}>{item}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </SectionCard>

              <SectionCard icon="alert-triangle" title="Safety briefing">
                <TouchableOpacity
                  style={[styles.confirmBtn, safetyBriefingAccepted && styles.confirmBtnActive]}
                  onPress={() => setSafetyBriefingAccepted(!safetyBriefingAccepted)}
                  activeOpacity={0.75}
                >
                  <Feather
                    name={safetyBriefingAccepted ? 'check-square' : 'square'}
                    size={20}
                    color={safetyBriefingAccepted ? colors.success : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.confirmText, safetyBriefingAccepted && styles.confirmTextActive]}>
                      Visitor accepts safety requirements
                    </Text>
                    <Text style={styles.confirmHint}>
                      Will follow all safety protocols and wear required PPE while on site.
                    </Text>
                  </View>
                </TouchableOpacity>
              </SectionCard>
            </>
          )}

          {step === 3 && (
            <>
              <SectionCard icon="clipboard" title="Review">
                <ReviewRow label="Name" value={`${firstName} ${lastName}`.trim() || '—'} />
                <ReviewRow label="Phone" value={phone || '—'} />
                <ReviewRow label="Email" value={email || '—'} />
                <ReviewRow label="Company" value={company || 'Not specified'} />
                <ReviewRow label="Purpose" value={purpose || '—'} />
                <ReviewRow label="Host" value={hostName || 'Not specified'} />
                <ReviewRow label="Vehicle" value={vehicleReg || 'Not specified'} />
                <ReviewRow label="Duration" value={expectedDuration ? `${expectedDuration} hour(s)` : 'Not specified'} />
                <ReviewRow label="Emergency" value={`${emergencyName} · ${emergencyPhone}`} />
                <ReviewRow label="PPE" value={ppeRequired.length ? ppeRequired.join(', ') : 'None'} />
              </SectionCard>

              <View style={styles.alertBox}>
                <Feather name="info" size={16} color={colors.primary} />
                <Text style={styles.alertText}>
                  Submitting will sign the visitor in immediately and notify their host.
                  Remember to sign them out when they leave.
                </Text>
              </View>
            </>
          )}

          <View style={{ height: spacing.xxl }} />
        </ScrollView>

        <BottomActionBar
          secondaryLabel={step === 0 ? 'Cancel' : 'Back'}
          secondaryIcon={step === 0 ? 'x' : 'arrow-left'}
          onSecondary={handleBack}
          primaryLabel={submitting ? 'Signing in...' : (step === STEPS.length - 1 ? 'Sign in' : 'Next')}
          primaryIcon={step === STEPS.length - 1 ? 'check' : 'arrow-right'}
          primaryColor="primary"
          onPrimary={handleNext}
          disabled={submitting}
        />
      </KeyboardAvoider>
    </View>
  );
}

function ReviewRow({ label, value }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  headerSafe: { backgroundColor: colors.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.primary,
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

  row: { flexDirection: 'row', gap: spacing.sm },
  col: { flex: 1 },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '14' },
  chipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: colors.primary, fontWeight: '700' },

  helperText: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 18 },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.base,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  confirmBtnActive: { borderColor: colors.success, backgroundColor: colors.gpsBg },
  confirmText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600', flex: 1 },
  confirmTextActive: { color: colors.success },
  confirmHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4, lineHeight: 16 },

  ppeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ppeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ppeChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  ppeText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '500' },
  ppeTextActive: { color: colors.white, fontWeight: '700' },

  reviewRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight,
    gap: spacing.md,
  },
  reviewLabel: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  reviewValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600', flex: 1, textAlign: 'right' },

  alertBox: {
    flexDirection: 'row', gap: spacing.sm,
    backgroundColor: colors.primary + '12', borderRadius: radius.md,
    padding: spacing.md, marginTop: spacing.sm,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  alertText: { flex: 1, fontSize: fontSize.xs, color: colors.text, fontWeight: '500', lineHeight: 16 },
});
