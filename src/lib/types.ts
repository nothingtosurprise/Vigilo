export type DetectionMode = "opencv" | "mediapipe";

export interface OpenCVConfig {
  diffThreshold: number;
  motionAreaPercentage: number;
}

export interface MediaPipeConfig {
  scoreThreshold: number;
  maxResults: number;
  model: "efficientdet-lite0";
}

export interface TrackedObject {
  className: string;
  isTracking: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  confidence?: number;
  classId?: number;
}

// Worker Messages
export type WorkerMessage =
  | { type: "INIT_OPENCV"; config: OpenCVConfig }
  | { type: "INIT_MEDIAPIPE"; config: MediaPipeConfig }
  | { type: "UPDATE_CONFIG_OPENCV"; config: OpenCVConfig }
  | { type: "UPDATE_CONFIG_MEDIAPIPE"; config: MediaPipeConfig }
  | { type: "PROCESS_FRAME"; imageData?: ImageData; imageBitmap?: ImageBitmap; timestamp: number }
  | { type: "CLEANUP" };

export type WorkerResponse =
  | {
      type: "INITIALIZED";
      backend: DetectionMode;
      success: boolean;
      error?: string;
      delegate?: "GPU" | "CPU";
    }
  | { type: "MOTION_DETECTED"; timestamp: number; boxes: BoundingBox[]; frameDataUrl?: string }
  | {
      type: "OBJECTS_DETECTED";
      timestamp: number;
      boxes: BoundingBox[];
      frameDataUrl?: string;
      inferenceTime?: number;
    }
  | { type: "ERROR"; error: string }
  | { type: "PROCESSING_DONE" }; // used to release main thread lock
