/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdfkit"],
  },
  webpack: (config) => {
    // The engine uses ESM-correct ".js" specifiers that point at ".ts" sources.
    // Teach webpack to resolve them (tsc/vitest already do via bundler resolution).
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
