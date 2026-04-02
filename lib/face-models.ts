/**
 * Singleton cache for face-api.js models.
 *
 * Because this module lives at module scope, the loaded faceapi instance and
 * model weights survive across React component mount/unmount cycles for the
 * lifetime of the browser session.  The first caller triggers the network
 * fetch; every subsequent caller gets the already-resolved promise instantly.
 */

const MODELS_BASE = "/models";

type LoadState = "idle" | "loading" | "loaded" | "error";

let _faceapi: typeof import("face-api.js") | null = null;
let _state: LoadState = "idle";
let _promise: Promise<typeof import("face-api.js")> | null = null;
let _error: Error | null = null;

/** Returns the cached faceapi module synchronously, or null if not loaded yet. */
export function getCachedFaceApi(): typeof import("face-api.js") | null {
  return _faceapi;
}

/** Current load state – useful for showing a ready indicator. */
export function getFaceModelsState(): { state: LoadState; error: Error | null } {
  return { state: _state, error: _error };
}

/**
 * Load (or return already-loaded) face-api.js and its three model weights.
 *
 * Safe to call multiple times concurrently – all callers share the same
 * in-flight promise so the network is only hit once.
 */
export async function loadFaceModels(): Promise<typeof import("face-api.js")> {
  if (_state === "loaded" && _faceapi) return _faceapi;
  if (_state === "loading" && _promise) return _promise;

  _state = "loading";
  _error = null;

  _promise = (async () => {
    const faceapi = await import("face-api.js");

    await Promise.all([
      faceapi.nets.tinyFaceDetector.isLoaded
        ? Promise.resolve()
        : faceapi.nets.tinyFaceDetector.loadFromUri(
            MODELS_BASE + "/tiny_face_detector"
          ),
      faceapi.nets.faceLandmark68Net.isLoaded
        ? Promise.resolve()
        : faceapi.nets.faceLandmark68Net.loadFromUri(
            MODELS_BASE + "/face_landmark_68"
          ),
      faceapi.nets.faceRecognitionNet.isLoaded
        ? Promise.resolve()
        : faceapi.nets.faceRecognitionNet.loadFromUri(
            MODELS_BASE + "/face_recognition"
          ),
    ]);

    _faceapi = faceapi;
    _state = "loaded";
    return faceapi;
  })();

  _promise.catch((err: unknown) => {
    _state = "error";
    _error = err instanceof Error ? err : new Error(String(err));
    _promise = null;
  });

  return _promise;
}

/**
 * Fire-and-forget background preload.  Call this as early as possible
 * (e.g. on dashboard mount) so models are warm before the dialog opens.
 * Errors are swallowed here – the dialog will surface them if needed.
 */
export function preloadFaceModels(): void {
  if (_state === "idle") {
    loadFaceModels().catch(() => {
      // silently ignored – error stored in module state for consumers to read
    });
  }
}
