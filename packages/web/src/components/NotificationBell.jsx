// components/NotificationBell.jsx — bell icon + unread badge, polls every 30s
import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { notificationService } from '@vineyard/shared';
import NotificationDropdown from './NotificationDropdown';
import './NotificationBell.css';

const POLL_INTERVAL = 30000;

function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef(null);

  const fetchCount = useCallback(async () => {
    try {
      const data = await notificationService.getUnreadCount();
      setUnreadCount(data.count ?? 0);
    } catch {
      // silent — badge just stays at last known value
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchCount]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const handleToggle = () => setDropdownOpen((prev) => !prev);

  const handleMarkAllRead = () => {
    setUnreadCount(0);
  };

  const handleNotificationRead = () => {
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  return (
    <div className="notification-bell-container" ref={containerRef}>
      <button
        className="notification-bell-btn"
        onClick={handleToggle}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {dropdownOpen && (
        <NotificationDropdown
          onClose={() => setDropdownOpen(false)}
          onMarkAllRead={handleMarkAllRead}
          onNotificationRead={handleNotificationRead}
        />
      )}
    </div>
  );
}

export default NotificationBell;
