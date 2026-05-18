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

  // Don't advertise the framework in response headers.
  poweredByHeader: false,
};

export default nextConfig;
