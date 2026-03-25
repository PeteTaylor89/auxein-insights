// components/calendar/EventCard.jsx — colour-coded event pill with drag support
import './CalendarView.css';

const TYPE_LABELS = {
  task: 'Task',
  observation: 'Obs',
  training: 'Training',
  risk_action: 'Action',
  maintenance: 'Maint',
};

function EventCard({ event, onClick, draggable, onDragStart, onDragEnd }) {
  return (
    <div
      className={`calendar-event ${draggable ? 'draggable' : ''}`}
      style={{ '--event-color': event.color || '#5B6830' }}
      onClick={() => onClick?.(event)}
      title={`${TYPE_LABELS[event.event_type] || event.event_type}: ${event.title}`}
      role="button"
      tabIndex={0}
      draggable={draggable || false}
      onDragStart={draggable ? (e) => onDragStart?.(e, event) : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      <span className="calendar-event-dot" />
      <span className="calendar-event-title">{event.title}</span>
    </div>
  );
}

export default EventCard;
