import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Clock, CheckCircle2, AlertTriangle, Plus, Trash2, Download, ChevronRight, Save, ChevronLeft } from 'lucide-react';
import { useAuth, timesheetsService, tasksService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import './Timesheets.css';

// Build a CSV string from a 2D array and trigger a browser download.
// BOM prefix keeps Excel happy with UTF-8; values with commas/quotes are escaped.
const downloadCsv = (filename, rows) => {
  const csv = rows
    .map(r => r.map(cell => {
      const s = cell == null ? '' : String(cell);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
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

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => selectedWeek.add(i, 'day')), [selectedWeek]);
  const canViewTeamDashboard = user && ['manager', 'admin'].includes(user.role);

  useEffect(() => { if (isAuthenticated && user) loadData(); }, [selectedWeek, isAuthenticated, user, view]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const startDate = selectedWeek.format('YYYY-MM-DD');
      const endDate = selectedWeek.add(6, 'day').format('YYYY-MM-DD');
      const daysData = await timesheetsService.getDays({ date_from: startDate, date_to: endDate, user_id: view === 'my-timesheet' ? user.id : undefined });
      setTimesheetDays(daysData);
      if (view === 'my-timesheet') { const tasks = await tasksService.getFilteredTasks({ assignedTo: user.id }); setAvailableTasks(tasks); }
    } catch (err) { setError(err?.response?.data?.detail || err.message || 'Failed to load data'); }
    finally { setLoading(false); }
  };

  const getDayData = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    return timesheetDays.find(d => d.work_date === dateStr) || { work_date: dateStr, entries: [], day_hours: null, entry_hours: 0, uncoded_hours: 0, effective_total_hours: 0, status: 'draft' };
  };

  const updateDayHours = async (date, hours) => {
    if (isRejected(getDayData(date))) return;
    try { await timesheetsService.createDay({ work_date: date.format('YYYY-MM-DD'), day_hours: hours === '' ? null : parseFloat(hours) }); await loadData(); showNotification('Day hours updated'); }
    catch (err) { setError(err?.response?.data?.detail || err.message || 'Failed to save day hours'); }
  };

  const updateDayNotes = async (date, notes) => {
    if (isRejected(getDayData(date))) return;
    const dateStr = date.format('YYYY-MM-DD');
    try { const d = getDayData(date); if (d?.id) await timesheetsService.updateDay(d.id, { notes }); else await timesheetsService.createDay({ work_date: dateStr, notes }); await loadData(); showNotification('Notes saved'); }
    catch (err) { setError(err?.response?.data?.detail || err.message || 'Failed to save notes'); }
  };

  const addTimeEntry = async (date, taskId, hours) => {
    if (isRejected(getDayData(date))) return;
    const dateStr = date.format('YYYY-MM-DD');
    try {
      let d = getDayData(date); let dayId = d.id;
      if (!dayId) { const created = await timesheetsService.createDay({ work_date: dateStr }); dayId = created.id; }
      await timesheetsService.createEntry({ timesheet_day_id: dayId, hours: parseFloat(hours), task_id: taskId || null });
      await loadData(); showNotification('Time entry added');
    } catch (err) { setError(err?.response?.data?.detail || err.message || 'Failed to add time entry'); }
  };

  const deleteTimeEntry = async (entryId) => { try { await timesheetsService.deleteEntry(entryId); await loadData(); showNotification('Time entry deleted'); } catch (err) { setError(err?.response?.data?.detail || err.message || 'Failed to delete entry'); } };
  const submitDay = async (dayId) => { try { await timesheetsService.submitDay(dayId); await loadData(); showNotification('Day submitted for approval'); } catch (err) { setError(err?.response?.data?.detail || err.message || 'Failed to submit day'); } };
  const approveDay = async (dayId) => { try { await timesheetsService.approveDay(dayId); await loadData(); showNotification('Day approved'); } catch (err) { setError(err?.response?.data?.detail || err.message || 'Failed to approve day'); } };
  const rejectDay = async (dayId, reason) => { try { await timesheetsService.rejectDay(dayId, reason); await loadData(); showNotification('Day rejected'); } catch (err) { setError(err?.response?.data?.detail || err.message || 'Failed to reject day'); } };
  const releaseDay = async (dayId) => { try { await timesheetsService.releaseDay(dayId); await loadData(); showNotification('Day released for editing'); } catch (err) { setError(err?.response?.data?.detail || err.message || 'Failed to release day'); } };

  // Export the current view + visible week to CSV (client-side, no backend round-trip).
  const handleExport = () => {
    const weekLabel = selectedWeek.format('YYYY-MM-DD');
    const dayHeaders = weekDays.map(d => d.format('ddd M/D'));

    if (view === 'my-timesheet') {
      const rows = [['Task', 'Block', ...dayHeaders, 'Total']];
      const tasksWithTime = availableTasks.filter(task =>
        weekDays.some(day => getDayData(day).entries?.some(e => e.task_id === task.id)),
      );
      tasksWithTime.forEach(task => {
        let total = 0;
        const cells = weekDays.map(day => {
          const hrs = (getDayData(day).entries || [])
            .filter(e => e.task_id === task.id)
            .reduce((s, e) => s + parseFloat(e.hours || 0), 0);
          total += hrs;
          return hrs ? hrs : '';
        });
        rows.push([task.title, task.block?.block_name || '', ...cells, total]);
      });
      rows.push(['Daily total', '', ...weekDays.map(day => getDayData(day).effective_total_hours || 0), '']);
      downloadCsv(`my-timesheet-${weekLabel}.csv`, rows);
      showNotification('Timesheet exported');
      return;
    }

    // Team dashboard: one row per team member, hours per day + weekly total.
    const groups = {};
    timesheetDays.forEach(day => {
      const uid = day.user_id;
      if (!groups[uid]) {
        const u = day.user || {};
        const name = u.first_name && u.last_name
          ? `${u.first_name} ${u.last_name}`
          : u.first_name || u.username || `User ${uid}`;
        groups[uid] = { name, total: 0, byDate: {} };
      }
      if (day.status !== 'rejected') groups[uid].total += parseFloat(day.effective_total_hours || 0);
      groups[uid].byDate[day.work_date] = day.effective_total_hours || 0;
    });
    const rows = [['Team Member', 'Total Hours', ...dayHeaders]];
    Object.values(groups).forEach(g => {
      rows.push([g.name, g.total.toFixed(1), ...weekDays.map(d => g.byDate[d.format('YYYY-MM-DD')] ?? '')]);
    });
    downloadCsv(`team-timesheet-${weekLabel}.csv`, rows);
    showNotification('Team timesheet exported');
  };

  if (!isAuthenticated || !user) {
    return <div className="ts-auth-error"><div style={{ textAlign: 'center' }}><AlertTriangle style={{ width: '3rem', height: '3rem', color: 'var(--color-danger)', margin: '0 auto 1rem' }} /><p style={{ color: 'var(--color-text-muted)' }}>Please log in to access timesheets</p></div></div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-surface)' }}>
      <div className="ts-header">
        <div className="ts-header-inner">
          <div className="ts-header-content">
            <div className="ts-header-left">
              <h1 className="ts-title">Timesheets</h1>
              {canViewTeamDashboard && (
                <nav className="ts-nav">
                  <button className={`ts-nav-btn ${view === 'my-timesheet' ? 'active' : ''}`} onClick={() => setView('my-timesheet')}>My Timesheet</button>
                  <button className={`ts-nav-btn ${view === 'team-dashboard' ? 'active' : ''}`} onClick={() => setView('team-dashboard')}>Team Dashboard</button>
                </nav>
              )}
            </div>
            <div className="ts-header-right">
              <div className="ts-user-info">{user.full_name || user.username}</div>
              <button className="ts-export-btn" onClick={handleExport}><Download style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} /> Export CSV</button>
            </div>
          </div>
        </div>
      </div>

      <div className="ts-content">
        {notification && (
          <div className={`ts-notification ts-notification--${notification.type}`}>
            {notification.type === 'success' ? <CheckCircle2 style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }} /> : <AlertTriangle style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }} />}
            <p style={{ margin: 0 }}>{notification.message}</p>
          </div>
        )}
        {error && (
          <div className="ts-notification ts-notification--error">
            <AlertTriangle style={{ width: '1.25rem', height: '1.25rem', flexShrink: 0 }} />
            <p style={{ margin: 0 }}>{error}</p>
          </div>
        )}

        {view === 'my-timesheet' ? (
          <MyTimesheetView weekDays={weekDays} selectedWeek={selectedWeek} setSelectedWeek={setSelectedWeek} getDayData={getDayData} availableTasks={availableTasks} updateDayHours={updateDayHours} updateDayNotes={updateDayNotes} addTimeEntry={addTimeEntry} deleteTimeEntry={deleteTimeEntry} submitDay={submitDay} loading={loading} isRejected={isRejected} />
        ) : (
          <TeamDashboardView timesheetDays={timesheetDays} approveDay={approveDay} rejectDay={rejectDay} releaseDay={releaseDay} loading={loading} weekDays={weekDays} selectedWeek={selectedWeek} setSelectedWeek={setSelectedWeek} />
        )}
      </div>
      <MobileNavigation />
    </div>
  );
};

