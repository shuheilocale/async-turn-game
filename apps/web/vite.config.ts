import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 同じ Wi-Fi のスマホからも開けるようにする
    // 開発サーバを同時に複数動かすときは API_PORT（サーバの PORT と同じ値）と WEB_PORT を変える
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: {
      "/api": `http://localhost:${process.env.API_PORT ?? 8787}`,
    },
  },
});
