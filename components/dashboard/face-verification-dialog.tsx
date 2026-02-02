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
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Eye } from "lucide-react";

const MODELS_BASE = "/models";
const FACE_MATCH_THRESHOLD = 0.6;
const EAR_CLOSED_THRESHOLD = 0.2;
const EAR_OPEN_THRESHOLD = 0.25;
const BLINK_DETECTION_MS = 3000;

type Step = "loading" | "camera" | "position" | "blink" | "verifying" | "success" | "error";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceApiRef = useRef<typeof import("face-api.js") | null>(null);
  const modelsLoadedRef = useRef(false);
  const blinkDetectedRef = useRef(false);
  const earWasClosedRef = useRef(false);
  const phaseRef = useRef<"position" | "blink">("position");
  const { toast } = useToast();

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setStep("loading");
      setError(null);
      setCameraReady(false);
      blinkDetectedRef.current = false;
      earWasClosedRef.current = false;
      phaseRef.current = "position";
      return;
    }

    if (!storedDescriptor || storedDescriptor.length !== 128) {
      setStep("error");
      setError("Face not registered. Please register your face first.");
      return;
    }

    let cancelled = false;

    async function init() {
      try {
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
        
        // Set step to camera to render video element
        setStep("camera");
        
        // Wait for Dialog and video element to render (longer delay for Dialog mount)
        await new Promise(resolve => setTimeout(resolve, 300));

        console.log("🎥 Getting camera stream...");
        
        // Check if video element is available, retry if needed
        let retries = 0;
        while (!videoRef.current && retries < 10) {
          console.log(`⏳ Waiting for video element... (attempt ${retries + 1}/10)`);
          await new Promise(resolve => setTimeout(resolve, 100));
          retries++;
        }
        
        if (!videoRef.current) {
          console.error("❌ Video ref not available after multiple retries");
          setError("Video element not ready. Please try closing and reopening the dialog.");
          setStep("error");
          return;
        }
        
        console.log("✅ Video element is ready");
        setCameraReady(true);
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        console.log("✅ Got media stream");
        
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        
        streamRef.current = stream;
        
        console.log("📹 Setting video srcObject");
        videoRef.current.srcObject = stream;
        
        // Ensure video element properties are set
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        
        // Now transition to position step
        setStep("position");
        
        // Wait for video to be ready
        try {
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
          console.log("✅ Video playing");
        } catch (playError: any) {
          console.error("❌ Video play error:", playError);
          // Don't fail completely, detection loop might still work
        }
      } catch (err: any) {
        if (!cancelled) {
          setStep("error");
          setError(err?.message || "Failed to load camera or models. Allow camera access and ensure models are in /public/models.");
        }
      }
    }

    init();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, storedDescriptor, stopCamera]);

  useEffect(() => {
    if (step !== "position" && step !== "blink") return;
    const video = videoRef.current;
    if (!video || !faceApiRef.current || !streamRef.current || !storedDescriptor || !cameraReady) return;

    let rafId: number;
    let blinkCheckStart: number | null = null;

    function eyeAspectRatio(eye: { x: number; y: number }[]) {
      if (!eye || eye.length < 6) return 0.2;
      const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
      const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
      const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
      if (h === 0) return 0.2;
      return (v1 + v2) / (2 * h);
    }

    async function detect() {
      const faceapi = faceApiRef.current;
      if (!videoRef.current || !faceapi || !storedDescriptor) return;

      try {
        const det = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!det) {
          rafId = requestAnimationFrame(detect);
          return;
        }

        if (phaseRef.current === "position") {
          phaseRef.current = "blink";
          setStep("blink");
          blinkCheckStart = Date.now();
        }

        if (phaseRef.current === "blink" && !blinkDetectedRef.current) {
          const landmarks = det.landmarks as { getLeftEye: () => { x: number; y: number }[]; getRightEye: () => { x: number; y: number }[] };
          const leftEye = landmarks.getLeftEye();
          const rightEye = landmarks.getRightEye();
          const earLeft = eyeAspectRatio(leftEye);
          const earRight = eyeAspectRatio(rightEye);
          const ear = (earLeft + earRight) / 2;

          if (ear < EAR_CLOSED_THRESHOLD) {
            earWasClosedRef.current = true;
          } else if (ear > EAR_OPEN_THRESHOLD && earWasClosedRef.current) {
            blinkDetectedRef.current = true;
            setStep("verifying");

            const descriptor = Array.from(det.descriptor);
            const distance = faceapi.euclideanDistance(descriptor, storedDescriptor);
            if (distance < FACE_MATCH_THRESHOLD) {
              setStep("success");
              onVerified();
              onOpenChange(false);
            } else {
              setStep("error");
              setError("Face did not match. Please try again.");
            }
          }

          if (blinkCheckStart && Date.now() - blinkCheckStart > BLINK_DETECTION_MS && !blinkDetectedRef.current) {
            setStep("error");
            setError("Blink was not detected. Use a live face (not a photo) and blink once.");
          }
        }
      } catch (_) {
        // ignore single-frame errors
      }
      rafId = requestAnimationFrame(detect);
    }

    rafId = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(rafId);
  }, [step, storedDescriptor, onVerified, onOpenChange, cameraReady]);

  const handleClose = () => {
    stopCamera();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showClose={true} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {actionType === "clockIn" ? "Clock In" : "Clock Out"} with Face
          </DialogTitle>
          <DialogDescription>
            {step === "loading" && "Loading camera and face recognition..."}
            {step === "position" && "Position your face in the frame."}
            {step === "blink" && (
              <>
                <span className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Please blink once to verify you are live (not a photo).
                </span>
              </>
            )}
            {step === "verifying" && "Verifying your face..."}
            {step === "success" && "Verified. Recording attendance."}
            {step === "error" && (error || "Something went wrong.")}
            {step === "camera" && "Starting camera..."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex justify-center rounded-lg overflow-hidden bg-muted aspect-video max-h-64">
          {step === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            </div>
          )}
          {(step === "camera" || step === "position" || step === "blink" || step === "verifying") && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          )}
          {step === "error" && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
