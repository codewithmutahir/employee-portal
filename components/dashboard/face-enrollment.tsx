"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Camera, UserPlus } from "lucide-react";
import { saveEmployeeFaceDescriptor } from "@/app/actions/face";

const MODELS_BASE = "/models";
const VIDEO_READY_WAIT_MS = 400;

interface FaceEnrollmentProps {
  employeeId: string;
  onEnrolled: () => void;
  /** When true, show copy for re-registration (e.g. from profile settings). When 'settings', show neutral copy for both first-time and re-register. */
  isReRegister?: boolean | 'settings';
}

export function FaceEnrollment({ employeeId, onEnrolled, isReRegister }: FaceEnrollmentProps) {
  const [loading, setLoading] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
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
        const faceapi = await import("face-api.js");
        faceApiRef.current = faceapi;
        
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_BASE + "/tiny_face_detector"),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_BASE + "/face_landmark_68"),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_BASE + "/face_recognition"),
        ]);
        
        if (!cancelled) {
          setModelsReady(true);
        }
      } catch (err: any) {
        console.error("Model loading error:", err);
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
    setVideoReady(false);
    setCameraActive(true);
    await new Promise(resolve => setTimeout(resolve, 150));
    
    try {
      let retries = 0;
      while (!videoRef.current && retries < 8) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
      
      if (!videoRef.current) {
        setError("Video not ready. Please refresh the page and try again.");
        setCameraActive(false);
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Camera took too long to start")), 8000);
        video.onloadedmetadata = () => {
          clearTimeout(t);
          resolve();
        };
      });
      
      await video.play();
      await new Promise(r => setTimeout(r, VIDEO_READY_WAIT_MS));
      if (video.readyState >= 2 && video.videoWidth > 0) {
        setVideoReady(true);
      } else {
        setVideoReady(true);
      }
    } catch (err: any) {
      console.error("Camera error:", err);
      setError(err?.message || "Could not access camera. Please allow camera access and try again.");
      setCameraActive(false);
      setVideoReady(false);
      stopCamera();
    }
  }

  async function captureAndSave() {
    const video = videoRef.current;
    const faceapi = faceApiRef.current;
    if (!video || !faceapi || !modelsReady) return;
    if (video.readyState < 2 || video.videoWidth === 0) {
      setError("Camera still loading. Wait a moment and try again.");
      return;
    }

    setCapturing(true);
    setError(null);
    
    try {
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.25
        }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!det) {
        setError("No face in frame. Face the camera directly, ensure good lighting, and try again.");
        setCapturing(false);
        return;
      }

      const descriptor = Array.from(det.descriptor);
      const result = await saveEmployeeFaceDescriptor(employeeId, descriptor);

      if (result.success) {
        toast({ title: "Face registered successfully", description: "You can now use face verification for clock in and out." });
        stopCamera();
        setVideoReady(false);
        onEnrolled();
      } else {
        setError(result.error || "Failed to save. Please try again.");
      }
    } catch (err: any) {
      console.error("Face capture error:", err);
      setError(err?.message || "Capture failed. Check lighting and try again.");
    }
    setCapturing(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          {isReRegister === true
            ? 'Re-register your face'
            : isReRegister === 'settings'
              ? 'Face recognition'
              : 'Register your face'}
        </CardTitle>
        <CardDescription>
          {isReRegister === true
            ? 'Update your face registration for clock in and clock out. Use this if your first registration wasn’t perfect or your appearance has changed.'
            : isReRegister === 'settings'
              ? 'Register or update your face for clock in and clock out. Use this if you haven’t registered yet or if your first registration wasn’t perfect.'
              : 'Register your face once to use facial recognition for clock in and clock out. Your face data is stored securely and used only to verify it\'s you (not a photo).'}
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
              {!videoReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/80 z-10">
                  <span className="text-sm text-muted-foreground">Starting camera...</span>
                </div>
              )}
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
                  disabled={capturing || !videoReady}
                >
                  {capturing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : isReRegister === true ? (
                    "Update my face"
                  ) : isReRegister === 'settings' ? (
                    "Register / Update my face"
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
