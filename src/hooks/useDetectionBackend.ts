import { useState, useEffect, useCallback } from "preact/hooks";
import type {
  DetectionMode,
  OpenCVConfig,
  MediaPipeConfig,
  TrackedObject,
} from "../lib/types";
import { STORAGE_KEYS } from "../lib/detection-backends";
import { DEFAULT_MEDIAPIPE_MODEL, currentMpDelegate, subscribeMpDelegate } from "../lib/mediapipe";
import type { MpDelegate } from "../lib/mediapipe";

const TRACKED_OBJECTS_KEY = "vigilo-tracked-objects";

const DEFAULT_OPENCV_CONFIG: OpenCVConfig = {
  diffThreshold: 25,
  motionAreaPercentage: 1.0,
};

const DEFAULT_MEDIAPIPE_CONFIG: MediaPipeConfig = {
  scoreThreshold: 0.5,
  maxResults: 10,
  model: DEFAULT_MEDIAPIPE_MODEL,
};

// Person tracking is ON by default — it's the primary security-camera use case.
// Other classes stay opt-in via the Telegram ask-to-track flow.
const DEFAULT_TRACKED_OBJECTS: Record<string, TrackedObject> = {
  person: { className: "person", isTracking: true },
};

function migrateMode(raw: string | null): DetectionMode {
  if (raw === "mediapi" || raw === "mediapipe" || raw === "opencv") return raw as DetectionMode;
  // Legacy installs stored "yolo" here; map to the new smart-detection backend.
  return "mediapipe";
}

function loadTrackedObjects(): Record<string, TrackedObject> {
  try {
    const saved = localStorage.getItem(TRACKED_OBJECTS_KEY);
    if (!saved) return { ...DEFAULT_TRACKED_OBJECTS };
    const parsed = JSON.parse(saved) as Record<string, TrackedObject>;
    // Merge defaults for missing keys (e.g. existing installs that never saw
    // "person"), but respect explicit user choices already stored.
    return { ...DEFAULT_TRACKED_OBJECTS, ...parsed };
  } catch {
    return { ...DEFAULT_TRACKED_OBJECTS };
  }
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Shared store: every useDetectionBackend() instance in the app (App,
// useTelegram, TrackedObjectsList, settings panels, …) must see the same
// state. Previously each hook instance held its own useState, so pressing
// "Track" in Telegram updated only useTelegram's copy and App never saw it —
// the ask-to-track question was sent once, then notifications never arrived.
// A module-level store with subscriptions fixes that.
// ---------------------------------------------------------------------------

interface BackendStore {
  mode: DetectionMode;
  opencvConfig: OpenCVConfig;
  mediapipeConfig: MediaPipeConfig;
  trackedObjects: Record<string, TrackedObject>;
  flashOnMovement: boolean;
  flashDurationMs: number;
}

let store: BackendStore | null = null;
const listeners = new Set<() => void>();

function getStore(): BackendStore {
  if (!store) {
    store = {
      mode: migrateMode(localStorage.getItem(STORAGE_KEYS.DETECTION_BACKEND)),
      opencvConfig: loadJson(STORAGE_KEYS.OPENCV_CONFIG, DEFAULT_OPENCV_CONFIG),
      mediapipeConfig: {
        ...DEFAULT_MEDIAPIPE_CONFIG,
        ...loadJson<Partial<MediaPipeConfig>>(STORAGE_KEYS.MEDIAPIPE_CONFIG, {}),
        model: DEFAULT_MEDIAPIPE_MODEL,
      },
      trackedObjects: loadTrackedObjects(),
      flashOnMovement: loadJson(STORAGE_KEYS.FLASH_ON_MOVEMENT, true),
      flashDurationMs: loadJson(STORAGE_KEYS.FLASH_DURATION_MS, 3000),
    };
    try {
      localStorage.removeItem("vigilo-yolo-config");
    } catch {
      // ignore
    }
  }
  return store;
}

function persist(s: BackendStore) {
  try {
    localStorage.setItem(STORAGE_KEYS.DETECTION_BACKEND, s.mode);
    localStorage.setItem(STORAGE_KEYS.OPENCV_CONFIG, JSON.stringify(s.opencvConfig));
    localStorage.setItem(STORAGE_KEYS.MEDIAPIPE_CONFIG, JSON.stringify(s.mediapipeConfig));
    localStorage.setItem(TRACKED_OBJECTS_KEY, JSON.stringify(s.trackedObjects));
    localStorage.setItem(STORAGE_KEYS.FLASH_ON_MOVEMENT, JSON.stringify(s.flashOnMovement));
    localStorage.setItem(STORAGE_KEYS.FLASH_DURATION_MS, JSON.stringify(s.flashDurationMs));
  } catch (error) {
    console.error("Error saving config:", error);
  }
}

function setStore(patch: Partial<BackendStore>) {
  const s = getStore();
  Object.assign(s, patch);
  persist(s);
  listeners.forEach((l) => l());
}

export const useDetectionBackend = () => {
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const s = getStore();

  // Runtime-only: which delegate the MediaPipe engine actually settled on.
  // Shared across hook instances via broadcast (see lib/mediapipe.ts) —
  // not persisted, re-detected on every worker/detector init.
  const [mpDelegate, setMpDelegate] = useState<MpDelegate | null>(() => currentMpDelegate());

  useEffect(() => subscribeMpDelegate(setMpDelegate), []);

  const setMode = useCallback((mode: DetectionMode) => setStore({ mode }), []);
  const updateOpencvConfig = useCallback(
    (config: Partial<OpenCVConfig>) =>
      setStore({ opencvConfig: { ...getStore().opencvConfig, ...config } }),
    [],
  );
  const updateMediapipeConfig = useCallback(
    (config: Partial<MediaPipeConfig>) =>
      setStore({
        mediapipeConfig: {
          ...getStore().mediapipeConfig,
          ...config,
          model: DEFAULT_MEDIAPIPE_MODEL,
        },
      }),
    [],
  );
  const setFlashOnMovement = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) =>
      setStore({
        flashOnMovement:
          typeof v === "function" ? (v as (p: boolean) => boolean)(getStore().flashOnMovement) : v,
      }),
    [],
  );
  const setFlashDurationMs = useCallback(
    (v: number | ((prev: number) => number)) =>
      setStore({
        flashDurationMs:
          typeof v === "function" ? (v as (p: number) => number)(getStore().flashDurationMs) : v,
      }),
    [],
  );

  const toggleTrackedObject = useCallback((className: string, isTracking: boolean) => {
    const prev = getStore().trackedObjects;
    setStore({
      trackedObjects: { ...prev, [className]: { className, isTracking } },
    });
  }, []);

  const addDiscoveredObject = useCallback((className: string) => {
    const prev = getStore().trackedObjects;
    if (prev[className]) return;
    // "person" is tracked by default; everything else waits for user opt-in.
    const isTracking = className.toLowerCase() === "person";
    setStore({
      trackedObjects: { ...prev, [className]: { className, isTracking } },
    });
  }, []);

  return {
    mode: s.mode,
    setMode,
    opencvConfig: s.opencvConfig,
    updateOpencvConfig,
    mediapipeConfig: s.mediapipeConfig,
    updateMediapipeConfig,
    mpDelegate,
    trackedObjects: s.trackedObjects,
    toggleTrackedObject,
    addDiscoveredObject,
    flashOnMovement: s.flashOnMovement,
    setFlashOnMovement,
    flashDurationMs: s.flashDurationMs,
    setFlashDurationMs,
  };
};
