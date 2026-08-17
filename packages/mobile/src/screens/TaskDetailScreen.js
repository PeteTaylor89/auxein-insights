// screens/TaskDetailScreen.js — Full task detail with start/rows/complete (M2)
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
// GPS tracking is mothballed. The
// useGpsTracking hook, GpsTrackingScreen overlay and the backend track
// endpoints all still exist; this screen simply no longer reaches them.
// (phone GPS wasn't accurate enough to record a track worth acting on)
import { refOrId } from '../services/writeQueue';
import {
  TaskStatusBadge, useToast, EntityPhotos, SectionCard, BottomActionBar, SubTaskPanel,
} from '../components';
import RiskHazardChips from '../components/RiskHazardChips';

// Row label as the crew says it out loud — "Row 12", not "#4471".
// Named ...For to stay clear of the local `rowLabel` inside handleCompleteRow.
function rowLabelFor(row) {
  return `Row ${row?.row_identifier || row?.vineyard_row?.row_number || row?.id}`;
}

// The block a task sits on, whichever shape the payload arrived in:
// TaskWithRelations nests it, the lighter task payloads carry a flat name.
function blockNameOf(task) {
  return task?.block?.block_name || task?.block_name || null;
}

// "Block 4, Row 18 — Broken wire".
//
// The location leads because a repair list gets read two ways: some crews
// group by issue type, some by block. Whichever way it's sorted, the title
// has to say where to go — a bare "Broken wire" is useless once it's sitting
// in a roll-up alongside nine others.
//
// Truncation trims the ISSUE, never the location. "Block 4, Row 18 — broken
// wire on the third pos…" is still actionable; a title cut the other way
// isn't. Falls back to just the issue when the task has no block or row.
const TITLE_MAX = 200;
function issueTitle({ blockName, rowLabel, issue }) {
  const text = String(issue || '').trim();
  const where = [blockName, rowLabel ? `Row ${rowLabel}` : null].filter(Boolean).join(', ');
  if (!where) return text.slice(0, TITLE_MAX);
  if (!text) return where.slice(0, TITLE_MAX);

  const prefix = `${where} — `;
  const room = TITLE_MAX - prefix.length;
  if (room <= 1) return prefix.slice(0, TITLE_MAX);
  return prefix + (text.length > room ? `${text.slice(0, room - 1).trimEnd()}…` : text);
}

