import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude heavy server-only packages from webpack bundling.
  // @prisma/client uses generated native code; @react-pdf/renderer uses
  // canvas/pdfkit which also can't be bundled. Both must run in Node.js.
  serverExternalPackages: ["@prisma/client", "@react-pdf/renderer"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },

  // Expose a build-stamped deployment identifier to the browser so client-side
  // error reports (lib/client-errors/report.ts → /api/client-errors) can be
  // tied to a specific deploy. Vercel's VERCEL_DEPLOYMENT_ID / VERCEL_GIT_COMMIT_SHA
  // are server-only system vars; mapping one here inlines its build-time value
  // as a public var, so no manual Vercel dashboard variable is needed (and the
  // value is always the current deploy, never a stale typed-in id). Falls back
  // to the commit SHA (always set at build), then '' for local dev.
  env: {
    NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID:
      process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },

  // Don't advertise the framework in response headers.
  poweredByHeader: false,

  async headers() {
    // Sandbox-only headers (the public demo). Keep the rest of the app on its
    // existing headers. `SANDBOX_FRAME_ANCESTORS` is a space-separated list
    // that replaces the default allowed embedders (e.g. the Wix site domain).
    const ancestors =
      process.env.SANDBOX_FRAME_ANCESTORS ||
      "'self' https://*.wixsite.com https://*.wix.com";
    const sandboxHeaders = [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Content-Security-Policy", value: `frame-ancestors ${ancestors}` },
    ];
    return [
      { source: "/sandbox", headers: sandboxHeaders },
      { source: "/sandbox/:path*", headers: sandboxHeaders },
    ];
  },
};

export default nextConfig;
