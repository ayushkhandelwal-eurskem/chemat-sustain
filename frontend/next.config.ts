import type { NextConfig } from "next";

// Where /api/* requests are proxied when they reach the Next.js server
// directly (the dev server on :3001, bypassing nginx). Inside the compose
// network the backend is http://backend:8000; nginx performs the same
// /api/ -> / rewrite for traffic arriving through :8080.
const backendOrigin = process.env.BACKEND_ORIGIN || "http://backend:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [{
      hostname: "chematsustain.eu"
    }],
  },
};

export default nextConfig;