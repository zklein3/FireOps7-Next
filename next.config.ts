import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Without this, Server Component fetch responses (including what the Supabase
    // client does internally) get cached across HMR refreshes in dev, and that cache
    // only clears on a real navigation or full page reload — not on router.refresh().
    // Caused stale data to keep showing after DB changes during active dev sessions.
    serverComponentsHmrCache: false,
  },
};

export default nextConfig;
