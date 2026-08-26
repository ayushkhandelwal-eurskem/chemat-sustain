import axios from 'axios';
import { getAccessToken } from './oidc';

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export const getBaseUrl = (): string => {
    // docker-compose-dev.yml sets NEXT_PUBLIC_API_URL=/api for the frontend
    // container. That path is served by nginx (location /api/) and, for direct
    // access to the dev server, by the /api rewrite in next.config.ts - so the
    // browser never needs to know which host port the backend is published on
    // (8001 in this setup, not 8000).
    const override = process.env.NEXT_PUBLIC_API_URL;
    if (override) {
      // A relative base is meaningless during SSR: Node needs an absolute
      // URL. Inside the compose network the backend is http://backend:8000.
      if (typeof window === 'undefined') {
        return stripTrailingSlash(process.env.BACKEND_INTERNAL_URL || 'http://backend:8000');
      }
      return stripTrailingSlash(override);
    }
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

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Request-ID'] = crypto.randomUUID();
  return config;
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
