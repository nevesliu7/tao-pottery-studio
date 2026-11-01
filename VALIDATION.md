# Validation · 2026-10-30

## Follow-up fix: index-only signature activation

The previous 180 ms dwell gate combined with a 220 ms stale-frame reset prevented writing at low recognition frame rates. The old classifier also ignored the thumb. Regression tests reproduced both problems before the fix.

The new rule writes on the first frame with exactly one raised finger (the index), counting all five fingers across detected hands. Any extra raised finger, a fist, another single finger, or loss of the hand lifts immediately. World landmarks classify pose without camera perspective distortion; thumb extension is measured in the palm plane so a thumb resting against the fist is not counted as extended. The entire camera frame maps to the pad. A 1 s tracking outage breaks strokes without introducing an activation delay.

Chrome + actual MediaPipe model + official pointing sample: one continuous 121-point stroke; switching to open hands reported Pen up and left the stroke unchanged; switching back produced a second independent 222-point stroke. A captured real landmark frame is retained as a regression fixture. This is sample-stream evidence, not a physical webcam test.

Camera controls and the live Pen down / Pen up indicator now appear above the writing pad. 22 tests and production build pass; existing Vite bundle advisory remains.

## English UI, backgrounds and signature export

- `npm test`: 22 / 22 passed. Covers existing pottery geometry and camera lifecycle, plus pointing pose, immediate pen-down, low-frame-rate writing, thumb extension, pen lift, tracking loss, hand identity changes, mirrored coordinates, writing bounds, undo/clear and image cover cropping.
- `npm run build`: TypeScript and Vite production build passed. Vite reports a non-blocking bundle-size advisory for Three.js. No new dependencies were added.
- Application UI, tooltips, errors, dialog text and HTML metadata are English. `rg -n '[\p{Han}]' src index.html` has no matches. Real hardware device names remain exactly as provided by the operating system.
- Chrome desktop: Save artwork opens the live 1600 × 1600 composition editor. Warm paper, Sage gallery and Midnight switch the actual canvas background. Pottery is captured with transparent surroundings; the original studio, turntable and camera are excluded.
- Actual mouse drags produced visible signature strokes and an immediately updated artwork preview. Clear removed all strokes; unit tests cover stroke undo. Ink color and bottom-left placement were exercised in the browser.
- Real MediaPipe Hand Landmarker processed Google's moving pointing-finger photo stream in the development harness, detected one pointing hand and produced multiple ink strokes. Production contains no prerecorded hand movement or injected recognition results.
- The test harness loaded a local sample JPEG through the same photo loader; the composition switched to the photo, retaining the pottery and signature. A corrupt JPEG produced the English error while retaining the last valid background. Cover cropping is unit tested.
- The browser test intercepted the actual download anchor in the test entry only: PNG data decoded to 1600 × 1600 and matched the current composition canvas exactly. Verified with both uploaded-photo and Midnight backgrounds. The latter payload is saved as `docs/signature-export-test.png`.
- A camera started within the editor stopped on closing it (all test tracks ended). A camera already running in the studio remained active after closing the editor. The same camera instance and device controls serve both views.
- Responsive viewport checks: 844 × 390 and 390 × 844 had document dimensions equal to viewport dimensions. The export footer and Download image button stayed within the screen; editor controls scroll internally. Desktop preview remains fixed while signature controls scroll.

## Existing core checks retained from the initial release

Mouse and injected touch events changed actual pottery geometry and could be undone. Local and whole-pot glazing changed vertex colors. Gloss/matte, rotation, reset/undo and help controls were exercised. Real MediaPipe detected two hands from the official two-hand sample. Test stream switching ended the old tracks, and stopping cleared the video source. Mirror aligned the preview and the independent 3D hand overlays. Initial dependency audit reported zero vulnerabilities; dependencies are unchanged in this update.

## Limits and manual acceptance

- No physical webcam was opened. USB hardware, live human handwriting quality under different lighting and a real permission prompt remain manual checks.
- The automated native file chooser is blocked by the browser extension's disabled file-URL access. Photo decode, validation and composition were exercised using an explicit development fixture; selection through an actual native picker remains a manual check.
- Export PNG bytes were inspected and saved as a test artifact. The end-user download's destination on disk and iOS share/download behavior have not been verified.
- Viewport emulation does not establish performance or touch behavior on physical iPhone/Android devices.
- `tests/browser-harness.html` is development-only and is not a production entry. It labels its sample stream, substitutes only camera input, and intercepts downloads only for verification.

On the HTTPS site, make a piece, choose Save artwork, try the three backgrounds and a personal photo, then Add signature. Enable camera and point only the index finger inside the dashed guide; curl it to lift the pen between letters. Check Mirror, Undo stroke, Clear, ink color and position, then Download image. Confirm that the resulting PNG has the chosen pottery/background/signature and no camera image or interface.
