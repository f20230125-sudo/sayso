import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Development only: lets the dev server be opened as 127.0.0.1 as well as localhost.
  allowedDevOrigins: ["127.0.0.1"],
  // The round badge Next.js draws in a corner while developing sits on top of
  // the ask bar, and gets into the README's pictures.
  devIndicators: false,
  // The Docker build asks for a self-contained server (see Dockerfile). Other
  // builds, such as the one on Vercel, are left as they are.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
