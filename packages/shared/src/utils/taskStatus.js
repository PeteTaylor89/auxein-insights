export const TASK_STATUS_META = {
  draft:       { label: 'Draft',       tone: 'muted'   },
  scheduled:   { label: 'Scheduled',   tone: 'info'    },
  ready:       { label: 'Ready',       tone: 'info'    },
  in_progress: { label: 'In Progress', tone: 'warning' },
  paused:      { label: 'Paused',      tone: 'warning' },
  completed:   { label: 'Completed',   tone: 'success' },
  cancelled:   { label: 'Cancelled',   tone: 'danger'  },
};

export const TASK_STATUS_VALUES = Object.keys(TASK_STATUS_META);

export function getTaskStatusMeta(status) {
  const k = String(status || '').toLowerCase().replace(/\s+/g, '_');
  return TASK_STATUS_META[k] || { label: 'Unknown', tone: 'muted' };
}

export const TASK_STATUS_STARTABLE = ['draft', 'scheduled', 'ready'];
export const TASK_STATUS_ACTIVE = ['in_progress', 'paused'];
export const TASK_STATUS_FINISHED = ['completed', 'cancelled'];
