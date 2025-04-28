/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Prevent ws from being bundled client-side
    if (!isServer) {
        config.resolve.fallback = {
          ...config.resolve.fallback,
          ws: false, // Exclude ws module
          // Keep other fallbacks if they exist
        };
        // Optional: If the above doesn't work, try aliasing ws to an empty module
        // config.resolve.alias = { ...config.resolve.alias, ws: false };
    }

    // Keep the exclusion for bufferutil and utf-8-validate as well, just in case
    // config.externals.push("bufferutil", "utf-8-validate"); 
    // Note: Using fallback is generally preferred over externals for this case

    return config;
  },
};

module.exports = nextConfig;