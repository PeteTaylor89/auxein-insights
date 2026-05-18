// screens/RelationshipsScreen.js — Contractor's list of company relationships.
// User-facing label is "Contracts" (set on the tab options); internal route +
// data model use the canonical "Relationship" naming.
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { contractorService } from '../api/services';
import { SkeletonCard, useToast } from '../components';

const STATUS_STYLES = {
  active:     { bg: colors.success + '18', fg: colors.success, label: 'Active' },
  suspended:  { bg: colors.warning + '18', fg: colors.warning, label: 'Suspended' },
  inactive:   { bg: colors.textMuted + '18', fg: colors.textMuted, label: 'Inactive' },
  terminated: { bg: colors.danger + '18',  fg: colors.danger,  label: 'Terminated' },
  pending:    { bg: colors.info + '18',    fg: colors.info,    label: 'Pending' },
};

const formatRate = (rel) => {
  if (rel.hourly_rate) return `${rel.currency || 'NZD'} $${rel.hourly_rate.toFixed(2)}/hr`;
  if (rel.daily_rate) return `${rel.currency || 'NZD'} $${rel.daily_rate.toFixed(2)}/day`;
  return 'Rate not set';
};

const formatLastWorked = (iso) => {
  if (!iso) return 'No work logged yet';
  const d = new Date(iso);
  const today = new Date();
  const diffDays = Math.floor((today - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Worked today';
  if (diffDays === 1) return 'Worked yesterday';
  if (diffDays < 7) return `Worked ${diffDays}d ago`;
  if (diffDays < 30) return `Worked ${Math.floor(diffDays / 7)}w ago`;
  return `Last worked ${d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}`;
};

const formatContractEnd = (iso) => {
  if (!iso) return null;
  return `Contract ends ${new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`;
};

export default function RelationshipsScreen({ navigation }) {
  const toast = useToast();
  const [rels, setRels] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await contractorService.listMyRelationships();
      setRels(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log('Relationships load failed:', err.message);
      toast.show('Could not load contracts', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />
        }
      >
        {loading && rels.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : rels.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="briefcase" size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No contracts yet</Text>
            <Text style={styles.emptyBody}>
              When a company engages you, the contract will appear here with your rates, contract dates and permitted blocks.
            </Text>
          </View>
        ) : (
          rels.map(rel => <RelCard key={rel.id} rel={rel} navigation={navigation} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RelCard({ rel, navigation }) {
  const statusStyle = STATUS_STYLES[rel.status] || STATUS_STYLES.inactive;
  const contractEnd = formatContractEnd(rel.contract_end);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('RelationshipDetail', {
        relationshipId: rel.id,
        companyName: rel.company_name,
      })}
      activeOpacity={0.85}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            {rel.is_preferred && (
              <Feather name="star" size={14} color={colors.warning} style={{ marginRight: 4 }} />
            )}
            <Text style={styles.companyName} numberOfLines={1}>{rel.company_name}</Text>
          </View>
          <Text style={styles.rate}>{formatRate(rel)}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.fg }]}>{statusStyle.label}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Feather name="clock" size={12} color={colors.textMuted} />
        <Text style={styles.metaText}>{formatLastWorked(rel.last_worked_date)}</Text>
        {rel.jobs_completed_for_company > 0 && (
          <Text style={styles.metaText}>
            · {rel.jobs_completed_for_company} job{rel.jobs_completed_for_company !== 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {contractEnd && (
        <View style={styles.metaRow}>
          <Feather name="calendar" size={12} color={colors.textMuted} />
          <Text style={styles.metaText}>{contractEnd}</Text>
        </View>
      )}

      {!rel.has_required_training && rel.required_training_modules?.length > 0 && (
        <View style={styles.warningRow}>
          <Feather name="alert-triangle" size={12} color={colors.warning} />
          <Text style={styles.warningText}>Training outstanding</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing.xl },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  companyName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, flexShrink: 1 },
  rate: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },

  statusPill: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: '600' },

  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: spacing.sm,
  },
  metaText: { fontSize: fontSize.xs, color: colors.textMuted },

  warningRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  warningText: { fontSize: fontSize.xs, color: colors.warning, fontWeight: '600' },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
  },
  emptyBody: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
