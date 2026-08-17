// services/tasksCache.js — Stale-while-revalidate wrappers for tasks endpoints.
// Screens import these instead of tasksService for read paths so cold-open
// offline still shows the last-loaded data.
import { swr, paramKey } from './offlineCache';
import { tasksService, taskRowService } from '../api/services';

// Key namespace conventions:
//   tasks.feed:<params>
//   tasks.detail:<taskId>
//   tasks.mine:<userId>:<params>
//   tasks.rows:<taskId>
//   tasks.rowProgress:<taskId>
//   tasks.children:<taskId>

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

// A roll-up's children. Cached like rows are, and for the same reason: the
// crew opens the roll-up in the block to work down it, which is exactly where
// signal is worst. Without this the panel would be empty offline even though
// the parent task itself paints from cache.
export async function listChildTasksCached(taskId, opts = {}) {
  const key = `tasks.children:${taskId}`;
  return swr(key, () => tasksService.listChildTasks(taskId), opts);
}
