// packages/shared/src/api/notificationService.js
import api from './api';

const notificationService = {
  getNotifications: async (params = {}) => {
    const res = await api.get('/v1/notifications', { params });
    return res.data;
  },

  getUnreadCount: async () => {
    const res = await api.get('/v1/notifications/unread-count');
    return res.data;
  },

  markAsRead: async (notificationId) => {
    const res = await api.patch(`/v1/notifications/${notificationId}/read`);
    return res.data;
  },

  markAllAsRead: async () => {
    const res = await api.post('/v1/notifications/read-all');
    return res.data;
  },
};

export default notificationService;
