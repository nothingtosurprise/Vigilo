import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    // Bundle MediaPipe WASM locally so AI works offline and always matches
    // the installed @mediapipe/tasks-vision version. Served at /mediapipe-wasm/
    // in both dev and build (no binaries committed to git).
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@mediapipe/tasks-vision/wasm/*",
          dest: "mediapipe-wasm",
          rename: { stripBase: true }, // flat copy: dist/mediapipe-wasm/<file>
        },
      ],
    }),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectManifest: {
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        // Precache the detection model for offline AI. WASM (~34MB across
        // variants, only one used per browser) is runtime-cached instead —
        // see sw.ts — to keep SW install light.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}", "models/*.tflite"],
      },
      manifest: false,
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  worker: {
    // Module workers: required for the MediaPipe ES-module WASM loader
    // (see visionFilesetForWorker). Matches the official sample setup.
    format: "es",
  },
});
