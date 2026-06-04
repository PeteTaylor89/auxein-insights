// screens/EditContractorProfileScreen.js — Edit contact + biosecurity fields.
// Both sections share /me/profile PATCH so they live on one screen.
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { contractorService } from '../api/services';
import { FilledInput, KeyboardAvoider, useToast } from '../components';

const CONTRACTOR_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
  { value: 'partnership', label: 'Partnership' },
];

// "comma, separated, values" <-> array helpers
const csvFromArray = (arr) => Array.isArray(arr) ? arr.join(', ') : '';
const arrayFromCsv = (csv) =>
  (csv || '').split(',').map(s => s.trim()).filter(Boolean);

export default function EditContractorProfileScreen({ route, navigation }) {
  const toast = useToast();
  const initial = route.params?.profile || {};

  const [businessName, setBusinessName] = useState(initial.business_name || '');
  const [businessNumber, setBusinessNumber] = useState(initial.business_number || '');
  const [contactPerson, setContactPerson] = useState(initial.contact_person || '');
  const [phone, setPhone] = useState(initial.phone || '');
  const [mobile, setMobile] = useState(initial.mobile || '');
  const [address, setAddress] = useState(initial.address || '');
  const [contractorType, setContractorType] = useState(initial.contractor_type || 'individual');
  const [specializations, setSpecializations] = useState(csvFromArray(initial.specializations));
  const [equipmentOwned, setEquipmentOwned] = useState(csvFromArray(initial.equipment_owned));

  const [hasCleaning, setHasCleaning] = useState(!!initial.has_cleaning_protocols);
  const [usesDisinfectants, setUsesDisinfectants] = useState(!!initial.uses_approved_disinfectants);
  const [cleaningKit, setCleaningKit] = useState(csvFromArray(initial.cleaning_equipment_owned));

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: 'Edit profile' });
  }, [navigation]);

  const save = async () => {
    if (!businessName.trim() || !contactPerson.trim() || !phone.trim()) {
      toast.show('Business name, contact person and phone are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const patch = {
        business_name: businessName.trim(),
        business_number: businessNumber.trim() || null,
        contact_person: contactPerson.trim(),
        phone: phone.trim(),
        mobile: mobile.trim() || null,
        address: address.trim() || null,
        contractor_type: contractorType,
        specializations: arrayFromCsv(specializations),
        equipment_owned: arrayFromCsv(equipmentOwned),
        has_cleaning_protocols: hasCleaning,
        uses_approved_disinfectants: usesDisinfectants,
        cleaning_equipment_owned: arrayFromCsv(cleaningKit),
      };
      await contractorService.updateMyProfile(patch);
      toast.show('Profile updated', 'success');
      navigation.goBack();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Could not save', 'error');
    } finally {
      setSaving(false);
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
        <SectionTitle>Contact details</SectionTitle>
        <FilledInput label="Business name" required value={businessName} onChangeText={setBusinessName} />
        <FilledInput label="Contact person" required value={contactPerson} onChangeText={setContactPerson} />
        <FilledInput label="Phone" required value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <FilledInput label="Mobile" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
        <FilledInput label="Address" value={address} onChangeText={setAddress} multiline numberOfLines={3} />
        <FilledInput label="Business number" value={businessNumber} onChangeText={setBusinessNumber} />

        <Text style={styles.subLabel}>Type</Text>
        <View style={styles.pillRow}>
          {CONTRACTOR_TYPES.map(t => (
            <TouchableOpacity
              key={t.value}
              style={[styles.pickerPill, contractorType === t.value && styles.pickerPillActive]}
              onPress={() => setContractorType(t.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pickerPillText, contractorType === t.value && styles.pickerPillTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FilledInput
          label="Specialties"
          value={specializations}
          onChangeText={setSpecializations}
          placeholder="pruning, spraying, harvesting"
        />
        <Text style={styles.helpText}>Separate items with commas.</Text>

        <FilledInput
          label="Equipment you bring"
          value={equipmentOwned}
          onChangeText={setEquipmentOwned}
          placeholder="tractor, sprayer, etc"
        />

        <SectionTitle style={{ marginTop: spacing.lg }}>Biosecurity</SectionTitle>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Cleaning protocols in place</Text>
            <Text style={styles.toggleHint}>Procedures for cleaning gear between sites.</Text>
          </View>
          <Switch
            value={hasCleaning}
            onValueChange={setHasCleaning}
            trackColor={{ false: colors.border, true: colors.primary + '88' }}
            thumbColor={hasCleaning ? colors.primary : colors.borderLight}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Use approved disinfectants</Text>
            <Text style={styles.toggleHint}>Industry-approved products only.</Text>
          </View>
          <Switch
            value={usesDisinfectants}
            onValueChange={setUsesDisinfectants}
            trackColor={{ false: colors.border, true: colors.primary + '88' }}
            thumbColor={usesDisinfectants ? colors.primary : colors.borderLight}
          />
        </View>

        <FilledInput
          label="Cleaning kit"
          value={cleaningKit}
          onChangeText={setCleaningKit}
          placeholder="pressure washer, disinfectant sprayer"
        />
        <Text style={styles.helpText}>Separate items with commas.</Text>
      </ScrollView>

      {/* Bottom action bar */}
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
            <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </KeyboardAvoider>
    </View>
  );
}

function SectionTitle({ children, style }) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },

  sectionTitle: {
    fontSize: fontSize.md, fontWeight: '700', color: colors.text,
    marginBottom: spacing.sm,
  },
  subLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 6, marginBottom: 6 },
  helpText: { fontSize: 11, color: colors.textMuted, marginTop: -8, marginBottom: 14 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  pickerPill: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  pickerPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pickerPillText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  pickerPillTextActive: { color: colors.white, fontWeight: '700' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  toggleLabel: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  toggleHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

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
