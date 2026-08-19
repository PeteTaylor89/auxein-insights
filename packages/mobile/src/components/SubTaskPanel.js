// components/SubTaskPanel.js — a roll-up's children, shown as rows.
//
// Mobile counterpart to web's components/tasks/SubTaskPanel.jsx. The field
// workflow: a crew pruning row by row hits a broken wire, raises it as an
// issue task, and it lands under "Wires — Block A". When someone later opens
// that roll-up ON THE PHONE, in the block, they should see those issues the
// same way a pruning task shows its rows — a list to work down and tick off.
// Until this existed, the parent opened to nothing and the issues could only
// be worked from the web app.
//
// Children are TASKS, not task_rows — deliberately. Each carries its own
// status, assignee, schedule and history; materialising them into task_rows
// would create a second source of truth for the same work. So this mirrors
// the Rows card's SHAPE without sharing its data model.
//
// The status circle does NOT complete the child. It used to, with an empty
// payload — so a tap finished the task instantly with no hours, no notes and
// no start, and the Undo it offered could never work: PATCH /tasks/{id}
// refuses any update to a completed task (tasks.py, "Cannot update {status}
// tasks"), which is the same guard that already hides Detach on a finished
// row. Completing a child now goes through the standard path — open it, start
// it, complete it with hours and notes — so there is nothing to undo.
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '../styles/theme';
import { tasksService } from '../api/services';
import { listChildTasksCached } from '../services/tasksCache';
import { byNatural } from '../utils/naturalSort';
import { TASK_STATUS_FINISHED } from '../utils/taskStatus';
import SectionCard from './SectionCard';
import TaskStatusBadge from './TaskStatusBadge';
import { useToast } from './Toast';

const isFinished = (status) =>
  TASK_STATUS_FINISHED.includes(String(status || '').toLowerCase().replace(/\s+/g, '_'));

// Oldest first, so the list reads in the order the issues were found. Natural
// sort on the task number keeps 2 ahead of 10 when the numbers are strings.
function sortChildren(res) {
  // The endpoint is response_model=List[...] so a bare array is the contract,
  // but unwrap an envelope too — the same tolerance web has. A silent [] here
  // reads as "nothing rolled up", which is the wrong story to tell.
  const list = Array.isArray(res) ? res : (res?.items ?? res?.tasks ?? []);
  if (!Array.isArray(list)) return [];
  const arr = [...list];
  arr.sort((a, b) => {
    const af = isFinished(a.status) ? 1 : 0;
    const bf = isFinished(b.status) ? 1 : 0;
    if (af !== bf) return af - bf; // outstanding work first — that's the job
    const cmp = byNatural('task_number')(a, b);
    if (cmp !== 0) return cmp;
    return (a.id ?? 0) - (b.id ?? 0);
  });
  return arr;
}

// `refreshKey` lets the parent screen's pull-to-refresh reach in here without
// an imperative ref — bump it and the load effect re-fires.
export default function SubTaskPanel({ taskId, canEdit = true, onNavigate, refreshKey = 0, style }) {
  const toast = useToast();
  const [children, setChildren] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!taskId) return;
    try {
      const data = await listChildTasksCached(taskId, {
        onCached: (cached) => {
          if (cached?.data) setChildren(sortChildren(cached.data));
        },
      });
      setChildren(sortChildren(data));
    } catch (err) {
      console.log('Failed to load rolled-up tasks:', err.message);
      setChildren([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, refreshKey]);

  useEffect(() => { load(); }, [load]);

  // Detach is the only write left in this panel. Offline it resolves with the
  // queue's 202 stub and the read cache knows nothing about it, so reloading
  // would paint the child straight back into the list — hence the local splice
  // on `__queued` below, and a real re-read only when the write landed.
  const detachChild = async (child) => {
    setBusyId(child.id);
    try {
      const res = await tasksService.updateTask(child.id, { parent_task_id: null });
      if (res?.__queued) setChildren(prev => prev.filter(c => c.id !== child.id));
      else await load();
      toast.show('Removed from this roll-up', 'success', undefined, {
        label: 'Undo',
        onPress: async () => {
          try {
            const undone = await tasksService.updateTask(child.id, {
              parent_task_id: Number(taskId),
            });
            if (undone?.__queued) setChildren(prev => sortChildren([...prev, child]));
            else await load();
          } catch {
            toast.show('Could not undo that', 'error');
          }
        },
      });
    } catch (err) {
      toast.show(err?.response?.data?.detail || 'Could not remove that task', 'error');
    } finally {
      setBusyId(null);
    }
  };

  // An ordinary task has no children — render nothing at all rather than an
  // empty card, whether we're still loading or came back empty. Same
  // self-hiding rule as web, so this is safe to mount on every task detail.
  if (children.length === 0) return null;

  const done = children.filter(c => isFinished(c.status)).length;
  const pct = children.length > 0 ? Math.round((done / children.length) * 100) : 0;

  return (
    <SectionCard
      icon="layers"
      title="Rolled-up issues"
      subtitle={`${done}/${children.length} complete`}
      style={style}
    >
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>

      {children.map((c) => {
        const finished = isFinished(c.status);
        const busy = busyId === c.id;
        return (
          <View key={c.id} style={[styles.row, finished && styles.rowDone]}>
            {/* Status only. Tapping it opens the child rather than doing
                nothing, so the circle is not a dead target. */}
            <TouchableOpacity
              onPress={() => onNavigate?.(c.id)}
              hitSlop={8}
              style={[styles.check, finished && styles.checkDone]}
              accessibilityLabel={finished ? `${c.title}, complete. Open it` : `Open ${c.title}`}
            >
              <Feather
                name={finished ? 'check-circle' : 'circle'}
                size={20}
                color={finished ? colors.success : colors.textMuted}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.main}
              onPress={() => onNavigate?.(c.id)}
              accessibilityLabel={`Open ${c.title}`}
            >
              <Text
                style={[styles.rowTitle, finished && styles.rowTitleDone]}
                numberOfLines={2}
              >
                {c.title || `Task #${c.id}`}
              </Text>
              <View style={styles.metaRow}>
                <TaskStatusBadge status={c.status} size="sm" />
                {(c.block?.block_name || c.block_name) ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    {c.block?.block_name || c.block_name}
                  </Text>
                ) : null}
                {c.task_number ? <Text style={styles.meta}>{c.task_number}</Text> : null}
              </View>
            </TouchableOpacity>

            {/* Detach is hidden on a finished child: PATCH /tasks/{id} refuses
                any update to a completed or cancelled task, so the button
                would only ever 400. */}
            {canEdit && !finished && (
              <TouchableOpacity
                onPress={() => detachChild(c)}
                disabled={busy}
                hitSlop={8}
                style={styles.detach}
                accessibilityLabel={`Remove ${c.title} from this roll-up`}
              >
                {busy
                  ? <ActivityIndicator size="small" color={colors.textMuted} />
                  : <Feather name="x" size={16} color={colors.textMuted} />}
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  progressBar: {
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowDone: { opacity: 0.6 },
  check: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { opacity: 1 },
  main: { flex: 1 },
  rowTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  rowTitleDone: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  meta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  detach: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
