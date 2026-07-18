import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer ships native-ish deps that must not be bundled by
  // Turbopack/webpack — keep it external so the payslip route handler can
  // require it at runtime on the Node server.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
