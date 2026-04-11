import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // @databricks/sql pulls in native lz4 bindings; do not bundle them for server.
  serverExternalPackages: ["@databricks/sql", "lz4"],
};

export default nextConfig;
