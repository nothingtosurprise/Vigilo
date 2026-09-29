import { useCallback, useRef, useEffect, useState } from "preact/hooks";
import { Loader2 } from "lucide-react";
import { useVideoElement } from "./useVideoElement";
import { useDarkMotionDetector } from "./useDarkMotionDetector";
import { useFlashLight } from "../../hooks/useFlashLight";
import { useDetectionBackend } from "../../hooks/useDetectionBackend";
import { drawDetections } from "../../lib/drawing-utils";
import type { BoundingBox, WorkerMessage, WorkerResponse } from "../../lib/types";
import { reportMpDelegate } from "../../lib/mediapipe";
import MediapipeWorker from "../../workers/mediapipe.worker.ts?worker";
import OpenCVWorker from "../../workers/opencv.worker.ts?worker";

interface FeedProps {
  stream: MediaStream;
  deviceId: string;
  onMotion: (timestamp: Date, frame: string, deviceId: string, boxes: BoundingBox[]) => void;
  onLatestFrame: (deviceId: string, frame: string) => void;
  intervalMs: number;
}

export const Feed = ({ stream, deviceId, onMotion, onLatestFrame, intervalMs }: FeedProps) => {
  const videoRef = useVideoElement(stream);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const isProcessingRef = useRef(false);
  const lastMotionTimeRef = useRef<number>(0);
  const lastFrameCaptureTimeRef = useRef<number>(0);

  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const { mode, flashOnMovement, flashDurationMs, mediapipeConfig, opencvConfig } =
    useDetectionBackend();

  const onMotionRef = useRef(onMotion);
  const onLatestFrameRef = useRef(onLatestFrame);
  const mediapipeConfigRef = useRef(mediapipeConfig);
  const opencvConfigRef = useRef(opencvConfig);
  const intervalMsRef = useRef(intervalMs);
  useEffect(() => {
    onMotionRef.current = onMotion;
    onLatestFrameRef.current = onLatestFrame;
    mediapipeConfigRef.current = mediapipeConfig;
    opencvConfigRef.current = opencvConfig;
    intervalMsRef.current = intervalMs;
  }, [onMotion, onLatestFrame, mediapipeConfig, opencvConfig, intervalMs]);

  const { isScreenFlashActive, isFlashActive, triggerFlash } = useFlashLight(
    stream,
    flashOnMovement,
    flashDurationMs,
  );
  const { checkFrame: checkDarkMotion } = useDarkMotionDetector(triggerFlash, isFlashActive);

  // Reset video-ready state when switching streams so the
  // "Connecting to camera..." overlay shows for each new open.
  useEffect(() => {
    setIsVideoReady(false);
  }, [stream, deviceId]);

  // Init worker for the active backend; re-init on mode/device change.
  useEffect(() => {
    setIsModelLoaded(false);
    setInitError(null);
    // Clear any stale overlay from the previous backend.
    const overlay = canvasRef.current?.getContext("2d");
    if (overlay && canvasRef.current) {
      overlay.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    isProcessingRef.current = false;

    const worker = mode === "opencv" ? new OpenCVWorker() : new MediapipeWorker();
    workerRef.current = worker;

    const emitMotion = (boxes: BoundingBox[], timestamp: number) => {
      const overlayCtx = canvasRef.current?.getContext("2d");
      if (overlayCtx && canvasRef.current) {
        // Always clear stale overlays. Only the smart backend draws boxes —
        // pixel mode just alerts on any change, no colored overlays.
        overlayCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        if (mode === "mediapipe") drawDetections(overlayCtx, boxes, mode);
      }
      if (boxes.length === 0) return;
      const now = Date.now();
      if (now - lastMotionTimeRef.current >= intervalMsRef.current) {
        lastMotionTimeRef.current = now;
        if (videoRef.current) {
          const canvas = document.createElement("canvas");
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0);
            onMotionRef.current(
              new Date(timestamp || now),
              canvas.toDataURL("image/jpeg", 0.8),
              deviceId,
              boxes,
            );
          }
        }
      }
    };

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const res = e.data;
      switch (res.type) {
        case "INITIALIZED":
          if (res.success) {
            setIsModelLoaded(true);
            // A mode switch can leave a stale in-flight flag set (a frame
            // posted to this worker before init completed). Clear it so the
            // loop restarts cleanly without a camera re-add.
            isProcessingRef.current = false;
            if (res.delegate) reportMpDelegate(res.delegate);
            // Sync any config edits made while the worker was loading.
            if (mode === "opencv") {
              worker.postMessage({
                type: "UPDATE_CONFIG_OPENCV",
                config: opencvConfigRef.current,
              } as WorkerMessage);
            } else {
              worker.postMessage({
                type: "UPDATE_CONFIG_MEDIAPIPE",
                config: mediapipeConfigRef.current,
              } as WorkerMessage);
            }
          } else {
            setInitError(res.error || `${mode} engine failed to start.`);
            console.error(`${mode} worker init failed:`, res.error);
          }
          break;
        case "MOTION_DETECTED":
          emitMotion(res.boxes, res.timestamp);
          break;
        case "OBJECTS_DETECTED": {
          emitMotion(res.boxes, res.timestamp);
          break;
        }
        case "ERROR":
          console.error(`${mode} worker error:`, res.error);
          break;
        case "PROCESSING_DONE":
          isProcessingRef.current = false;
          break;
      }
    };

    if (mode === "opencv") {
      worker.postMessage({ type: "INIT_OPENCV", config: opencvConfigRef.current } as WorkerMessage);
    } else {
      worker.postMessage({
        type: "INIT_MEDIAPIPE",
        config: mediapipeConfigRef.current,
      } as WorkerMessage);
    }

    return () => {
      try {
        worker.postMessage({ type: "CLEANUP" } as WorkerMessage);
      } catch {
        /* worker may already be gone */
      }
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
      if (workerRef.current === worker) workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, mode]);

  // Push config updates without reloading the model.
  useEffect(() => {
    if (!isModelLoaded) return;
    if (mode === "opencv") {
      workerRef.current?.postMessage({
        type: "UPDATE_CONFIG_OPENCV",
        config: opencvConfig,
      } as WorkerMessage);
    } else {
      workerRef.current?.postMessage({
        type: "UPDATE_CONFIG_MEDIAPIPE",
        config: mediapipeConfig,
      } as WorkerMessage);
    }
  }, [mode, opencvConfig, mediapipeConfig, isModelLoaded]);

  // Camera loop (cancellable: cleanup stops the rAF chain on unmount/config change)
  const startCameraLoop = useCallback(() => {
    let active = true;
    let rafId = 0;
    const loop = async () => {
      if (!active) return;
      if (!isProcessingRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        isProcessingRef.current = true;

        // Background frame capture for /status command (every 1 second max)
        const now = Date.now();
        if (now - lastFrameCaptureTimeRef.current > 1000) {
          lastFrameCaptureTimeRef.current = now;
          const canvas = document.createElement("canvas");
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0);
            onLatestFrameRef.current(deviceId, canvas.toDataURL("image/jpeg", 0.5));
          }
        }

        if (flashOnMovement) {
          checkDarkMotion(videoRef.current);
        }

        try {
          if (canvasRef.current) {
            if (
              canvasRef.current.width !== videoRef.current.videoWidth ||
              canvasRef.current.height !== videoRef.current.videoHeight
            ) {
              canvasRef.current.width = videoRef.current.videoWidth;
              canvasRef.current.height = videoRef.current.videoHeight;
            }
          }

          if (mode === "opencv") {
            // OpenCV worker expects ImageData (no ImageBitmap support).
            const capture = document.createElement("canvas");
            capture.width = videoRef.current.videoWidth;
            capture.height = videoRef.current.videoHeight;
            const captureCtx = capture.getContext("2d");
            if (!captureCtx) {
              isProcessingRef.current = false;
            } else {
              captureCtx.drawImage(videoRef.current, 0, 0);
              const imageData = captureCtx.getImageData(0, 0, capture.width, capture.height);
              workerRef.current?.postMessage({
                type: "PROCESS_FRAME",
                imageData,
                timestamp: now,
              } as WorkerMessage);
            }
          } else {
            const bitmap = await createImageBitmap(videoRef.current);
            workerRef.current?.postMessage(
              { type: "PROCESS_FRAME", imageBitmap: bitmap, timestamp: now } as WorkerMessage,
              [bitmap],
            );
          }
        } catch (e) {
          console.error("Frame capture error:", e);
          isProcessingRef.current = false;
        }
      }
      if (active) rafId = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      active = false;
      cancelAnimationFrame(rafId);
    };
  }, [deviceId, mode, flashOnMovement, checkDarkMotion]);

  useEffect(() => {
    if (!isModelLoaded) return;
    return startCameraLoop();
  }, [isModelLoaded, startCameraLoop]);

  return (
    <>
      {isScreenFlashActive && (
        <div aria-hidden="true" className="fixed inset-0 z-50 bg-white pointer-events-none motion-reduce:hidden" />
      )}
      <div className="relative flex justify-center items-center mt-4 min-h-[300px] overflow-hidden bg-black/5 dark:bg-white/5 rounded-lg">
        {!isVideoReady && (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-background/80 backdrop-blur-sm rounded-lg">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2 motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-base font-medium">Connecting to camera...</p>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-[80%]">
              Waiting for the first frame.
            </p>
            <span className="sr-only">Connecting to camera, waiting for first frame</span>
          </div>
        )}
        {isVideoReady && !isModelLoaded && !initError && (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-background/80 backdrop-blur-sm rounded-lg">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2 motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-base font-medium">
              {mode === "opencv" ? "Loading Motion Engine..." : "Loading AI Model..."}
            </p>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-[80%]">
              {mode === "opencv"
                ? "Starting lightweight pixel motion detection."
                : "First load may take a moment while downloading the model."}
            </p>
            <span className="sr-only">
              {mode === "opencv" ? "Loading motion engine" : "Loading AI model"}
            </span>
          </div>
        )}
        {isVideoReady && initError && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-background/80 backdrop-blur-sm rounded-lg p-4 text-center">
            <p className="text-base font-medium text-destructive">Detection engine failed to start</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-[80%]">{initError}</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-[80%]">
              Try switching detection mode or reloading the page.
            </p>
          </div>
        )}
        <video
          ref={videoRef}
          style={{ borderRadius: 8 }}
          className="block w-full rounded-lg object-contain"
          onCanPlay={() => setIsVideoReady(true)}
          onLoadedData={() => setIsVideoReady(true)}
          muted
          playsInline
          preload="auto"
          aria-label="Live camera feed"
        />
        <canvas ref={canvasRef} aria-hidden="true" className="absolute top-0 left-0 w-full h-full pointer-events-none" />
      </div>
    </>
  );
};
