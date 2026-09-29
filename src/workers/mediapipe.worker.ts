// NOTE: this worker runs as a module worker and must use the ES-module WASM
// loader via visionFilesetForWorker() (useModule=true). The classic loader
// relies on importScripts globals and fails here with "ModuleFactory not set".
import { ObjectDetector } from "@mediapipe/tasks-vision";
import { mapDetections, modelAssetPath, visionFilesetForWorker } from "../lib/mediapipe";
import type { MediaPipeConfig } from "../lib/types";
import type { WorkerMessage, WorkerResponse } from "../lib/types";

let detector: ObjectDetector | null = null;
let activeDelegate: "GPU" | "CPU" = "CPU";
let lastTimestamp = 0;
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

async function createDetector(config: MediaPipeConfig, tryDelegate: "GPU" | "CPU") {
  const vision = await visionFilesetForWorker();
  return ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelAssetPath(config.model),
      delegate: tryDelegate,
    },
    scoreThreshold: config.scoreThreshold,
    maxResults: config.maxResults,
    runningMode: "VIDEO",
  });
}

async function init(config: MediaPipeConfig) {
  try {
    try {
      detector = await createDetector(config, "GPU");
      activeDelegate = "GPU";
    } catch (gpuErr) {
      console.warn("[mediapipe.worker] GPU delegate failed, falling back to CPU:", gpuErr);
      detector = await createDetector(config, "CPU");
      activeDelegate = "CPU";
    }
    console.info(`[mediapipe.worker] detector ready (delegate=${activeDelegate})`);
    self.postMessage({
      type: "INITIALIZED",
      backend: "mediapipe",
      success: true,
      delegate: activeDelegate,
    } as WorkerResponse);
  } catch (err) {
    self.postMessage({
      type: "INITIALIZED",
      backend: "mediapipe",
      success: false,
      error: String(err),
    } as WorkerResponse);
  }
}

async function processFrame(data: ImageBitmap | ImageData, timestamp: number) {
  if (!detector) {
    if ("close" in data) (data as ImageBitmap).close();
    // Contract: every PROCESS_FRAME is answered with PROCESSING_DONE, even
    // when dropped. Otherwise the main thread's in-flight flag sticks and the
    // camera loop stalls forever (e.g. a frame posted during a mode switch
    // lands in the fresh, not-yet-initialized worker).
    self.postMessage({ type: "PROCESSING_DONE" } as WorkerResponse);
    return;
  }
  try {
    // Monotonic timestamp required by VIDEO mode.
    const ts = Math.max(timestamp, lastTimestamp + 1);
    lastTimestamp = ts;

    // Both are valid TexImageSource inputs for detectForVideo. ImageBitmap is
    // passed through directly (zero-copy, no 2D context needed); ImageData
    // goes via a scratch canvas.
    let source: ImageBitmap | OffscreenCanvas | ImageData;
    let ownedBitmap: ImageBitmap | null = null;
    if ("close" in data) {
      ownedBitmap = data as ImageBitmap;
      source = ownedBitmap;
    } else {
      const imageData = data as ImageData;
      if (
        !canvas ||
        canvas.width !== imageData.width ||
        canvas.height !== imageData.height
      ) {
        canvas = new OffscreenCanvas(imageData.width, imageData.height);
        ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
      }
      if (!ctx) throw new Error("Failed to get offscreen context");
      ctx.putImageData(imageData, 0, 0);
      source = canvas;
    }

    const start = performance.now();
    const result = detector.detectForVideo(source, ts);
    const boxes = mapDetections(result.detections);
    const inferenceTime = performance.now() - start;
    ownedBitmap?.close();

    // Always emit so the main thread can clear stale overlays on empty frames.
    self.postMessage({
      type: "OBJECTS_DETECTED",
      timestamp,
      boxes,
      inferenceTime,
    } as WorkerResponse);
  } catch (err) {
    self.postMessage({ type: "ERROR", error: String(err) } as WorkerResponse);
  } finally {
    self.postMessage({ type: "PROCESSING_DONE" } as WorkerResponse);
  }
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case "INIT_MEDIAPIPE":
      await init(msg.config);
      break;
    case "PROCESS_FRAME":
      if (msg.imageBitmap) await processFrame(msg.imageBitmap, msg.timestamp);
      else if (msg.imageData) await processFrame(msg.imageData, msg.timestamp);
      break;
    case "UPDATE_CONFIG_MEDIAPIPE":
      if (detector && msg.config) {
        await detector.setOptions({
          scoreThreshold: msg.config.scoreThreshold,
          maxResults: msg.config.maxResults,
        });
      }
      break;
    case "CLEANUP":
      try {
        detector?.close();
      } catch {
        // ignore
      }
      detector = null;
      canvas = null;
      ctx = null;
      self.close();
      break;
  }
};
