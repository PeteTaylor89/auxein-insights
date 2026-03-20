// packages/shared/src/api/calendarService.js
import api from './api';

const calendarService = {
  getEvents: async (startDate, endDate, eventTypes = []) => {
    // Build URLSearchParams manually — FastAPI expects repeated keys
    // (event_types=task&event_types=observation), not bracket notation
    const params = new URLSearchParams();
    params.append('start_date', startDate);
    params.append('end_date', endDate);
    for (const t of eventTypes) {
      params.append('event_types', t);
    }
    const res = await api.get('/v1/calendar/events', { params });
    return res.data;
  },
};

export default calendarService;
