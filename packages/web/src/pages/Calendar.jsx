// pages/Calendar.jsx — unified calendar with month/week toggle and type filters
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { calendarService } from '@vineyard/shared';
import CalendarView from '../components/calendar/CalendarView';
import './Calendar.css';

const EVENT_TYPES = [
  { value: 'task', label: 'Tasks', color: '#5B6830' },
  { value: 'observation', label: 'Observations', color: '#2d5a87' },
  { value: 'training', label: 'Training', color: '#7c3aed' },
  { value: 'risk_action', label: 'Risk Actions', color: '#D1583B' },
  { value: 'maintenance', label: 'Maintenance', color: '#f59e0b' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function Calendar() {
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView] = useState('month'); // month | week
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTypes, setActiveTypes] = useState(EVENT_TYPES.map((t) => t.value));

  // Date range for API query
  const { startDate, endDate } = useMemo(() => {
    const start = new Date(year, month, 1);
    start.setDate(start.getDate() - 7); // buffer for previous month overflow
    const end = new Date(year, month + 1, 0);
    end.setDate(end.getDate() + 7); // buffer for next month overflow
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, [year, month]);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await calendarService.getEvents(startDate, endDate, activeTypes);
      setEvents(data || []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, activeTypes]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const goPrev = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };

  const goNext = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const toggleType = (type) => {
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleEventClick = (event) => {
    if (event.url) navigate(event.url);
  };

  return (
    <div className="page-container">
      <div className="calendar-page">
        {/* Header */}
        <div className="calendar-header">
          <div className="calendar-title-row">
            <CalendarIcon size={24} />
            <h1 className="section-title">Calendar</h1>
          </div>

          <div className="calendar-controls">
            <div className="calendar-nav">
              <button className="calendar-nav-btn" onClick={goPrev} aria-label="Previous month">
                <ChevronLeft size={18} />
              </button>
              <span className="calendar-nav-label">
                {MONTH_NAMES[month]} {year}
              </span>
              <button className="calendar-nav-btn" onClick={goNext} aria-label="Next month">
                <ChevronRight size={18} />
              </button>
            </div>

            <button className="btn-ghost calendar-today-btn" onClick={goToday}>
              Today
            </button>

            <div className="calendar-view-toggle">
              <button
                className={`calendar-view-btn ${view === 'month' ? 'active' : ''}`}
                onClick={() => setView('month')}
              >
                Month
              </button>
              <button
                className={`calendar-view-btn ${view === 'week' ? 'active' : ''}`}
                onClick={() => setView('week')}
              >
                Week
              </button>
            </div>
          </div>
        </div>

        {/* Type filters / legend */}
        <div className="calendar-legend">
          {EVENT_TYPES.map((t) => (
            <button
              key={t.value}
              className={`calendar-legend-item ${activeTypes.includes(t.value) ? '' : 'inactive'}`}
              onClick={() => toggleType(t.value)}
            >
              <span className="calendar-legend-dot" style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="calendar-loading">Loading events...</div>
        ) : (
          <CalendarView
            year={year}
            month={month}
            selectedDate={today.getDate()}
            view={view}
            events={events}
            onEventClick={handleEventClick}
          />
        )}
      </div>
    </div>
  );
}

export default Calendar;
