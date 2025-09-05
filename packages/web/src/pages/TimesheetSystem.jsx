import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { 
  Users, Clock, CheckCircle2, AlertTriangle, Plus, Trash2, 
  Calendar, Filter, Download, Eye, ChevronRight, Save, ChevronLeft 
} from 'lucide-react';

import { useAuth, timesheetsService, tasksService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';

const styles = {
  // Main container styles
  container: { minHeight: '100vh', backgroundColor: '#f9fafb' },
  header: { backgroundColor: 'white', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', borderBottom: '1px solid #e5e7eb' },
  headerInner: { maxWidth: '80rem', margin: '0 auto', padding: '0 1rem' },
  headerContent: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '4rem' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '2rem' },
  title: { fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', margin: 0 },
  nav: { display: 'flex', gap: '0.25rem' },
  navButton: (active) => ({
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: active ? '#dbeafe' : 'transparent',
    color: active ? '#1d4ed8' : '#6b7280',
    boxShadow: active ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none'
  }),
  headerRight: { display: 'flex', alignItems: 'center', gap: '1rem' },
  userInfo: { fontSize: '0.875rem', color: '#4b5563' },
  exportButton: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#374151',
    backgroundColor: 'white',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },

  // Content area
  content: { maxWidth: '80rem', margin: '0 auto', padding: '2rem 1rem' },
  
  // Notifications
  notification: (type) => ({
    marginBottom: '1.5rem',
    padding: '1rem',
    borderRadius: '0.5rem',
    border: type === 'success' ? '1px solid #d1fae5' : '1px solid #fecaca',
    backgroundColor: type === 'success' ? '#ecfdf5' : '#fef2f2',
    color: type === 'success' ? '#065f46' : '#991b1b'
  }),
  notificationContent: { display: 'flex', alignItems: 'center' },
  
  // Loading states
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' },
  loadingText: { color: '#4b5563' },

  // Week navigation card
  weekCard: {
    backgroundColor: 'white',
    borderRadius: '0.75rem',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb',
    padding: '1.5rem',
    marginBottom: '1.5rem'
  },
  weekNavigation: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  weekControls: { display: 'flex', alignItems: 'center', gap: '1rem' },
  weekButton: {
    padding: '0.5rem',
    color: '#9ca3af',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  weekInfo: { textAlign: 'center' },
  weekTitle: { fontSize: '1.125rem', fontWeight: '600', color: '#111827', margin: 0 },
  weekSubtitle: { fontSize: '0.875rem', color: '#6b7280', margin: 0 },
  weekTotal: { textAlign: 'right' },
  weekTotalLabel: { fontSize: '0.875rem', color: '#6b7280', margin: 0 },
  weekTotalValue: { fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', margin: 0 },

  // Timesheet grid
  timesheetCard: {
    backgroundColor: 'white',
    borderRadius: '0.75rem',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb',
    overflow: 'hidden'
  },
  gridHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    background: 'linear-gradient(to right, #f9fafb, #f3f4f6)',
    borderBottom: '1px solid #e5e7eb'
  },
  gridHeaderCell: { padding: '1rem', fontWeight: '600', color: '#111827' },
  gridHeaderDay: (isToday) => ({
    padding: '1rem',
    textAlign: 'center',
    backgroundColor: isToday ? '#eff6ff' : 'transparent'
  }),
  dayName: (isToday) => ({
    fontWeight: '600',
    color: isToday ? '#1d4ed8' : '#111827',
    margin: 0
  }),
  dayDate: (isToday) => ({
    fontSize: '0.875rem',
    color: isToday ? '#2563eb' : '#6b7280',
    margin: 0
  }),

  // Task rows
  taskRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    borderBottom: '1px solid #f3f4f6',
    transition: 'background-color 0.2s'
  },
  taskInfo: {
    padding: '1rem',
    borderRight: '1px solid #f3f4f6'
  },
  taskTitle: { fontWeight: '500', color: '#111827', margin: 0 },
  taskSubtitle: { fontSize: '0.875rem', color: '#6b7280', margin: 0 },
  dayCell: {
    padding: '1rem',
    textAlign: 'center',
    borderRight: '1px solid #f3f4f6'
  },
  entryContainer: { display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' },
  entryRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  entryHours: { fontSize: '0.875rem', fontWeight: '500', color: '#2563eb' },
  deleteButton: {
    color: '#ef4444',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'color 0.2s'
  },
  entryTotal: {
    fontSize: '0.75rem',
    color: '#6b7280',
    borderTop: '1px solid #e5e7eb',
    paddingTop: '0.25rem',
    marginTop: '0.25rem'
  },
  emptyState: { color: '#d1d5db' },

  // Add entry row
  addEntryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    borderBottom: '1px solid #e5e7eb',
    background: 'linear-gradient(to right, #eff6ff, #e0e7ff)'
  },
  addEntryInfo: {
    padding: '1rem',
    borderRight: '1px solid #e5e7eb'
  },
  addEntryTitle: { fontSize: '0.875rem', fontWeight: '600', color: '#1d4ed8', margin: 0 },
  addEntrySubtitle: { fontSize: '0.75rem', color: '#2563eb', margin: 0 },
  addEntryCell: {
    padding: '0.5rem',
    borderRight: '1px solid #e5e7eb'
  },
  addEntryContainer: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  select: {
    width: '100%',
    fontSize: '0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    padding: '0.25rem 0.5rem',
    outline: 'none'
  },
  entryInputRow: { display: 'flex', gap: '0.25rem' },
  entryInput: {
    flex: 1,
    fontSize: '0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    padding: '0.25rem 0.5rem',
    outline: 'none'
  },
  addButton: {
    padding: '0.25rem 0.5rem',
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },

  // Daily totals row
  totalsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    background: 'linear-gradient(to right, #f9fafb, #f3f4f6)'
  },
  totalsLabel: {
    padding: '1rem',
    fontWeight: '600',
    color: '#111827',
    borderRight: '1px solid #e5e7eb'
  },
  totalsCell: {
    padding: '1rem',
    textAlign: 'center',
    borderRight: '1px solid #e5e7eb'
  },
  totalsCellContainer: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  dayHoursInput: {
    width: '100%',
    fontSize: '0.875rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    padding: '0.25rem 0.5rem',
    textAlign: 'center',
    outline: 'none'
  },
  totalsInfo: { fontSize: '0.75rem', color: '#4b5563' },
  uncodedHours: { fontSize: '0.75rem', color: '#ea580c', fontWeight: '500' },
  statusBadge: (status) => {
    const colors = {
      approved: { bg: '#dcfce7', text: '#166534' },
      submitted: { bg: '#fef3c7', text: '#92400e' },
      rejected: { bg: '#fecaca', text: '#991b1b' },
      draft: { bg: '#f3f4f6', text: '#374151' }
    };
    const color = colors[status] || colors.draft;
    return {
      padding: '0.25rem 0.5rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: '500',
      backgroundColor: color.bg,
      color: color.text
    };
  },
  submitButton: {
    width: '100%',
    fontSize: '0.75rem',
    backgroundColor: '#059669',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.25rem 0.5rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s'
  },

  // Stats cards
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' },
  statCard: {
    backgroundColor: 'white',
    borderRadius: '0.75rem',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb',
    padding: '1.5rem'
  },
  statContent: { display: 'flex', alignItems: 'center' },
  statIcon: (color) => ({
    padding: '0.75rem',
    borderRadius: '0.5rem',
    marginRight: '1rem',
    backgroundColor: color
  }),
  statInfo: {},
  statLabel: { fontSize: '0.875rem', color: '#6b7280', fontWeight: '500', margin: 0 },
  statValue: { fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', margin: 0 },

  // Table styles
  tableCard: {
    backgroundColor: 'white',
    borderRadius: '0.75rem',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb'
  },
  tableHeader: {
    padding: '1.5rem',
    borderBottom: '1px solid #e5e7eb'
  },
  tableHeaderContent: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  tableTitle: { fontSize: '1.125rem', fontWeight: '600', color: '#111827', margin: 0 },
  tableContainer: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableHead: { backgroundColor: '#f9fafb' },
  th: {
    padding: '0.75rem 1.5rem',
    textAlign: 'left',
    fontSize: '0.75rem',
    fontWeight: '500',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  td: { padding: '1rem 1.5rem', whiteSpace: 'nowrap', borderBottom: '1px solid #f3f4f6' },
  employeeName: { fontWeight: '500', color: '#111827' },
  actionButtons: { display: 'flex', gap: '0.75rem' },
  actionButton: (color) => ({
    color,
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'color 0.2s'
  }),

  // Empty states
  emptyStateContainer: { padding: '2rem', textAlign: 'center', color: '#6b7280' },
  emptyStateIcon: { width: '3rem', height: '3rem', margin: '0 auto 1rem', color: '#d1d5db' },
  emptyStateText: { margin: 0 },
  emptyStateSubtext: { fontSize: '0.875rem', margin: 0 },

  // Auth error
  authError: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  authErrorContent: { textAlign: 'center' },
  authErrorIcon: { width: '3rem', height: '3rem', color: '#ef4444', margin: '0 auto 1rem' },
  authErrorText: { color: '#4b5563' }
};

const TimesheetSystem = () => {
  const { user, isAuthenticated } = useAuth();
  const [view, setView] = useState('my-timesheet');
  const [selectedWeek, setSelectedWeek] = useState(dayjs().startOf('week').add(1, 'day'));
  const [timesheetDays, setTimesheetDays] = useState([]);
  const [availableTasks, setAvailableTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);
  const isRejected = (dayData) => dayData?.status === 'rejected';

  // Generate week days
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => selectedWeek.add(i, 'day'));
  }, [selectedWeek]);

  const canViewTeamDashboard = user && ['manager', 'admin'].includes(user.role);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadData();
    }
  }, [selectedWeek, isAuthenticated, user, view]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    try {
      // Load timesheet days for the week
      const startDate = selectedWeek.format('YYYY-MM-DD');
      const endDate = selectedWeek.add(6, 'day').format('YYYY-MM-DD');
      
      const daysData = await timesheetsService.getDays({
        date_from: startDate,
        date_to: endDate,
        user_id: view === 'my-timesheet' ? user.id : undefined
      });
      
      setTimesheetDays(daysData);
      
      // Load available tasks - only for current user's assignments
      if (view === 'my-timesheet') {
        const tasks = await tasksService.getFilteredTasks({
          assignedTo: user.id
        });
        setAvailableTasks(tasks);
      }
      
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const getDayData = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    return timesheetDays.find(d => d.work_date === dateStr) || {
      work_date: dateStr,
      entries: [],
      day_hours: null,
      entry_hours: 0,
      uncoded_hours: 0,
      effective_total_hours: 0,
      status: 'draft'
    };
  };

  const updateDayHours = async (date, hours) => {
    const dayData = getDayData(date);
    if (isRejected(dayData)) return; // lockout
    const dateStr = date.format('YYYY-MM-DD');
    try {
      const payload = { work_date: dateStr, day_hours: hours === '' ? null : parseFloat(hours) };
      await timesheetsService.createDay(payload);
      await loadData();
      showNotification('Day hours updated successfully');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to save day hours');
    }
  };

  const updateDayNotes = async (date, notes) => {
    const dayData = getDayData(date);
    if (isRejected(dayData)) return;
    const dateStr = date.format('YYYY-MM-DD');
    try {
      // If day exists, patch notes; else create day with notes
      const dayData = getDayData(date);
      if (dayData?.id) {
        await timesheetsService.updateDay(dayData.id, { notes });
      } else {
        await timesheetsService.createDay({ work_date: dateStr, notes });
      }
      await loadData();
      showNotification('Notes saved');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to save notes');
    }
  };

  const addTimeEntry = async (date, taskId, hours) => {
    const dayData = getDayData(date);
    if (isRejected(dayData)) return; // lockout
    const dateStr = date.format('YYYY-MM-DD');
    try {
      let dayData = getDayData(date);
      let dayId = dayData.id;
      
      if (!dayId) {
        const created = await timesheetsService.createDay({ work_date: dateStr });
        dayId = created.id;
      }
      
      const payload = { 
        timesheet_day_id: dayId, 
        hours: parseFloat(hours),
        task_id: taskId || null
      };
      
      await timesheetsService.createEntry(payload);
      await loadData();
      showNotification('Time entry added successfully');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to add time entry');
    }
  };

  const deleteTimeEntry = async (entryId) => {
    try {
      await timesheetsService.deleteEntry(entryId);
      await loadData();
      showNotification('Time entry deleted');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to delete entry');
    }
  };

  const submitDay = async (dayId) => {
    try {
      await timesheetsService.submitDay(dayId);
      await loadData();
      showNotification('Day submitted for approval');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to submit day');
    }
  };

  const approveDay = async (dayId) => {
    try {
      await timesheetsService.approveDay(dayId);
      await loadData();
      showNotification('Day approved');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to approve day');
    }
  };

  const rejectDay = async (dayId, reason) => {
    try {
      await timesheetsService.rejectDay(dayId, reason);
      await loadData();
      showNotification('Day rejected');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to reject day');
    }
  };

  const releaseDay = async (dayId) => {
    try {
      await timesheetsService.releaseDay(dayId);
      await loadData();
      showNotification('Day released for editing');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to release day');
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div style={styles.authError}>
        <div style={styles.authErrorContent}>
          <AlertTriangle style={styles.authErrorIcon} />
          <p style={styles.authErrorText}>Please log in to access timesheets</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.headerContent}>
            <div style={styles.headerLeft}>
              <h1 style={styles.title}>Timesheets</h1>
              
              {canViewTeamDashboard && (
                <nav style={styles.nav}>
                  <button
                    onClick={() => setView('my-timesheet')}
                    style={styles.navButton(view === 'my-timesheet')}
                  >
                    My Timesheet
                  </button>
                  <button
                    onClick={() => setView('team-dashboard')}
                    style={styles.navButton(view === 'team-dashboard')}
                  >
                    Team Dashboard
                  </button>
                </nav>
              )}
            </div>
            
            <div style={styles.headerRight}>
              <div style={styles.userInfo}>
                Welcome, {user.full_name || user.username}
              </div>
              <button style={styles.exportButton}>
                <Download style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} />
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.content}>
        {/* Notifications */}
        {notification && (
          <div style={styles.notification(notification.type)}>
            <div style={styles.notificationContent}>
              {notification.type === 'success' ? (
                <CheckCircle2 style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem' }} />
              ) : (
                <AlertTriangle style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem' }} />
              )}
              <p style={{ margin: 0 }}>{notification.message}</p>
            </div>
          </div>
        )}

        {error && (
          <div style={styles.notification('error')}>
            <div style={styles.notificationContent}>
              <AlertTriangle style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem', flexShrink: 0 }} />
              <p style={{ margin: 0 }}>{error}</p>
            </div>
          </div>
        )}

        {view === 'my-timesheet' ? (
          <MyTimesheetView 
            weekDays={weekDays}
            selectedWeek={selectedWeek}
            setSelectedWeek={setSelectedWeek}
            getDayData={getDayData}
            availableTasks={availableTasks}
            updateDayHours={updateDayHours}
            updateDayNotes={updateDayNotes}
            addTimeEntry={addTimeEntry}
            deleteTimeEntry={deleteTimeEntry}
            submitDay={submitDay}
            loading={loading}
            isRejected={isRejected}
          />
        ) : (
          <TeamDashboardView 
            timesheetDays={timesheetDays}
            approveDay={approveDay}
            rejectDay={rejectDay}
            releaseDay={releaseDay}
            loading={loading}
          />
        )}
      </div>
      <MobileNavigation />
    </div>
  );
};

