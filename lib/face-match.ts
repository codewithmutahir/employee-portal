/**
 * Single threshold for face-api.js 128-d Euclidean distance (faceRecognitionNet).
 * Same person is often below 0.55; lighting/camera drift can push legitimate matches to about 0.6–0.65.
 * Must stay in sync with POST /api/face/verify.
 */
export const FACE_DESCRIPTOR_MATCH_THRESHOLD = 0.7;

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length !== 128) return Infinity;
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Element-wise mean of 128-d face descriptors (reduces single-frame noise). */
export function averageFaceDescriptors(samples: number[][]): number[] {
  if (samples.length === 0) return [];
  if (samples.length === 1) return samples[0]!.slice();
  const out = new Array(128).fill(0);
  for (const s of samples) {
    for (let i = 0; i < 128; i++) out[i] += s[i] ?? 0;
  }
  const n = samples.length;
  for (let i = 0; i < 128; i++) out[i] /= n;
  return out;
}
