// screens/TaskDetailScreen.js — Full task detail with start/rows/complete (M2)
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput, Modal,
  KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Platform,
} from 'react-native';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { tasksService, taskRowService } from '../api/services';

export default function TaskDetailScreen({ route, navigation }) {
  const { taskId } = route.params;
  const [task, setTask] = useState(null);
  const [rows, setRows] = useState([]);
  const [progress, setProgress] = useState(null);
  const [equipmentChecks, setEquipmentChecks] = useState(null);
  const [consumables, setConsumables] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Row completion modal state
  const [showRowModal, setShowRowModal] = useState(false);
  const [activeRow, setActiveRow] = useState(null);
  const [rowNotes, setRowNotes] = useState('');
  const [rowIssues, setRowIssues] = useState('');
  const [rowQuality, setRowQuality] = useState(0);

  // Complete modal state
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [consumableActuals, setConsumableActuals] = useState([]);

  // Equipment check modal state
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);

  const loadTask = useCallback(async () => {
    try {
      const data = await tasksService.getTask(taskId);
      setTask(data);
      navigation.setOptions({ title: data.title || `Task #${data.id}` });
    } catch (err) {
      console.log('Failed to load task:', err.message);
    }
  }, [taskId, navigation]);

  const loadRows = useCallback(async () => {
    try {
      const [rowData, progressData] = await Promise.all([
        taskRowService.listRows(taskId).catch(() => []),
        taskRowService.getProgress(taskId).catch(() => null),
      ]);
      setRows(Array.isArray(rowData) ? rowData : []);
      setProgress(progressData);
    } catch (err) {
      console.log('Failed to load rows:', err.message);
    }
  }, [taskId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadTask(), loadRows()]);
    setLoading(false);
  }, [loadTask, loadRows]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadTask(), loadRows()]);
    setRefreshing(false);
  }, [loadTask, loadRows]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.navigate('TaskList')} style={{ paddingRight: spacing.md }}>
          <Text style={{ color: colors.primary, fontSize: fontSize.base }}>← Tasks</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // --- Actions ---

  const handleStartTask = async () => {
    setActionLoading(true);
    try {
      // Check equipment first
      const checks = await tasksService.getEquipmentCheck(taskId);
      const overdueItems = (checks.equipment_checks || []).filter(c => c.calibration_overdue);

      if (overdueItems.length > 0) {
        setEquipmentChecks(checks.equipment_checks);
        setShowEquipmentModal(true);
        setActionLoading(false);
        return;
      }

      await doStartTask(false);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to start task');
    } finally {
      setActionLoading(false);
    }
  };

  const doStartTask = async (skipEquipmentCheck) => {
    setActionLoading(true);
    try {
      await tasksService.startTask(taskId, {
        skip_equipment_check: skipEquipmentCheck,
        start_gps_tracking: false,
      });
      setShowEquipmentModal(false);
      await loadAll();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to start task');
    } finally {
      setActionLoading(false);
    }
  };

  const openRowComplete = (row) => {
    setActiveRow(row);
    setRowNotes('');
    setRowIssues('');
    setRowQuality(0);
    setShowRowModal(true);
  };

  const handleCompleteRow = async () => {
    if (!activeRow) return;
    try {
      await taskRowService.completeRow(taskId, activeRow.id, {
        notes: rowNotes || null,
        issues_found: rowIssues || null,
        quality_rating: rowQuality > 0 ? rowQuality : null,
      });
      setShowRowModal(false);
      setActiveRow(null);
      await loadRows();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to complete row');
    }
  };

  const handleSkipRow = (rowId, rowName) => {
    Alert.prompt
      ? Alert.prompt('Skip Row', `Why are you skipping ${rowName}?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Skip', style: 'destructive', onPress: async (reason) => {
            try {
              await taskRowService.skipRow(taskId, rowId, reason || 'Skipped from mobile');
              await loadRows();
            } catch (err) {
              Alert.alert('Error', err.response?.data?.detail || 'Failed to skip row');
            }
          }},
        ])
      : handleSkipRowFallback(rowId);
  };

  const handleSkipRowFallback = async (rowId) => {
    try {
      await taskRowService.skipRow(taskId, rowId, 'Skipped from mobile');
      await loadRows();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to skip row');
    }
  };

  const handleOpenCompleteModal = async () => {
    try {
      const data = await tasksService.getConsumables(taskId);
      const items = data?.consumables || data || [];
      setConsumables(Array.isArray(items) ? items : []);
      setConsumableActuals(
        (Array.isArray(items) ? items : []).map(c => ({
          task_asset_id: c.task_asset_id,
          actual_quantity: c.planned_quantity || 0,
          batch_number: '',
        }))
      );
      setShowCompleteModal(true);
    } catch (err) {
      // No consumables — open modal anyway
      setConsumables([]);
      setConsumableActuals([]);
      setShowCompleteModal(true);
    }
  };

  const handleCompleteTask = async () => {
    setActionLoading(true);
    try {
      const payload = { completion_notes: completionNotes || null };
      if (consumableActuals.length > 0) {
        payload.consumable_actuals = consumableActuals.map(c => ({
          task_asset_id: c.task_asset_id,
          actual_quantity: parseFloat(c.actual_quantity) || 0,
          batch_number: c.batch_number || null,
        }));
      }
      await tasksService.completeTask(taskId, payload);
      setShowCompleteModal(false);
      await loadAll();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to complete task');
    } finally {
      setActionLoading(false);
    }
  };

  // --- Render helpers ---

  const statusColor = (s) => {
    const k = String(s || '').toLowerCase();
    if (k === 'in_progress') return colors.warning;
    if (k === 'completed') return colors.success;
    if (k === 'scheduled' || k === 'ready') return colors.info;
    if (k === 'skipped') return colors.textMuted;
    if (k === 'cancelled') return colors.danger;
    return colors.textMuted;
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!task) return <View style={styles.center}><Text>Task not found</Text></View>;

  const isStartable = ['draft', 'scheduled', 'ready'].includes(task.status);
  const isInProgress = task.status === 'in_progress';
  const isCompletable = isInProgress;
  const isCompleted = task.status === 'completed';

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Task Info Card */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.taskNumber}>{task.task_number}</Text>
            <Badge label={task.status} color={statusColor(task.status)} />
          </View>
          <Text style={styles.title}>{task.title || `Task #${task.id}`}</Text>
          {task.description ? <Text style={styles.description}>{task.description}</Text> : null}

          <View style={styles.fields}>
            {task.task_category && <Field label="Category" value={task.task_category.replace(/_/g, ' ')} />}
            {task.priority && <Field label="Priority" value={task.priority} />}
            {task.scheduled_start_date && (
              <Field label="Scheduled" value={new Date(task.scheduled_start_date).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })} />
            )}
            {(task.block?.block_name || task.block_name) && <Field label="Block" value={task.block?.block_name || task.block_name} />}
            {task.assignee_names?.length > 0 && <Field label="Assigned" value={task.assignee_names.join(', ')} />}
          </View>
        </View>

        {/* Row Progress */}
        {(rows.length > 0 || progress) && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Row Progress</Text>
            {progress && (
              <View style={styles.progressSection}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress.completion_percentage || 0}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {progress.completed_rows}/{progress.total_rows} rows complete
                  {progress.skipped_rows > 0 ? ` · ${progress.skipped_rows} skipped` : ''}
                </Text>
              </View>
            )}
            {rows.map(row => (
              <View key={row.id} style={styles.rowItem}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>Row {row.row_identifier || row.vineyard_row?.row_number || row.id}</Text>
                  <Badge label={row.status} color={statusColor(row.status)} small />
                </View>
                {row.status === 'pending' && isInProgress && (
                  <View style={styles.rowActions}>
                    <TouchableOpacity style={styles.rowBtn} onPress={() => openRowComplete(row)}>
                      <Text style={styles.rowBtnText}>Done</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.rowBtn, styles.rowBtnSkip]} onPress={() => handleSkipRow(row.id, row.row_identifier)}>
                      <Text style={styles.rowBtnSkipText}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {row.notes ? <Text style={styles.rowNotes}>{row.notes}</Text> : null}
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Action Bar */}
      {!isCompleted && (
        <View style={styles.actionBar}>
          {isStartable && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={handleStartTask}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.actionBtnText}>Start Task</Text>}
            </TouchableOpacity>
          )}
          {isCompletable && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSuccess]}
              onPress={handleOpenCompleteModal}
              disabled={actionLoading}
            >
              <Text style={styles.actionBtnText}>Complete Task</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Row Completion Modal */}
      <Modal visible={showRowModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalContent}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>
                  Complete Row {activeRow?.row_identifier || activeRow?.vineyard_row?.row_number || activeRow?.id}
                </Text>

                <Text style={styles.inputLabel}>Quality Rating</Text>
                <View style={styles.qualityRow}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.qualityStar, rowQuality >= n && styles.qualityStarActive]}
                      onPress={() => setRowQuality(rowQuality === n ? 0 : n)}
                    >
                      <Text style={[styles.qualityStarText, rowQuality >= n && styles.qualityStarTextActive]}>
                        {n}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  style={styles.notesInput}
                  value={rowNotes}
                  onChangeText={setRowNotes}
                  placeholder="Any notes for this row..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={2}
                />

                <Text style={styles.inputLabel}>Issues Found</Text>
                <TextInput
                  style={styles.notesInput}
                  value={rowIssues}
                  onChangeText={setRowIssues}
                  placeholder="Describe any issues..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={2}
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => { Keyboard.dismiss(); setShowRowModal(false); }}>
                    <Text style={styles.modalBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnPrimary]}
                    onPress={handleCompleteRow}
                  >
                    <Text style={styles.actionBtnText}>Complete Row</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Equipment Check Modal */}
      <Modal visible={showEquipmentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Equipment Check</Text>
            <Text style={styles.modalSubtitle}>The following equipment has overdue calibration:</Text>
            {(equipmentChecks || []).filter(c => c.calibration_overdue).map(c => (
              <View key={c.task_asset_id} style={styles.checkItem}>
                <Text style={styles.checkName}>{c.asset_name}</Text>
                <Text style={styles.checkWarning}>Calibration overdue</Text>
                {c.last_calibration_date && <Text style={styles.checkDate}>Last: {c.last_calibration_date}</Text>}
              </View>
            ))}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowEquipmentModal(false)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnOverride}
                onPress={() => doStartTask(true)}
                disabled={actionLoading}
              >
                {actionLoading
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.modalBtnOverrideText}>Start Anyway</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Task Modal */}
      <Modal visible={showCompleteModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalContent}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Complete Task</Text>

                {consumables && consumables.length > 0 && (
                  <View style={styles.consumablesSection}>
                    <Text style={styles.consumablesTitle}>Consumables Used</Text>
                    {consumables.map((c, i) => (
                      <View key={c.task_asset_id} style={styles.consumableRow}>
                        <Text style={styles.consumableName}>{c.asset_name} ({c.unit})</Text>
                        <View style={styles.consumableInputs}>
                          <TextInput
                            style={styles.consumableQty}
                            value={String(consumableActuals[i]?.actual_quantity ?? '')}
                            onChangeText={(val) => {
                              const updated = [...consumableActuals];
                              updated[i] = { ...updated[i], actual_quantity: val };
                              setConsumableActuals(updated);
                            }}
                            keyboardType="decimal-pad"
                            placeholder="Qty"
                            placeholderTextColor={colors.textMuted}
                          />
                          <TextInput
                            style={styles.consumableBatch}
                            value={consumableActuals[i]?.batch_number ?? ''}
                            onChangeText={(val) => {
                              const updated = [...consumableActuals];
                              updated[i] = { ...updated[i], batch_number: val };
                              setConsumableActuals(updated);
                            }}
                            placeholder="Batch #"
                            placeholderTextColor={colors.textMuted}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={styles.inputLabel}>Completion Notes</Text>
                <TextInput
                  style={styles.notesInput}
                  value={completionNotes}
                  onChangeText={setCompletionNotes}
                  placeholder="Any notes about the completed task..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => { Keyboard.dismiss(); setShowCompleteModal(false); }}>
                    <Text style={styles.modalBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnSuccess]}
                    onPress={handleCompleteTask}
                    disabled={actionLoading}
                  >
                    {actionLoading
                      ? <ActivityIndicator color={colors.white} />
                      : <Text style={styles.actionBtnText}>Confirm Complete</Text>
                    }
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// --- Small components ---

function Badge({ label, color, small }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '20' }, small && styles.badgeSmall]}>
      <Text style={[styles.badgeText, { color }, small && styles.badgeTextSmall]}>
        {String(label || '').replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceWarm },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Card
  card: {
    margin: spacing.base, marginBottom: 0, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.base,
    borderWidth: 1, borderColor: colors.border,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  taskNumber: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  description: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md },
  sectionTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.text, marginBottom: spacing.md },
  fields: { gap: spacing.sm },
  field: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  fieldValue: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, textTransform: 'capitalize' },

  // Badge
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  badgeSmall: { paddingHorizontal: spacing.xs, paddingVertical: 1 },
  badgeText: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  badgeTextSmall: { fontSize: 10 },

  // Progress
  progressSection: { marginBottom: spacing.md },
  progressBar: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden', marginBottom: spacing.xs },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  progressText: { fontSize: fontSize.xs, color: colors.textMuted },

  // Rows
  rowItem: {
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text },
  rowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  rowBtn: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  rowBtnText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '600' },
  rowBtnSkip: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.textMuted },
  rowBtnSkipText: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '500' },
  rowNotes: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },

  // Action Bar
  actionBar: {
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    padding: spacing.base, paddingBottom: spacing.lg,
    flexDirection: 'row', gap: spacing.sm,
  },
  actionBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnSuccess: { backgroundColor: colors.success },
  actionBtnText: { color: colors.white, fontSize: fontSize.base, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, maxHeight: '80%',
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalBtnCancel: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  modalBtnCancelText: { color: colors.text, fontSize: fontSize.base, fontWeight: '500' },
  modalBtnOverride: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
    alignItems: 'center', backgroundColor: colors.warning,
  },
  modalBtnOverrideText: { color: colors.white, fontSize: fontSize.base, fontWeight: '600' },

  // Equipment check
  checkItem: {
    backgroundColor: colors.surfaceWarm, padding: spacing.md, borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  checkName: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text },
  checkWarning: { fontSize: fontSize.xs, color: colors.danger, fontWeight: '500', marginTop: 2 },
  checkDate: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  // Consumables
  consumablesSection: { marginBottom: spacing.md },
  consumablesTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  consumableRow: { marginBottom: spacing.sm },
  consumableName: { fontSize: fontSize.sm, color: colors.text, marginBottom: 4 },
  consumableInputs: { flexDirection: 'row', gap: spacing.sm },
  consumableQty: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: fontSize.sm, color: colors.text, backgroundColor: colors.white,
  },
  consumableBatch: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: fontSize.sm, color: colors.text, backgroundColor: colors.white,
  },

  // Quality rating
  qualityRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  qualityStar: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center', backgroundColor: colors.white,
  },
  qualityStarActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  qualityStarText: { fontSize: fontSize.base, fontWeight: '600', color: colors.textMuted },
  qualityStarTextActive: { color: colors.white },

  // Notes input
  inputLabel: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, marginBottom: spacing.xs },
  notesInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.md, fontSize: fontSize.sm, color: colors.text,
    backgroundColor: colors.white, minHeight: 80, textAlignVertical: 'top',
  },
});