const SimpleTimesheetView = ({ 
  weekDays, selectedWeek, setSelectedWeek, availableTasks,
  formatDate, formatDisplayDate, showNotification, setError, loadData
}) => {
  const [newEntries, setNewEntries] = useState({});

  const addNewEntry = async (date, taskId, hours) => {
    const dateStr = formatDate(date);
    try {
      const payload = { 
        timesheet_day_id: 1, // Simplified for testing
        hours: parseFloat(hours),
        task_id: taskId || null
      };
      
      await timesheetsService.createEntry(payload);
      await loadData();
      showNotification('Time entry added successfully');
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to add time entry');
    }
  };

  const addEntryForDay = (date) => {
    const dateStr = formatDate(date);
    const entry = newEntries[dateStr];
    if (entry && entry.hours && entry.taskId) {
      addNewEntry(date, entry.taskId, entry.hours);
      setNewEntries(prev => ({ ...prev, [dateStr]: { taskId: '', hours: '' } }));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Week Navigation */}
      <div style={styles.weekCard}>
        <div style={styles.weekNavigation}>
          <div style={styles.weekControls}>
            <button
              onClick={() => {
                const newWeek = new Date(selectedWeek);
                newWeek.setDate(newWeek.getDate() - 7);
                setSelectedWeek(newWeek);
              }}
              style={styles.weekButton}
            >
              ← Previous
            </button>
            
            <div style={styles.weekInfo}>
              <h2 style={styles.weekTitle}>
                Week of {formatFullDisplayDate(weekDays[0])}
              </h2>
              <p style={styles.weekSubtitle}>
                {formatDisplayDate(weekDays[0])} - {formatFullDisplayDate(weekDays[6])}
              </p>
            </div>
            
            <button
              onClick={() => {
                const newWeek = new Date(selectedWeek);
                newWeek.setDate(newWeek.getDate() + 7);
                setSelectedWeek(newWeek);
              }}
              style={styles.weekButton}
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Simple Timesheet Grid */}
      <div style={styles.timesheetCard}>
        <div style={styles.gridHeader}>
          <div style={styles.gridHeaderCell}>Task</div>
          {weekDays.map((day, index) => {
            const isToday = formatDate(day) === formatDate(new Date());
            return (
              <div key={index} style={styles.gridHeaderDay(isToday)}>
                <div style={styles.dayName(isToday)}>
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div style={styles.dayDate(isToday)}>
                  {day.getMonth() + 1}/{day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Task rows */}
        {availableTasks.length > 0 ? (
          availableTasks.map(task => (
            <div key={task.id} style={styles.taskRow}>
              <div style={styles.taskInfo}>
                <div style={styles.taskTitle}>{task.title}</div>
                <div style={styles.taskSubtitle}>
                  {task.block?.name} • ID: {task.id}
                </div>
              </div>
              
              {weekDays.map((day, index) => (
                <div key={index} style={styles.dayCell}>
                  <span style={styles.emptyState}>-</span>
                </div>
              ))}
            </div>
          ))
        ) : (
          <div style={styles.emptyStateContainer}>
            <div style={styles.emptyStateIcon}>📋</div>
            <p style={styles.emptyStateText}>No tasks assigned to you</p>
            <p style={styles.emptyStateSubtext}>Contact your manager to get tasks assigned</p>
          </div>
        )}

        {/* Add new entry row */}
        {availableTasks.length > 0 && (
          <div style={styles.addEntryRow}>
            <div style={styles.addEntryInfo}>
              <div style={styles.addEntryTitle}>Add Time Entry</div>
              <div style={styles.addEntrySubtitle}>Select task and enter hours</div>
            </div>
            
            {weekDays.map((day, index) => {
              const dateStr = formatDate(day);
              const entry = newEntries[dateStr] || { taskId: '', hours: '' };
              
              return (
                <div key={index} style={styles.addEntryCell}>
                  <div style={styles.addEntryContainer}>
                    <select
                      value={entry.taskId}
                      onChange={(e) => setNewEntries(prev => ({
                        ...prev,
                        [dateStr]: { ...entry, taskId: e.target.value }
                      }))}
                      style={styles.select}
                    >
                      <option value="">Select task</option>
                      {availableTasks.map(task => (
                        <option key={task.id} value={task.id}>{task.title}</option>
                      ))}
                    </select>
                    
                    <div style={styles.entryInputRow}>
                      <input
                        type="number"
                        step="0.25"
                        min="0.25"
                        max="24"
                        placeholder="Hours"
                        value={entry.hours}
                        onChange={(e) => setNewEntries(prev => ({
                          ...prev,
                          [dateStr]: { ...entry, hours: e.target.value }
                        }))}
                        style={styles.entryInput}
                      />
                      <button
                        onClick={() => addEntryForDay(day)}
                        disabled={!entry.hours || !entry.taskId}
                        style={{
                          ...styles.addButton,
                          opacity: (!entry.hours || !entry.taskId) ? 0.5 : 1,
                          cursor: (!entry.hours || !entry.taskId) ? 'not-allowed' : 'pointer'
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const MyTimesheetView = ({ 
  weekDays, selectedWeek, setSelectedWeek, getDayData, availableTasks,
  updateDayHours, addTimeEntry, deleteTimeEntry, submitDay, loading, updateDayNotes, isRejected
}) => {
  const [newEntries, setNewEntries] = useState({});

  const weekTotal = weekDays.reduce((total, day) => {
    const dayData = getDayData(day);
    return total + parseFloat(dayData.effective_total_hours || 0);
  }, 0);

  const addNewEntry = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    const entry = newEntries[dateStr];
    if (entry && entry.hours && entry.taskId) {
      addTimeEntry(date, entry.taskId, entry.hours);
      setNewEntries(prev => ({ ...prev, [dateStr]: { taskId: '', hours: '' } }));
    }
  };

  if (loading) {
    return (
      <div style={styles.loading}>
        <Clock style={{ width: '2rem', height: '2rem', color: '#2563eb', animation: 'spin 1s linear infinite', marginRight: '0.75rem' }} />
        <span style={styles.loadingText}>Loading your timesheet...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Week Navigation */}
      <div style={styles.weekCard}>
        <div style={styles.weekNavigation}>
          <div style={styles.weekControls}>
            <button
              onClick={() => setSelectedWeek(selectedWeek.subtract(1, 'week'))}
              style={styles.weekButton}
              onMouseEnter={(e) => {
                e.target.style.color = '#4b5563';
                e.target.style.backgroundColor = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.target.style.color = '#9ca3af';
                e.target.style.backgroundColor = 'transparent';
              }}
            >
              <ChevronLeft style={{ width: '1.25rem', height: '1.25rem' }} />
            </button>
            
            <div style={styles.weekInfo}>
              <h2 style={styles.weekTitle}>
                Week of {selectedWeek.format('MMM D, YYYY')}
              </h2>
              <p style={styles.weekSubtitle}>
                {selectedWeek.format('MMM D')} - {selectedWeek.add(6, 'day').format('MMM D, YYYY')}
              </p>
            </div>
            
            <button
              onClick={() => setSelectedWeek(selectedWeek.add(1, 'week'))}
              style={styles.weekButton}
              onMouseEnter={(e) => {
                e.target.style.color = '#4b5563';
                e.target.style.backgroundColor = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.target.style.color = '#9ca3af';
                e.target.style.backgroundColor = 'transparent';
              }}
            >
              <ChevronRight style={{ width: '1.25rem', height: '1.25rem' }} />
            </button>
          </div>
          
          <div style={styles.weekTotal}>
            <p style={styles.weekTotalLabel}>Week Total</p>
            <p style={styles.weekTotalValue}>{weekTotal.toFixed(2)}h</p>
          </div>
        </div>
      </div>

      {/* Daily Timesheet Grid */}
      <div style={styles.timesheetCard}>
        <div style={styles.gridHeader}>
          <div style={styles.gridHeaderCell}>Task</div>
          {weekDays.map(day => {
            const isToday = day.isSame(dayjs(), 'day');
            return (
              <div key={day.format('YYYY-MM-DD')} style={styles.gridHeaderDay(isToday)}>
                <div style={styles.dayName(isToday)}>
                  {day.format('ddd')}
                </div>
                <div style={styles.dayDate(isToday)}>
                  {day.format('M/D')}
                </div>
              </div>
            );
          })}
        </div>

        {/* Task rows */}
        {availableTasks.length > 0 ? (
          availableTasks.map(task => (
            <div key={task.id} style={{
              ...styles.taskRow,
              ':hover': { backgroundColor: '#f9fafb' }
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9fafb'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              <div style={styles.taskInfo}>
                <div style={styles.taskTitle}>{task.title}</div>
                <div style={styles.taskSubtitle}>
                  {task.block?.name} • ID: {task.id}
                </div>
              </div>
              
              {weekDays.map(day => {
                const dayData = getDayData(day);
                const taskEntries = dayData.entries?.filter(e => e.task_id === task.id) || [];
                const totalHours = taskEntries.reduce((sum, e) => sum + parseFloat(e.hours || 0), 0);
                
                return (
                  <div key={day.format('YYYY-MM-DD')} style={styles.dayCell}>
                    {taskEntries.length > 0 ? (
                      <div style={styles.entryContainer}>
                        {taskEntries.map(entry => (
                          <div key={entry.id} style={styles.entryRow}>
                            <span style={styles.entryHours}>{entry.hours}h</span>
                            <button
                              onClick={() => !isRejected(dayData) && deleteTimeEntry(entry.id)}
                              style={styles.deleteButton}
                              disabled={isRejected(dayData)}
                              onMouseEnter={(e) => e.target.style.color = '#dc2626'}
                              onMouseLeave={(e) => e.target.style.color = '#ef4444'}
                            >
                              <Trash2 style={{ width: '0.75rem', height: '0.75rem' }} />
                            </button>
                          </div>
                        ))}
                        {totalHours > 0 && taskEntries.length > 1 && (
                          <div style={styles.entryTotal}>
                            Total: {totalHours}h
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={styles.emptyState}>-</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          <div style={styles.emptyStateContainer}>
            <Clock style={styles.emptyStateIcon} />
            <p style={styles.emptyStateText}>No tasks assigned to you</p>
            <p style={styles.emptyStateSubtext}>Contact your manager to get tasks assigned</p>
          </div>
        )}

        {/* Add new entry row */}
        {availableTasks.length > 0 && (
          <div style={styles.addEntryRow}>
            <div style={styles.addEntryInfo}>
              <div style={styles.addEntryTitle}>Add Time Entry</div>
              <div style={styles.addEntrySubtitle}>Select task and enter hours</div>
            </div>
            
            {weekDays.map(day => {
              const dateStr = day.format('YYYY-MM-DD');
              const entry = newEntries[dateStr] || { taskId: '', hours: '' };
              const rejected = isRejected(getDayData(day));
              
              return (
                <div key={dateStr} style={styles.addEntryCell}>
                  <div style={styles.addEntryContainer}>
                    <select
                      value={entry.taskId}
                      onChange={(e) => !rejected && setNewEntries(prev => ({
                        ...prev,
                        [dateStr]: { ...entry, taskId: e.target.value }
                      }))}
                      style={styles.select}
                      disabled={rejected}
                    >
                      <option value="">Select task</option>
                      {availableTasks.map(task => (
                        <option key={task.id} value={task.id}>{task.title}</option>
                      ))}
                    </select>
                    
                    <div style={styles.entryInputRow}>
                      <input
                        type="number"
                        step="0.25"
                        min="0.25"
                        max="24"
                        placeholder="Hours"
                        value={entry.hours}
                        onChange={(e) => !rejected && setNewEntries(prev => ({
                          ...prev,
                          [dateStr]: { ...entry, hours: e.target.value }
                        }))}
                        style={styles.entryInput}
                        disabled={rejected}
                      />
                      <button
                        onClick={() => addNewEntry(day)}
                        disabled={rejected || !entry.hours || !entry.taskId}
                        style={{
                          ...styles.addButton,
                          opacity: (rejected || !entry.hours || !entry.taskId) ? 0.5 : 1,
                          cursor: (rejected || !entry.hours || !entry.taskId) ? 'not-allowed' : 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          if (entry.hours && entry.taskId) {
                            e.target.style.backgroundColor = '#1d4ed8';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (entry.hours && entry.taskId) {
                            e.target.style.backgroundColor = '#2563eb';
                          }
                        }}
                      >
                        <Plus style={{ width: '0.75rem', height: '0.75rem' }} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Day totals and status */}
        <div style={styles.totalsRow}>
          <div style={styles.totalsLabel}>Daily Totals</div>
          
          {weekDays.map(day => {
            const dayData = getDayData(day);
            const canSubmit = dayData.id && dayData.status === 'draft' && dayData.effective_total_hours > 0;
            
            return (
              <div key={day.format('YYYY-MM-DD')} style={styles.totalsCell}>
                <div style={styles.totalsCellContainer}>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    value={dayData.day_hours || ''}
                    onChange={(e) => updateDayHours(day, e.target.value)}
                    placeholder="Day total"
                    style={styles.dayHoursInput}
                    disabled={isRejected(dayData)}
                  />
                  <textarea
                    rows={2}
                    placeholder="Notes"
                    defaultValue={dayData?.notes || ''}
                    onBlur={(e) => !isRejected(dayData) && updateDayNotes(day, e.target.value)}
                    disabled={isRejected(dayData)}
                    style={{
                      width: '100%',
                      fontSize: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      padding: '0.375rem 0.5rem',
                      outline: 'none',
                      resize: 'vertical',
                      backgroundColor: isRejected(dayData) ? '#f3f4f6' : 'white',
                      cursor: isRejected(dayData) ? 'not-allowed' : 'text',
                    }}
                  />
                  {isRejected(dayData) && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>
                      Editing is disabled because this day is rejected.
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={styles.totalsInfo}>Coded: {dayData.entry_hours}h</div>
                    {dayData.uncoded_hours > 0 && (
                      <div style={styles.uncodedHours}>
                        Uncoded: {dayData.uncoded_hours}h
                      </div>
                    )}
                  </div>
                  
                  <div style={{ fontSize: '0.75rem' }}>
                    <span style={styles.statusBadge(dayData.status)}>
                      {dayData.status || 'draft'}
                    </span>
                  </div>
                  
                  {canSubmit && (
                    <button
                      onClick={() => submitDay(dayData.id)}
                      style={styles.submitButton}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#047857'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = '#059669'}
                    >
                      Submit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const TeamDashboardView = ({ timesheetDays, approveDay, rejectDay, releaseDay, loading }) => {
  const [filter, setFilter] = useState('all');
  
  const filteredDays = timesheetDays.filter(day => {
    if (filter === 'submitted') return day.status === 'submitted';
    if (filter === 'pending') return ['draft', 'submitted'].includes(day.status);
    return true;
  });

  const stats = useMemo(() => {
    // Only count non-rejected hours for totals
    const totalHours = timesheetDays
      .filter(day => day.status !== 'rejected')
      .reduce((sum, day) => sum + parseFloat(day.effective_total_hours || 0), 0);
    
    return {
      totalHours: totalHours.toFixed(1),
      submitted: timesheetDays.filter(d => d.status === 'submitted').length,
      approved: timesheetDays.filter(d => d.status === 'approved').length,
      rejected: timesheetDays.filter(d => d.status === 'rejected').length
    };
  }, [timesheetDays]);

  // Group timesheet days by user for weekly view
  const userWeeklyData = useMemo(() => {
    const userGroups = {};
    
    timesheetDays.forEach(day => {
      const userId = day.user_id;
      if (!userGroups[userId]) {
        userGroups[userId] = {
          user: day.user || { id: userId, username: `User ${userId}` },
          days: [],
          totalHours: 0,
          statusCounts: { draft: 0, submitted: 0, approved: 0, rejected: 0 }
        };
      }
      
      userGroups[userId].days.push(day);
      
      // Only add hours if not rejected
      if (day.status !== 'rejected') {
        userGroups[userId].totalHours += parseFloat(day.effective_total_hours || 0);
      }
      
      userGroups[userId].statusCounts[day.status] = (userGroups[userId].statusCounts[day.status] || 0) + 1;
    });
    
    return Object.values(userGroups);
  }, [timesheetDays]);

  const handleReject = async (dayId) => {
    const reason = prompt('Rejection reason (optional):') || '';
    await rejectDay(dayId, reason);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 style={{ width: '1rem', height: '1rem', color: '#16a34a' }} />;
      case 'submitted':
        return <Clock style={{ width: '1rem', height: '1rem', color: '#d97706' }} />;
      case 'rejected':
        return <AlertTriangle style={{ width: '1rem', height: '1rem', color: '#dc2626' }} />;
      default:
        return <div style={{ width: '1rem', height: '1rem', backgroundColor: '#d1d5db', borderRadius: '50%' }}></div>;
    }
  };

  if (loading) {
    return (
      <div style={styles.loading}>
        <Clock style={{ width: '2rem', height: '2rem', color: '#2563eb', animation: 'spin 1s linear infinite', marginRight: '0.75rem' }} />
        <span style={styles.loadingText}>Loading team data...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Stats Cards - Updated */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statContent}>
            <div style={styles.statIcon('#dbeafe')}>
              <Clock style={{ width: '1.5rem', height: '1.5rem', color: '#2563eb' }} />
            </div>
            <div style={styles.statInfo}>
              <p style={styles.statLabel}>Total Hours This Week</p>
              <p style={styles.statValue}>{stats.totalHours}h</p>
            </div>
          </div>
        </div>
        
        <div style={styles.statCard}>
          <div style={styles.statContent}>
            <div style={styles.statIcon('#fef3c7')}>
              <Clock style={{ width: '1.5rem', height: '1.5rem', color: '#d97706' }} />
            </div>
            <div style={styles.statInfo}>
              <p style={styles.statLabel}>Pending Approval</p>
              <p style={styles.statValue}>{stats.submitted}</p>
            </div>
          </div>
        </div>
        
        <div style={styles.statCard}>
          <div style={styles.statContent}>
            <div style={styles.statIcon('#dcfce7')}>
              <CheckCircle2 style={{ width: '1.5rem', height: '1.5rem', color: '#16a34a' }} />
            </div>
            <div style={styles.statInfo}>
              <p style={styles.statLabel}>Approved</p>
              <p style={styles.statValue}>{stats.approved}</p>
            </div>
          </div>
        </div>
        
        <div style={styles.statCard}>
          <div style={styles.statContent}>
            <div style={styles.statIcon('#fecaca')}>
              <AlertTriangle style={{ width: '1.5rem', height: '1.5rem', color: '#dc2626' }} />
            </div>
            <div style={styles.statInfo}>
              <p style={styles.statLabel}>Rejected</p>
              <p style={styles.statValue}>{stats.rejected}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Team View Table */}
      <div style={styles.tableCard}>
        <div style={styles.tableHeader}>
          <div style={styles.tableHeaderContent}>
            <h3 style={styles.tableTitle}>Team Weekly Overview</h3>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  outline: 'none'
                }}
              >
                <option value="all">All Entries</option>
                <option value="submitted">Awaiting Approval</option>
                <option value="pending">Pending/Draft</option>
              </select>
            </div>
          </div>
        </div>
        
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead style={styles.tableHead}>
              <tr>
                <th style={styles.th}>Team Member</th>
                <th style={styles.th}>Total Hours</th>
                <th style={styles.th}>Mon</th>
                <th style={styles.th}>Tue</th>
                <th style={styles.th}>Wed</th>
                <th style={styles.th}>Thu</th>
                <th style={styles.th}>Fri</th>
                <th style={styles.th}>Sat</th>
                <th style={styles.th}>Sun</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody style={{ backgroundColor: 'white' }}>
              {userWeeklyData.length > 0 ? (
                userWeeklyData.map(userData => (
                  <tr key={userData.user.id} style={{ transition: 'background-color 0.2s' }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f9fafb'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  >
                    <td style={styles.td}>
                      <div style={styles.employeeName}>
                        {userData.user?.first_name && userData.user?.last_name 
                          ? `${userData.user.first_name} ${userData.user.last_name}`
                          : userData.user?.first_name || userData.user?.username || `User ${userData.user.id}`
                        }
                      </div>
                    </td>
                    <td style={styles.td}>
                      <div style={{ fontWeight: '600', color: '#111827' }}>
                        {userData.totalHours.toFixed(1)}h
                      </div>
                    </td>
                    
                    {/* Days of week columns */}
                    {Array.from({ length: 7 }, (_, dayIndex) => {
                      const dayData = userData.days.find(day => {
                        const dayOfWeek = new Date(day.work_date).getDay();
                        return dayOfWeek === (dayIndex + 1) % 7; // Adjust for Monday start
                      });
                      
                      return (
                        <td key={dayIndex} style={{ ...styles.td, textAlign: 'center' }}>
                          {dayData ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                              <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                                {dayData.effective_total_hours}h
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                {getStatusIcon(dayData.status)}
                                {dayData.status === 'submitted' && (
                                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button
                                      onClick={() => approveDay(dayData.id)}
                                      style={styles.actionButton('#16a34a')}
                                      title="Approve"
                                    >
                                      <CheckCircle2 style={{ width: '0.75rem', height: '0.75rem' }} />
                                    </button>
                                    <button
                                      onClick={() => handleReject(dayData.id)}
                                      style={styles.actionButton('#dc2626')}
                                      title="Reject"
                                    >
                                      <AlertTriangle style={{ width: '0.75rem', height: '0.75rem' }} />
                                    </button>
                                  </div>
                                )}
                                {dayData.status === 'approved' && (
                                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button
                                      onClick={() => releaseDay(dayData.id)}
                                      style={styles.actionButton('#2563eb')}
                                      title="Release for editing"
                                    >
                                      <Save style={{ width: '0.75rem', height: '0.75rem' }} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#d1d5db' }}>-</span>
                          )}
                        </td>
                      );
                    })}
                    
                    <td style={styles.td}>
                      <div style={styles.actionButtons}>
                        <button style={styles.actionButton('#2563eb')} title="View Details">
                          <Eye style={{ width: '1rem', height: '1rem' }} />
                        </button>
                        
                        {userData.statusCounts.submitted > 0 && (
                          <div style={{ 
                            backgroundColor: '#fef3c7', 
                            color: '#92400e', 
                            padding: '0.25rem 0.5rem', 
                            borderRadius: '0.375rem', 
                            fontSize: '0.75rem',
                            fontWeight: '500'
                          }}>
                            {userData.statusCounts.submitted} pending
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" style={{ ...styles.td, textAlign: 'center', padding: '3rem 1.5rem' }}>
                    <div style={styles.emptyStateContainer}>
                      <Clock style={styles.emptyStateIcon} />
                      <p style={styles.emptyStateText}>No timesheet entries found</p>
                      <p style={styles.emptyStateSubtext}>Entries will appear here once team members submit timesheets</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
    </div>
    
  );
};

export default TimesheetSystem;