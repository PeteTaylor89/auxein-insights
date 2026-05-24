import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { riskService } from '../api/services';
import { colors, fontSize, radius, spacing } from '../styles/theme';

const LEVEL_TONE = {
  low:      { bg: colors.successBg, fg: colors.success      },
  medium:   { bg: colors.warningBg, fg: colors.warningDark  },
  high:     { bg: colors.dangerBg,  fg: colors.danger       },
  critical: { bg: colors.danger,    fg: colors.white        },
};

function currentLevel(risk) {
  return risk.residual_risk_level || risk.inherent_risk_level || 'medium';
}

export default function RiskHazardChips({
  blockId = null,
  spatialAreaId = null,
  propertyId = null,
  label = 'Hazards on site',
  variant = 'chips',  // 'chips' | 'banner'
}) {
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(false);

  const hasAnyFilter = blockId != null || spatialAreaId != null || propertyId != null;

  useEffect(() => {
    if (!hasAnyFilter) { setRisks([]); return; }
    let cancelled = false;
    setLoading(true);
    riskService.byLocation({ blockId, spatialAreaId, propertyId })
      .then((list) => {
        if (cancelled) return;
        const sorted = [...(list || [])].sort((a, b) => {
          const order = { critical: 0, high: 1, medium: 2, low: 3 };
          return (order[currentLevel(a)] ?? 9) - (order[currentLevel(b)] ?? 9);
        });
        setRisks(sorted);
      })
      .catch(() => { if (!cancelled) setRisks([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [blockId, spatialAreaId, propertyId]);

  if (!hasAnyFilter) return null;

  // Banner variant — single highlighted strip when ANY high/critical risk exists.
  // Used on ContractorTasksScreen.
  if (variant === 'banner') {
    if (loading || risks.length === 0) return null;
    const severe = risks.filter((r) => ['high', 'critical'].includes(currentLevel(r)));
    if (severe.length === 0) return null;
    return (
      <View style={styles.banner}>
        <Feather name="alert-triangle" size={16} color={colors.danger} />
        <Text style={styles.bannerText}>
          {severe.length === 1
            ? `Hazard on site: ${severe[0].risk_title}`
            : `${severe.length} hazards on site — ${severe.map((r) => r.risk_title).join(', ')}`}
        </Text>
      </View>
    );
  }

  // Chips variant — full row labelled
  if (loading) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        <ActivityIndicator size="small" color={colors.textMuted} />
      </View>
    );
  }
  if (risks.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Feather name="alert-triangle" size={12} color={colors.textMuted} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.chipsRow}>
        {risks.map((r) => {
          const lvl = currentLevel(r);
          const tone = LEVEL_TONE[lvl] || LEVEL_TONE.medium;
          return (
            <View
              key={r.id}
              style={[styles.chip, { backgroundColor: tone.bg }]}
            >
              <Text style={[styles.chipText, { color: tone.fg }]} numberOfLines={1}>
                {r.risk_title}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: spacing.sm,
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    padding: spacing.md,
    borderRadius: radius.md,
    marginVertical: spacing.sm,
  },
  bannerText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.dangerDark,
    fontWeight: '600',
  },
});
