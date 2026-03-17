import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_data');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;