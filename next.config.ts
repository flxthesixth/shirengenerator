import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  images: {
    // ponytail: allowlist only what the app actually loads remotely; add
    // coinvision/asset CDNs here when they become real usage.
    remotePatterns: supabaseHost
      ? [
          { protocol: "https", hostname: supabaseHost },
          { protocol: "https", hostname: "**.supabase.co" },
        ]
      : [{ protocol: "https", hostname: "**.supabase.co" }],
  },
};

export default nextConfig;
