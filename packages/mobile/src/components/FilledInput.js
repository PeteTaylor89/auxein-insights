import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius } from '../styles/theme';

export default function FilledInput({ label, required, value, onChangeText, placeholder, multiline, numberOfLines, keyboardType, editable = true, style, secureTextEntry, autoCapitalize, autoCorrect, error }) {
  const isFilled = value != null && String(value).trim().length > 0;

  return (
    <View style={[styles.group, style]}>
      {label && (
        <Text style={styles.label}>
          {label}{required && <Text style={styles.required}> *</Text>}
        </Text>
      )}
      <TextInput
        style={[
          styles.input,
          isFilled && styles.inputFilled,
          error && styles.inputError,
          multiline && styles.inputMultiline,
          !editable && styles.inputDisabled,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        numberOfLines={numberOfLines}
        keyboardType={keyboardType}
        editable={editable}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  required: {
    color: colors.danger,
  },
  input: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    fontSize: fontSize.base,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  inputFilled: {
    borderColor: colors.successLight,
    backgroundColor: '#f0fdf4',
  },
  inputError: {
    borderColor: colors.danger,
    backgroundColor: '#fef2f2',
  },
  errorText: {
    fontSize: 11,
    color: colors.danger,
    marginTop: 4,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputDisabled: {
    backgroundColor: colors.borderLight,
    color: colors.textMuted,
  },
});
