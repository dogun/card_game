import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,              // 监听 0.0.0.0，便于外部访问
    port: 5173,
    strictPort: true,
    allowedHosts: ["yueyue.com"], // 允许用该 Host 访问
    // 如果 HMR 在域名下有问题可启用（按需）：
    // hmr: { host: "yueyue.com", protocol: "ws", port: 5173 }
  },
});

