import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius } from '../styles/theme';

const SEVERITIES = [
  { value: 'minor',    label: 'Minor',    color: '#22c55e' },
  { value: 'moderate', label: 'Moderate', color: '#f59e0b' },
  { value: 'serious',  label: 'Serious',  color: '#ef4444' },
  { value: 'critical', label: 'Critical', color: '#991b1b' },
  { value: 'fatal',    label: 'Fatal',    color: '#1f2937' },
];

export default function SeveritySelector({ value, onChange, options }) {
  const items = options || SEVERITIES;

  return (
    <View style={styles.grid}>
      {items.map((item) => {
        const selected = value === item.value;
        return (
          <TouchableOpacity
            key={item.value}
            style={[
              styles.option,
              selected && { borderColor: item.color, backgroundColor: item.color + '14' },
            ]}
            onPress={() => onChange(item.value)}
            activeOpacity={0.75}
          >
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={[styles.text, selected && { color: item.color, fontWeight: '700' }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flex: 1, minWidth: 80,
    paddingVertical: 10, paddingHorizontal: 8,
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, alignItems: 'center',
    backgroundColor: colors.surface, gap: 4,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  text: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
});
