// screens/CreateTaskScreen.js — Field-side task creation (single scrollable form)
import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, StatusBar, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { tasksService, propertyService } from '../api/services';
import {
  SectionCard, FilledInput, BottomActionBar, BlockPickerModal, useToast,
} from '../components';
import TaskTemplatePickerModal from '../components/TaskTemplatePickerModal';
import AssigneePickerModal from '../components/AssigneePickerModal';

const CATEGORIES = [
  { value: 'vineyard',         label: 'Vineyard',        icon: 'grid' },
  { value: 'land_management',  label: 'Land mgmt',       icon: 'map' },
  { value: 'asset_management', label: 'Asset mgmt',      icon: 'package' },
  { value: 'compliance',       label: 'Compliance',      icon: 'shield' },
  { value: 'general',          label: 'General',         icon: 'clipboard' },
];

const PRIORITIES = [
  { value: 'low',    label: 'Low',    color: colors.textMuted },
  { value: 'medium', label: 'Medium', color: colors.info },
  { value: 'high',   label: 'High',   color: colors.warning },
  { value: 'urgent', label: 'Urgent', color: colors.danger },
];

export default function CreateTaskScreen({ navigation }) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [properties, setProperties] = useState([]);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [block, setBlock] = useState(null);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [propertyId, setPropertyId] = useState(null);
  const [scheduledDate, setScheduledDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [priority, setPriority] = useState('medium');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [requiresGps, setRequiresGps] = useState(false);

  // Template state — when a template is picked, the form collapses to the
  // web-app quick-create flow: block + date + assignees. Title/category/
  // description/priority/hours/GPS all come from the template (server-side),
  // so the user only chooses where + when + who.
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateId, setTemplateId] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Assignees — only surfaced in template mode (mirrors web TaskQuickCreate).
  // Backend accepts assigned_user_ids: List[int] for multi-assign.
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [assigneeUsers, setAssigneeUsers] = useState([]); // for label rendering

  const handleTemplateSelect = (tpl) => {
    setTemplateId(tpl.id);
    setSelectedTemplate(tpl);
  };

  const clearTemplate = () => {
    setTemplateId(null);
    setSelectedTemplate(null);
    setAssigneeIds([]);
    setAssigneeUsers([]);
  };

  const handleAssigneesConfirm = (ids, allUsers) => {
    setAssigneeIds(ids);
    if (Array.isArray(allUsers)) {
      const map = new Map(allUsers.map((u) => [u.id, u]));
      setAssigneeUsers(ids.map((id) => map.get(id)).filter(Boolean));
    }
  };

  const inTemplateMode = !!templateId;
  const assigneeSummary = assigneeIds.length === 0
    ? 'Unassigned'
    : assigneeUsers.length > 0
      ? assigneeUsers.map((u) => `${u.first_name || ''} ${u.last_name || ''}`.trim()).filter(Boolean).join(', ')
      : `${assigneeIds.length} selected`;

  useEffect(() => {
    propertyService.listProperties()
      .then(data => {
        const props = Array.isArray(data) ? data : [];
        setProperties(props);
        if (props.length === 1) setPropertyId(props[0].id);
      })
      .catch(() => {});
  }, []);

  // Template mode submits via /quick-create (only block/date/assignees needed —
  // template_id expands the rest server-side). Manual mode submits via /tasks
  // and requires title + category. Mirrors the web TaskQuickCreate flow.
  const canSubmit = inTemplateMode
    ? true
    : title.trim().length > 0 && !!category;

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.show('Title and category are required', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      let created;
      if (inTemplateMode) {
        const payload = {
          template_id: templateId,
          block_id: block?.id || undefined,
          scheduled_start_date: scheduledDate
            ? scheduledDate.toISOString().split('T')[0]
            : undefined,
          assigned_user_ids: assigneeIds.length > 0 ? assigneeIds : undefined,
        };
        created = await tasksService.quickCreateTask(payload);
      } else {
        const payload = {
          title: title.trim(),
          task_category: category,
          description: description.trim() || undefined,
          block_id: block?.id || undefined,
          scheduled_start_date: scheduledDate
            ? scheduledDate.toISOString().split('T')[0]
            : undefined,
          priority,
          requires_gps_tracking: requiresGps,
        };
        const hrs = parseFloat(estimatedHours);
        if (!isNaN(hrs) && hrs > 0) {
          payload.estimated_hours = Math.round(hrs * 4) / 4;
        }
        created = await tasksService.createTask(payload);
      }
      toast.show('Task created', 'success');
      navigation.replace('TaskDetail', { taskId: created.id });
    } catch (err) {
      const msg = err.response?.data?.detail;
      toast.show(typeof msg === 'string' ? msg : 'Failed to create task', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const onDateChange = (_, selected) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selected) setScheduledDate(selected);
  };

  const formatDate = (d) =>
    d ? d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'No date set';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
            <Feather name="arrow-left" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>New task</Text>
            <Text style={styles.headerSub}>Create a one-off task</Text>
          </View>
          <Feather name="clipboard" size={22} color={colors.white} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Start-from-template entry. When a template is picked, the form
              collapses to block + date + assignees (template defines the rest
              server-side via /quick-create). Tap × to clear and return to the
              full manual form. */}
          <SectionCard
            icon="layers"
            title={inTemplateMode ? 'Template' : 'Start from template (optional)'}
          >
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => setShowTemplatePicker(true)}
              activeOpacity={0.75}
            >
              <View style={[styles.pickerIconBox, inTemplateMode && styles.pickerIconBoxActive]}>
                <Feather
                  name="layers"
                  size={16}
                  color={inTemplateMode ? colors.success : colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerLabel}>Template</Text>
                <Text style={[styles.pickerValue, !selectedTemplate && styles.pickerValueEmpty]}>
                  {selectedTemplate?.name || 'Pick a template to skip the long form'}
                </Text>
              </View>
              {inTemplateMode ? (
                <TouchableOpacity onPress={clearTemplate} hitSlop={12}>
                  <Feather name="x" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ) : (
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              )}
            </TouchableOpacity>
            {inTemplateMode && (
              <Text style={styles.templateHint}>
                Template sets category, priority, hours, GPS and description.
                Just choose where, when, and who.
              </Text>
            )}
          </SectionCard>

          {!inTemplateMode && (
          <SectionCard icon="edit-3" title="Basics">
            <FilledInput
              label="Task title"
              required
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Hand-thin block C row 14"
            />

            <Text style={styles.fieldLabel}>Category *</Text>
            <View style={styles.grid}>
              {CATEGORIES.map(c => {
                const selected = category === c.value;
                return (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.tile, selected && styles.tileActive]}
                    onPress={() => setCategory(c.value)}
                    activeOpacity={0.75}
                  >
                    <Feather
                      name={c.icon}
                      size={18}
                      color={selected ? colors.primary : colors.textMuted}
                    />
                    <Text style={[styles.tileLabel, selected && styles.tileLabelActive]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionCard>
          )}

          <SectionCard icon="map-pin" title="Location (optional)">
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => setShowBlockPicker(true)}
              activeOpacity={0.75}
            >
              <View style={[styles.pickerIconBox, block && styles.pickerIconBoxActive]}>
                <Feather name="grid" size={16} color={block ? colors.success : colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerLabel}>Block</Text>
                <Text style={[styles.pickerValue, !block && styles.pickerValueEmpty]}>
                  {block?.block_name || 'No block selected'}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </SectionCard>

          <SectionCard icon="calendar" title="Schedule">
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.75}
            >
              <View style={[styles.pickerIconBox, scheduledDate && styles.pickerIconBoxActive]}>
                <Feather name="calendar" size={16} color={scheduledDate ? colors.success : colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerLabel}>Start date</Text>
                <Text style={[styles.pickerValue, !scheduledDate && styles.pickerValueEmpty]}>
                  {formatDate(scheduledDate)}
                </Text>
              </View>
              {scheduledDate && (
                <TouchableOpacity onPress={() => setScheduledDate(null)} hitSlop={10}>
                  <Feather name="x" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {!inTemplateMode && (
              <>
                <Text style={styles.fieldLabel}>Priority</Text>
                <View style={styles.chipRow}>
                  {PRIORITIES.map(p => {
                    const selected = priority === p.value;
                    return (
                      <TouchableOpacity
                        key={p.value}
                        style={[
                          styles.chip,
                          selected && { backgroundColor: p.color, borderColor: p.color },
                        ]}
                        onPress={() => setPriority(p.value)}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </SectionCard>

          {inTemplateMode && (
          <SectionCard icon="users" title="Assign to (optional)">
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => setShowAssigneePicker(true)}
              activeOpacity={0.75}
            >
              <View style={[styles.pickerIconBox, assigneeIds.length > 0 && styles.pickerIconBoxActive]}>
                <Feather
                  name="users"
                  size={16}
                  color={assigneeIds.length > 0 ? colors.success : colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerLabel}>
                  Assignees{assigneeIds.length > 0 ? ` (${assigneeIds.length})` : ''}
                </Text>
                <Text
                  style={[styles.pickerValue, assigneeIds.length === 0 && styles.pickerValueEmpty]}
                  numberOfLines={2}
                >
                  {assigneeSummary}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </SectionCard>
          )}

          {!inTemplateMode && (
          <SectionCard icon="clock" title="Effort & tracking">
            <Text style={styles.fieldLabel}>Estimated hours (optional)</Text>
            <View style={styles.hoursRow}>
              <FilledInput
                value={estimatedHours}
                onChangeText={setEstimatedHours}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
              <View style={styles.hoursChips}>
                {['0.5', '1', '2', '4', '8'].map(h => (
                  <TouchableOpacity
                    key={h}
                    style={styles.hoursChip}
                    onPress={() => setEstimatedHours(h)}
                  >
                    <Text style={styles.hoursChipText}>{h}h</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Track GPS during this task</Text>
                <Text style={styles.toggleHint}>For spray/mowing/spread tasks where coverage matters</Text>
              </View>
              <Switch
                value={requiresGps}
                onValueChange={setRequiresGps}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.white}
              />
            </View>
          </SectionCard>

          )}

          {!inTemplateMode && (
          <SectionCard icon="align-left" title="Description (optional)">
            <FilledInput
              value={description}
              onChangeText={setDescription}
              placeholder="Anything else the assignee needs to know"
              multiline
              numberOfLines={4}
            />
          </SectionCard>
          )}

          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomActionBar
        secondaryLabel="Cancel"
        secondaryIcon="x"
        onSecondary={() => navigation.goBack()}
        primaryLabel={submitting ? 'Creating...' : 'Create task'}
        primaryIcon="check"
        primaryColor="green"
        onPrimary={handleSubmit}
        disabled={submitting}
      />

      <BlockPickerModal
        visible={showBlockPicker}
        onClose={() => setShowBlockPicker(false)}
        onSelect={setBlock}
        propertyId={propertyId}
        selectedBlockId={block?.id}
      />

      <TaskTemplatePickerModal
        visible={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onSelect={handleTemplateSelect}
      />

      <AssigneePickerModal
        visible={showAssigneePicker}
        selectedIds={assigneeIds}
        onClose={() => setShowAssigneePicker(false)}
        onConfirm={handleAssigneesConfirm}
      />

      {showDatePicker && (
        <DateTimePicker
          value={scheduledDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
          minimumDate={new Date()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  headerSafe: { backgroundColor: colors.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    backgroundColor: colors.primary,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.xs, marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base },

  fieldLabel: {
    fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary,
    marginTop: spacing.md, marginBottom: spacing.xs,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '31%', minWidth: 96, flexGrow: 1,
    alignItems: 'center', gap: 6,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  tileActive: { borderColor: colors.primary, backgroundColor: colors.gpsBg },
  tileLabel: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', fontWeight: '500' },
  tileLabelActive: { color: colors.primary, fontWeight: '700' },

  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  pickerIconBox: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  pickerIconBoxActive: { backgroundColor: colors.gpsBg },
  pickerLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  pickerValue: { fontSize: fontSize.base, color: colors.text, fontWeight: '500', marginTop: 2 },
  pickerValueEmpty: { color: colors.textMuted, fontWeight: '400', fontStyle: 'italic' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: colors.white, fontWeight: '700' },

  hoursRow: { gap: spacing.sm },
  hoursChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  hoursChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, backgroundColor: colors.borderLight,
  },
  hoursChipText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm, marginTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  toggleLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  toggleHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  templateHint: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
