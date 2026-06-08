import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// web/ 复用父仓库的 drizzle schema / normalize / queries 层(src/db/*),
// 这些文件在 vite root(web/)之外,需放开 fs 访问到仓库根。
export default defineConfig({
  server: {
    fs: {
      allow: [".."],
    },
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
