// screens/ChangeContractorPasswordScreen.js — Contractor self-service password change.
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { contractorService } from '../api/services';
import { FilledInput, KeyboardAvoider, useToast } from '../components';

// Mirrors backend is_password_strong rules so the user gets immediate feedback.
const checkStrength = (pw) => {
  const issues = [];
  if (pw.length < 8) issues.push('At least 8 characters');
  if (!/[a-z]/.test(pw)) issues.push('A lowercase letter');
  if (!/[A-Z]/.test(pw)) issues.push('An uppercase letter');
  if (!/\d/.test(pw)) issues.push('A number');
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(pw)) issues.push('A special character');
  return issues;
};

export default function ChangeContractorPasswordScreen({ navigation }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: 'Change password' });
  }, [navigation]);

  const issues = next ? checkStrength(next) : [];
  const mismatch = next && confirm && next !== confirm;

  const save = async () => {
    if (!current || !next || !confirm) {
      toast.show('Fill in all three fields', 'error');
      return;
    }
    if (issues.length > 0) {
      toast.show('Password does not meet the requirements', 'error');
      return;
    }
    if (mismatch) {
      toast.show('New password and confirmation do not match', 'error');
      return;
    }
    setSaving(true);
    try {
      await contractorService.changeMyPassword(current, next);
      toast.show('Password updated', 'success');
      navigation.goBack();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.show(typeof detail === 'string' ? detail : 'Could not change password', 'error');
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
        <FilledInput
          label="Current password"
          required
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FilledInput
          label="New password"
          required
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FilledInput
          label="Confirm new password"
          required
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Live requirements */}
        <View style={styles.requirements}>
          <Text style={styles.requirementsTitle}>Your new password needs:</Text>
          {checkStrength(next).length === 0 && next ? (
            <View style={styles.reqRow}>
              <Feather name="check-circle" size={14} color={colors.success} />
              <Text style={[styles.reqText, { color: colors.success }]}>All checks passed</Text>
            </View>
          ) : (
            [
              'At least 8 characters',
              'A lowercase letter',
              'An uppercase letter',
              'A number',
              'A special character',
            ].map(rule => {
              const passed = next && !checkStrength(next).includes(rule);
              return (
                <View key={rule} style={styles.reqRow}>
                  <Feather
                    name={passed ? 'check-circle' : 'circle'}
                    size={14}
                    color={passed ? colors.success : colors.textMuted}
                  />
                  <Text style={[styles.reqText, passed && { color: colors.text }]}>{rule}</Text>
                </View>
              );
            })
          )}
          {mismatch && (
            <View style={styles.reqRow}>
              <Feather name="alert-triangle" size={14} color={colors.warning} />
              <Text style={[styles.reqText, { color: colors.warning }]}>Confirmation does not match</Text>
            </View>
          )}
        </View>

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
            <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Update password'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </KeyboardAvoider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },

  requirements: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.base,
    borderWidth: 1, borderColor: colors.border,
    marginTop: 4,
  },
  requirementsTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  reqText: { fontSize: fontSize.xs, color: colors.textMuted },

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
