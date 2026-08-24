import type { NextConfig } from "next";

const proxyTarget = process.env.API_PROXY_TARGET ?? "http://backend:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {source: "/health", destination: `${proxyTarget}/health`},
      {source: "/auth/:path*", destination: `${proxyTarget}/auth/:path*`},
      {source: "/api/:path*", destination: `${proxyTarget}/api/:path*`},
      {source: "/admin/:path*", destination: `${proxyTarget}/admin/:path*`},
      {source: "/logos/:path*", destination: `${proxyTarget}/logos/:path*`},
      {source: "/r/:path*", destination: `${proxyTarget}/r/:path*`},
      {source: "/docs", destination: `${proxyTarget}/docs`},
      {source: "/openapi.json", destination: `${proxyTarget}/openapi.json`},
    ];
  },
};

export default nextConfig;
