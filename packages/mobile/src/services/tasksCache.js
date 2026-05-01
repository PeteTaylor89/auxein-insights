// services/tasksCache.js — Stale-while-revalidate wrappers for tasks endpoints.
// Screens import these instead of tasksService for read paths so cold-open
// offline still shows the last-loaded data.
import { swr } from './offlineCache';
import { tasksService, taskRowService } from '../api/services';

// Key namespace conventions:
//   tasks.feed:<params>
//   tasks.detail:<taskId>
//   tasks.mine:<userId>:<params>
//   tasks.rows:<taskId>
//   tasks.rowProgress:<taskId>

function paramKey(params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return '';
  entries.sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join('&');
}

export async function getUnifiedFeedCached(params = {}, opts = {}) {
  const key = `tasks.feed:${paramKey(params)}`;
  return swr(key, () => tasksService.getUnifiedFeed(params), opts);
}

export async function getTaskCached(taskId, opts = {}) {
  const key = `tasks.detail:${taskId}`;
  return swr(key, () => tasksService.getTask(taskId), opts);
}

export async function getMyTasksCached(userId, params = {}, opts = {}) {
  const key = `tasks.mine:${userId}:${paramKey(params)}`;
  return swr(key, () => tasksService.getMyTasks(userId, params), opts);
}

export async function listRowsCached(taskId, opts = {}) {
  const key = `tasks.rows:${taskId}`;
  return swr(key, () => taskRowService.listRows(taskId), opts);
}

export async function getRowProgressCached(taskId, opts = {}) {
  const key = `tasks.rowProgress:${taskId}`;
  return swr(key, () => taskRowService.getProgress(taskId), opts);
}
