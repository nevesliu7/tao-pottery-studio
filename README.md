# TAO · A Pottery Studio in Your Hands

A browser-based 3D pottery studio. Three.js renders an editable pottery mesh, and MediaPipe tracks both hands locally in the browser. The studio supports desktop and mobile landscape layouts. There is no backend, account system, video upload, or recording.

## Run locally

Requires Node.js 22.18+ (24 or later recommended).

```sh
npm ci
npm run dev
```

Open the `http://localhost:5173/` URL printed in the terminal. Opening the HTML file directly will not work with ES modules and camera APIs.

```sh
npm test       # Model, camera lifecycle, and signature tests
npm run build # TypeScript checks and static production build
npm run preview
```

The build output is in `dist/` and can be deployed to a static hosting service with HTTPS. The recognition model and WASM files are included in `public/`, so startup does not depend on an external model CDN. The first camera session downloads approximately 18 MB of model and WASM assets from the site itself. The page does not send video frames.

On a phone, use the deployed HTTPS URL. A local-network URL such as `http://YOUR_COMPUTER_IP:5173` supports touch controls, but usually cannot enable the camera because mobile browsers require a secure context.

## Controls

- **Shape**: Press and drag the pottery wall sideways. Move toward the center to narrow it or outward to widen it. Work at different heights to shape the profile.
- **Glaze**: Select a color swatch to enter glaze mode, then press and brush over the wall. Color stays attached to the pottery surface as the wheel turns. **Glaze all** covers the entire piece.
- **Hand gestures**: Click **Enable camera** and grant permission. Pinch your thumb and index finger together and move the pinch point onto the pottery wall. Move sideways to shape or brush over the surface to glaze. Release the pinch to stop. Both hands can work at the same time.
- **Mirror**: The video, hand landmarks in the camera preview, and hand overlays beside the pottery use the same coordinate transform. Drag the preview's header to move it, or enlarge the preview. Neither action changes the control coordinates.
- **Camera switching**: The list contains only video inputs returned by `enumerateDevices()`. Device names appear after permission is granted. Switching stops the previous stream first; closing the camera or leaving the page releases all tracks.
- **Undo**: Undo up to 24 complete actions. **Start over** can also be undone.
- **Save artwork**: Open the composition editor with **Save artwork**. Choose **Warm paper**, **Sage gallery**, or **Midnight**, or select **Upload a photo** to use a local JPG, PNG, or WebP file up to 20 MB. Photos are center-cropped, not stretched, and are not uploaded to a server.
- **Signature**: Click **Add signature**, enable the camera, and raise only one index finger to start writing immediately, with no dwell delay. The full camera frame maps to the signature pad. Raising any other finger (including the thumb), pointing with both hands, lowering the index finger, making a fist, or moving out of frame lifts the pen immediately. **Pen down** / **Pen up** and the detected finger count appear above the pad. Mouse and touch input also work. The editor supports stroke undo, clearing, two ink colors, and three positions along the bottom.
- **Export**: **Download image** saves a 1600 × 1600 PNG containing the current pottery, selected background, and signature. The camera view, interface, and wheel are excluded. Signature input is only recorded after you choose **Add signature**; editing the signature does not change the pottery.
- **Keyboard shortcuts**: `1` selects Shape, `2` selects Glaze, `Space` pauses or resumes the wheel, and `⌘/Ctrl + Z` undoes the last action. The wheel starts paused when reduced motion is preferred.

## Implementation and limitations

The pottery is a surface of revolution with a base, inner wall, rounded rim, and wall thickness. Shaping adjusts the radii of 65 horizontal layers; 96 segments around the circumference support local glazing. Shaping is rotationally symmetric, like wheel throwing, rather than arbitrary-topology sculpting. Vertex colors are stored in linear color space, with a shared glaze material and export color configuration. Lighting makes the highlighted areas of the pottery appear lighter than the swatches.

Video and hand overlays use live MediaPipe Hand Landmarker results, not prerecorded hand animations. The overlays have an independent world-coordinate mapping and are not children of the rotating pottery. CPU fallback recognition speed depends on the device. Low light, occlusion, and distracting backgrounds can affect tracking.

The current piece is stored in memory and is cleared when you refresh or close the page. Download an image first. 3D model export and cross-device draft syncing are not currently supported.

## Validation and reproduction

`tests/model.test.ts` checks local deformation, minimum wall thickness, painting across the angular seam, undo, mirroring, and pinch ratios. `tests/camera.test.ts` uses mock video tracks to check camera switching, shutdown, asynchronous permission races, permission denial, recognition-loading failures, and device disconnection.

`tests/signature.test.ts` checks the index-finger pose, first-frame pen-down, low-frame-rate writing, pen lift for the thumb and multiple fingers, pen-up behavior, tracking loss, separation between hands, mirroring, writing bounds, undo, and image cropping. The interface, hints, and error messages are all in English.

On the development server, `/tests/browser-harness.html` is a separate test entry. It generates a video stream from Google's official two-hand sample image and runs the real recognition model without accessing a hardware camera. It is not included in `dist/`; the production page always reads frames from the camera authorized by the user. Sample source: <https://storage.googleapis.com/mediapipe-tasks/hand_landmarker/woman_hands.jpg>.

Add `?pose=point` to use the official pointing-finger sample stream and verify the path from the real model to signature strokes. Development test buttons can load a sample background or simulate a corrupt image. The test entry intercepts download data and displays its dimensions and whether it matches the preview, without triggering a file download. These substitutions are not present in the production page.

See `VALIDATION.md` for the validation record from October 30, 2026. Switching physical USB cameras, camera use on physical phones, and saving downloads to disk still require hands-on validation. Viewport emulation and mock video tracks do not replace hardware tests.

## Files

- `src/model.ts`: Pottery shape, glaze colors, undo, and gesture math.
- `src/scene.ts`: 3D geometry, materials, lighting, wheel, hit testing, and export.
- `src/camera.ts`: Camera permissions, device enumeration, connection lifecycle, and recognition.
- `src/main.ts`: Interface, pointer and gesture controls, preview window, and control buttons.
- `src/export.ts`, `src/export.css`: Background selection, photo import, signature interface, and PNG composition.
- `src/signature.ts`: Index-finger pose, pen-up behavior, and stroke data.
- `src/style.css`: Desktop, landscape, portrait, and reduced-motion layouts.
- `public/models`, `public/wasm`: Local recognition assets deployed with the site.

Reference documentation: [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) and [Three.js](https://threejs.org/docs/). See `THIRD_PARTY.md` for third-party licenses.