const MyTimesheetView = ({ weekDays, selectedWeek, setSelectedWeek, getDayData, availableTasks, updateDayHours, updateDayNotes, addTimeEntry, deleteTimeEntry, submitDay, loading, isRejected }) => {
  const [newEntries, setNewEntries] = useState({});
  const [showAllTasks, setShowAllTasks] = useState(false);
  const weekTotal = weekDays.reduce((total, day) => total + parseFloat(getDayData(day).effective_total_hours || 0), 0);

  // Set of task ids that already have time logged anywhere this week.
  const touchedTaskIds = useMemo(() => {
    const ids = new Set();
    weekDays.forEach(day => getDayData(day).entries?.forEach(e => { if (e.task_id != null) ids.add(e.task_id); }));
    return ids;
  }, [weekDays, getDayData]);

  // Only show task rows that actually have time logged this week — keeps the grid
  // compact. New time is added via the "Add Time Entry" row below.
  const visibleTasks = availableTasks.filter(task => touchedTaskIds.has(task.id));

  // Tasks selectable in the Add-entry dropdown. Default to those relevant to the
  // visible week (already touched, scheduled to overlap it, or currently active)
  // so the list stays short; "Show all" lifts the filter for ad-hoc logging.
  const weekStart = selectedWeek;
  const weekEnd = selectedWeek.add(6, 'day');
  const selectableTasks = showAllTasks ? availableTasks : availableTasks.filter(task => {
    if (touchedTaskIds.has(task.id)) return true;
    if (task.is_active || ['in_progress', 'paused'].includes(task.status)) return true;
    const s = task.scheduled_start_date ? dayjs(task.scheduled_start_date) : null;
    const e = task.scheduled_end_date ? dayjs(task.scheduled_end_date) : s;
    return !!(s && e && !s.isAfter(weekEnd, 'day') && !e.isBefore(weekStart, 'day'));
  });
  const taskLabel = (task) => (task.block?.block_name ? `${task.title} — ${task.block.block_name}` : task.title);

  const addNewEntry = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    const entry = newEntries[dateStr];
    if (entry?.hours && entry?.taskId) { addTimeEntry(date, entry.taskId, entry.hours); setNewEntries(prev => ({ ...prev, [dateStr]: { taskId: '', hours: '' } })); }
  };

  if (loading) return <div className="ts-loading"><Clock style={{ width: '2rem', height: '2rem', color: 'var(--color-primary)', marginRight: '0.75rem' }} /> Loading your timesheet...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="ts-week-card">
        <div className="ts-week-nav">
          <div className="ts-week-controls">
            <button className="ts-week-btn" onClick={() => setSelectedWeek(selectedWeek.subtract(1, 'week'))}><ChevronLeft style={{ width: '1.25rem', height: '1.25rem' }} /></button>
            <div className="ts-week-info">
              <h2 className="ts-week-title">Week of {selectedWeek.format('MMM D, YYYY')}</h2>
              <p className="ts-week-subtitle">{selectedWeek.format('MMM D')} - {selectedWeek.add(6, 'day').format('MMM D, YYYY')}</p>
            </div>
            <button className="ts-week-btn" onClick={() => setSelectedWeek(selectedWeek.add(1, 'week'))}><ChevronRight style={{ width: '1.25rem', height: '1.25rem' }} /></button>
          </div>
          <div className="ts-week-total">
            <p className="ts-week-total-label">Week Total</p>
            <p className="ts-week-total-value">{weekTotal.toFixed(2)}h</p>
          </div>
        </div>
      </div>

      <div className="ts-grid-card">
        <div className="ts-grid-header">
          <div className="ts-grid-header-cell">Task</div>
          {weekDays.map(day => {
            const isToday = day.isSame(dayjs(), 'day');
            return (
              <div key={day.format('YYYY-MM-DD')} className={`ts-grid-header-day ${isToday ? 'today' : ''}`}>
                <div className={`ts-day-name ${isToday ? 'today' : ''}`}>{day.format('ddd')}</div>
                <div className={`ts-day-date ${isToday ? 'today' : ''}`}>{day.format('M/D')}</div>
              </div>
            );
          })}
        </div>

        {visibleTasks.length > 0 && (
          visibleTasks.map(task => (
            <div key={task.id} className="ts-task-row">
              <div className="ts-task-info">
                <div className="ts-task-title">{task.title}</div>
                {task.block?.block_name && <div className="ts-task-subtitle">{task.block.block_name}</div>}
              </div>
              {weekDays.map(day => {
                const dayData = getDayData(day);
                const taskEntries = dayData.entries?.filter(e => e.task_id === task.id) || [];
                const totalHours = taskEntries.reduce((sum, e) => sum + parseFloat(e.hours || 0), 0);
                return (
                  <div key={day.format('YYYY-MM-DD')} className="ts-day-cell">
                    {taskEntries.length > 0 ? (
                      <div className="ts-entry-container">
                        {taskEntries.map(entry => (
                          <div key={entry.id} className="ts-entry-row">
                            <span className="ts-entry-hours">{entry.hours}h</span>
                            <button className="ts-delete-btn" onClick={() => !isRejected(dayData) && deleteTimeEntry(entry.id)} disabled={isRejected(dayData)}>
                              <Trash2 style={{ width: '0.75rem', height: '0.75rem' }} />
                            </button>
                          </div>
                        ))}
                        {totalHours > 0 && taskEntries.length > 1 && <div className="ts-entry-total">Total: {totalHours}h</div>}
                      </div>
                    ) : <span style={{ color: 'var(--color-border)' }}>-</span>}
                  </div>
                );
              })}
            </div>
          ))
        )}

        {availableTasks.length === 0 && (
          <div className="ts-empty"><Clock style={{ width: '3rem', height: '3rem', color: 'var(--color-border)', margin: '0 auto 1rem' }} /><p style={{ margin: 0 }}>No tasks assigned to you</p><p style={{ fontSize: 'var(--font-size-base)', margin: 0 }}>Contact your manager to get tasks assigned</p></div>
        )}

        {availableTasks.length > 0 && visibleTasks.length === 0 && (
          <div className="ts-empty-inline">No time logged this week yet — add an entry below.</div>
        )}

        {availableTasks.length > 0 && (
          <div className="ts-add-entry-row">
            <div className="ts-add-entry-info">
              <div className="ts-add-entry-title">Add Time Entry</div>
              <label className="ts-show-all-toggle">
                <input type="checkbox" checked={showAllTasks} onChange={(e) => setShowAllTasks(e.target.checked)} />
                All assigned tasks
              </label>
            </div>
            {weekDays.map(day => {
              const dateStr = day.format('YYYY-MM-DD');
              const entry = newEntries[dateStr] || { taskId: '', hours: '' };
              const rejected = isRejected(getDayData(day));
              return (
                <div key={dateStr} className="ts-add-entry-cell">
                  <div className="ts-add-entry-container">
                    <select className="ts-select" value={entry.taskId} onChange={(e) => !rejected && setNewEntries(prev => ({ ...prev, [dateStr]: { ...entry, taskId: e.target.value } }))} disabled={rejected}>
                      <option value="">Select task</option>
                      {selectableTasks.map(task => <option key={task.id} value={task.id}>{taskLabel(task)}</option>)}
                    </select>
                    <div className="ts-entry-input-row">
                      <input className="ts-entry-input" type="number" step="0.25" min="0.25" max="24" placeholder="Hours" value={entry.hours} onChange={(e) => !rejected && setNewEntries(prev => ({ ...prev, [dateStr]: { ...entry, hours: e.target.value } }))} disabled={rejected} />
                      <button className="ts-add-btn" onClick={() => addNewEntry(day)} disabled={rejected || !entry.hours || !entry.taskId}>
                        <Plus style={{ width: '0.75rem', height: '0.75rem' }} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="ts-totals-row">
          <div className="ts-totals-label">Daily Totals</div>
          {weekDays.map(day => {
            const dayData = getDayData(day);
            const canSubmit = dayData.id && dayData.status === 'draft' && dayData.effective_total_hours > 0;
            return (
              <div key={day.format('YYYY-MM-DD')} className="ts-totals-cell">
                <div className="ts-totals-container">
                  <input className="ts-day-hours-input" type="number" step="0.25" min="0" max="24" value={dayData.day_hours || ''} onChange={(e) => updateDayHours(day, e.target.value)} placeholder="Day total" disabled={isRejected(dayData)} />
                  <textarea className="ts-notes-textarea" rows={2} placeholder="Notes" defaultValue={dayData?.notes || ''} onBlur={(e) => !isRejected(dayData) && updateDayNotes(day, e.target.value)} disabled={isRejected(dayData)} />
                  {isRejected(dayData) && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>Editing disabled — day is rejected.</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                    <div className="ts-totals-info">Coded: {dayData.entry_hours}h</div>
                    {dayData.uncoded_hours > 0 && <div className="ts-uncoded-hours">Uncoded: {dayData.uncoded_hours}h</div>}
                  </div>
                  <div><span className={`ts-badge ts-badge--${dayData.status || 'draft'}`}>{dayData.status || 'draft'}</span></div>
                  {canSubmit && <button className="ts-submit-btn" onClick={() => submitDay(dayData.id)}>Submit</button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const TeamDashboardView = ({ timesheetDays, approveDay, rejectDay, releaseDay, loading, weekDays, selectedWeek, setSelectedWeek }) => {
  const stats = useMemo(() => {
    const totalHours = timesheetDays.filter(d => d.status !== 'rejected').reduce((sum, d) => sum + parseFloat(d.effective_total_hours || 0), 0);
    return { totalHours: totalHours.toFixed(1), submitted: timesheetDays.filter(d => d.status === 'submitted').length, approved: timesheetDays.filter(d => d.status === 'approved').length, rejected: timesheetDays.filter(d => d.status === 'rejected').length };
  }, [timesheetDays]);

  const userWeeklyData = useMemo(() => {
    const groups = {};
    timesheetDays.forEach(day => {
      const uid = day.user_id;
      if (!groups[uid]) groups[uid] = { user: day.user || { id: uid, username: `User ${uid}` }, days: [], totalHours: 0, statusCounts: { draft: 0, submitted: 0, approved: 0, rejected: 0 } };
      groups[uid].days.push(day);
      if (day.status !== 'rejected') groups[uid].totalHours += parseFloat(day.effective_total_hours || 0);
      groups[uid].statusCounts[day.status] = (groups[uid].statusCounts[day.status] || 0) + 1;
    });
    return Object.values(groups);
  }, [timesheetDays]);

  const handleReject = async (dayId) => { const reason = prompt('Rejection reason (optional):') || ''; await rejectDay(dayId, reason); };
  const getStatusIcon = (status) => {
    if (status === 'approved') return <CheckCircle2 style={{ width: '1rem', height: '1rem', color: 'var(--color-success)' }} />;
    if (status === 'submitted') return <Clock style={{ width: '1rem', height: '1rem', color: 'var(--color-warning)' }} />;
    if (status === 'rejected') return <AlertTriangle style={{ width: '1rem', height: '1rem', color: 'var(--color-danger)' }} />;
    return <div style={{ width: '1rem', height: '1rem', background: 'var(--color-border)', borderRadius: '50%' }} />;
  };

  if (loading) return <div className="ts-loading"><Clock style={{ width: '2rem', height: '2rem', color: 'var(--color-primary)', marginRight: '0.75rem' }} /> Loading team data...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="ts-week-card">
        <div className="ts-week-nav">
          <div className="ts-week-controls">
            <button className="ts-week-btn" onClick={() => setSelectedWeek(selectedWeek.subtract(1, 'week'))}><ChevronLeft style={{ width: '1.25rem', height: '1.25rem' }} /></button>
            <div className="ts-week-info">
              <h2 className="ts-week-title">Week of {selectedWeek.format('MMM D, YYYY')}</h2>
              <p className="ts-week-subtitle">{selectedWeek.format('MMM D')} - {selectedWeek.add(6, 'day').format('MMM D, YYYY')}</p>
            </div>
            <button className="ts-week-btn" onClick={() => setSelectedWeek(selectedWeek.add(1, 'week'))}><ChevronRight style={{ width: '1.25rem', height: '1.25rem' }} /></button>
          </div>
          <button className="ts-week-today-btn" onClick={() => setSelectedWeek(dayjs().startOf('week').add(1, 'day'))}>This week</button>
        </div>
      </div>

      <div className="ts-stats-grid">
        {[
          { label: 'Total Hours This Week', value: `${stats.totalHours}h`, bg: 'var(--color-info-bg)', icon: <Clock style={{ width: '1.5rem', height: '1.5rem', color: 'var(--color-info)' }} /> },
          { label: 'Pending Approval', value: stats.submitted, bg: 'var(--color-warning-bg)', icon: <Clock style={{ width: '1.5rem', height: '1.5rem', color: 'var(--color-warning)' }} /> },
          { label: 'Approved', value: stats.approved, bg: 'var(--color-success-bg)', icon: <CheckCircle2 style={{ width: '1.5rem', height: '1.5rem', color: 'var(--color-success)' }} /> },
          { label: 'Rejected', value: stats.rejected, bg: 'var(--color-danger-bg)', icon: <AlertTriangle style={{ width: '1.5rem', height: '1.5rem', color: 'var(--color-danger)' }} /> }
        ].map((s, i) => (
          <div key={i} className="ts-stat-card">
            <div className="ts-stat-content">
              <div className="ts-stat-icon" style={{ background: s.bg }}>{s.icon}</div>
              <div><p className="ts-stat-label">{s.label}</p><p className="ts-stat-value">{s.value}</p></div>
            </div>
          </div>
        ))}
      </div>

      <div className="ts-table-card">
        <div className="ts-table-header">
          <div className="ts-table-header-content">
            <h3 className="ts-table-title">Team Weekly Overview</h3>
          </div>
        </div>
        <div className="ts-table-wrap">
          <table className="ts-table">
            <thead>
              <tr>
                <th>Team Member</th>
                <th>Total Hours</th>
                {weekDays.map(day => (
                  <th key={day.format('YYYY-MM-DD')} style={{ textAlign: 'center' }}>
                    {day.format('ddd')}<br /><span style={{ fontWeight: 400, textTransform: 'none' }}>{day.format('M/D')}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {userWeeklyData.length > 0 ? userWeeklyData.map(ud => (
                <tr key={ud.user.id}>
                  <td>
                    <div className="ts-employee-name">{ud.user?.first_name && ud.user?.last_name ? `${ud.user.first_name} ${ud.user.last_name}` : ud.user?.first_name || ud.user?.username || `User ${ud.user.id}`}</div>
                    {ud.statusCounts.submitted > 0 && <span className="ts-badge ts-badge--submitted" style={{ marginTop: 4 }}>{ud.statusCounts.submitted} to review</span>}
                  </td>
                  <td><div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{ud.totalHours.toFixed(1)}h</div></td>
                  {weekDays.map(day => {
                    const dd = ud.days.find(d => d.work_date === day.format('YYYY-MM-DD'));
                    return (
                      <td key={day.format('YYYY-MM-DD')} style={{ textAlign: 'center', verticalAlign: 'top' }}>
                        {dd ? (
                          <div className="ts-day-stack">
                            <div className="ts-day-hours-label">
                              {getStatusIcon(dd.status)}
                              <span>{dd.effective_total_hours}h</span>
                            </div>
                            {dd.status === 'submitted' && (
                              <div className="ts-day-actions">
                                <button className="ts-day-action ts-day-action--approve" onClick={() => approveDay(dd.id)}><CheckCircle2 size={14} /> Accept</button>
                                <button className="ts-day-action ts-day-action--reject" onClick={() => handleReject(dd.id)}><AlertTriangle size={14} /> Reject</button>
                              </div>
                            )}
                            {dd.status === 'approved' && (
                              <div className="ts-day-actions">
                                <button className="ts-day-action ts-day-action--release" onClick={() => releaseDay(dd.id)}><Save size={14} /> Release</button>
                              </div>
                            )}
                          </div>
                        ) : <span style={{ color: 'var(--color-border)' }}>-</span>}
                      </td>
                    );
                  })}
                </tr>
              )) : (
                <tr><td colSpan={9} className="ts-empty"><Clock style={{ width: '3rem', height: '3rem', color: 'var(--color-border)', margin: '0 auto 1rem' }} /><p style={{ margin: 0 }}>No timesheet entries found</p></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TimesheetSystem;
