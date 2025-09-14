// src/services/usersService.js
import api from './api';
import authService from './authService';

const usersService = {
  // Minimal: fetch assignable company users
  listCompanyUsers: async () => {
    const companyId = authService.getCompanyId();
    // Adjust the endpoint if your backend differs (e.g. /companies/current/users)
    const res = await api.get('/users', {
      params: companyId ? { company_id: companyId } : {}
    });
    return res.data;
  },
};

export default usersService;
