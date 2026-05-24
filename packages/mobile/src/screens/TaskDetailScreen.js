// screens/TaskDetailScreen.js — Full task detail with start/rows/complete (M2)
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput, Modal,
  KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { tasksService, taskRowService } from '../api/services';
import { getTaskCached, listRowsCached, getRowProgressCached } from '../services/tasksCache';
import { byNatural } from '../utils/naturalSort';
import { useGpsTracking } from '../hooks/useGpsTracking';
import GpsTrackingOverlay from './GpsTrackingScreen';
import { TaskStatusBadge } from '../components';
import RiskHazardChips from '../components/RiskHazardChips';

export default function TaskDetailScreen({ route, navigation }) {
  const { taskId } = route.params;
  const insets = useSafeAreaInsets();
  // Bottom-sheet modals (Row Completion, Equipment Check, Complete Task) all
  // anchor to the bottom of the screen. Apply the inset so their content +
  // action buttons stay clear of the Android gesture bar.
  const sheetPad = { paddingBottom: spacing.lg + insets.bottom };
  const [task, setTask] = useState(null);
  const [rows, setRows] = useState([]);
  const [progress, setProgress] = useState(null);
  const [equipmentChecks, setEquipmentChecks] = useState(null);
  const [consumables, setConsumables] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // GPS tracking
  const gps = useGpsTracking();
  const [showGpsOverlay, setShowGpsOverlay] = useState(false);
  const [gpsCommittedSummary, setGpsCommittedSummary] = useState(null); // server-side summary if GPS was stopped/committed

  // Row completion modal state
  const [showRowModal, setShowRowModal] = useState(false);
  const [activeRow, setActiveRow] = useState(null);
  const [rowNotes, setRowNotes] = useState('');
  const [rowIssues, setRowIssues] = useState('');

  // Complete modal state
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [consumableActuals, setConsumableActuals] = useState([]);
  const [hoursWorked, setHoursWorked] = useState('');

  // Equipment check modal state
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);

  const loadTask = useCallback(async () => {
    try {
      const data = await getTaskCached(taskId, {
        onCached: (cached) => {
          if (cached?.data) {
            setTask(cached.data);
            navigation.setOptions({ title: cached.data.title || `Task #${cached.data.id}` });
          }
        },
      });
      if (data) {
        setTask(data);
        navigation.setOptions({ title: data.title || `Task #${data.id}` });
      }
    } catch (err) {
      console.log('Failed to load task:', err.message);
    }
  }, [taskId, navigation]);

  // Natural-sort rows by row_number ("1", "2", "10") rather than the
  // lexicographic order the backend returns. id is a stable tiebreaker for
  // rows without a row_number. Same util the web RowProgressPanel uses.
  const sortRows = useCallback((data) => {
    if (!Array.isArray(data)) return [];
    const list = [...data];
    list.sort((a, b) => {
      const cmp = byNatural('row_number')(a, b);
      if (cmp !== 0) return cmp;
      return (a.id ?? 0) - (b.id ?? 0);
    });
    return list;
  }, []);

  const loadRows = useCallback(async () => {
    try {
      const [rowData, progressData] = await Promise.all([
        listRowsCached(taskId, {
          onCached: (cached) => { if (Array.isArray(cached?.data)) setRows(sortRows(cached.data)); },
        }).catch(() => []),
        getRowProgressCached(taskId, {
          onCached: (cached) => { if (cached?.data) setProgress(cached.data); },
        }).catch(() => null),
      ]);
      setRows(sortRows(rowData));
      setProgress(progressData);
    } catch (err) {
      console.log('Failed to load rows:', err.message);
    }
  }, [taskId, sortRows]);

  const loadGpsCommitted = useCallback(async () => {
    // Only check if not actively tracking — avoids hitting endpoint mid-flight.
    if (gps.isTracking || gps.isPaused) return;
    try {
      const summary = await tasksService.getGpsSummary(taskId);
      setGpsCommittedSummary(summary || null);
    } catch (err) {
      // 404 = no summary yet (never started or still active); anything else also benign here
      setGpsCommittedSummary(null);
    }
  }, [taskId, gps.isTracking, gps.isPaused]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadTask(), loadRows(), loadGpsCommitted()]);
    setLoading(false);
  }, [loadTask, loadRows, loadGpsCommitted]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadTask(), loadRows()]);
    setRefreshing(false);
  }, [loadTask, loadRows]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    navigation.setOptions({
      headerBackVisible: false, // hide the default tiny chevron — we render a clearer one
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('TaskList')}
          hitSlop={12}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 6,
            paddingHorizontal: 10,
            marginLeft: -6,
            borderRadius: 8,
          }}
          accessibilityLabel="Back to tasks"
        >
          <Feather name="chevron-left" size={22} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: fontSize.base, fontWeight: '600', marginLeft: 2 }}>
            Tasks
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // --- Actions ---

  // Confirmation prompt fired before any flow that will kick off live GPS
  // recording. Surfaces what's about to happen so users don't accidentally
  // start tracking and burn battery / sit in foreground when they didn't intend.
  const confirmStartGps = (proceed) => {
    Alert.alert(
      'Start GPS recording?',
      'This task records your location continuously while it\'s in progress.\n\n' +
      '• Keep the app open and your device awake — backgrounding may pause recording.\n' +
      '• Recording continues until you tap Stop.\n' +
      '• Pause when taking a break to save battery.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start recording', onPress: proceed },
      ],
    );
  };

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

      // If GPS will auto-start with the task, confirm first. Non-GPS tasks
      // skip the prompt entirely — no behaviour change for them.
      if (task?.requires_gps_tracking === true) {
        setActionLoading(false);
        confirmStartGps(() => doStartTask(false));
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
      const gpsRequired = task?.requires_gps_tracking === true;
      await tasksService.startTask(taskId, {
        skip_equipment_check: skipEquipmentCheck,
        start_gps_tracking: gpsRequired,
      });
      setShowEquipmentModal(false);
      // Start GPS tracking only if task requires it. On success, jump straight
      // into the full-screen GPS overlay — that's where Pause/Stop + live
      // stats live, and on a fresh start the user expects to see the
      // recording state, not the task detail page.
      if (gpsRequired) {
        const gpsStarted = await gps.startTracking(taskId);
        if (gpsStarted) {
          setShowGpsOverlay(true);
        } else {
          Alert.alert('GPS Note', 'Task started but GPS tracking could not be enabled. You can continue without tracking.');
        }
      }
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
    setShowRowModal(true);
  };

  const handleCompleteRow = async () => {
    if (!activeRow) return;
    try {
      await taskRowService.completeRow(taskId, activeRow.id, {
        notes: rowNotes || null,
        issues_found: rowIssues || null,
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
      // Stop GPS tracking first (don't let GPS errors block completion)
      if (gps.isTracking || gps.isPaused) {
        try {
          await gps.stopTracking();
        } catch (gpsErr) {
          console.warn('[GPS] Stop failed during complete, continuing:', gpsErr.message);
        }
      }
      const payload = { completion_notes: completionNotes || null };
      if (consumableActuals.length > 0) {
        payload.consumable_actuals = consumableActuals.map(c => ({
          task_asset_id: c.task_asset_id,
          actual_quantity: parseFloat(c.actual_quantity) || 0,
          batch_number: c.batch_number || null,
        }));
      }
      const hrs = parseFloat(hoursWorked);
      if (!isNaN(hrs) && hrs > 0) {
        const quantized = Math.round(hrs * 4) / 4;
        payload.hours_worked = quantized;
      }
      await tasksService.completeTask(taskId, payload);
      setShowCompleteModal(false);
      setHoursWorked('');
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
            <TaskStatusBadge status={task.status} />
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
          <RiskHazardChips
            blockId={task.block_id || null}
            spatialAreaId={task.spatial_area_id || null}
            propertyId={task.property_id || task.block?.property_id || null}
          />
        </View>

        {/* GPS — committed/locked. Server has a summary OR this session stopped it. */}
        {isInProgress && task?.requires_gps_tracking && !gps.isTracking && !gps.isPaused && (gpsCommittedSummary || gps.hasBeenStopped) && (
          <View style={styles.card}>
            <View style={styles.gpsHeader}>
              <View style={styles.gpsHeaderLeft}>
                <View style={[styles.gpsDot, { backgroundColor: colors.success }]} />
                <Text style={styles.sectionTitle}>GPS Recording Complete</Text>
              </View>
              <Feather name="lock" size={14} color={colors.textMuted} />
            </View>
            <Text style={styles.gpsHint}>
              GPS track is saved and locked. Complete the task below to log hours and notes.
            </Text>
            {gpsCommittedSummary && (
              <View style={styles.gpsStats}>
                <View style={styles.gpsStat}>
                  <Text style={styles.gpsStatValue}>
                    {Number(gpsCommittedSummary.total_distance_km || 0).toFixed(2)}
                  </Text>
                  <Text style={styles.gpsStatLabel}>km</Text>
                </View>
                <View style={styles.gpsStat}>
                  <Text style={styles.gpsStatValue}>
                    {gpsCommittedSummary.active_duration_minutes || 0}m
                  </Text>
                  <Text style={styles.gpsStatLabel}>active</Text>
                </View>
                <View style={styles.gpsStat}>
                  <Text style={styles.gpsStatValue}>{gpsCommittedSummary.total_points || 0}</Text>
                  <Text style={styles.gpsStatLabel}>points</Text>
                </View>
                {gpsCommittedSummary.coverage_area_hectares != null && (
                  <View style={styles.gpsStat}>
                    <Text style={styles.gpsStatValue}>
                      {Number(gpsCommittedSummary.coverage_area_hectares).toFixed(2)}
                    </Text>
                    <Text style={styles.gpsStatLabel}>ha</Text>
                  </View>
                )}
              </View>
            )}

            {/* View completed track on Map. Cross-tab nav with viewTaskId
                param; MapScreen fetches the locked track + fits camera. */}
            <TouchableOpacity
              style={styles.gpsMapBtn}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Map', { viewTaskId: taskId })}
            >
              <Text style={styles.gpsMapBtnText}>View track on Map →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* GPS — never started yet, task in progress + tracking required */}
        {isInProgress && task?.requires_gps_tracking && !gps.isTracking && !gps.isPaused && !gpsCommittedSummary && !gps.hasBeenStopped && (
          <View style={styles.card}>
            <View style={styles.gpsHeader}>
              <View style={styles.gpsHeaderLeft}>
                <View style={[styles.gpsDot, { backgroundColor: colors.textMuted }]} />
                <Text style={styles.sectionTitle}>GPS Tracking</Text>
              </View>
            </View>
            <Text style={styles.gpsHint}>
              GPS is not currently recording. Start now to capture coverage for this task.
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnPrimary, { marginTop: spacing.md }]}
              onPress={() => confirmStartGps(async () => {
                const ok = await gps.startTracking(taskId);
                if (!ok) {
                  Alert.alert('GPS', 'Could not start tracking. Check location permission and try again.');
                } else {
                  setShowGpsOverlay(true);
                }
              })}
            >
              <Feather name="play-circle" size={18} color={colors.white} />
              <Text style={[styles.actionBtnText, { marginLeft: spacing.xs }]}>Start GPS Tracking</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* GPS Tracking Card — tap to open full GPS screen */}
        {isInProgress && (gps.isTracking || gps.isPaused) && (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => setShowGpsOverlay(true)}
          >
            <View style={styles.gpsHeader}>
              <View style={styles.gpsHeaderLeft}>
                <View style={[styles.gpsDot, gps.isPaused ? styles.gpsDotPaused : styles.gpsDotActive]} />
                <Text style={styles.sectionTitle}>
                  {gps.isPaused ? 'GPS Paused' : 'GPS Tracking'}
                </Text>
              </View>
              <Text style={styles.gpsExpandHint}>Tap to expand →</Text>
            </View>

            <View style={styles.gpsStats}>
              <View style={styles.gpsStat}>
                <Text style={styles.gpsStatValue}>
                  {(gps.stats.distance / 1000).toFixed(2)}
                </Text>
                <Text style={styles.gpsStatLabel}>km</Text>
              </View>
              <View style={styles.gpsStat}>
                <Text style={styles.gpsStatValue}>
                  {Math.floor(gps.stats.duration / 3600) > 0
                    ? `${Math.floor(gps.stats.duration / 3600)}h ${Math.floor((gps.stats.duration % 3600) / 60)}m`
                    : `${Math.floor(gps.stats.duration / 60)}m ${Math.floor(gps.stats.duration % 60)}s`}
                </Text>
                <Text style={styles.gpsStatLabel}>time</Text>
              </View>
              <View style={styles.gpsStat}>
                <Text style={styles.gpsStatValue}>{gps.stats.pointCount}</Text>
                <Text style={styles.gpsStatLabel}>points</Text>
              </View>
              <View style={styles.gpsStat}>
                <Text style={styles.gpsStatValue}>
                  {gps.stats.avgSpeed > 0 ? gps.stats.avgSpeed.toFixed(1) : '—'}
                </Text>
                <Text style={styles.gpsStatLabel}>km/h</Text>
              </View>
            </View>

            {/* View live track on Map. Cross-tab nav (parent tab navigator
                resolves the 'Map' tab name). MapScreen is already polling
                for any active task and renders the polyline automatically. */}
            <TouchableOpacity
              style={styles.gpsMapBtn}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Map')}
            >
              <Text style={styles.gpsMapBtnText}>View live track on Map →</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}

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
            <View style={[styles.modalContent, sheetPad]}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>
                  Complete Row {activeRow?.row_identifier || activeRow?.vineyard_row?.row_number || activeRow?.id}
                </Text>

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
            <View style={[styles.modalContent, sheetPad]}>
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

                <Text style={styles.inputLabel}>Hours worked (optional)</Text>
                <View style={styles.hoursRow}>
                  <TextInput
                    style={styles.hoursInput}
                    value={hoursWorked}
                    onChangeText={setHoursWorked}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                  />
                  <View style={styles.hoursChipRow}>
                    {['0.5', '1', '2', '4', '8'].map(h => (
                      <TouchableOpacity
                        key={h}
                        style={styles.hoursChip}
                        onPress={() => setHoursWorked(h)}
                      >
                        <Text style={styles.hoursChipText}>{h}h</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <Text style={styles.hoursHint}>
                  Quarter-hour increments. Adds an entry to today&apos;s timesheet.
                </Text>

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

      {/* GPS Full-Screen Overlay */}
      <Modal visible={showGpsOverlay} animationType="slide">
        <GpsTrackingOverlay
          gps={gps}
          taskTitle={task.title || `Task #${task.id}`}
          taskNumber={task.task_number}
          onClose={() => setShowGpsOverlay(false)}
          onViewMap={() => {
            // Close the overlay then jump to the Map tab. The live polyline
            // reads from the same useGpsTracking buffer the overlay shows,
            // so the trail appears immediately.
            setShowGpsOverlay(false);
            navigation.navigate('Map');
          }}
        />
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
  actionBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnSuccess: { backgroundColor: colors.success },
  actionBtnText: { color: colors.white, fontSize: fontSize.base, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    // paddingBottom applied inline (sheetPad) so we can add the Android gesture-bar inset
    maxHeight: '80%',
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

  // GPS tracking
  gpsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  gpsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gpsDot: { width: 10, height: 10, borderRadius: 5 },
  gpsDotActive: { backgroundColor: colors.success },
  gpsDotPaused: { backgroundColor: colors.warning },
  gpsExpandHint: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  gpsHint: { fontSize: fontSize.sm, color: colors.textMuted },
  gpsStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.md },
  gpsStat: { alignItems: 'center' },
  gpsStatValue: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  gpsStatLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  gpsMapBtn: {
    alignSelf: 'stretch',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.trackBlueDark || '#2563eb',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  gpsMapBtnText: { color: '#FFFFFF', fontSize: fontSize.sm, fontWeight: '600' },
  gpsActions: { flexDirection: 'row', gap: spacing.sm },
  gpsBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center' },
  gpsBtnResume: { backgroundColor: colors.success },
  gpsBtnPause: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warning },
  gpsBtnStop: { backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.danger },
  gpsBtnText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '600' },
  gpsBtnPauseText: { color: colors.warning, fontSize: fontSize.sm, fontWeight: '600' },
  gpsBtnStopText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '600' },

  // Hours input
  hoursRow: { marginBottom: spacing.xs, gap: spacing.sm },
  hoursInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, fontSize: fontSize.md, color: colors.text,
    backgroundColor: colors.white, fontVariant: ['tabular-nums'],
  },
  hoursChipRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  hoursChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, backgroundColor: colors.borderLight,
  },
  hoursChipText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary },
  hoursHint: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.md, fontStyle: 'italic' },

  // Notes input
  inputLabel: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text, marginBottom: spacing.xs },
  notesInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.md, fontSize: fontSize.sm, color: colors.text,
    backgroundColor: colors.white, minHeight: 80, textAlignVertical: 'top',
  },
});
