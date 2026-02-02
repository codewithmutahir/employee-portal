# Face Recognition Models

This folder must contain the face-api.js models for facial recognition and liveness (blink) detection.

## Setup

1. Clone the pre-built models repository:
   ```bash
   git clone https://github.com/justadudewhohacks/face-api.js-models.git _models
   ```

2. Copy these three folders from `_models` into this `public/models` directory:
   - **tiny_face_detector** → `public/models/tiny_face_detector`
   - **face_landmark_68** → `public/models/face_landmark_68`
   - **face_recognition** → `public/models/face_recognition`

   Or download the folders directly from:
   - https://github.com/justadudewhohacks/face-api.js-models/tree/master/tiny_face_detector
   - https://github.com/justadudewhohacks/face-api.js-models/tree/master/face_landmark_68
   - https://github.com/justadudewhohacks/face-api.js-models/tree/master/face_recognition

3. Your `public/models` structure should look like:
   ```
   public/models/
   ├── tiny_face_detector/   (manifest + .shard files)
   ├── face_landmark_68/     (manifest + .shard files)
   ├── face_recognition/     (manifest + .shard files)
   └── README.md
   ```

The app loads these at `/models/tiny_face_detector`, `/models/face_landmark_68`, and `/models/face_recognition`.
