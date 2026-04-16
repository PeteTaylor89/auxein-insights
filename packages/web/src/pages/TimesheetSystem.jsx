import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Users, Clock, CheckCircle2, AlertTriangle, Plus, Trash2, Calendar, Filter, Download, Eye, ChevronRight, Save, ChevronLeft } from 'lucide-react';
import { useAuth, timesheetsService, tasksService } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import './Timesheets.css';

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
              <div className="ts-user-info">Welcome, {user.full_name || user.username}</div>
              <button className="ts-export-btn"><Download style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} /> Export</button>
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
          <TeamDashboardView timesheetDays={timesheetDays} approveDay={approveDay} rejectDay={rejectDay} releaseDay={releaseDay} loading={loading} />
        )}
      </div>
      <MobileNavigation />
    </div>
  );
};

const MyTimesheetView = ({ weekDays, selectedWeek, setSelectedWeek, getDayData, availableTasks, updateDayHours, updateDayNotes, addTimeEntry, deleteTimeEntry, submitDay, loading, isRejected }) => {
  const [newEntries, setNewEntries] = useState({});
  const weekTotal = weekDays.reduce((total, day) => total + parseFloat(getDayData(day).effective_total_hours || 0), 0);

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

        {availableTasks.length > 0 ? (
          availableTasks.map(task => (
            <div key={task.id} className="ts-task-row">
              <div className="ts-task-info">
                <div className="ts-task-title">{task.title}</div>
                <div className="ts-task-subtitle">{task.block?.name} • ID: {task.id}</div>
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
        ) : (
          <div className="ts-empty"><Clock style={{ width: '3rem', height: '3rem', color: 'var(--color-border)', margin: '0 auto 1rem' }} /><p style={{ margin: 0 }}>No tasks assigned to you</p><p style={{ fontSize: 'var(--font-size-base)', margin: 0 }}>Contact your manager to get tasks assigned</p></div>
        )}

        {availableTasks.length > 0 && (
          <div className="ts-add-entry-row">
            <div className="ts-add-entry-info">
              <div className="ts-add-entry-title">Add Time Entry</div>
              <div className="ts-add-entry-subtitle">Select task and enter hours</div>
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
                      {availableTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
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

const TeamDashboardView = ({ timesheetDays, approveDay, rejectDay, releaseDay, loading }) => {
  const [filter, setFilter] = useState('all');
  const filteredDays = timesheetDays.filter(day => { if (filter === 'submitted') return day.status === 'submitted'; if (filter === 'pending') return ['draft', 'submitted'].includes(day.status); return true; });

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
            <select style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--font-size-base)', fontFamily: 'var(--font-family)' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All Entries</option><option value="submitted">Awaiting Approval</option><option value="pending">Pending/Draft</option>
            </select>
          </div>
        </div>
        <div className="ts-table-wrap">
          <table className="ts-table">
            <thead><tr><th>Team Member</th><th>Total Hours</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th><th>Actions</th></tr></thead>
            <tbody>
              {userWeeklyData.length > 0 ? userWeeklyData.map(ud => (
                <tr key={ud.user.id}>
                  <td><div className="ts-employee-name">{ud.user?.first_name && ud.user?.last_name ? `${ud.user.first_name} ${ud.user.last_name}` : ud.user?.first_name || ud.user?.username || `User ${ud.user.id}`}</div></td>
                  <td><div style={{ fontWeight: 600 }}>{ud.totalHours.toFixed(1)}h</div></td>
                  {Array.from({ length: 7 }, (_, di) => {
                    const dd = ud.days.find(d => new Date(d.work_date).getDay() === (di + 1) % 7);
                    return (
                      <td key={di} style={{ textAlign: 'center' }}>
                        {dd ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-xs)' }}>
                            <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 500 }}>{dd.effective_total_hours}h</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                              {getStatusIcon(dd.status)}
                              {dd.status === 'submitted' && (
                                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                                  <button className="ts-action-btn" onClick={() => approveDay(dd.id)} title="Approve" style={{ color: 'var(--color-success)' }}><CheckCircle2 style={{ width: '0.75rem', height: '0.75rem' }} /></button>
                                  <button className="ts-action-btn" onClick={() => handleReject(dd.id)} title="Reject" style={{ color: 'var(--color-danger)' }}><AlertTriangle style={{ width: '0.75rem', height: '0.75rem' }} /></button>
                                </div>
                              )}
                              {dd.status === 'approved' && (
                                <button className="ts-action-btn" onClick={() => releaseDay(dd.id)} title="Release" style={{ color: 'var(--color-primary)' }}><Save style={{ width: '0.75rem', height: '0.75rem' }} /></button>
                              )}
                            </div>
                          </div>
                        ) : <span style={{ color: 'var(--color-border)' }}>-</span>}
                      </td>
                    );
                  })}
                  <td>
                    <div className="ts-action-buttons">
                      <button className="ts-action-btn" title="View Details" style={{ color: 'var(--color-primary)' }}><Eye style={{ width: '1rem', height: '1rem' }} /></button>
                      {ud.statusCounts.submitted > 0 && <span className="ts-badge ts-badge--submitted">{ud.statusCounts.submitted} pending</span>}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="10" className="ts-empty"><Clock style={{ width: '3rem', height: '3rem', color: 'var(--color-border)', margin: '0 auto 1rem' }} /><p style={{ margin: 0 }}>No timesheet entries found</p></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TimesheetSystem;
