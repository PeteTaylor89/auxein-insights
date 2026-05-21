// src/services/usersService.js
import api from './api';
import authService from './authService';

const usersService = {
  // Fetch assignable company users — uses admin endpoint scoped to own company
  getCompanyUsers: async () => {
    const companyId = authService.getCompanyId();
    const res = await api.get('/admin/users', {
      params: {
        ...(companyId ? { company_id: companyId } : {}),
        status: 'active',
        limit: 200,
      }
    });
    // Normalise: response may be array or { data: [...] }
    const data = res.data;
    if (Array.isArray(data)) return data;
    if (data?.data) return data.data;
    if (data?.users) return data.users;
    return [];
  },

  // Alias for backwards compatibility
  listCompanyUsers: async () => {
    return usersService.getCompanyUsers();
  },

  // Self-edit profile fields (first/last name, phone, job_title, bio, emergency contact, etc.)
  // Excludes avatar — that goes through uploadMyAvatar.
  updateMyProfile: async (data) => {
    const res = await api.patch('/auth/me', data);
    return res.data;
  },

  // Upload (or replace) the current user's avatar. `file` is a File/Blob.
  // Server returns { ok, avatar_url } where avatar_url is a presigned 1h URL.
  uploadMyAvatar: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post('/auth/me/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  deleteMyAvatar: async () => {
    const res = await api.delete('/auth/me/avatar');
    return res.data;
  },
};

export default usersService;
