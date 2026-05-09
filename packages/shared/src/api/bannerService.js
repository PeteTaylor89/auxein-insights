// packages/shared/src/api/bannerService.js
import api from './api';

const bannerService = {
  getActiveBanners: async (audience = 'grow') => {
    const res = await api.get('/v1/public/banners/active', { params: { audience } });
    return res.data;
  },

  // Admin (auxein_admin only) — Grow side
  admin: {
    listBanners: async () => {
      const res = await api.get('/v1/grow-admin/banners');
      return res.data;
    },
    createBanner: async (data) => {
      const res = await api.post('/v1/grow-admin/banners', data);
      return res.data;
    },
    updateBanner: async (id, data) => {
      const res = await api.patch(`/v1/grow-admin/banners/${id}`, data);
      return res.data;
    },
    deleteBanner: async (id) => {
      const res = await api.delete(`/v1/grow-admin/banners/${id}`);
      return res.data;
    },
  },
};

export default bannerService;
