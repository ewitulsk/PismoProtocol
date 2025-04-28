const fs = require('fs');
const toml = require('toml');
const path = require('path');

// Function to load and parse TOML config
const loadTomlConfig = () => {
  try {
    const tomlPath = path.resolve(__dirname, 'config.toml');
    const tomlContent = fs.readFileSync(tomlPath, 'utf-8');
    const config = toml.parse(tomlContent);
    return config;
  } catch (error) {
    console.error('Failed to load or parse config.toml:', error);
    return {};
  }
};

const tomlConfig = loadTomlConfig();

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
  env: {
    ...tomlConfig, // Spread the loaded TOML config into env
  },
  // Adding a fallback for the 'bufferutil' and 'utf-8-validate' optional dependencies for `ws`
  // This is often needed in environments where native Node.js addons can't be built/run (like some serverless platforms or WebAssembly)
  // See: https://github.com/websockets/ws/issues/1779 and https://github.com/vercel/next.js/issues/48938
  experimental: {
    webpackBuildWorker: true,
  },
};

module.exports = nextConfig;