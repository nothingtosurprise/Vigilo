import { useDetectionBackend } from "../hooks/useDetectionBackend";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

const RANGE_SLIDER_CLS =
  "h-11 cursor-pointer border-0 bg-transparent shadow-none px-0 accent-primary";

export function MotionSensitivitySettings() {
  const { mode, setMode } = useDetectionBackend();

  return (
    <section aria-labelledby="detection-heading" className="space-y-3">
      <div>
        <h3 id="detection-heading" className="text-base font-semibold">Detection</h3>
        <p className="text-sm text-muted-foreground">Choose how you want to detect motion</p>
      </div>
      <div className="flex items-center justify-between gap-4 min-h-[44px]">
        <Label htmlFor="mode-toggle" className="flex flex-col space-y-1 cursor-pointer">
          <span>Smart Object Detection</span>
          <span className="font-normal text-sm text-muted-foreground">
            Uses AI to detect specific objects. Turn off for fast, lightweight pixel motion.
          </span>
        </Label>
        <Switch
          id="mode-toggle"
          checked={mode === "mediapipe"}
          onCheckedChange={(c) => setMode(c ? "mediapipe" : "opencv")}
          className="cursor-pointer shrink-0"
        />
      </div>
    </section>
  );
}

export function DetectionAdvancedSettings({
  intervalMs,
  setIntervalMs,
}: {
  intervalMs: number;
  setIntervalMs: (val: number) => void;
}) {
  const {
    mode,
    opencvConfig,
    updateOpencvConfig,
    mediapipeConfig,
    updateMediapipeConfig,
    mpDelegate,
    flashOnMovement,
    setFlashOnMovement,
    flashDurationMs,
    setFlashDurationMs,
  } = useDetectionBackend();

  return (
    <div className="space-y-6">

        {mode === "opencv" && (
          <div className="space-y-4">
            <h4 className="font-medium text-base">Pixel Motion Settings</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="diff-threshold">Sensitivity (Difference Threshold)</Label>
                <span className="text-sm text-muted-foreground">{opencvConfig.diffThreshold}</span>
              </div>
              <Input
                id="diff-threshold"
                type="range"
                className={RANGE_SLIDER_CLS}
                value={opencvConfig.diffThreshold}
                onInput={(e) =>
                  updateOpencvConfig({
                    diffThreshold: parseInt((e.target as HTMLInputElement).value, 10),
                  })
                }
                max={100}
                min={1}
                step={1}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor="motion-area">Minimum Motion Area</Label>
                <span className="text-sm text-muted-foreground">
                  {opencvConfig.motionAreaPercentage}%
                </span>
              </div>
              <Input
                id="motion-area"
                type="range"
                className={RANGE_SLIDER_CLS}
                value={opencvConfig.motionAreaPercentage}
                onInput={(e) =>
                  updateOpencvConfig({
                    motionAreaPercentage: parseFloat((e.target as HTMLInputElement).value),
                  })
                }
                max={20}
                min={0.1}
                step={0.1}
              />
            </div>
          </div>
        )}

        {mode === "mediapipe" && (
          <div className="space-y-4">
            <h4 className="font-medium text-base">Smart Object Settings</h4>
            <div className="flex items-center justify-between">
              <Label>Acceleration</Label>
              <span className="text-sm font-mono text-muted-foreground">
                {mpDelegate ?? "starting…"}
              </span>
            </div>
            <p className="text-base sm:text-sm text-muted-foreground">
              EfficientDet-Lite on-device AI. GPU preferred with automatic CPU fallback.
            </p>

            <div className="space-y-2 mt-4">
              <div className="flex justify-between">
                <Label htmlFor="confidence-threshold">Confidence Threshold</Label>
                <span className="text-sm text-muted-foreground">
                  {Math.round(mediapipeConfig.scoreThreshold * 100)}%
                </span>
              </div>
              <Input
                id="confidence-threshold"
                type="range"
                className={RANGE_SLIDER_CLS}
                value={mediapipeConfig.scoreThreshold}
                onInput={(e) =>
                  updateMediapipeConfig({
                    scoreThreshold: parseFloat((e.target as HTMLInputElement).value),
                  })
                }
                max={0.9}
                min={0.1}
                step={0.05}
              />
            </div>

            <div className="space-y-2 mt-4">
              <div className="flex justify-between">
                <Label htmlFor="max-results">Max Results</Label>
                <span className="text-sm text-muted-foreground">{mediapipeConfig.maxResults}</span>
              </div>
              <Input
                id="max-results"
                type="range"
                className={RANGE_SLIDER_CLS}
                value={mediapipeConfig.maxResults}
                onInput={(e) =>
                  updateMediapipeConfig({
                    maxResults: parseInt((e.target as HTMLInputElement).value, 10),
                  })
                }
                max={20}
                min={1}
                step={1}
              />
            </div>
          </div>
        )}

        <div className="space-y-4 pt-4 border-t">
          <h4 className="font-medium text-base">Low Light Vision</h4>
          <div className="flex items-center justify-between gap-4 min-h-[44px]">
            <Label htmlFor="flash-toggle" className="flex flex-col space-y-1 cursor-pointer">
              <span>Flash on Dark Movement</span>
              <span className="font-normal text-sm text-muted-foreground">
                Uses device flashlight (or bright screen) if movement is detected in the dark.
              </span>
            </Label>
            <Switch
              id="flash-toggle"
              checked={flashOnMovement}
              onCheckedChange={setFlashOnMovement}
              className="cursor-pointer shrink-0"
            />
          </div>

          {flashOnMovement && (
            <div className="space-y-2 mt-2">
              <div className="flex justify-between">
                <Label htmlFor="flash-duration">Flash Duration</Label>
                <span className="text-sm text-muted-foreground">{flashDurationMs / 1000}s</span>
              </div>
              <Input
                id="flash-duration"
                type="range"
                className={RANGE_SLIDER_CLS}
                value={flashDurationMs / 1000}
                onInput={(e) =>
                  setFlashDurationMs(parseInt((e.target as HTMLInputElement).value, 10) * 1000)
                }
                max={15}
                min={1}
                step={1}
              />
            </div>
          )}
        </div>

        <div className="space-y-2 pt-4 border-t">
          <div className="flex justify-between">
            <Label htmlFor="polling-interval">Polling Interval</Label>
            <span className="text-sm text-muted-foreground">{intervalMs}ms</span>
          </div>
          <Input
            id="polling-interval"
            type="range"
            className={RANGE_SLIDER_CLS}
            value={intervalMs}
            onInput={(e) => setIntervalMs(parseInt((e.target as HTMLInputElement).value, 10))}
            max={2000}
            min={100}
            step={50}
          />
        </div>
    </div>
  );
}
