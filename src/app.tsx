import { useCallback, useState, useEffect, useRef } from "preact/hooks";
import "./app.css";
import { TelegramSettings, TelegramAdvancedSettings } from "./components/TelegramSettings";
import { MotionSensitivitySettings, DetectionAdvancedSettings } from "./components/MotionSensitivitySettings";
import { AdvancedSection } from "./components/AdvancedSection";
import { useTelegram } from "./hooks/useTelegram";
import { useDetectionBackend } from "./hooks/useDetectionBackend";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion, MotionConfig } from "motion/react";
import { useTheme } from "./hooks/useTheme";
import logo from "./assets/logo.svg";
import { Eye, EyeOff, Sun, Moon, Activity, CheckCircle, AlertCircle } from "lucide-react";
import { TrackedObjectsList } from "./components/TrackedObjectsList";
import { InferenceTest } from "./components/InferenceTest";
import {
  MOTION_ACTIVE_DURATION_MS,
  DEFAULT_INTERVAL_MS,
  KEYBOARD_SHORTCUTS,
} from "./lib/constants";
import { Camera } from "./components/Camera";

export function App() {
  const { theme, setTheme } = useTheme();
  const [showCameras, setShowCameras] = useState(true);
  const [lastMotionTime, setLastMotionTime] = useState<Date | null>(null);
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL_MS);
  const [latestFrames, setLatestFrames] = useState<Record<string, string>>({});

  const { mode, trackedObjects, addDiscoveredObject } = useDetectionBackend();

  // Local sync to prevent multiple rapid discoveries of the same object before React state updates
  const locallyKnownObjects = useRef<Set<string>>(new Set(Object.keys(trackedObjects)));
  useEffect(() => {
    Object.keys(trackedObjects).forEach((k) => locallyKnownObjects.current.add(k));
  }, [trackedObjects]);

  const updateLatestFrame = useCallback((deviceId: string, frame: string) => {
    setLatestFrames((prev) => ({ ...prev, [deviceId]: frame }));
  }, []);

  const {
    telegramBotToken,
    setTelegramBotToken,
    telegramChatId,
    sendTelegrams,
    setSendTelegrams,
    debounceTime,
    setDebounceTime,
    botUsername,
    tokenError,
    isValidatingToken,
    resetTelegramSettings,
    sendTelegramMessage,
    askToTrackObject,
    sendStatusResponse,
    sendTestMessage,
    setStatusHandler,
  } = useTelegram();

  const handleStatusRequest = useCallback(async () => {
    try {
      const frames = Object.entries(latestFrames)
        .map(([_deviceId, frame], index) => ({
          frame: frame,
          cameraIndex: index,
        }))
        .filter((f) => f.frame);

      if (frames.length > 0) {
        sendStatusResponse(frames);
      } else {
        // Fallback to dummy if no frames
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "red";
          ctx.fillRect(0, 0, 640, 480);
          ctx.fillStyle = "white";
          ctx.font = "30px Arial";
          ctx.fillText("No camera frames available", 150, 240);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          sendStatusResponse([{ frame: dataUrl, cameraIndex: 0 }]);
        }
      }
    } catch (error) {
      console.error("Error handling status request:", error);
    }
  }, [latestFrames, sendStatusResponse]);

  useEffect(() => {
    setStatusHandler(handleStatusRequest);
  }, [setStatusHandler, handleStatusRequest]);

  const isAppReady = Object.keys(latestFrames).length > 0 && telegramBotToken && telegramChatId;
  const isMotionActive =
    lastMotionTime && Date.now() - lastMotionTime.getTime() < MOTION_ACTIVE_DURATION_MS;

  const handleMotion = useCallback(
    async (timestamp: Date, frame: string, _deviceId: string, boxes: any[]) => {
      setLastMotionTime(timestamp);

      if (!sendTelegrams) return;

      if (mode === "mediapipe" && boxes.length > 0) {
        let sentAny = false;

        for (const box of boxes) {
          const label = box.label || "unknown";
          const confidence = box.confidence || 0;
          const trackedObj = trackedObjects[label];

          if (!locallyKnownObjects.current.has(label)) {
            // New object discovered. "person" is tracked by default, so notify
            // immediately; other classes ask for opt-in via Telegram.
            locallyKnownObjects.current.add(label);
            addDiscoveredObject(label);
            if (label.toLowerCase() === "person") {
              if (!sentAny) {
                await sendTelegramMessage(
                  frame,
                  `🚨 Detected: ${label} (${Math.round(confidence * 100)}%)`,
                );
                sentAny = true;
              }
            } else {
              await askToTrackObject(label, frame);
            }
          } else if (trackedObj && trackedObj.isTracking) {
            // It's tracked. Send a regular notification.
            if (!sentAny) {
              await sendTelegramMessage(
                frame,
                `🚨 Detected: ${label} (${Math.round(confidence * 100)}%)`,
              );
              sentAny = true; // prevent sending multiple photos for multiple tracked objects in the same frame
            }
          }
        }
      } else if (mode === "opencv" && boxes.length > 0) {
        await sendTelegramMessage(frame, `🚨 Pixel Motion Detected!`);
      }
    },
    [
      sendTelegrams,
      mode,
      trackedObjects,
      addDiscoveredObject,
      askToTrackObject,
      sendTelegramMessage,
    ],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case KEYBOARD_SHORTCUTS.TOGGLE_THEME:
          setTheme(theme === "dark" ? "light" : "dark");
          break;
        case KEYBOARD_SHORTCUTS.TOGGLE_CAMERAS:
          setShowCameras(!showCameras);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [theme, showCameras]);

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-4">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:rounded-md focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <header className="flex flex-wrap sm:flex-nowrap items-center justify-between w-full mb-4 sm:mb-6 gap-3 p-4 bg-card rounded-lg shadow-sm">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <img src={logo} alt="Vigilo Logo" className="w-8 h-8 shrink-0" />
          <h1 className="text-2xl font-bold leading-tight shrink-0">Vigilo</h1>
          <div className="flex items-center gap-1 text-base shrink-0" role="status" aria-live="polite">
            {isMotionActive ? (
              <Activity className="w-4 h-4 text-red-600 dark:text-red-400" aria-hidden="true" />
            ) : isAppReady ? (
              <CheckCircle className="w-4 h-4 text-green-700 dark:text-green-400" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 text-yellow-700 dark:text-yellow-400" aria-hidden="true" />
            )}
            <span>
              {isMotionActive ? "Motion Detected" : isAppReady ? "Ready" : "Setup Required"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            onClick={() => setShowCameras(!showCameras)}
            variant="outline"
            size="sm"
            className="min-h-[44px] min-w-[44px]"
            title="Toggle camera previews (Shortcut: H)"
            aria-label={showCameras ? "Hide camera previews" : "Show camera previews"}
            aria-pressed={showCameras}
            aria-expanded={showCameras}
            aria-keyshortcuts="h"
          >
            {showCameras ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
            <span className="hidden sm:inline">{showCameras ? "Hide" : "Show"} Cameras</span>
            <kbd className="hidden md:inline text-xs text-muted-foreground border rounded px-1" aria-hidden="true">H</kbd>
          </Button>
          <Button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            variant="outline"
            size="sm"
            className="min-h-[44px] min-w-[44px]"
            title="Toggle theme (Shortcut: T)"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            aria-pressed={theme === "dark"}
            aria-keyshortcuts="t"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
            <span className="hidden sm:inline">Theme</span>
            <kbd className="hidden md:inline text-xs text-muted-foreground border rounded px-1" aria-hidden="true">T</kbd>
          </Button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} aria-label="Vigilo monitoring dashboard" className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 divide-y divide-border">
              <div className="pb-6">
              <TelegramSettings
                sendTelegrams={sendTelegrams}
                setSendTelegrams={setSendTelegrams}
                telegramBotToken={telegramBotToken}
                setTelegramBotToken={setTelegramBotToken}
                telegramChatId={telegramChatId}
                botUsername={botUsername}
                tokenError={tokenError}
                isValidatingToken={isValidatingToken}
                sendTestMessage={sendTestMessage}
                onDisconnect={resetTelegramSettings}
              />
              </div>
              <div className="py-6">
              <MotionSensitivitySettings />
              </div>
              {mode === "mediapipe" && <div className="py-6"><TrackedObjectsList /></div>}
              <div className="pt-2">
              <AdvancedSection
                storageKey="vigilo-advanced-options"
                description="Fine-tune thresholds, timing, Telegram setup, and test tools."
              >
                <TelegramAdvancedSettings
                  debounceTime={debounceTime}
                  setDebounceTime={setDebounceTime}
                  resetTelegramSettings={resetTelegramSettings}
                />
                <div className="pt-4 border-t">
                  <DetectionAdvancedSettings intervalMs={intervalMs} setIntervalMs={setIntervalMs} />
                </div>
                <div className="pt-4 border-t">
                  <InferenceTest />
                </div>
              </AdvancedSection>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: 0.1, ease: "easeOut" }}
          className="lg:col-span-2"
        >
          {showCameras ? (
            <div className="min-h-[300px]">
              <Camera
                onMotion={handleMotion}
                onLatestFrame={updateLatestFrame}
                intervalMs={intervalMs}
              />
            </div>
          ) : (
            <div className="min-h-[300px] flex items-center justify-center rounded-lg border border-dashed bg-muted/20 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Camera previews hidden. Detection is paused to save battery.
              </p>
            </div>
          )}
        </motion.div>
      </main>

      <footer className="text-center p-4 text-base sm:text-sm text-muted-foreground mt-8 border-t">
        <p>© {new Date().getFullYear()} eifr. All rights reserved.</p>
        <p>Version 1.0.0</p>
      </footer>
    </div>
    </MotionConfig>
  );
}
