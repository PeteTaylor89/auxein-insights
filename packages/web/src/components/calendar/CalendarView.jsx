// components/calendar/CalendarView.jsx — month/week grid with multi-day bars, quick add, drag-drop
import { useMemo, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X as XIcon } from 'lucide-react';
import EventCard, { AssigneeChips } from './EventCard';
import './CalendarView.css';

const TYPE_LABELS = {
  task: 'Tasks',
  observation: 'Observations',
  risk_action: 'Risk Actions',
  maintenance: 'Maintenance',
  training: 'Training',
};

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

  // Greedy interval packing → assign each bar a deterministic `track`.
  // Sort earliest-start-first, then longest-span-first so chunky bars get a
  // lower track and short bars slot in around them.
  bars.sort((a, b) => a.startCol - b.startCol || b.span - a.span);
  const trackEnds = []; // index = track, value = next free column
  for (const bar of bars) {
    let track = trackEnds.findIndex((endCol) => endCol <= bar.startCol);
    if (track === -1) {
      track = trackEnds.length;
      trackEnds.push(0);
    }
    trackEnds[track] = bar.startCol + bar.span;
    bar.track = track;
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
  const [modalDate, setModalDate] = useState(null); // Date object or null

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
    if (ev.event_type !== 'task' && ev.event_type !== 'risk_action') { e.preventDefault(); return; }
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

    // Field names differ per event type so the caller can route to the right endpoint.
    // For risk_action single-day events (no `.end`) we set both target dates to the
    // new date so the deadline moves with the drag — not just a phantom "start".
    const isTask = dragData.event_type === 'task';
    const dates = isTask
      ? { scheduled_start_date: newStartDate }
      : { target_start_date: newStartDate, target_completion_date: newStartDate };
    if (dragData.end) {
      const newEnd = new Date(stripTime(new Date(dragData.end)));
      newEnd.setDate(newEnd.getDate() + deltaDays);
      if (isTask) dates.scheduled_end_date = dateKey(newEnd);
      else dates.target_completion_date = dateKey(newEnd);
    }

    onReschedule(dragData, dates);
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

      {/* Week rows — three stacked layers per week:
            1. date-strip       (date numbers per day)
            2. span-layer       (multi-day bars, packed into deterministic tracks)
            3. events-row       (single-day events per day, also the drop targets)
          All events thus sit UNDER the date numbers, with bars between header
          and single-day events. */}
      {weeks.map((weekDays, wi) => {
        const bars = computeSpanningBars(weekDays, multiDayEvents);
        const trackCount = bars.reduce((m, b) => Math.max(m, b.track + 1), 0);

        return (
          <div key={wi} className="calendar-week-row">
            {/* Date strip — one cell per day, clickable number opens the day modal + optional add button */}
            <div className="calendar-date-strip">
              {weekDays.map(({ date: d, currentMonth }) => {
                const key = dateKey(d);
                return (
                  <div
                    key={`hdr-${key}`}
                    className={`calendar-date-cell ${!currentMonth ? 'other-month' : ''} ${isToday(d) ? 'today' : ''}`}
                  >
                    <button
                      type="button"
                      className="calendar-date-cell-btn"
                      onClick={() => setModalDate(d)}
                      title="See all events for this day"
                    >
                      <span className="calendar-cell-date">{d.getDate()}</span>
                    </button>
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
                );
              })}
            </div>

            {/* Multi-day bar layer — always rendered so every week has
                consistent vertical rhythm. Bars use explicit gridRow. */}
            <div
              className="calendar-span-layer"
              style={{ gridTemplateRows: trackCount > 0 ? `repeat(${trackCount}, 20px)` : '4px' }}
            >
              {bars.map((bar) => (
                <button
                  key={`span-${bar.event.event_type}-${bar.event.id}`}
                  className={`calendar-span-bar ${bar.continuesLeft ? 'continues-left' : ''} ${bar.continuesRight ? 'continues-right' : ''} ${hoveredEvent === eventUid(bar.event) ? 'span-hover' : ''}`}
                  style={{
                    '--event-color': bar.event.color || '#5B6830',
                    gridColumn: `${bar.startCol + 1} / span ${bar.span}`,
                    gridRow: `${bar.track + 1} / span 1`,
                  }}
                  onClick={() => onEventClick?.(bar.event)}
                  onMouseEnter={() => setHoveredEvent(eventUid(bar.event))}
                  onMouseLeave={() => setHoveredEvent(null)}
                  title={`${bar.event.title}${bar.event.assignees?.length ? ' — ' + bar.event.assignees.join(', ') : ''}`}
                  draggable={canEdit && (bar.event.event_type === 'task' || bar.event.event_type === 'risk_action') && bar.event.status !== 'completed' && bar.event.status !== 'cancelled'}
                  onDragStart={(e) => handleDragStart(e, bar.event)}
                  onDragEnd={handleDragEnd}
                >
                  <span className="calendar-span-bar-title">{bar.event.title}</span>
                  <AssigneeChips assignees={bar.event.assignees} />
                </button>
              ))}
            </div>

            {/* Events row — single-day events + drop targets */}
            <div className="calendar-events-row">
              {weekDays.map(({ date: d, currentMonth }) => {
                const key = dateKey(d);
                const dayEvents = singleDayByDate[key] || [];
                const isDropHere = dropTarget === key;

                return (
                  <div
                    key={`body-${key}`}
                    className={`calendar-cell ${!currentMonth ? 'other-month' : ''} ${isToday(d) ? 'today' : ''} ${isDropHere ? 'drop-target' : ''}`}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, d)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, d)}
                  >
                    <div className="calendar-cell-events">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <EventCard
                          key={`${ev.event_type}-${ev.id}`}
                          event={ev}
                          onClick={onEventClick}
                          draggable={canEdit && (ev.event_type === 'task' || ev.event_type === 'risk_action') && ev.status !== 'completed' && ev.status !== 'cancelled'}
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

      {modalDate && (
        <DayDetailModal
          date={modalDate}
          events={events}
          onClose={() => setModalDate(null)}
          onEventClick={(ev) => {
            setModalDate(null);
            onEventClick?.(ev);
          }}
        />
      )}
    </div>
  );
}

// Day detail modal — lists every event whose window includes the chosen day,
// grouped by type. Solves the "+N more" cap on the cell preview and gives a
// fuller view (title + status + assignees) before drilling into a record.
function DayDetailModal({ date, events, onClose, onEventClick }) {
  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const dayStart = stripTime(date);
  const dayKey = dateKey(date);

  // Pull every event whose date matches the chosen day OR whose multi-day
  // span covers it. Keep them in one flat list, then group by type at render.
  const dayEvents = useMemo(() => {
    const out = [];
    for (const ev of events) {
      const evStart = stripTime(new Date(ev.start));
      if (ev.end) {
        const evEnd = stripTime(new Date(ev.end));
        if (dayStart >= evStart && dayStart <= evEnd) out.push(ev);
      } else if (dateKey(new Date(ev.start)) === dayKey) {
        out.push(ev);
      }
    }
    return out;
  }, [events, dayStart, dayKey]);

  const groups = useMemo(() => {
    const order = ['task', 'observation', 'risk_action', 'maintenance', 'training'];
    const map = {};
    for (const ev of dayEvents) {
      const t = ev.event_type || 'other';
      if (!map[t]) map[t] = [];
      map[t].push(ev);
    }
    return order
      .filter((t) => map[t] && map[t].length > 0)
      .map((t) => ({ type: t, label: TYPE_LABELS[t] || t, events: map[t] }))
      // Then any types we didn't anticipate, alphabetised.
      .concat(
        Object.keys(map)
          .filter((t) => !order.includes(t))
          .sort()
          .map((t) => ({ type: t, label: TYPE_LABELS[t] || t, events: map[t] })),
      );
  }, [dayEvents]);

  const formatted = date.toLocaleDateString('en-NZ', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return createPortal(
    <div className="cdm-overlay" onClick={onClose}>
      <div className="cdm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cdm-header">
          <h3 className="cdm-title">{formatted}</h3>
          <button className="cdm-close" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>
        <div className="cdm-body">
          {dayEvents.length === 0 ? (
            <div className="cdm-empty">Nothing scheduled for this day.</div>
          ) : (
            groups.map((g) => (
              <div key={g.type} className="cdm-group">
                <div className="cdm-group-title">{g.label} ({g.events.length})</div>
                {g.events.map((ev) => (
                  <div
                    key={`${ev.event_type}-${ev.id}`}
                    className="cdm-event"
                    style={{ '--event-color': ev.color || '#5B6830' }}
                    onClick={() => onEventClick(ev)}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="cdm-event-title">{ev.title}</span>
                    <AssigneeChips assignees={ev.assignees} />
                    {ev.status && <span className="cdm-event-status">{String(ev.status).replace(/_/g, ' ')}</span>}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default CalendarView;
