// screens/ObservationsScreen.js — Observation hub: quick obs, active runs, planned obs
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, FlatList, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { observationService, blocksService } from '../api/services';

// Template categories for quick observation
const TEMPLATE_CATEGORIES = [
  { key: 'phenology', icon: '🍇', label: 'Phenology & Growth', types: ['phenology', 'growth', 'bud_count'] },
  { key: 'disease', icon: '🦠', label: 'Pests & Disease', types: ['pest_disease', 'disease', 'pest', 'beneficials', 'nutrient_health'] },
  { key: 'yield', icon: '📊', label: 'Yield & Sampling', types: ['flower_set', 'bunch_count', 'pre_veraison_yield', 'post_veraison_yield', 'maturity_sampling', 'lab_sampling_pre_winery'] },
  { key: 'environment', icon: '🌿', label: 'Environment', types: ['soil_groundcover', 'land_management', 'frost_event', 'weather', 'irrigation_check', 'biosecurity'] },
  { key: 'other', icon: '📝', label: 'Field Note & Other', types: ['other', 'compliance', 'hazard', 'maintenance'] },
];

export default function ObservationsScreen({ navigation }) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [plans, setPlans] = useState([]);
  const [activeRuns, setActiveRuns] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Quick obs flow state
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tpl, pln, runs, blk] = await Promise.all([
        observationService.getTemplates().catch(() => []),
        observationService.getPlans({ status_in: 'scheduled,in_progress' }).catch(() => []),
        observationService.listRuns({ active_only: true }).catch(() => []),
        blocksService.getCompanyBlocks().catch(() => []),
      ]);
      setTemplates(Array.isArray(tpl) ? tpl : []);
      setPlans(Array.isArray(pln) ? pln : []);
      setActiveRuns(Array.isArray(runs) ? runs : []);
      setBlocks(Array.isArray(blk) ? blk : []);
    } catch (err) {
      console.log('Failed to load observation data:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload on screen focus (so resuming from SpotCapture refreshes the list)
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // --- Quick Field Note (ad-hoc, no template selection) ---

  const handleQuickFieldNote = () => {
    const freeForm = templates.find(t => getType(t) === 'other' && /free.?form/i.test(t.name));
    if (freeForm) {
      // Skip template picker — go straight to block picker
      setSelectedTemplate(freeForm);
      setShowBlockPicker(true);
    } else {
      // Fallback: open the Other category
      const otherCat = TEMPLATE_CATEGORIES.find(c => c.key === 'other');
      if (otherCat) handleCategoryPress(otherCat);
    }
  };

  // --- Quick Observation Flow ---

  const handleCategoryPress = (cat) => {
    setSelectedCategory(cat);
    setShowTemplatePicker(true);
  };

  // Template type comes as "type" or "observation_type" depending on serialization
  const getType = (t) => t.type || t.observation_type || '';

  const categoryTemplates = selectedCategory
    ? templates.filter(t => selectedCategory.types.includes(getType(t)))
    : [];

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setShowTemplatePicker(false);
    setShowBlockPicker(true);
  };

  const handleBlockSelect = (block) => {
    setShowBlockPicker(false);
    // Navigate to spot capture — run creation is deferred until first spot save
    navigation.navigate('SpotCapture', {
      templateId: selectedTemplate.id,
      blockId: block.id,
      blockName: block.block_name || block.name,
      templateName: selectedTemplate.name,
      companyId: user?.company_id,
    });
  };

  // --- Resume active run ---

  const handleResumeRun = (run) => {
    navigation.navigate('SpotCapture', {
      runId: run.id,
      templateId: run.template_id,
      blockId: run.block_id,
      blockName: run.block_name || '',
      templateName: run.template_name || run.name || 'Observation',
      companyId: user?.company_id,
    });
  };

  // --- Planned Observation Flow ---

  const handleStartPlan = (plan) => {
    const blockId = plan.targets?.length === 1 ? plan.targets[0].block_id : null;
    // Navigate to spot capture — run creation is deferred until first spot save
    navigation.navigate('SpotCapture', {
      templateId: plan.template_id,
      planId: plan.id,
      blockId: blockId,
      blockName: plan.targets?.[0]?.block_name,
      templateName: plan.template_name || plan.name,
      planName: plan.name,
      companyId: user?.company_id,
    });
  };

  const priorityColor = (p) => {
    if (p === 'high') return colors.danger;
    if (p === 'normal') return colors.warning;
    return colors.textMuted;
  };

  const timeAgo = (isoDate) => {
    if (!isoDate) return '';
    const mins = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor={colors.primary} />}
    >
      {/* Active Runs — shown first so they're immediately visible */}
      {activeRuns.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>In Progress</Text>
          <Text style={styles.sectionSub}>Tap to resume capturing spots</Text>
          {activeRuns.map(run => (
            <TouchableOpacity key={run.id} style={styles.activeRunCard} onPress={() => handleResumeRun(run)}>
              <View style={styles.activeRunHeader}>
                <View style={styles.activeRunDot} />
                <Text style={styles.activeRunName} numberOfLines={1}>{run.template_name || run.name}</Text>
              </View>
              <Text style={styles.activeRunMeta}>
                {run.block_name || 'No block'}
                {run.spots_count != null ? ` · ${run.spots_count} spot${run.spots_count !== 1 ? 's' : ''}` : ''}
                {run.observed_at_start ? ` · ${timeAgo(run.observed_at_start)}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Quick Field Note */}
      <TouchableOpacity style={styles.fieldNoteBtn} onPress={handleQuickFieldNote}>
        <Text style={styles.fieldNoteIcon}>📋</Text>
        <View style={styles.fieldNoteLabelWrap}>
          <Text style={styles.fieldNoteLabel}>Quick Field Note</Text>
          <Text style={styles.fieldNoteSub}>Photo, notes & GPS — no template needed</Text>
        </View>
        <Text style={styles.fieldNoteChevron}>›</Text>
      </TouchableOpacity>

      {/* Quick Observation */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Observation</Text>
        <Text style={styles.sectionSub}>Pick a category, select a template, choose a block</Text>
        <View style={styles.categoryGrid}>
          {TEMPLATE_CATEGORIES.map(cat => {
            const count = templates.filter(t => cat.types.includes(getType(t))).length;
            return (
              <TouchableOpacity
                key={cat.key}
                style={styles.categoryCard}
                onPress={() => handleCategoryPress(cat)}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text style={styles.categoryLabel}>{cat.label}</Text>
                <Text style={styles.categoryCount}>{count} templates</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Planned Observations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Planned Observations</Text>
        {plans.length === 0 ? (
          <Text style={styles.emptyText}>No observation plans scheduled</Text>
        ) : (
          plans.map(plan => (
            <TouchableOpacity key={plan.id} style={styles.planCard} onPress={() => handleStartPlan(plan)}>
              <View style={styles.planHeader}>
                <Text style={styles.planName} numberOfLines={1}>{plan.name}</Text>
                {plan.priority && (
                  <Text style={[styles.planPriority, { color: priorityColor(plan.priority) }]}>
                    {plan.priority}
                  </Text>
                )}
              </View>
              <Text style={styles.planMeta}>
                {plan.template_name || 'Template'}
                {plan.targets?.length ? ` · ${plan.targets.length} target${plan.targets.length > 1 ? 's' : ''}` : ''}
                {plan.runs_count ? ` · ${plan.runs_count} run${plan.runs_count > 1 ? 's' : ''}` : ''}
              </Text>
              {plan.instructions && <Text style={styles.planInstructions} numberOfLines={2}>{plan.instructions}</Text>}
              <View style={[styles.statusBadge, { backgroundColor: plan.status === 'in_progress' ? colors.warning + '20' : colors.info + '20' }]}>
                <Text style={[styles.statusText, { color: plan.status === 'in_progress' ? colors.warning : colors.info }]}>
                  {plan.status?.replace(/_/g, ' ')}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={{ height: spacing.xxl }} />

      {/* Template Picker Modal */}
      <Modal visible={showTemplatePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedCategory?.icon} {selectedCategory?.label}</Text>
            <Text style={styles.modalSub}>Select a template</Text>
            {categoryTemplates.length === 0 ? (
              <Text style={styles.emptyText}>No templates in this category</Text>
            ) : (
              <FlatList
                data={categoryTemplates}
                keyExtractor={t => String(t.id)}
                renderItem={({ item: t }) => (
                  <TouchableOpacity style={styles.templateItem} onPress={() => handleTemplateSelect(t)}>
                    <Text style={styles.templateName}>{t.name}</Text>
                    <Text style={styles.templateType}>{(t.observation_type || t.type || '').replace(/_/g, ' ')}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowTemplatePicker(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Block Picker Modal */}
      <Modal visible={showBlockPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Block</Text>
            <Text style={styles.modalSub}>{selectedTemplate?.name}</Text>
            {blocks.length === 0 ? (
              <Text style={styles.emptyText}>No blocks found</Text>
            ) : (
              <FlatList
                data={blocks}
                keyExtractor={b => String(b.id)}
                renderItem={({ item: b }) => (
                  <TouchableOpacity style={styles.templateItem} onPress={() => handleBlockSelect(b)}>
                    <Text style={styles.templateName}>{b.block_name || b.name}</Text>
                    <Text style={styles.templateType}>{b.variety || ''}{b.area_hectares ? ` · ${b.area_hectares} ha` : ''}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowBlockPicker(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },

  // Sections
  section: { padding: spacing.base },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  sectionSub: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.md },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm, fontStyle: 'italic', padding: spacing.md },

  // Quick field note button
  fieldNoteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: spacing.base, marginTop: spacing.base,
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.md, paddingHorizontal: spacing.base,
  },
  fieldNoteIcon: { fontSize: 24 },
  fieldNoteLabelWrap: { flex: 1 },
  fieldNoteLabel: { fontSize: fontSize.base, fontWeight: '600', color: colors.white },
  fieldNoteSub: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  fieldNoteChevron: { fontSize: 24, color: 'rgba(255,255,255,0.6)', fontWeight: '300' },

  // Category grid
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryCard: {
    width: '48%', backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.base, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', gap: spacing.xs,
  },
  categoryIcon: { fontSize: 28 },
  categoryLabel: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, textAlign: 'center' },
  categoryCount: { fontSize: fontSize.xs, color: colors.textMuted },

  // Active run cards
  activeRunCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.warning,
    borderLeftWidth: 3,
  },
  activeRunHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  activeRunDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.warning,
  },
  activeRunName: { fontSize: fontSize.base, fontWeight: '500', color: colors.text, flex: 1 },
  activeRunMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs, marginLeft: 20 },

  // Plan cards
  planCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { fontSize: fontSize.base, fontWeight: '500', color: colors.text, flex: 1 },
  planPriority: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  planMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  planInstructions: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.xs },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, marginTop: spacing.sm },
  statusText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, maxHeight: '70%',
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  modalSub: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md },
  modalCancel: { marginTop: spacing.md, padding: spacing.md, alignItems: 'center' },
  modalCancelText: { color: colors.textMuted, fontSize: fontSize.base, fontWeight: '500' },

  // Template/block list items
  templateItem: {
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  templateName: { fontSize: fontSize.base, fontWeight: '500', color: colors.text },
  templateType: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
});
