import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius } from '../styles/theme';

const SEVERITIES = [
  { value: 'minor', label: 'Minor', icon: '🟢' },
  { value: 'moderate', label: 'Moderate', icon: '🟡' },
  { value: 'serious', label: 'Serious', icon: '🔴' },
  { value: 'critical', label: 'Critical', icon: '⚫' },
  { value: 'fatal', label: 'Fatal', icon: '💀' },
];

export default function SeveritySelector({ value, onChange, options }) {
  const items = options || SEVERITIES;

  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.value}
          style={[styles.option, value === item.value && styles.optionSelected]}
          onPress={() => onChange(item.value)}
          activeOpacity={0.7}
        >
          <Text style={styles.icon}>{item.icon}</Text>
          <Text style={styles.text}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    flex: 1,
    minWidth: 80,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  optionSelected: {
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  icon: {
    fontSize: 20,
    marginBottom: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
