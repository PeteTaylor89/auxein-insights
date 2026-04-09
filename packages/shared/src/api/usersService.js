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
};

export default usersService;
