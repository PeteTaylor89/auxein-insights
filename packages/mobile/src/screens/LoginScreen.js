// screens/LoginScreen.js — Mobile login
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';

const LOGO_MARK = require('../../assets/brand/logo-mark.png');
const LOGO_FULL = require('../../assets/brand/logo-full.png');

export default function LoginScreen() {
  const { login, loading, error } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(null);

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) return;
    try {
      await login(identifier.trim(), password);
    } catch {}
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logoMark}>
            <Image source={LOGO_MARK} style={styles.logoMarkImg} resizeMode="contain" />
          </View>
          <Text style={styles.brand}>Auxein Grow</Text>
          <Text style={styles.tagline}>Vineyard operations, in the field.</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.welcome}>Welcome back</Text>
          <Text style={styles.welcomeSub}>Sign in to continue</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <Text style={styles.label}>Username or Email</Text>
            <View style={[
              styles.inputWrap,
              focused === 'id' && styles.inputWrapFocus,
              !!identifier && styles.inputWrapFilled,
            ]}>
              <Feather name="user" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="name@email.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onFocus={() => setFocused('id')}
                onBlur={() => setFocused(null)}
              />
            </View>

            <Text style={styles.label}>Password</Text>
            <View style={[
              styles.inputWrap,
              focused === 'pw' && styles.inputWrapFocus,
              !!password && styles.inputWrapFilled,
            ]}>
              <Feather name="lock" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                onFocus={() => setFocused('pw')}
                onBlur={() => setFocused(null)}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Text style={styles.buttonText}>Sign in</Text>
                  <Feather name="arrow-right" size={18} color={colors.white} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footer}>© Auxein · NZ vineyard management</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },

  // Hero
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  logoMark: {
    width: 96, height: 96, borderRadius: radius.xl,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.base,
    padding: 10,
    ...shadows.elevated,
  },
  logoMarkImg: { width: '100%', height: '100%' },
  brand: { color: colors.white, fontSize: fontSize.xxl, fontWeight: '700', letterSpacing: 0.3 },
  tagline: { color: 'rgba(255,255,255,0.78)', fontSize: fontSize.sm, marginTop: spacing.xs },

  // Card
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadows.elevated,
  },
  welcome: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  welcomeSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.dangerBg, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.dangerBorder,
  },
  errorText: { color: colors.danger, fontSize: fontSize.sm, flex: 1, fontWeight: '500' },

  form: { gap: spacing.sm },
  label: {
    fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary,
    marginTop: spacing.sm, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: Platform.OS === 'ios' ? 14 : 4,
    backgroundColor: colors.white,
  },
  inputWrapFocus: { borderColor: colors.primary },
  inputWrapFilled: { borderColor: colors.gpsBorder, backgroundColor: colors.gpsBg },
  input: { flex: 1, fontSize: fontSize.md, color: colors.text, paddingVertical: Platform.OS === 'android' ? 10 : 0 },

  button: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.base, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: spacing.sm,
    marginTop: spacing.lg, ...shadows.card,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },

  footer: {
    color: 'rgba(255,255,255,0.6)', fontSize: fontSize.xs,
    textAlign: 'center', marginTop: spacing.xl,
  },
});
