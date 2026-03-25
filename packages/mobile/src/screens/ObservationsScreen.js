// screens/ObservationsScreen.js — Observation entry point (placeholder for M3)
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, spacing, fontSize, radius } from '../styles/theme';

const OBS_CATEGORIES = [
  { key: 'quick', icon: '⚡', label: 'Quick Check', desc: 'Free-form, Pests & Diseases, Vine Health' },
  { key: 'phenology', icon: '🍇', label: 'Phenology & Growth', desc: 'EL Stages, Bud Count, Growth/Canopy' },
  { key: 'yield', icon: '📊', label: 'Yield', desc: 'Flower Count, Bunch Count, Estimation' },
  { key: 'lab', icon: '🧪', label: 'Lab & Sampling', desc: 'On-Site Lab, External Lab' },
  { key: 'environment', icon: '🌿', label: 'Environment', desc: 'Land Management, Frost, Biosecurity' },
];

export default function ObservationsScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Observations</Text>
        <Text style={styles.subtitle}>Capture vineyard data in the field</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Start an Observation</Text>
        {OBS_CATEGORIES.map(cat => (
          <TouchableOpacity key={cat.key} style={styles.card}>
            <Text style={styles.cardIcon}>{cat.icon}</Text>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{cat.label}</Text>
              <Text style={styles.cardDesc}>{cat.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>Full Observation Capture</Text>
        <Text style={styles.placeholderText}>
          Template selection, block picker, spot capture with GPS + camera, and offline queue will be built in Phase M3.
        </Text>
      </View>

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  header: { padding: spacing.lg, paddingTop: spacing.xl, backgroundColor: colors.primary },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.white },
  subtitle: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: spacing.xs },
  section: { padding: spacing.base },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, marginBottom: spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cardIcon: { fontSize: 28 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: fontSize.base, fontWeight: '500', color: colors.text },
  cardDesc: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  placeholder: {
    margin: spacing.base, backgroundColor: colors.surfaceWarm,
    borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.oliveBorder, borderStyle: 'dashed',
    alignItems: 'center',
  },
  placeholderTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.primary, marginBottom: spacing.xs },
  placeholderText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
