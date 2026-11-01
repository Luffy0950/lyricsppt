/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // keep these server-only libraries out of the webpack bundle
  serverExternalPackages: ["pdf-parse", "mammoth", "pptxgenjs", "jszip", "jpeg-js", "mysql2"],
};
export default nextConfig;
