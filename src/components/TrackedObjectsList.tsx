import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDetectionBackend } from "../hooks/useDetectionBackend";
import { ListFilter } from "lucide-react";

export function TrackedObjectsList() {
  const { mode, trackedObjects, toggleTrackedObject } = useDetectionBackend();

  if (mode !== "mediapipe") {
    return null; // Only show when smart detection is active
  }

  const objects = Object.values(trackedObjects);

  return (
    <section aria-labelledby="tracked-objects-heading" className="mt-4 rounded-xl border border-border/50 bg-card shadow-sm">
      <div className="px-6 pt-6 pb-3">
        <h4 id="tracked-objects-heading" className="flex items-center gap-2 text-lg font-semibold leading-none">
          <ListFilter className="w-5 h-5 text-primary" aria-hidden="true" />
          Tracked Objects
        </h4>
      </div>
      <div className="px-6 pb-6">
        {objects.length === 0 ? (
          <div className="text-center p-6 border border-dashed rounded-lg bg-muted/20">
            <p className="text-sm text-muted-foreground">
              No objects discovered yet. The AI will learn and add them here as it sees things.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {objects.map((obj) => (
              <div
                key={obj.className}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  obj.isTracking
                    ? "bg-primary/5 border-primary/20"
                    : "bg-muted/30 border-transparent"
                }`}
              >
                <Label
                  className="capitalize font-medium cursor-pointer"
                  htmlFor={`track-${obj.className}`}
                >
                  {obj.className}
                </Label>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-muted-foreground">
                    {obj.isTracking ? "Tracking" : "Ignoring"}
                  </span>
                  <Switch
                    id={`track-${obj.className}`}
                    checked={obj.isTracking}
                    onCheckedChange={(c) => toggleTrackedObject(obj.className, c)}
                    className="cursor-pointer"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
