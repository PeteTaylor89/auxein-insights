// components/calendar/EventCard.jsx — colour-coded event pill with drag support
import './CalendarView.css';

const TYPE_LABELS = {
  task: 'Task',
  observation: 'Obs',
  training: 'Training',
  risk_action: 'Action',
  maintenance: 'Maint',
};

// "Pete Taylor" → "PT". "Anna" → "A". Falls back to "?" for empty/odd input.
function initialsOf(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AssigneeChips({ assignees }) {
  if (!assignees || assignees.length === 0) return null;
  const visible = assignees.slice(0, 2);
  const overflow = assignees.length - visible.length;
  return (
    <span
      className="calendar-event-assignees"
      title={assignees.join(', ')}
    >
      {visible.map((name, i) => (
        <span key={`${name}-${i}`} className="calendar-assignee-chip">
          {initialsOf(name)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="calendar-assignee-chip calendar-assignee-chip--overflow">
          +{overflow}
        </span>
      )}
    </span>
  );
}

function EventCard({ event, onClick, draggable, onDragStart, onDragEnd }) {
  const assigneesLabel = event.assignees?.length ? ` — ${event.assignees.join(', ')}` : '';
  return (
    <div
      className={`calendar-event ${draggable ? 'draggable' : ''}`}
      style={{ '--event-color': event.color || '#5B6830' }}
      onClick={() => onClick?.(event)}
      title={`${TYPE_LABELS[event.event_type] || event.event_type}: ${event.title}${assigneesLabel}`}
      role="button"
      tabIndex={0}
      draggable={draggable || false}
      onDragStart={draggable ? (e) => onDragStart?.(e, event) : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      <span className="calendar-event-dot" />
      <span className="calendar-event-title">{event.title}</span>
      <AssigneeChips assignees={event.assignees} />
    </div>
  );
}

export { initialsOf, AssigneeChips };
export default EventCard;
