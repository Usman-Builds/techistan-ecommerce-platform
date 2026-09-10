import type { NextConfig } from "next";

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
};

export default nextConfig;
