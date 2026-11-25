import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["node-pty", "yaml"],
  outputFileTracingExcludes: { "/*": ["./.axercise/**/*", "./test-results/**/*", "./.playwright-mcp/**/*"] },
  turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
};

export default nextConfig;
