"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { machine } from "os";

const MODELS_BASE = "/models";
// STRICT face matching - lower = more strict (0.4-0.5 is recommended)
// Same person typically has distance < 0.4
// Different person typically has distance > 0.5
const FACE_MATCH_THRESHOLD = 0.45;
// How long to hold face steady for verification (in ms)
const HOLD_DURATION_MS = 2000;
// Minimum confidence score for face detection
const MIN_DETECTION_SCORE = 0.3;
// Input size for face detector (higher = more accurate but slower)
const DETECTOR_INPUT_SIZE = 320;
// Run detection every N frames to keep UI smooth and reduce CPU
const DETECTION_THROTTLE = 2;

type Step = "loading" | "camera" | "detecting" | "verifying" | "success" | "error";

interface FaceVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionType: "clockIn" | "clockOut";
  employeeId: string;
  storedDescriptor: number[] | null;
  onVerified: () => void;
}

export function FaceVerificationDialog({
  open,
  onOpenChange,
  actionType,
  employeeId,
  storedDescriptor,
  onVerified,
}: FaceVerificationDialogProps) {
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Initializing...");
  const [faceDetected, setFaceDetected] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceApiRef = useRef<typeof import("face-api.js") | null>(null);
  const modelsLoadedRef = useRef(false);
  const detectionStartTimeRef = useRef<number | null>(null);
  const verifiedRef = useRef(false);
  const detectionLoopStartedRef = useRef(false);
  const noFaceCountRef = useRef(0);
  const onVerifiedRef = useRef(onVerified);
  const onOpenChangeRef = useRef(onOpenChange);
  onVerifiedRef.current = onVerified;
  onOpenChangeRef.current = onOpenChange;

  const { toast } = useToast();

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      stopCamera();
      setStep("loading");
      setError(null);
      setCameraReady(false);
      setProgress(0);
      setStatusText("Initializing...");
      setFaceDetected(false);
      detectionStartTimeRef.current = null;
      verifiedRef.current = false;
      detectionLoopStartedRef.current = false;
      noFaceCountRef.current = 0;
      return;
    }

    if (!storedDescriptor || storedDescriptor.length !== 128) {
      setStep("error");
      setError("Face not registered. Please register your face first from the dashboard.");
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        setStatusText("Loading face recognition...");
        
        const faceapi = await import("face-api.js");
        faceApiRef.current = faceapi;

        if (!modelsLoadedRef.current) {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_BASE + "/tiny_face_detector"),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_BASE + "/face_landmark_68"),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_BASE + "/face_recognition"),
          ]);
          modelsLoadedRef.current = true;
        }

        if (cancelled) return;
        
        setStep("camera");
        setStatusText("Starting camera...");
        
        // Wait for dialog to render
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Retry getting video element
        let retries = 0;
        while (!videoRef.current && retries < 10) {
          await new Promise(resolve => setTimeout(resolve, 100));
          retries++;
        }
        
        if (!videoRef.current) {
          throw new Error("Camera not available. Please close and reopen.");
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => resolve();
          }
        });
        
        await videoRef.current.play();
        
        setStep("detecting");
        setCameraReady(true);
        setStatusText("Position your face in the frame");
        
      } catch (err: any) {
        if (!cancelled) {
          console.error("Face verification init error:", err);
          setStep("error");
          setError(err?.message || "Failed to start camera. Please allow camera access.");
        }
      }
    }

    init();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, storedDescriptor, stopCamera]);

  // Main detection loop (use refs for callbacks so effect doesn't restart on parent re-render)
  useEffect(() => {
    if (step !== "detecting" || !cameraReady) return;
    
    const video = videoRef.current;
    const faceapi = faceApiRef.current;
    
    if (!video || !faceapi || !storedDescriptor) return;

    let rafId: number = 0;
    let frameCount = 0;

    async function detect() {
      if (verifiedRef.current) return;
      
      const v = videoRef.current;
      const api = faceApiRef.current;
      if (!v || !api || !storedDescriptor) return;

      // Wait for video to be ready
      if (v.readyState < 2 || v.videoWidth === 0) {
        rafId = requestAnimationFrame(detect);
        return;
      }

      try {
        frameCount++;
        // Throttle: run detection every N frames for smoother UI
        if (frameCount % DETECTION_THROTTLE !== 0) {
          rafId = requestAnimationFrame(detect);
          return;
        }
        
        const det = await api
          .detectSingleFace(v, new api.TinyFaceDetectorOptions({ 
            inputSize: DETECTOR_INPUT_SIZE,
            scoreThreshold: MIN_DETECTION_SCORE 
          }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!det) {
          // No face detected - reset progress
          setFaceDetected(false);
          detectionStartTimeRef.current = null;
          setProgress(0);
          noFaceCountRef.current++;
          
          // Provide helpful feedback based on how long we've been trying
          if (noFaceCountRef.current % 60 === 0) {
            const seconds = Math.floor(noFaceCountRef.current / 30);
            if (seconds < 3) {
              setStatusText("Looking for your face...");
            } else if (seconds < 6) {
              setStatusText("Make sure your face is well-lit and centered");
            } else if (seconds < 10) {
              setStatusText("Try moving closer to the camera");
            } else {
              setStatusText("Having trouble? Try better lighting or refresh the page");
            }
          }
          
          rafId = requestAnimationFrame(detect);
          return;
        }
        
        // Face found - reset no-face counter
        noFaceCountRef.current = 0;

        // Check detection confidence
        const detectionScore = det.detection.score;
        if (detectionScore < MIN_DETECTION_SCORE) {
          if (frameCount % 45 === 0) {
            setStatusText("Move closer or improve lighting...");
          }
          rafId = requestAnimationFrame(detect);
          return;
        }

        // Face detected with good confidence!
        setFaceDetected(true);
        
        // Start timer if not already started
        if (!detectionStartTimeRef.current) {
          detectionStartTimeRef.current = Date.now();
        }
        
        const elapsed = Date.now() - detectionStartTimeRef.current;
        const progressPercent = Math.min((elapsed / HOLD_DURATION_MS) * 100, 100);
        setProgress(progressPercent);
        
        // Update status based on progress
        if (progressPercent < 30) {
          setStatusText("Face detected! Hold steady...");
        } else if (progressPercent < 70) {
          setStatusText("Keep holding...");
        } else if (progressPercent < 100) {
          setStatusText("Almost there...");
        }
        
        // Check if we've held long enough
        if (elapsed >= HOLD_DURATION_MS && !verifiedRef.current) {
          verifiedRef.current = true;
          setStatusText("Verifying identity...");
          setStep("verifying");
          
          // Verify face match with STRICT threshold
          const descriptor = Array.from(det.descriptor);
          const distance = api.euclideanDistance(descriptor, storedDescriptor);
          
          if (distance < FACE_MATCH_THRESHOLD) {
            setStep("success");
            setStatusText("Verified successfully!");
            
            setTimeout(() => {
              onVerifiedRef.current();
              onOpenChangeRef.current(false);
            }, 800);
          } else {
            setStep("error");
            
            // Give specific feedback based on how far off it was
            if (distance > 0.7) {
              setError("This face does not match the registered employee. Access denied.");
            } else if (distance > 0.55) {
              setError("Face verification failed. This doesn't appear to be the registered employee.");
            } else {
              setError("Face didn't match clearly. Try better lighting or re-register your face.");
            }
          }
          return;
        }
        
      } catch (err: any) {
        if (frameCount % 60 === 0) {
          console.error("Face detection error:", err?.message);
        }
      }
      
      rafId = requestAnimationFrame(detect);
    }

    // Start detection
    setTimeout(() => {
      rafId = requestAnimationFrame(detect);
    }, 100);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [step, storedDescriptor, cameraReady]);

  const handleClose = () => {
    stopCamera();
    onOpenChange(false);
  };

  const handleRetry = () => {
    setStep("detecting");
    setError(null);
    setProgress(0);
    setStatusText("Position your face in the frame");
    detectionStartTimeRef.current = null;
    verifiedRef.current = false;
    noFaceCountRef.current = 0;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showClose={true} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {actionType === "clockIn" ? "Clock In" : "Clock Out"} with Face
          </DialogTitle>
          <DialogDescription className="sr-only">
            Face verification for attendance
          </DialogDescription>
        </DialogHeader>

        {/* Video container */}
        <div className="relative flex justify-center rounded-lg overflow-hidden bg-muted aspect-video">
          {step === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <LoadingSpinner block size="lg" label={statusText} />
            </div>
          )}
          
          {/* Keep video mounted for camera + detecting + verifying + error so Retry doesn't lose stream */}
          {(step === "camera" || step === "detecting" || step === "verifying" || step === "error") && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)', visibility: step === "error" ? "hidden" : "visible" }}
              />
              
              {step === "detecting" && (
                <div className={`absolute inset-4 border-4 rounded-lg transition-colors duration-300 ${
                  faceDetected 
                    ? 'border-green-500' 
                    : 'border-dashed border-white/50'
                }`} />
              )}
              
              {step === "verifying" && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <LoadingSpinner size="lg" className="text-white" label="Verifying" />
                </div>
              )}
            </>
          )}
          
          {step === "success" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-green-500/20">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <span className="text-lg font-medium text-green-600">Verified!</span>
            </div>
          )}
          
          {step === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center bg-background/95">
              <XCircle className="h-12 w-12 text-destructive" />
              <span className="text-sm text-destructive font-medium">{error}</span>
              <p className="text-xs text-muted-foreground">Click Try Again to verify again, or re-register your face in Settings if it often fails.</p>
            </div>
          )}
        </div>
        
        {/* Progress bar and status */}
        {step === "detecting" && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${faceDetected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
              <span className="text-muted-foreground">{statusText}</span>
            </div>
            {!faceDetected && (
              <p className="text-xs text-center text-muted-foreground">
                Tip: Ensure good lighting and face the camera directly
              </p>
            )}
          </div>
        )}
        
        {step === "verifying" && (
          <div className="text-center text-sm text-muted-foreground">
            {statusText}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "error" && (
            <Button onClick={handleRetry} className="flex-1">
              Try Again
            </Button>
          )}
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
