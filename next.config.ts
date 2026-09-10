import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static deployment: `npm run build` produces a self-contained `out/`
  // directory that can be served by any static host (no Node server needed).
  output: "export",
  // No Image Optimization API on static hosts — serve images as-is.
  images: { unoptimized: true },
};

export default nextConfig;
