// screens/ObservationsScreen.js — Observation hub: quick obs, active runs, planned obs
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, FlatList,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import { useAuth } from '../contexts/AuthContext';
import { byNatural } from '../utils/naturalSort';
import { colors, spacing, fontSize, radius, shadows } from '../styles/theme';
import { observationService, blocksService } from '../api/services';
import { OBS_CATEGORY_ICONS, SkeletonCard } from '../components';

// Template categories
const TEMPLATE_CATEGORIES = [
  { key: 'phenology',   label: 'Phenology & Growth',  types: ['phenology', 'growth', 'bud_count'] },
  { key: 'disease',     label: 'Pests & Disease',     types: ['pest_disease', 'disease', 'pest', 'beneficials', 'nutrient_health'] },
  { key: 'yield',       label: 'Yield & Sampling',    types: ['flower_set', 'bunch_count', 'pre_veraison_yield', 'post_veraison_yield', 'maturity_sampling', 'lab_sampling_pre_winery'] },
  { key: 'environment', label: 'Environment',         types: ['soil_groundcover', 'land_management', 'frost_event', 'weather', 'irrigation_check', 'biosecurity'] },
  { key: 'other',       label: 'Field Note & Other',  types: ['other', 'compliance', 'hazard', 'maintenance'] },
];

