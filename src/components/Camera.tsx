import { useState } from "preact/hooks";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { useCameras } from "@/hooks/useCameras";
import { Feed } from "./Feed/Feed";
import { Loader2, Plus, Video } from "lucide-react";

interface CameraProps {
  onMotion: (timestamp: Date, frame: string, deviceId: string, boxes: any[]) => void;
  onLatestFrame: (deviceId: string, frame: string) => void;
  intervalMs: number;
}

export const Camera = ({ onMotion, onLatestFrame, intervalMs }: CameraProps) => {
  const [showAvailableCameras, setShowAvailableCameras] = useState(false);
  const {
    availableCameras,
    refreshDevices,
    addCamera,
    removeCamera,
    activeDeviceIds,
    getStream,
    error,
    isRefreshing,
    pendingDeviceIds,
  } = useCameras();

  const toggleShowAvailableCameras = async () => {
    if (!showAvailableCameras) {
      await refreshDevices();
    }
    setShowAvailableCameras((prev) => !prev);
  };

  const handleSelectCamera = async (deviceId: string) => {
    const ok = await addCamera(deviceId);
    if (ok) {
      setShowAvailableCameras(false);
    }
  };

  const pendingNotActive = pendingDeviceIds.filter((id) => !activeDeviceIds.includes(id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cameras</CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={toggleShowAvailableCameras} disabled={isRefreshing} className="min-h-[44px]" aria-expanded={showAvailableCameras}>
          {isRefreshing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          )}
          {isRefreshing ? "Searching..." : "Add Camera"}
        </Button>
        {error && <p role="alert" className="text-base sm:text-sm text-destructive mt-2">{error}</p>}
        {showAvailableCameras && (
          <div className="mt-4 space-y-2">
            {isRefreshing ? (
              <div className="space-y-2" role="status" aria-label="Searching for cameras">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <span className="sr-only">Searching for cameras</span>
              </div>
            ) : availableCameras.length === 0 ? (
              <p className="text-base sm:text-sm text-muted-foreground">No cameras found.</p>
            ) : (
              availableCameras.map(({ label, deviceId }, index) => {
                const isPending = pendingDeviceIds.includes(deviceId);
                const isActive = activeDeviceIds.includes(deviceId);
                return (
                  <Button
                    key={deviceId}
                    variant="outline"
                    className="w-full justify-start min-h-[44px]"
                    disabled={isPending || isActive}
                    onClick={() => handleSelectCamera(deviceId)}
                    aria-label={`Add ${label || `Camera ${index + 1}`}${isActive ? " (already added)" : ""}`}
                  >
                    {isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    ) : (
                      <Video className="w-4 h-4 mr-2" aria-hidden="true" />
                    )}
                    {isPending
                      ? `Opening ${label || `Camera ${index + 1}`}...`
                      : isActive
                        ? `${label || `Camera ${index + 1}`} (added)`
                        : label || `Camera ${index + 1}`}
                  </Button>
                );
              })
            )}
          </div>
        )}
        {pendingNotActive.map((deviceId) => (
          <div
            key={`pending-${deviceId}`}
            role="status"
            className="relative flex flex-col items-center justify-center mt-4 min-h-[200px] bg-black/5 dark:bg-white/5 rounded-lg"
          >
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2 motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-base font-medium">Opening camera...</p>
            <p className="text-sm text-muted-foreground mt-1">
              This may take a few seconds while the browser connects.
            </p>
            <span className="sr-only">Opening camera, browser connecting</span>
          </div>
        ))}
        {activeDeviceIds.map((deviceId) => {
          const stream = getStream(deviceId);
          if (!stream) return null;

          return (
            <div key={deviceId} className="mt-4 space-y-2">
              <div className="w-full overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
              <Feed
                deviceId={deviceId}
                stream={stream}
                onMotion={onMotion}
                onLatestFrame={onLatestFrame}
                intervalMs={intervalMs}
              />
              </div>
              <Button variant="outline" className="min-h-[44px] text-destructive hover:text-destructive" onClick={() => { if (window.confirm("Remove this camera? Detection for this device will stop.")) removeCamera(deviceId); }} aria-label={`Remove camera ${availableCameras.find((c) => c.deviceId === deviceId)?.label || `Camera ${activeDeviceIds.indexOf(deviceId) + 1}`}`}>
                Remove Camera
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
