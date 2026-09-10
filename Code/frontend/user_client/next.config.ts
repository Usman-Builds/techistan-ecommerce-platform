import type { NextConfig } from "next";

// Where the NestJS backend lives. The browser never calls it directly: it calls
// this app's own /api/* path and the rewrite below forwards it there (see
// src/lib/api/client.ts for why). NEXT_PUBLIC_* values are fixed at BUILD time,
// so changing NEXT_PUBLIC_API_URL needs a rebuild.
const backendUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  // Cloudinary-backed image optimization (script 06). A custom loader means
  // next/image emits Cloudinary delivery URLs (f_auto/q_auto → WebP/AVIF) with
  // a responsive srcset, instead of routing through Next's own optimizer.
  images: {
    loader: "custom",
    loaderFile: "./src/lib/cloudinary-loader.ts",
  },

  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/:path*` }];
  },

  experimental: {
    // A sleeping Render free-plan backend can take about a minute to wake. The
    // default 30s proxy timeout would turn that first request into a 500.
    proxyTimeout: 90_000,
  },
};

export default nextConfig;
