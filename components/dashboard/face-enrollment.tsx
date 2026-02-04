"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Camera, UserPlus } from "lucide-react";
import { saveEmployeeFaceDescriptor } from "@/app/actions/face";

const MODELS_BASE = "/models";

interface FaceEnrollmentProps {
  employeeId: string;
  onEnrolled: () => void;
}

export function FaceEnrollment({ employeeId, onEnrolled }: FaceEnrollmentProps) {
  const [loading, setLoading] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceApiRef = useRef<typeof import("face-api.js") | null>(null);
  const { toast } = useToast();

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      try {
        console.log("🚀 Loading face-api.js...");
        const faceapi = await import("face-api.js");
        faceApiRef.current = faceapi;
        console.log("✅ face-api.js loaded");
        
        console.log("📦 Loading face detection models from:", MODELS_BASE);
        
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_BASE + "/tiny_face_detector"),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_BASE + "/face_landmark_68"),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_BASE + "/face_recognition"),
        ]);
        
        // Verify models loaded
        console.log("📦 Models loaded status:", {
          tinyFaceDetector: faceapi.nets.tinyFaceDetector.isLoaded,
          faceLandmark68Net: faceapi.nets.faceLandmark68Net.isLoaded,
          faceRecognitionNet: faceapi.nets.faceRecognitionNet.isLoaded,
        });
        
        if (!cancelled) {
          setModelsReady(true);
          console.log("✅ All models loaded successfully, ready for face enrollment");
        }
      } catch (err: any) {
        console.error("❌ Model loading error:", err);
        if (!cancelled) {
          setError(err?.message || "Failed to load face recognition models. Ensure /public/models contains the required model folders.");
        }
      }
    }
    loadModels();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [stopCamera]);

  async function startCamera() {
    setError(null);
    console.log("🎥 Starting camera...");
    
    // Set camera active FIRST to ensure video element is rendered
    setCameraActive(true);
    
    // Wait for React to render the video element (longer wait for safety)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      // Check if video element is available, retry if needed
      let retries = 0;
      while (!videoRef.current && retries < 5) {
        console.log(`⏳ Waiting for video element... (attempt ${retries + 1}/5)`);
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
      
      if (!videoRef.current) {
        console.error("❌ Video ref not available after multiple retries");
        setError("Video element not ready. Please refresh the page and try again.");
        setCameraActive(false);
        return;
      }
      
      console.log("✅ Video element is ready");
      
      // Now request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      console.log("✅ Got media stream:", stream);
      streamRef.current = stream;
      
      // Attach stream to video element
      console.log("📹 Setting video srcObject");
      videoRef.current.srcObject = stream;
      
      // Ensure video element properties are set
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      
      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        const video = videoRef.current;
        if (!video) {
          reject(new Error("Video element lost"));
          return;
        }
        
        const timeout = setTimeout(() => {
          reject(new Error("Video load timeout"));
        }, 5000);
        
        video.onloadedmetadata = () => {
          console.log("✅ Video metadata loaded, dimensions:", video.videoWidth, "x", video.videoHeight);
          clearTimeout(timeout);
          resolve();
        };
      });
      
      console.log("▶️ Playing video");
      await videoRef.current.play();
      console.log("✅ Camera started successfully, video is playing");
    } catch (err: any) {
      console.error("❌ Camera error:", err);
      setError(err?.message || "Could not access camera. Please allow camera access.");
      setCameraActive(false);
      stopCamera();
    }
  }

  async function captureAndSave() {
    const video = videoRef.current;
    const faceapi = faceApiRef.current;
    if (!video || !faceapi || !modelsReady) return;

    setCapturing(true);
    setError(null);
    
    try {
      console.log("📸 Attempting face capture...");
      console.log("   Video ready state:", video.readyState);
      console.log("   Video dimensions:", video.videoWidth, "x", video.videoHeight);
      
      // Use lower threshold for enrollment to make it easier
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.3  // Lower threshold for better detection
        }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!det) {
        console.log("❌ No face detected during capture");
        setError("No face detected. Make sure your face is well-lit, centered in the frame, and try again.");
        setCapturing(false);
        return;
      }
      
      console.log("✅ Face detected with score:", det.detection.score.toFixed(2));

      const descriptor = Array.from(det.descriptor);
      console.log("📝 Saving face descriptor...");
      const result = await saveEmployeeFaceDescriptor(employeeId, descriptor);

      if (result.success) {
        console.log("✅ Face registered successfully!");
        toast({ title: "Face registered successfully" });
        stopCamera();
        onEnrolled();
      } else {
        console.error("❌ Save failed:", result.error);
        setError(result.error || "Failed to save face data.");
      }
    } catch (err: any) {
      console.error("❌ Capture error:", err);
      setError(err?.message || "Face capture failed. Try refreshing the page.");
    }
    setCapturing(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Register your face
        </CardTitle>
        <CardDescription>
          Register your face once to use facial recognition for clock in and clock out. Your face data is stored securely and used only to verify it&apos;s you (not a photo).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <div className="relative flex justify-center rounded-lg overflow-hidden bg-muted aspect-video max-h-64">
          {!modelsReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            </div>
          )}
          {modelsReady && !cameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
              <Camera className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Start camera to register your face
              </p>
              <Button onClick={startCamera}>Start camera</Button>
            </div>
          )}
          {modelsReady && cameraActive && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={stopCamera}
                  disabled={capturing}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={captureAndSave}
                  disabled={capturing}
                >
                  {capturing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Register my face"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
