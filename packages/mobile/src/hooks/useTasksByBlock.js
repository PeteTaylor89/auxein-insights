// hooks/useTasksByBlock.js — fetch all visible tasks once, group by block_id
// on the client. Backend is already property-scoped, so the limit:500 ceiling
// is a soft safety bound for V1 customer sizes.
//
// Contractor branch: /tasks/tasks is user-only — for contractors we instead
// derive task badges from /me/assignments, which is already scoped to the
// contractor and joins block/property context inline.
//
// Returns:
//   tasksByBlock     — { [block_id]: Task[] }
//   getBlockTasks(id) — convenience accessor returning [] when none
//   loading, error, refetch

import { useCallback, useEffect, useMemo, useState } from 'react';
import { tasksService, contractorService } from '../api/services';
import { useAuth } from '../contexts/AuthContext';

const OPEN_STATUSES = new Set(['ready', 'scheduled', 'in_progress']);

export default function useTasksByBlock({ enabled = true } = {}) {
  const { isContractor } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isContractor) {
        const res = await contractorService.listMyAssignments({ include_completed: false });
        const list = Array.isArray(res) ? res : [];
        // Project to the same shape useTasksByBlock + MapBlockSheet expect:
        // {id, block_id, status, title, start_date}. Assignments without a
        // task_id (ad-hoc self-logged work) carry no block context — skip.
        const projected = list
          .filter(a => a.task_id != null && a.block_id != null)
          .map(a => ({
            id: a.task_id,
            block_id: a.block_id,
            status: a.status === 'assigned' || a.status === 'accepted' ? 'scheduled'
                  : a.status === 'in_progress' ? 'in_progress'
                  : a.status,
            title: a.title,
            start_date: a.scheduled_start,
            due_date: a.scheduled_end,
          }));
        setTasks(projected);
      } else {
        const res = await tasksService.getTasks({ limit: 500 });
        setTasks(Array.isArray(res) ? res : (res?.tasks || []));
      }
    } catch (err) {
      console.warn('[useTasksByBlock] fetch failed', err?.response?.status, err?.message);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [isContractor, enabled]);

  useEffect(() => { load(); }, [load]);

  const tasksByBlock = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      if (t.block_id == null) continue;
      (map[t.block_id] ??= []).push(t);
    }
    // Sort each block's bucket: open (scheduled/ready/in_progress) first, then by
    // start_date/due_date asc. Sheet's preview list shows the most actionable first.
    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => {
        const ao = OPEN_STATUSES.has(a.status) ? 0 : 1;
        const bo = OPEN_STATUSES.has(b.status) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        const ad = a.start_date || a.due_date || '';
        const bd = b.start_date || b.due_date || '';
        return String(ad).localeCompare(String(bd));
      });
    }
    return map;
  }, [tasks]);

  const getBlockTasks = useCallback((blockId) => tasksByBlock[blockId] || [], [tasksByBlock]);

  return { tasksByBlock, getBlockTasks, loading, error, refetch: load };
}
