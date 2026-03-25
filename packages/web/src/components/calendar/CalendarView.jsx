// components/calendar/CalendarView.jsx — month/week grid with multi-day bars, quick add, drag-drop
import { useMemo, useState, useCallback } from 'react';
import EventCard from './EventCard';
import './CalendarView.css';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonthDays(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  let startOffset = (first.getDay() + 6) % 7;
  const days = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -i), currentMonth: false });
  }
  for (let i = 1; i <= last.getDate(); i++) {
    days.push({ date: new Date(year, month, i), currentMonth: true });
  }
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - last.getDate() - startOffset + 1);
    days.push({ date: d, currentMonth: false });
  }
  return days;
}

function getWeekDays(year, month, day) {
  const current = new Date(year, month, day);
  const dayOfWeek = (current.getDay() + 6) % 7;
  const monday = new Date(current);
  monday.setDate(current.getDate() - dayOfWeek);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({ date: d, currentMonth: d.getMonth() === month });
  }
  return days;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isToday(d) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isMultiDay(ev) {
  if (!ev.end) return false;
  const s = stripTime(new Date(ev.start));
  const e = stripTime(new Date(ev.end));
  return e.getTime() > s.getTime();
}

function computeSpanningBars(weekDays, multiDayEvents) {
  const weekStart = stripTime(weekDays[0].date);
  const weekEnd = stripTime(weekDays[6].date);
  const bars = [];

  for (const ev of multiDayEvents) {
    const evStart = stripTime(new Date(ev.start));
    const evEnd = stripTime(new Date(ev.end));
    if (evEnd < weekStart || evStart > weekEnd) continue;

    const barStart = evStart < weekStart ? weekStart : evStart;
    const barEnd = evEnd > weekEnd ? weekEnd : evEnd;
    const startCol = Math.round((barStart - weekStart) / 86400000);
    const endCol = Math.round((barEnd - weekStart) / 86400000);

    bars.push({
      event: ev,
      startCol,
      span: endCol - startCol + 1,
      continuesLeft: evStart < weekStart,
      continuesRight: evEnd > weekEnd,
    });
  }
  return bars;
}

function eventUid(ev) {
  return `${ev.event_type}-${ev.id}`;
}

function CalendarView({ year, month, selectedDate, view, events, onEventClick, onAddTask, onReschedule, canEdit }) {
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const [dragData, setDragData] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const days = useMemo(() => {
    if (view === 'week') {
      return getWeekDays(year, month, selectedDate || new Date().getDate());
    }
    return getMonthDays(year, month);
  }, [year, month, selectedDate, view]);

  const { multiDayEvents, singleDayByDate } = useMemo(() => {
    const multi = [];
    const single = {};
    for (const ev of events) {
      if (isMultiDay(ev)) {
        multi.push(ev);
      } else {
        const key = dateKey(new Date(ev.start));
        if (!single[key]) single[key] = [];
        single[key].push(ev);
      }
    }
    return { multiDayEvents: multi, singleDayByDate: single };
  }, [events]);

  const weeks = useMemo(() => {
    const rows = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7));
    }
    return rows;
  }, [days]);

  // Drag handlers — no useCallback to avoid stale closure issues with dragData
  const handleDragStart = (e, ev) => {
    if (!canEdit) return;
    if (ev.event_type !== 'task') { e.preventDefault(); return; }
    if (ev.status === 'completed' || ev.status === 'cancelled') { e.preventDefault(); return; }
    setDragData(ev);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ev.id.toString());
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e, dayDate) => {
    e.preventDefault();
    setDropTarget(dateKey(dayDate));
  };

  const handleDragLeave = (e) => {
    // Only clear if leaving the cell entirely (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropTarget(null);
    }
  };

  const handleDrop = (e, dayDate) => {
    e.preventDefault();
    setDropTarget(null);
    if (!dragData || !onReschedule) { setDragData(null); return; }

    const newStartDate = dateKey(dayDate);
    const origStart = dateKey(new Date(dragData.start));
    if (newStartDate === origStart) { setDragData(null); return; }

    const origDate = stripTime(new Date(dragData.start));
    const newDate = stripTime(dayDate);
    const deltaDays = Math.round((newDate - origDate) / 86400000);

    const dates = { scheduled_start_date: newStartDate };
    if (dragData.end) {
      const newEnd = new Date(stripTime(new Date(dragData.end)));
      newEnd.setDate(newEnd.getDate() + deltaDays);
      dates.scheduled_end_date = dateKey(newEnd);
    }

    onReschedule(dragData.id, dates);
    setDragData(null);
  };

  const handleDragEnd = () => {
    setDragData(null);
    setDropTarget(null);
  };

  return (
    <div className={`calendar-view ${view === 'week' ? 'calendar-view--week' : ''}`}>
      {/* Day headers */}
      <div className="calendar-header-row">
        {DAYS.map((d) => (
          <div key={d} className="calendar-day-header">{d}</div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((weekDays, wi) => {
        const bars = computeSpanningBars(weekDays, multiDayEvents);

        return (
          <div key={wi} className="calendar-week-row">
            {/* Multi-day bar layer */}
            {bars.length > 0 && (
              <div className="calendar-span-layer">
                {bars.map((bar) => (
                  <button
                    key={`span-${bar.event.event_type}-${bar.event.id}`}
                    className={`calendar-span-bar ${bar.continuesLeft ? 'continues-left' : ''} ${bar.continuesRight ? 'continues-right' : ''} ${hoveredEvent === eventUid(bar.event) ? 'span-hover' : ''}`}
                    style={{
                      '--event-color': bar.event.color || '#5B6830',
                      gridColumn: `${bar.startCol + 1} / span ${bar.span}`,
                    }}
                    onClick={() => onEventClick?.(bar.event)}
                    onMouseEnter={() => setHoveredEvent(eventUid(bar.event))}
                    onMouseLeave={() => setHoveredEvent(null)}
                    title={bar.event.title}
                  >
                    <span className="calendar-span-bar-title">{bar.event.title}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Day cells */}
            <div className="calendar-day-row">
              {weekDays.map(({ date: d, currentMonth }) => {
                const key = dateKey(d);
                const dayEvents = singleDayByDate[key] || [];
                const isDropHere = dropTarget === key;

                return (
                  <div
                    key={key}
                    className={`calendar-cell ${!currentMonth ? 'other-month' : ''} ${isToday(d) ? 'today' : ''} ${isDropHere ? 'drop-target' : ''}`}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, d)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, d)}
                  >
                    <div className="calendar-cell-header">
                      <span className="calendar-cell-date">{d.getDate()}</span>
                      {canEdit && onAddTask && (
                        <button
                          className="calendar-add-btn"
                          onClick={() => onAddTask(dateKey(d))}
                          title="Create task"
                        >
                          +
                        </button>
                      )}
                    </div>
                    <div className="calendar-cell-events">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <EventCard
                          key={`${ev.event_type}-${ev.id}`}
                          event={ev}
                          onClick={onEventClick}
                          draggable={canEdit && ev.event_type === 'task' && ev.status !== 'completed' && ev.status !== 'cancelled'}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="calendar-more">+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CalendarView;
