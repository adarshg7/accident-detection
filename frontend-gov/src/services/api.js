import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  // All requests go to backend automatically
  // axios.get('/accidents') → http://localhost:5000/api/accidents
});

// Response interceptor: handle expired token globally
api.interceptors.response.use(
  response => response,
  // Pass successful responses through unchanged

  error => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('gov_token');
      localStorage.removeItem('gov_official');
      window.location.href = '/login';
      // Redirect to login page automatically
    }
    return Promise.reject(error);
  }
);

export default api;