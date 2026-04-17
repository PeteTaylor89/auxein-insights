import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows } from '../styles/theme';

export default function StepIndicator({ steps, currentStep }) {
  return (
    <View style={styles.container}>
      {steps.map((step, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;
        const isPending = i > currentStep;

        return (
          <View key={i} style={styles.stepRow}>
            {i > 0 && (
              <View style={[styles.line, isCompleted && styles.lineCompleted]} />
            )}
            <View style={styles.step}>
              <View style={[
                styles.circle,
                isCompleted && styles.circleCompleted,
                isActive && styles.circleActive,
                isPending && styles.circlePending,
              ]}>
                {isCompleted ? (
                  <Feather name="check" size={14} color={colors.white} />
                ) : (
                  <Text style={[
                    styles.circleText,
                    isActive && styles.circleTextActive,
                    isPending && styles.circleTextPending,
                  ]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[
                styles.label,
                isActive && styles.labelActive,
              ]}>{step}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    ...shadows.card,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  step: {
    alignItems: 'center',
    gap: 4,
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 8,
    marginBottom: 16,
  },
  lineCompleted: {
    backgroundColor: colors.success,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleCompleted: {
    backgroundColor: colors.success,
  },
  circleActive: {
    backgroundColor: colors.danger,
  },
  circlePending: {
    backgroundColor: colors.border,
  },
  circleText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  circleTextActive: {
    color: colors.white,
  },
  circleTextPending: {
    color: colors.textMuted,
  },
  label: {
    fontSize: 9,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  labelActive: {
    color: colors.danger,
    fontWeight: '600',
  },
});
