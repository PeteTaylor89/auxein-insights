// pages/Notifications.jsx — full notification page with filters, pagination, mark-all-read
import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, CheckCheck, Filter } from 'lucide-react';
import { notificationService } from '@vineyard/shared';
import './Notifications.css';

const NOTIFICATION_TYPES = [
  { value: '', label: 'All' },
  { value: 'task', label: 'Tasks' },
  { value: 'incident', label: 'Incidents' },
  { value: 'action', label: 'Actions' },
  { value: 'visitor', label: 'Visitors' },
  { value: 'timesheet', label: 'Timesheets' },
  { value: 'system', label: 'System' },
];

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-NZ', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(''); // '' = all types
  const [unreadOnly, setUnreadOnly] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (unreadOnly) params.unread_only = true;
      const data = await notificationService.getNotifications(params);
      let items = data.notifications || [];
      if (filter) {
        items = items.filter((n) => n.type === filter);
      }
      setNotifications(items);
      setTotal(data.total ?? items.length);
      setUnreadCount(data.unread_count ?? 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter, unreadOnly]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (notification) => {
    if (notification.read) return;
    try {
      await notificationService.markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  return (
    <div className="page-container">
      <div className="notifications-page">
        {/* Header */}
        <div className="notifications-header">
          <div className="notifications-title-row">
            <Bell size={24} />
            <h1 className="section-title">Notifications</h1>
            {unreadCount > 0 && (
              <span className="badge badge--accent">{unreadCount} unread</span>
            )}
          </div>
          {unreadCount > 0 && (
            <button className="btn-ghost" onClick={handleMarkAllRead}>
              <CheckCheck size={16} />
              Mark all as read
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="notifications-filters">
          <div className="notifications-filter-row">
            <Filter size={16} />
            <div className="notifications-type-chips">
              {NOTIFICATION_TYPES.map((t) => (
                <button
                  key={t.value}
                  className={`notification-chip ${filter === t.value ? 'active' : ''}`}
                  onClick={() => setFilter(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <label className="notifications-unread-toggle">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Unread only
          </label>
        </div>

        {/* List */}
        <div className="notifications-list">
          {loading ? (
            <div className="notifications-empty">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="notifications-empty">
              <Bell size={40} strokeWidth={1.5} />
              <p>No notifications{filter ? ` for "${NOTIFICATION_TYPES.find((t) => t.value === filter)?.label}"` : ''}</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`notification-row ${n.read ? '' : 'unread'}`}
              >
                <div className={`notification-dot ${n.read ? 'read' : ''}`} />
                <div className="notification-row-content">
                  <div className="notification-row-top">
                    <span className={`notification-type-badge type-${n.type}`}>
                      {n.type}
                    </span>
                    <span className="notification-row-title">{n.title}</span>
                    <span className="notification-row-time">{timeAgo(n.created_at)}</span>
                  </div>
                  {n.body && <p className="notification-row-body">{n.body}</p>}
                </div>
                {!n.read && (
                  <button
                    className="notification-read-btn"
                    onClick={() => handleMarkAsRead(n)}
                    title="Mark as read"
                  >
                    <Check size={16} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {!loading && notifications.length > 0 && (
          <div className="notifications-footer">
            Showing {notifications.length} of {total} notifications
          </div>
        )}
      </div>
    </div>
  );
}

export default Notifications;
