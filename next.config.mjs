/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  experimental: {
    optimizePackageImports: ["recharts", "framer-motion", "date-fns"],
    serverExternalPackages: ["googleapis", "google-auth-library"],
  },
};

export default nextConfig;
