// components/NotificationDropdown.jsx — latest 10 notifications with "View all" link
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { notificationService } from '@vineyard/shared';

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
  return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}

function NotificationDropdown({ onClose, onMarkAllRead, onNotificationRead }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await notificationService.getNotifications();
        setNotifications((data.notifications || []).slice(0, 10));
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      onMarkAllRead?.();
    } catch {
      // silent
    }
  };

  const handleItemClick = async (notification) => {
    if (!notification.read) {
      try {
        await notificationService.markAsRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
        );
        onNotificationRead?.();
      } catch {
        // silent
      }
    }
    onClose();
  };

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="notification-dropdown">
      <div className="notification-dropdown-header">
        <h3>Notifications</h3>
        {hasUnread && (
          <button className="notification-mark-all-btn" onClick={handleMarkAllRead}>
            Mark all read
          </button>
        )}
      </div>

      <div className="notification-dropdown-list">
        {loading ? (
          <div className="notification-empty">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="notification-empty">No notifications yet</div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`notification-dropdown-item ${n.read ? '' : 'unread'}`}
              onClick={() => handleItemClick(n)}
            >
              <div className={`notification-dot ${n.read ? 'read' : ''}`} />
              <div className="notification-item-content">
                <p className="notification-item-title">
                  <span className={`notification-type-badge type-${n.type}`}>
                    {n.type}
                  </span>
                  {n.title}
                </p>
                {n.body && <p className="notification-item-body">{n.body}</p>}
                <div className="notification-item-time">{timeAgo(n.created_at)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="notification-dropdown-footer">
        <Link to="/notifications" onClick={onClose}>
          View all notifications
        </Link>
      </div>
    </div>
  );
}

export default NotificationDropdown;
