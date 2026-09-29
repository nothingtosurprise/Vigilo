import { useCallback, useRef, useState } from "preact/hooks";
import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { useDetectionBackend } from "../hooks/useDetectionBackend";
import { drawDetections } from "../lib/drawing-utils";
import type { BoundingBox } from "../lib/types";
import { MEDIAPIPE_WASM_URL, mapDetections, modelAssetPath, reportMpDelegate } from "../lib/mediapipe";
import { Loader2, Upload, Image as ImageIcon } from "lucide-react";

export const InferenceTest = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inferenceTime, setInferenceTime] = useState<string | null>(null);
  const [detectedObjects, setDetectedObjects] = useState<BoundingBox[]>([]);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectorRef = useRef<ObjectDetector | null>(null);

  const { mediapipeConfig } = useDetectionBackend();

  const loadModel = useCallback(async () => {
    if (detectorRef.current || isLoadingModel) return;
    setIsLoadingModel(true);
    setError(null);
    try {
      // Main thread loads the classic WASM build via <script> tag — do NOT
      // pass useModule=true here (that's worker-only; classic scripts can't
      // parse the ES-module loader).
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      try {
        detectorRef.current = await ObjectDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: modelAssetPath(mediapipeConfig.model), delegate: "GPU" },
          scoreThreshold: mediapipeConfig.scoreThreshold,
          maxResults: mediapipeConfig.maxResults,
          runningMode: "IMAGE",
        });
        reportMpDelegate("GPU");
      } catch (gpuErr) {
        console.warn("[mediapipe] GPU delegate failed, falling back to CPU:", gpuErr);
        detectorRef.current = await ObjectDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: modelAssetPath(mediapipeConfig.model), delegate: "CPU" },
          scoreThreshold: mediapipeConfig.scoreThreshold,
          maxResults: mediapipeConfig.maxResults,
          runningMode: "IMAGE",
        });
        reportMpDelegate("CPU");
      }
      setIsModelLoaded(true);
    } catch (err) {
      console.error("Failed to load MediaPipe model:", err);
      setError("Failed to load AI model. Check your connection and retry.");
    } finally {
      setIsLoadingModel(false);
    }
  }, [isLoadingModel, mediapipeConfig]);

  const handleImageUpload = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("Please upload an image file");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === "string") {
          setSelectedImage(result);
          setDetectedObjects([]);
          setInferenceTime(null);
          setError(null);
          if (!detectorRef.current && !isLoadingModel) loadModel();
        }
      };
      reader.onerror = () => setError("Failed to read file");
      reader.readAsDataURL(file);
    },
    [isLoadingModel, loadModel],
  );

  const handleFileChange = useCallback(
    (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) handleImageUpload(file);
    },
    [handleImageUpload],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files[0];
      if (file) handleImageUpload(file);
    },
    [handleImageUpload],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleImageLoad = useCallback(() => {
    if (imageRef.current && canvasRef.current) {
      canvasRef.current.width = imageRef.current.naturalWidth;
      canvasRef.current.height = imageRef.current.naturalHeight;
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, []);

  const runInference = useCallback(async () => {
    if (!selectedImage || !imageRef.current) return;
    if (!detectorRef.current) {
      await loadModel();
      if (!detectorRef.current) return;
    }

    setIsProcessing(true);
    setError(null);
    setDetectedObjects([]);
    setInferenceTime(null);

    try {
      await detectorRef.current.setOptions({
        scoreThreshold: mediapipeConfig.scoreThreshold,
        maxResults: mediapipeConfig.maxResults,
      });
      const start = performance.now();
      const result = detectorRef.current.detect(imageRef.current);
      const ms = (performance.now() - start).toFixed(2);
      const boxes = mapDetections(result?.detections as never);
      setDetectedObjects(boxes);
      setInferenceTime(ms);

      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          drawDetections(ctx, boxes, "mediapipe");
        }
      }
    } catch (err) {
      console.error("Inference error:", err);
      setError("Failed to run inference");
    } finally {
      setIsProcessing(false);
    }
  }, [selectedImage, loadModel, mediapipeConfig]);

  const resetImage = useCallback(() => {
    setSelectedImage(null);
    setDetectedObjects([]);
    setInferenceTime(null);
    setError(null);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, []);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5" />
          Test Inference
        </CardTitle>
        <p className="text-sm text-muted-foreground">Upload an image to test object detection AI.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload area */}
        <div
          className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-200"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
          role="button"
          tabIndex={0}
          aria-label="Upload image for inference testing. Activate to browse files."
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            aria-label="Choose image file"
            tabIndex={-1}
          />
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-10 h-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-base font-medium">Drop an image here or click to browse</p>
            <p className="text-sm text-muted-foreground">Supports JPG, PNG, GIF, BMP, WEBP</p>
          </div>
        </div>

        {/* Selected image and canvas */}
        {selectedImage && (
          <div className="space-y-3">
            <div className="relative">
              <img
                ref={imageRef}
                src={selectedImage}
                className="max-w-full max-h-96 rounded-lg mx-auto block"
                onLoad={handleImageLoad}
                alt="Uploaded image for object detection test"
              />
              <canvas
                ref={canvasRef}
                aria-hidden="true"
                className="absolute top-0 left-0 w-full h-full pointer-events-none rounded-lg"
              />
            </div>

            <div className="flex gap-2 justify-center">
              <Button onClick={runInference} disabled={!isModelLoaded || isProcessing} size="sm" className="min-h-[44px]">
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Processing...
                  </>
                ) : (
                  "Run Inference"
                )}
              </Button>
              <Button onClick={resetImage} variant="outline" size="sm" className="min-h-[44px]">
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Status indicators */}
        {!isModelLoaded && !isLoadingModel && (
          <Button onClick={loadModel} variant="outline" size="sm" className="w-full min-h-[44px]">
            Load AI Model
          </Button>
        )}

        {isLoadingModel && (
          <div role="status" className="flex items-center justify-center gap-2 text-base text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Loading AI Model...
            <span className="sr-only">Loading AI model</span>
          </div>
        )}

        {error && (
          <div role="alert" className="p-3 rounded-lg bg-destructive/10 text-destructive text-base">{error}</div>
        )}

        {/* Results */}
        {inferenceTime && (
          <div className="text-base sm:text-sm text-muted-foreground text-center">
            Inference time: {inferenceTime}ms
          </div>
        )}

        {detectedObjects.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-base font-medium">Detected Objects:</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {detectedObjects.map((obj, idx) => {
                const confidence = Math.round((obj.confidence ?? 0) * 100);
                return (
                  <div
                    key={idx}
                    className="flex justify-between items-center p-2 rounded bg-muted/50 text-base sm:text-sm"
                  >
                    <span className="capitalize">{obj.label || `Object ${idx + 1}`}</span>
                    <span className="font-mono text-muted-foreground">{confidence}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedImage && detectedObjects.length === 0 && inferenceTime && !isProcessing && (
          <div className="text-center text-base sm:text-sm text-muted-foreground">No objects detected</div>
        )}
      </CardContent>
    </Card>
  );
};
