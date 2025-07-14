import axios from 'axios';

export const getBaseUrl = (): string => {
    if (typeof window === 'undefined') {
      // Server-side rendering
      return process.env.NODE_ENV === 'development'
        ? 'http://localhost:8000'
        : 'https://yourdomain.com/api';
    } else {
      // Client-side rendering
      return process.env.NODE_ENV === 'development'
        ? 'http://localhost:8000'
        : '/api'; // In production, use relative path since we're on the same domain
    }
  };


  // Create axios instance with default config
export const api = axios.create({
    baseURL:  getBaseUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // If you need to handle cookies
});

// // Request interceptor
// api.interceptors.request.use(
//     (config) => {
//         // Get token from wherever you store it (localStorage, cookies, etc.)
//         const token = storage.getSecure("auth_token")
//         if (token) {
//             config.headers.Authorization = `Bearer ${token}`;
//         }
//         return config;
//     },
//     (error) => {
//         return Promise.reject(error);
//     }
// );

// Response interceptor
// api.interceptors.response.use(
//     async (response) => response,
//     (error) => {
//         // Handle specific error cases
//         if (error.response?.status === 401) {   
//             if(window.location.pathname != "/login") 
//             window.location.assign('/login');
//         }
//         return Promise.reject(error);
//     }
// );
