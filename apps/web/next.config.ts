import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript sources.
  transpilePackages: ["@kiemtra/core", "@kiemtra/ui"],
};

export default nextConfig;
