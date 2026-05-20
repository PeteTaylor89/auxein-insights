// maps-v2/components/TaskDetailModal.jsx — Unified task modal, opened from a
// block's task symbol (list mode for N>1 tasks per block) or a GPS track
// line click (detail mode for one task).
import { useEffect, useMemo, useState } from 'react';
import {
  X, ArrowLeft, ExternalLink, MapPin, Calendar, User, Users,
  Clock, ClipboardList, Loader2, Navigation, Image as ImageIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { tasksService } from '@vineyard/shared';
import './TaskDetailModal.css';

const STATUS_COLORS = {
  in_progress: { bg: 'rgba(209,88,59,0.15)', fg: '#D1583B' },
  paused:      { bg: 'rgba(245,158,11,0.15)', fg: '#b45309' },
  ready:       { bg: 'rgba(91,104,48,0.15)', fg: '#5B6830' },
  scheduled:   { bg: 'rgba(59,130,246,0.15)', fg: '#1d4ed8' },
  completed:   { bg: 'rgba(91,104,48,0.15)', fg: '#5B6830' },
  cancelled:   { bg: 'rgba(107,114,128,0.15)', fg: '#374151' },
  draft:       { bg: 'rgba(156,163,175,0.15)', fg: '#4b5563' },
};

const STATUS_LABEL = {
  in_progress: 'In progress',
  paused: 'Paused',
  ready: 'Ready',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  draft: 'Draft',
};

function StatusPill({ status }) {
  const tone = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span
      className="v2-tdm-status"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function formatDate(value) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString('en-NZ', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return null; }
}

function TaskListView({ tasks, onPick }) {
  return (
    <ul className="v2-tdm-list">
      {tasks.map((t) => (
        <li key={t.id}>
          <button className="v2-tdm-list-item" onClick={() => onPick(t.id)}>
            <div className="v2-tdm-list-main">
              <div className="v2-tdm-list-title">{t.title || 'Untitled task'}</div>
              <div className="v2-tdm-list-meta">
                {t.task_category && <span>{t.task_category}</span>}
                {t.due_date && <span>· Due {formatDate(t.due_date)}</span>}
              </div>
            </div>
            <StatusPill status={t.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function TaskDetailView({ taskId, onBack, showBack }) {
  const [task, setTask] = useState(null);
  const [gpsStats, setGpsStats] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const t = await tasksService.getTask(taskId);
        if (cancelled) return;
        setTask(t);

        // Parallel: GPS stats + photos. Either failing is non-fatal.
        const [statsResult, photosResult] = await Promise.allSettled([
          t.has_gps_data ? tasksService.getGpsStats(taskId) : Promise.resolve(null),
          tasksService.listTaskPhotos(taskId),
        ]);
        if (cancelled) return;
        if (statsResult.status === 'fulfilled') setGpsStats(statsResult.value);
        if (photosResult.status === 'fulfilled' && Array.isArray(photosResult.value)) {
          setPhotos(photosResult.value);
        }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.detail || err.message || 'Failed to load task');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [taskId]);

  if (loading) {
    return (
      <div className="v2-tdm-loading">
        <Loader2 size={18} className="v2-spin" /> Loading task…
      </div>
    );
  }
  if (error) return <div className="v2-tdm-error">{error}</div>;
  if (!task) return null;

  const assignees = [
    ...(task.assignee_names || []),
    ...(task.contractor_names || []),
  ];

  const distanceKm = gpsStats?.total_distance_km;
  const activeMins = gpsStats?.active_duration_minutes;
  const coverageHa = gpsStats?.coverage_area_hectares;

  return (
    <>
      <div className="v2-tdm-head">
        {showBack && (
          <button className="v2-tdm-back" onClick={onBack} aria-label="Back to task list">
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="v2-tdm-title-wrap">
          <div className="v2-tdm-eyebrow"><ClipboardList size={12} /> Task</div>
          <h3 className="v2-tdm-title">{task.title || 'Untitled task'}</h3>
        </div>
        <StatusPill status={task.status} />
      </div>

      <div className="v2-tdm-grid">
        {task.block_name && (
          <Row icon={<MapPin size={14} />} label="Block" value={task.block_name} />
        )}
        {task.task_category && (
          <Row icon={<ClipboardList size={14} />} label="Category" value={task.task_category} />
        )}
        {task.priority && (
          <Row icon={<ClipboardList size={14} />} label="Priority" value={task.priority} />
        )}
        {task.due_date && (
          <Row icon={<Calendar size={14} />} label="Due" value={formatDate(task.due_date)} />
        )}
        {task.scheduled_start && (
          <Row icon={<Calendar size={14} />} label="Scheduled" value={formatDate(task.scheduled_start)} />
        )}
        {task.completed_at && (
          <Row icon={<Calendar size={14} />} label="Completed" value={formatDate(task.completed_at)} />
        )}
        {assignees.length > 0 && (
          <Row
            icon={assignees.length > 1 ? <Users size={14} /> : <User size={14} />}
            label={assignees.length > 1 ? 'Assignees' : 'Assignee'}
            value={assignees.join(', ')}
          />
        )}
        {task.actual_hours != null && (
          <Row icon={<Clock size={14} />} label="Hours" value={`${task.actual_hours}h`} />
        )}
      </div>

      {(distanceKm != null || activeMins != null || coverageHa != null) && (
        <div className="v2-tdm-gps">
          <div className="v2-tdm-gps-head">
            <Navigation size={14} /> GPS summary
          </div>
          <div className="v2-tdm-gps-stats">
            {distanceKm != null && (
              <Stat label="Distance" value={`${Number(distanceKm).toFixed(2)} km`} />
            )}
            {activeMins != null && (
              <Stat label="Active" value={`${activeMins} min`} />
            )}
            {coverageHa != null && coverageHa > 0 && (
              <Stat label="Coverage" value={`${Number(coverageHa).toFixed(2)} ha`} />
            )}
          </div>
        </div>
      )}

      {task.description && (
        <p className="v2-tdm-desc">{task.description}</p>
      )}

      {photos.length > 0 && (
        <div className="v2-tdm-photos">
          <div className="v2-tdm-photos-head">
            <ImageIcon size={14} /> Photos · {photos.length}
          </div>
          <div className="v2-tdm-photos-grid">
            {photos.slice(0, 6).map((p) => (
              <div key={p.id} className="v2-tdm-photo">
                {p.download_url ? (
                  <img src={p.download_url} alt={p.filename || ''} loading="lazy" />
                ) : (
                  <div className="v2-tdm-photo-fallback"><ImageIcon size={18} /></div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="v2-tdm-actions">
        <button
          className="v2-tdm-btn v2-tdm-btn--accent"
          onClick={() => navigate(`/tasks/${task.id}`)}
        >
          <ExternalLink size={14} /> Open full task
        </button>
      </div>
    </>
  );
}

function Row({ icon, label, value }) {
  return (
    <div className="v2-tdm-row">
      <span className="v2-tdm-row-icon">{icon}</span>
      <span className="v2-tdm-row-label">{label}</span>
      <span className="v2-tdm-row-value">{value}</span>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="v2-tdm-stat">
      <div className="v2-tdm-stat-value">{value}</div>
      <div className="v2-tdm-stat-label">{label}</div>
    </div>
  );
}

export default function TaskDetailModal({ open, taskId, tasks, onClose }) {
  // If a list of tasks is supplied with more than one, start in list mode and
  // let the user pick. Otherwise jump straight to the detail.
  const initialId = useMemo(() => {
    if (taskId) return taskId;
    if (tasks && tasks.length === 1) return tasks[0].id;
    return null;
  }, [taskId, tasks]);

  const [activeId, setActiveId] = useState(initialId);
  const showList = !activeId && tasks && tasks.length > 1;

  useEffect(() => {
    setActiveId(initialId);
  }, [initialId, open]);

  if (!open) return null;

  return (
    <div className="v2-tdm-backdrop" onClick={onClose}>
      <div className="v2-tdm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="v2-tdm-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <div className="v2-tdm-body">
          {showList ? (
            <>
              <div className="v2-tdm-head">
                <div className="v2-tdm-title-wrap">
                  <div className="v2-tdm-eyebrow"><ClipboardList size={12} /> Tasks on this block</div>
                  <h3 className="v2-tdm-title">{tasks.length} tasks</h3>
                </div>
              </div>
              <TaskListView tasks={tasks} onPick={setActiveId} />
            </>
          ) : (
            activeId && (
              <TaskDetailView
                taskId={activeId}
                onBack={() => setActiveId(null)}
                showBack={tasks && tasks.length > 1}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