export default function TaskDetailScreen({ route, navigation }) {
  // fromTaskId is set when this screen was pushed from a roll-up's issue list,
  // i.e. one TaskDetail stacked on another. It only drives the back button —
  // see the headerLeft effect below.
  const { taskId, fromTaskId } = route.params;
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

  // Row completion modal state
  const toast = useToast();
  const [showRowModal, setShowRowModal] = useState(false);
  // Raise-an-issue-as-a-task, from the row completion sheet.
  const [raiseIssue, setRaiseIssue] = useState(false);
  const [rollUpCandidates, setRollUpCandidates] = useState([]);
  const [rollUpChoice, setRollUpChoice] = useState('__none__');
  const [newRollUpTitle, setNewRollUpTitle] = useState('');
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

  // Bumped on pull-to-refresh so the rolled-up issues reload with everything
  // else. SubTaskPanel owns its own fetch (it self-hides on ordinary tasks, so
  // hoisting the fetch here would run it on every task detail for nothing).
  const [childRefreshKey, setChildRefreshKey] = useState(0);

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

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadTask(), loadRows()]);
    setLoading(false);
  }, [loadTask, loadRows]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setChildRefreshKey(k => k + 1);
    await Promise.all([loadTask(), loadRows()]);
    setRefreshing(false);
  }, [loadTask, loadRows]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Opening an issue from the roll-up and completing it there must be visible
  // on the way back — otherwise the list still shows it outstanding and the
  // crew ticks it twice. Skip the first focus; loadAll() already covers mount.
  const hasFocusedOnce = useRef(false);
  useEffect(() => navigation.addListener('focus', () => {
    if (!hasFocusedOnce.current) { hasFocusedOnce.current = true; return; }
    setChildRefreshKey(k => k + 1);
    loadTask();
  }), [navigation, loadTask]);

  // Every row's issues + notes, rolled into one ordered list. Web parity with
  // the Field Notes card on TaskDetail.jsx: derived, never stored, so it can't
  // drift from the rows it came from. Issues sort ahead of plain notes, then
  // naturally by row so 2 comes before 10.
  const fieldNotes = useMemo(() => {
    const entries = [];
    for (const r of rows) {
      const label = rowLabelFor(r);
      if (r.issues_found && r.issues_found.trim()) {
        entries.push({ id: `${r.id}-i`, label, text: r.issues_found.trim(), isIssue: true });
      }
      if (r.notes && r.notes.trim()) {
        entries.push({ id: `${r.id}-n`, label, text: r.notes.trim(), isIssue: false });
      }
    }
    entries.sort((a, b) => {
      if (a.isIssue !== b.isIssue) return a.isIssue ? -1 : 1;
      return byNatural('label')(a, b);
    });
    return entries;
  }, [rows]);

  const fieldNotesText = useMemo(
    () => fieldNotes.map(e => `${e.label}: ${e.text}`).join('\n'),
    [fieldNotes],
  );

  // Seed the completion notes with what the crew already wrote row by row,
  // rather than making them retype it at the end of the job.
  const insertFieldNotes = () => {
    setCompletionNotes(prev => (prev?.trim() ? `${prev.trim()}\n${fieldNotesText}` : fieldNotesText));
  };

  useEffect(() => {
    navigation.setOptions({
      headerBackVisible: false, // hide the default tiny chevron — we render a clearer one
      headerLeft: () => (
        <TouchableOpacity
          // Opening an issue from a roll-up stacks TaskDetail on TaskDetail.
          // A hard navigate to TaskList would skip the parent the user came
          // from, so pop when there is somewhere to pop back to.
          onPress={() => {
            if (fromTaskId && navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('TaskList');
          }}
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
            {fromTaskId ? 'Back' : 'Tasks'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, fromTaskId]);

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
    setRaiseIssue(false);
    setRollUpChoice('__none__');
    setNewRollUpTitle('');
    setShowRowModal(true);
    // Load roll-up options up front so the picker is populated the moment the
    // user ticks "raise as a task" — in the field, waiting on a spinner with
    // gloves on is where a flow gets abandoned.
    tasksService.getRollUpCandidates({
      block_id: task?.block_id ?? undefined,
      task_category: task?.task_category ?? undefined,
    })
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setRollUpCandidates(arr);
        const best = arr[0];
        // Preselect only on a strong match (same block), same rule as web.
        if (best && task?.block_id && best.block_id === task.block_id) {
          setRollUpChoice(String(best.id));
        }
      })
      .catch(() => setRollUpCandidates([]));
  };

  const handleCompleteRow = async () => {
    if (!activeRow) return;
    try {
      // The row completes either way — raising a task is additive, and a failed
      // task create must not cost the user their row completion.
      await taskRowService.completeRow(taskId, activeRow.id, {
        notes: rowNotes || null,
        issues_found: rowIssues || null,
      });

      if (raiseIssue && rowIssues.trim()) {
        const rowLabel = activeRow.row_identifier
          || activeRow.vineyard_row?.row_number
          || `#${activeRow.id}`;
        try {
          let parentId = null;
          if (rollUpChoice === '__new__') {
            const parent = await tasksService.createTask({
              title: newRollUpTitle.trim() || `Follow-ups — ${blockNameOf(task) || 'vineyard'}`,
              task_category: task?.task_category || 'general',
              priority: 'medium',
            });
            // refOrId, not .id — created offline the parent is a queued stub
            // with no server id, and the child has to carry a reference the
            // queue resolves once the parent lands.
            parentId = refOrId(parent);
          } else if (rollUpChoice !== '__none__') {
            parentId = Number(rollUpChoice);
          }

          await tasksService.createTask({
            title: issueTitle({
              blockName: blockNameOf(task),
              rowLabel,
              issue: rowIssues,
            }),
            task_category: task?.task_category || 'general',
            priority: 'medium',
            description: `${rowIssues.trim()}\n\nRaised from ${task?.title || 'a row-by-row task'}${task?.task_number ? ` (${task.task_number})` : ''}, row ${rowLabel}.`,
            block_id: task?.block_id ?? null,
            location_notes: `Row ${rowLabel}`,
            ...(parentId ? { parent_task_id: parentId } : {}),
          });
          toast.show('Row completed and issue raised', 'success');
        } catch (issueErr) {
          console.error('Failed to raise issue task:', issueErr);
          Alert.alert(
            'Row completed',
            'The row was saved, but the issue task could not be created. Raise it from the task list when you have signal.',
          );
        }
      }

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
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Identity + the facts, in one card. Everything below is a
            SectionCard so the screen reads as one stack of sections rather
            than a run of hand-rolled panels. */}
        <SectionCard style={styles.headCard}>
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
        </SectionCard>

        {/* Field notes — what the crew logged row by row, in one place. Sits
            high on the screen because it's the thing someone picking the job
            back up actually needs to read. */}
        {fieldNotes.length > 0 && (
          <SectionCard
            icon="clipboard"
            title="Field notes"
            subtitle={`${fieldNotes.length} from ${rows.length} row${rows.length === 1 ? '' : 's'}`}
          >
            {fieldNotes.map(e => (
              <View key={e.id} style={styles.noteRow}>
                {e.isIssue
                  ? <Feather name="alert-triangle" size={13} color={colors.warning} style={styles.noteIcon} />
                  : <View style={styles.noteIconSpacer} />}
                <Text style={styles.noteLabel}>{e.label}</Text>
                <Text style={styles.noteText}>{e.text}</Text>
              </View>
            ))}
          </SectionCard>
        )}

        {/* Photos already on the server. Renders nothing at all when there are
            none, so the card style goes on the component rather than a wrapper
            that would otherwise be left empty. */}
        <EntityPhotos entityType="task" entityId={taskId} label="Photos" style={styles.photoCard} />

        {(rows.length > 0 || progress) && (
          <SectionCard
            icon="list"
            title="Rows"
            subtitle={progress
              ? `${progress.completed_rows}/${progress.total_rows} complete${progress.skipped_rows > 0 ? ` · ${progress.skipped_rows} skipped` : ''}`
              : undefined}
          >
            {progress && (
              <View style={styles.progressSection}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress.completion_percentage || 0}%` }]} />
                </View>
              </View>
            )}
            {rows.map(row => (
              <View key={row.id} style={styles.rowItem}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName}>{rowLabelFor(row)}</Text>
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
          </SectionCard>
        )}

        {/* A roll-up's children, as a tickable list. Self-hides on an ordinary
            task, so it can sit here unconditionally. Mounted below Rows to
            match the reading order on web's TaskDetail. */}
        <SubTaskPanel
          taskId={taskId}
          canEdit={!isCompleted}
          refreshKey={childRefreshKey}
          onNavigate={(childId) => navigation.push('TaskDetail', {
            taskId: childId,
            fromTaskId: taskId,
          })}
        />

      </ScrollView>

      {/* One shared action bar instead of a bespoke one — same safe-area and
          button treatment as every other capture screen. */}
      {!isCompleted && isStartable && (
        <BottomActionBar
          primaryLabel={actionLoading ? 'Starting…' : 'Start task'}
          primaryIcon="play"
          onPrimary={handleStartTask}
          disabled={actionLoading}
        />
      )}
      {!isCompleted && isCompletable && (
        <BottomActionBar
          primaryLabel="Complete task"
          primaryIcon="check-circle"
          onPrimary={handleOpenCompleteModal}
          disabled={actionLoading}
        />
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

                {/* Only offered once an issue has actually been described —
                    no point raising a task with nothing in it. */}
                {rowIssues.trim().length > 0 && (
                  <View style={styles.raiseBlock}>
                    <TouchableOpacity
                      style={styles.raiseToggle}
                      onPress={() => setRaiseIssue(v => !v)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.raiseCheckbox, raiseIssue && styles.raiseCheckboxOn]}>
                        {raiseIssue && <Text style={styles.raiseCheckboxTick}>✓</Text>}
                      </View>
                      <Text style={styles.raiseToggleText}>Raise this as a task</Text>
                    </TouchableOpacity>

                    {raiseIssue && (
                      <View style={styles.raiseOptions}>
                        <Text style={styles.inputLabel}>Add to roll-up</Text>

                        {rollUpCandidates.map(c => (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.rollUpOpt, rollUpChoice === String(c.id) && styles.rollUpOptOn]}
                            onPress={() => setRollUpChoice(String(c.id))}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.rollUpOptText} numberOfLines={1}>
                              {c.title || `Task #${c.id}`}
                            </Text>
                            <Text style={styles.rollUpCount}>{c.child_count}</Text>
                          </TouchableOpacity>
                        ))}

                        <TouchableOpacity
                          style={[styles.rollUpOpt, rollUpChoice === '__new__' && styles.rollUpOptOn]}
                          onPress={() => setRollUpChoice('__new__')}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.rollUpOptText}>New roll-up…</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.rollUpOpt, rollUpChoice === '__none__' && styles.rollUpOptOn]}
                          onPress={() => setRollUpChoice('__none__')}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.rollUpOptText}>Standalone task</Text>
                        </TouchableOpacity>

                        {rollUpChoice === '__new__' && (
                          <TextInput
                            style={styles.notesInput}
                            value={newRollUpTitle}
                            onChangeText={setNewRollUpTitle}
                            placeholder={`Wires — ${task?.block_name || 'Block'}`}
                            placeholderTextColor={colors.textMuted}
                          />
                        )}
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => { Keyboard.dismiss(); setShowRowModal(false); }}>
                    <Text style={styles.modalBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnPrimary]}
                    onPress={handleCompleteRow}
                  >
                    <Text style={styles.actionBtnText}>
                      {raiseIssue && rowIssues.trim() ? 'Complete & Raise' : 'Complete Row'}
                    </Text>
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

                <View style={styles.notesLabelRow}>
                  <Text style={styles.inputLabel}>Completion Notes</Text>
                  {fieldNotes.length > 0 && (
                    <TouchableOpacity
                      style={styles.insertNotesBtn}
                      onPress={insertFieldNotes}
                      accessibilityLabel="Insert field notes into completion notes"
                    >
                      <Feather name="clipboard" size={12} color={colors.primary} />
                      <Text style={styles.insertNotesText}>
                        Insert field notes ({fieldNotes.length})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
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

  // Page gutter lives on the scroll content now, so each SectionCard only has
  // to worry about its own spacing rather than carrying a margin.
  scrollContent: { padding: spacing.base, paddingBottom: spacing.xl },

  headCard: { marginBottom: spacing.md },
  // Matches SectionCard so the photo strip sits in the same stack.
  photoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },

  // Field notes
  noteRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs,
    paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  noteIcon: { marginTop: 2 },
  noteIconSpacer: { width: 13 },
  noteLabel: { fontSize: fontSize.xs, fontWeight: '700', color: colors.text, minWidth: 54 },
  noteText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 19 },

  // Insert-field-notes affordance in the complete sheet
  notesLabelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm,
  },
  insertNotesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 8,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary,
  },
  insertNotesText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  taskNumber: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '500' },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  description: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md },
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

  // Confirm buttons inside the modal sheets. The screen's own action bar is now
  // the shared BottomActionBar.
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

  // Raise-an-issue-as-a-task block in the row completion sheet. Targets are
  // deliberately large — this is used one-handed, outdoors, often with gloves.
  raiseBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  raiseToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  raiseCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  raiseCheckboxOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  raiseCheckboxTick: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  raiseToggleText: { fontSize: 15, fontWeight: '600', color: colors.text },
  raiseOptions: { marginTop: spacing.sm, gap: spacing.xs },
  rollUpOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rollUpOptOn: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.surfaceWarm || colors.surface },
  rollUpOptText: { flex: 1, fontSize: 14, color: colors.text },
  rollUpCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.surfaceWarm || colors.border,
  },
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
