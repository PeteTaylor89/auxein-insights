// components/calendar/EventCard.jsx — colour-coded event pill
import './CalendarView.css';

const TYPE_LABELS = {
  task: 'Task',
  observation: 'Obs',
  training: 'Training',
  risk_action: 'Action',
  maintenance: 'Maint',
};

function EventCard({ event, onClick }) {
  return (
    <button
      className="calendar-event"
      style={{ '--event-color': event.color || '#5B6830' }}
      onClick={() => onClick?.(event)}
      title={`${TYPE_LABELS[event.event_type] || event.event_type}: ${event.title}`}
    >
      <span className="calendar-event-dot" />
      <span className="calendar-event-title">{event.title}</span>
    </button>
  );
}

export default EventCard;
