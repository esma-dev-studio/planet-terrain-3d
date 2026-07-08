import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 相対パス出力(GitHub Pages のプロジェクトサイト配下でも動くように)
  base: "./",
  server: { port: Number(process.env.PORT) || 5189 },
  build: {
    // esbuild の minify プロセスが不安定な環境向けに terser を使う
    minify: "terser",
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
