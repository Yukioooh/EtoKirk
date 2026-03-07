import axios from 'axios';

const API_BASE = '/api';

const api = {
  // Dashboard summary
  getDashboardSummary: async () => {
    const response = await axios.get(`${API_BASE}/stats/dashboard-summary`);
    return response.data;
  },

  // Viewer timeline
  getViewerTimeline: async (hours = 24) => {
    const response = await axios.get(`${API_BASE}/stats/viewers/timeline`, {
      params: { hours }
    });
    return response.data;
  },

  // Drop events
  getDropEvents: async (limit = 50) => {
    const response = await axios.get(`${API_BASE}/stats/drop-events`, {
      params: { limit }
    });
    return response.data;
  },

  // Average drop stats
  getAverageDrop: async () => {
    const response = await axios.get(`${API_BASE}/stats/average-drop`);
    return response.data;
  },

  // Current overlap
  getCurrentOverlap: async (minutes = 60) => {
    const response = await axios.get(`${API_BASE}/stats/overlap/current`, {
      params: { minutes }
    });
    return response.data;
  },

  // Overlap history
  getOverlapHistory: async (limit = 30) => {
    const response = await axios.get(`${API_BASE}/stats/overlap/history`, {
      params: { limit }
    });
    return response.data;
  },

  // Migration events
  getMigrationEvents: async (limit = 50) => {
    const response = await axios.get(`${API_BASE}/stats/migration/events`, {
      params: { limit }
    });
    return response.data;
  },

  // Stream events
  getStreamEvents: async (limit = 100) => {
    const response = await axios.get(`${API_BASE}/stats/stream-events`, {
      params: { limit }
    });
    return response.data;
  },

  // Common chatters
  getCommonChatters: async (hours = 24) => {
    const response = await axios.get(`${API_BASE}/stats/common-chatters`, {
      params: { hours }
    });
    return response.data;
  },

  // Health check
  getHealth: async () => {
    const response = await axios.get(`${API_BASE}/health`);
    return response.data;
  },

  // Traitors - Liste des traitres
  getTraitors: async (limit = 100) => {
    const response = await axios.get(`${API_BASE}/stats/traitors`, {
      params: { limit }
    });
    return response.data;
  },

  // Traitors - Top traitres
  getTopTraitors: async (limit = 20) => {
    const response = await axios.get(`${API_BASE}/stats/traitors/top`, {
      params: { limit }
    });
    return response.data;
  },

  // Traitors - Stats globales
  getTraitorStats: async () => {
    const response = await axios.get(`${API_BASE}/stats/traitors/stats`);
    return response.data;
  },

  // Traitors - Recherche
  searchChatter: async (username) => {
    const response = await axios.get(`${API_BASE}/stats/traitors/search`, {
      params: { username }
    });
    return response.data;
  },

  // Traitors - Historique des rapports
  getTraitorReports: async (days = 30) => {
    const response = await axios.get(`${API_BASE}/stats/traitors/reports`, {
      params: { days }
    });
    return response.data;
  }
};

export default api;
