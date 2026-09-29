import type { Detection } from "@mediapipe/tasks-vision";
import { FilesetResolver } from "@mediapipe/tasks-vision";
import type { BoundingBox } from "./types";

export const MEDIAPIPE_WASM_URL = "/mediapipe-wasm";

export const MEDIAPIPE_MODELS = {
  "efficientdet-lite0": "/models/efficientdet-lite0-fp16.tflite",
  // Larger / alternative models can be added here later.
} as const;

export type MediaPipeModelId = keyof typeof MEDIAPIPE_MODELS;

export const DEFAULT_MEDIAPIPE_MODEL: MediaPipeModelId = "efficientdet-lite0";

export type MpDelegate = "GPU" | "CPU";

const DELEGATE_EVENT = "vigilo-mp-delegate";

declare global {
  interface Window {
    __vigiloMpDelegate?: MpDelegate | null;
  }
}

/**
 * Broadcast which delegate the engine settled on (GPU preferred, CPU fallback).
 * The detection hook picks this up in every component instance.
 */
export function reportMpDelegate(delegate: MpDelegate) {
  window.__vigiloMpDelegate = delegate;
  window.dispatchEvent(new CustomEvent<MpDelegate>(DELEGATE_EVENT, { detail: delegate }));
  console.info(`[mediapipe] active delegate: ${delegate}`);
}

export function currentMpDelegate(): MpDelegate | null {
  return window.__vigiloMpDelegate ?? null;
}

export function subscribeMpDelegate(cb: (d: MpDelegate) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<MpDelegate>).detail);
  window.addEventListener(DELEGATE_EVENT, handler);
  return () => window.removeEventListener(DELEGATE_EVENT, handler);
}

export function modelAssetPath(model: MediaPipeModelId): string {
  return MEDIAPIPE_MODELS[model] ?? MEDIAPIPE_MODELS[DEFAULT_MEDIAPIPE_MODEL];
}

/**
 * Fileset for use inside Web Workers (module workers — see vite.config.ts).
 * `useModule=true` selects the ES-module WASM loader, which registers itself
 * via `globalThis.ModuleFactory` and therefore survives dynamic `import()`.
 * The classic loader only works via <script>/importScripts and fails in
 * module workers with "ModuleFactory not set".
 *
 * The cache-buster forces re-execution on every init: dynamic import() caches
 * modules, but MediaPipe consumes (clears) the global factory on each use —
 * without it, a second init in the same scope (e.g. GPU→CPU retry) fails.
 */
export async function visionFilesetForWorker(): Promise<
  Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
> {
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL, true);
  fileset.wasmLoaderPath = `${fileset.wasmLoaderPath}?cb=${Date.now()}`;
  return fileset;
}

/** Map MediaPipe detections (pixel-space boxes) to app BoundingBox. */
export function mapDetections(detections: Detection[] | undefined): BoundingBox[] {
  if (!detections) return [];
  const boxes: BoundingBox[] = [];
  for (const d of detections) {
    const bb = d.boundingBox;
    const top = d.categories[0];
    if (!bb || !top) continue;
    boxes.push({
      x: bb.originX,
      y: bb.originY,
      width: bb.width,
      height: bb.height,
      label: top.displayName || top.categoryName || `class_${top.index}`,
      confidence: top.score,
      classId: top.index,
    });
  }
  return boxes;
}
