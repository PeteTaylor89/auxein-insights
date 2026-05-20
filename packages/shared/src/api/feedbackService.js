// packages/shared/src/api/feedbackService.js
import api from './api';

const feedbackService = {
  /**
   * Submit in-app feedback / bug / idea. Server forwards to the product
   * inbox (grow@auxein.co.nz). Posts as multipart so screenshots can be
   * attached (up to 3 images, 5 MB each).
   *
   * @param {Object} payload
   * @param {'bug'|'feedback'|'idea'|'other'} payload.category
   * @param {string} payload.subject
   * @param {string} payload.message
   * @param {string} [payload.page_url]
   * @param {File[]} [payload.attachments]
   */
  submit: async (payload) => {
    const form = new FormData();
    form.append('category', payload.category || 'feedback');
    form.append('subject', payload.subject || '');
    form.append('message', payload.message || '');
    if (payload.page_url) form.append('page_url', payload.page_url);
    (payload.attachments || []).forEach((file) => {
      // FastAPI reads repeated fields as a List[UploadFile]
      form.append('attachments', file, file.name);
    });
    const res = await api.post('/feedback', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};

export default feedbackService;
