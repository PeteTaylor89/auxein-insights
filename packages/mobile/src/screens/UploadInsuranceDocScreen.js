// screens/UploadInsuranceDocScreen.js — Pick an insurance certificate (PDF/image),
// pick a policy type + optional expiry, upload to /me/insurance/docs.
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { contractorService } from '../api/services';
import { useToast } from '../components';

const POLICY_OPTIONS = [
  { value: 'public_liability', label: 'Public liability' },
  { value: 'professional_indemnity', label: 'Professional indemnity' },
  { value: 'workers_comp', label: 'Workers comp' },
  { value: 'equipment_insurance', label: 'Equipment' },
  { value: 'vehicle_insurance', label: 'Vehicle' },
  { value: 'other', label: 'Other' },
];

const formatBytes = (b) => {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

const formatDate = (d) =>
  d ? d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No expiry';

const toIsoDate = (d) => d ? d.toISOString().slice(0, 10) : null;

export default function UploadInsuranceDocScreen({ route, navigation }) {
  const toast = useToast();
  const initialPolicy = route.params?.policyType || 'public_liability';
  const [policyType, setPolicyType] = useState(initialPolicy);
  const [doc, setDoc] = useState(null); // { uri, name, mimeType, size }
  const [expiry, setExpiry] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: 'Add insurance document' });
  }, [navigation]);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      setDoc({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || 'application/octet-stream',
        size: asset.size,
      });
    } catch (err) {
      console.log('Document pick failed:', err.message);
      toast.show('Could not open document picker', 'error');
    }
  };

  const onDateChange = (_, selected) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selected) setExpiry(selected);
  };

  const upload = async () => {
    if (!doc) {
      toast.show('Pick a document first', 'error');
      return;
    }
    setUploading(true);
    try {
      await contractorService.uploadMyInsuranceDoc({
        uri: doc.uri,
        name: doc.name,
        mime: doc.mimeType,
        policy_type: policyType,
        expires_at: toIsoDate(expiry),
      });
      toast.show('Document uploaded', 'success');
      navigation.goBack();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Upload failed', 'error');
    } finally {
      setUploading(false);
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
        {/* Document picker */}
        <Text style={styles.label}>Document</Text>
        {doc ? (
          <View style={styles.docCard}>
            <View style={styles.docIcon}>
              <Feather
                name={doc.mimeType?.startsWith('image/') ? 'image' : 'file-text'}
                size={20}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
              <Text style={styles.docMeta}>{formatBytes(doc.size)}</Text>
            </View>
            <TouchableOpacity onPress={pickDocument} hitSlop={8}>
              <Text style={styles.replaceText}>Replace</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.pickBtn} onPress={pickDocument} activeOpacity={0.7}>
            <Feather name="upload" size={20} color={colors.primary} />
            <Text style={styles.pickBtnText}>Choose PDF or image</Text>
          </TouchableOpacity>
        )}

        {/* Policy type */}
        <Text style={[styles.label, { marginTop: spacing.lg }]}>Policy</Text>
        <View style={styles.pillRow}>
          {POLICY_OPTIONS.map(p => (
            <TouchableOpacity
              key={p.value}
              style={[styles.pickerPill, policyType === p.value && styles.pickerPillActive]}
              onPress={() => setPolicyType(p.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pickerPillText, policyType === p.value && styles.pickerPillTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Expiry (optional) */}
        <Text style={[styles.label, { marginTop: spacing.lg }]}>Expiry (optional)</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
          <Feather name="calendar" size={16} color={colors.primary} />
          <Text style={styles.dateText}>{formatDate(expiry)}</Text>
          {expiry && (
            <TouchableOpacity onPress={() => setExpiry(null)} hitSlop={8}>
              <Feather name="x" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={expiry || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
            minimumDate={new Date()}
          />
        )}

        <Text style={styles.helpText}>
          Set the expiry date to get reminders before the certificate runs out.
        </Text>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.barWrap}>
        <View style={styles.bar}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.goBack()}
            disabled={uploading}
          >
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, (!doc || uploading) && styles.primaryBtnDisabled]}
            onPress={upload}
            disabled={!doc || uploading}
            activeOpacity={0.85}
          >
            <Feather name={uploading ? 'loader' : 'upload'} size={16} color={colors.white} />
            <Text style={styles.primaryBtnText}>{uploading ? 'Uploading…' : 'Upload'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },

  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  helpText: { fontSize: 11, color: colors.textMuted, marginTop: 6 },

  pickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed',
  },
  pickBtnText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.base },

  docCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  docIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  docName: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  docMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  replaceText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickerPill: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  pickerPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pickerPillText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  pickerPillTextActive: { color: colors.white, fontWeight: '700' },

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