export default function ObservationsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [scheduledRuns, setScheduledRuns] = useState([]);
  const [activeRuns, setActiveRuns] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Field-worker tier sees only obs assigned to them; admins/managers see all
  // company obs so they can supervise.
  const onlyMine = user?.user_type === 'company_user';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // One fetch for both sections — partition client-side by whether the
      // run has been started yet. "Scheduled" = observed_at_start NULL;
      // "In progress" = observed_at_start set, observed_at_end NULL.
      const runParams = { not_completed: true };
      if (onlyMine) runParams.assigned_to_me = true;
      const [tpl, runs, blk] = await Promise.all([
        observationService.getTemplates().catch(() => []),
        observationService.listRuns(runParams).catch(() => []),
        blocksService.getCompanyBlocks().catch(() => []),
      ]);
      setTemplates(Array.isArray(tpl) ? tpl : []);
      const runList = Array.isArray(runs) ? runs : [];
      setScheduledRuns(runList.filter(r => !r.observed_at_start));
      setActiveRuns(runList.filter(r => r.observed_at_start && !r.observed_at_end));
      // Natural sort blocks alphanumerically — "Block 2" < "Block 10".
      const blockList = Array.isArray(blk) ? [...blk] : [];
      blockList.sort(byNatural('block_name'));
      setBlocks(blockList);
    } catch (err) {
      console.log('Failed to load observation data:', err.message);
    } finally {
      setLoading(false);
    }
  }, [onlyMine]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const getType = (t) => t.type || t.observation_type || '';

  const handleQuickFieldNote = () => {
    const freeForm = templates.find(t => getType(t) === 'other' && /free.?form/i.test(t.name));
    if (freeForm) {
      setSelectedTemplate(freeForm);
      setShowBlockPicker(true);
    } else {
      const otherCat = TEMPLATE_CATEGORIES.find(c => c.key === 'other');
      if (otherCat) handleCategoryPress(otherCat);
    }
  };

  const handleCategoryPress = (cat) => {
    setSelectedCategory(cat);
    setShowTemplatePicker(true);
  };

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
    navigation.navigate('SpotCapture', {
      templateId: selectedTemplate.id,
      blockId: block.id,
      blockName: block.block_name || block.name,
      templateName: selectedTemplate.name,
      companyId: user?.company_id,
    });
  };

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

  const handleStartScheduled = async (run) => {
    // Flip Scheduled → In Progress on the server (stamps observed_at_start),
    // then jump straight into SpotCapture for that run.
    try {
      await observationService.beginRun(run.id);
    } catch (err) {
      console.log('Failed to start scheduled run:', err?.message);
      // Non-fatal — SpotCapture can still open; user can retry. Loud failures
      // shouldn't block the field worker from opening the screen.
    }
    navigation.navigate('SpotCapture', {
      runId: run.id,
      templateId: run.template_id,
      blockId: run.block_id,
      blockName: run.block_name || '',
      templateName: run.template_name || run.name || 'Observation',
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
      {/* 1. Quick observation — ad-hoc field capture */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick observation</Text>
        </View>

        <TouchableOpacity style={styles.fieldNoteBtn} onPress={handleQuickFieldNote} activeOpacity={0.85}>
          <View style={styles.fieldNoteIconBox}>
            <Feather name="edit-3" size={20} color={colors.white} />
          </View>
          <View style={styles.fieldNoteLabelWrap}>
            <Text style={styles.fieldNoteLabel}>Quick field note</Text>
            <Text style={styles.fieldNoteSub}>Photo, notes & GPS — no template needed</Text>
          </View>
          <Feather name="chevron-right" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        <Text style={styles.sectionSub}>Or pick a category → template → block</Text>
        <View style={styles.categoryGrid}>
          {TEMPLATE_CATEGORIES.map(cat => {
            const count = templates.filter(t => cat.types.includes(getType(t))).length;
            return (
              <TouchableOpacity
                key={cat.key}
                style={styles.categoryCard}
                onPress={() => handleCategoryPress(cat)}
                activeOpacity={0.75}
                disabled={count === 0}
              >
                <View style={[styles.categoryIconBox, count === 0 && { backgroundColor: colors.borderLight }]}>
                  <Feather
                    name={OBS_CATEGORY_ICONS[cat.key] || 'circle'}
                    size={20}
                    color={count === 0 ? colors.textMuted : colors.success}
                  />
                </View>
                <Text style={styles.categoryLabel}>{cat.label}</Text>
                <Text style={styles.categoryCount}>{count} template{count !== 1 ? 's' : ''}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 2. Scheduled — assigned to me, not yet started */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Scheduled</Text>
        </View>
        {loading && scheduledRuns.length === 0 ? (
          <SkeletonCard />
        ) : scheduledRuns.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="calendar" size={20} color={colors.textMuted} />
            <Text style={styles.emptyText}>Nothing scheduled — anything new will appear here</Text>
          </View>
        ) : (
          scheduledRuns.map(run => (
            <TouchableOpacity key={run.id} style={styles.planCard} onPress={() => handleStartScheduled(run)} activeOpacity={0.75}>
              <View style={styles.planHeader}>
                <Text style={styles.planName} numberOfLines={1}>{run.template_name || run.name}</Text>
              </View>
              <Text style={styles.planMeta}>
                {run.block_name || 'No block'}
                {run.scheduled_date ? ` · Due ${dayjs(run.scheduled_date).format('DD MMM')}` : ''}
                {run.assigned_to_user_name ? ` · ${run.assigned_to_user_name}` : ''}
              </Text>
              {run.instructions && <Text style={styles.planInstructions} numberOfLines={2}>{run.instructions}</Text>}
              <View style={[styles.statusBadge, { backgroundColor: colors.info + '18' }]}>
                <View style={[styles.statusDot, { backgroundColor: colors.info }]} />
                <Text style={[styles.statusText, { color: colors.info }]}>scheduled</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* 3. In progress — started but not completed (tap to resume) */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>In progress</Text>
          {activeRuns.length > 0 && <Text style={styles.sectionHint}>Tap to resume</Text>}
        </View>
        {loading && activeRuns.length === 0 ? (
          <SkeletonCard />
        ) : activeRuns.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="play-circle" size={20} color={colors.textMuted} />
            <Text style={styles.emptyText}>Nothing in progress</Text>
          </View>
        ) : (
          activeRuns.map(run => (
            <TouchableOpacity key={run.id} style={styles.runCard} onPress={() => handleResumeRun(run)} activeOpacity={0.75}>
              <View style={styles.runDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.runName} numberOfLines={1}>{run.template_name || run.name}</Text>
                <Text style={styles.runMeta}>
                  {run.block_name || 'No block'}
                  {run.spots_count != null ? ` · ${run.spots_count} spot${run.spots_count !== 1 ? 's' : ''}` : ''}
                  {run.observed_at_start ? ` · ${timeAgo(run.observed_at_start)}` : ''}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={{ height: spacing.xxl }} />

      {/* Template Picker — bottom sheet */}
      <Modal visible={showTemplatePicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTemplatePicker(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalSheet, { paddingBottom: spacing.lg + insets.bottom }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={[styles.categoryIconBox, { marginBottom: 0 }]}>
                <Feather
                  name={OBS_CATEGORY_ICONS[selectedCategory?.key] || 'circle'}
                  size={20}
                  color={colors.success}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{selectedCategory?.label}</Text>
                <Text style={styles.modalSub}>Select a template</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTemplatePicker(false)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {categoryTemplates.length === 0 ? (
              <Text style={styles.emptyText}>No templates in this category</Text>
            ) : (
              <FlatList
                data={categoryTemplates}
                keyExtractor={t => String(t.id)}
                renderItem={({ item: t }) => (
                  <TouchableOpacity style={styles.templateItem} onPress={() => handleTemplateSelect(t)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.templateName}>{t.name}</Text>
                      <Text style={styles.templateType}>{getType(t).replace(/_/g, ' ')}</Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Block Picker — bottom sheet */}
      <Modal visible={showBlockPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowBlockPicker(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalSheet, { paddingBottom: spacing.lg + insets.bottom }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={[styles.categoryIconBox, { marginBottom: 0, backgroundColor: colors.primary + '18' }]}>
                <Feather name="grid" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Select block</Text>
                <Text style={styles.modalSub}>{selectedTemplate?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowBlockPicker(false)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {blocks.length === 0 ? (
              <Text style={styles.emptyText}>No blocks found</Text>
            ) : (
              <FlatList
                data={blocks}
                keyExtractor={b => String(b.id)}
                renderItem={({ item: b }) => (
                  <TouchableOpacity style={styles.templateItem} onPress={() => handleBlockSelect(b)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.templateName}>{b.block_name || b.name}</Text>
                      <Text style={styles.templateType}>
                        {b.variety || ''}
                        {b.area_hectares ? ` · ${b.area_hectares} ha` : ''}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Sections
  section: { padding: spacing.base },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  sectionHint: { fontSize: fontSize.xs, color: colors.textMuted },
  sectionSub: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.md },
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm, fontStyle: 'italic' },

  // Quick field note button
  fieldNoteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: spacing.base, marginTop: spacing.base,
    backgroundColor: colors.primary, borderRadius: radius.lg,
    padding: spacing.md, ...shadows.card,
  },
  fieldNoteIconBox: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  fieldNoteLabelWrap: { flex: 1 },
  fieldNoteLabel: { fontSize: fontSize.base, fontWeight: '600', color: colors.white },
  fieldNoteSub: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.8)', marginTop: 1 },

  // Category grid
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryCard: {
    width: '48%', backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.base, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', gap: spacing.xs,
  },
  categoryIconBox: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.gpsBg,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  categoryLabel: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.text,
    textAlign: 'center',
  },
  categoryCount: { fontSize: fontSize.xs, color: colors.textMuted },

  // Active run cards
  runCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.warning + '40',
    borderLeftWidth: 3, borderLeftColor: colors.warning,
  },
  runDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.warning,
  },
  runName: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  runMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  // Plan cards
  planCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  planName: { fontSize: fontSize.base, fontWeight: '600', color: colors.text, flex: 1 },
  priorityBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  priorityText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  planMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  planInstructions: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.xs },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radius.pill, marginTop: spacing.sm,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },

  // Modal bottom sheets
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    // paddingBottom applied inline so we can add the Android gesture-bar inset
    maxHeight: '75%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginBottom: spacing.md, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  modalSub: { fontSize: fontSize.sm, color: colors.textMuted },

  // Template/block list items
  templateItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  templateName: { fontSize: fontSize.base, fontWeight: '500', color: colors.text },
  templateType: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
});
