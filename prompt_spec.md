# Spec: Developer Power Mode Combo Chrome Extension (Manifest V3)

Write a fully functional, local-only Chrome Manifest V3 extension based on the technical specifications below. All files must belong to a single project folder, run entirely offline, and require no build tools, npm packages, or bundlers.

---

## 1. Directory Structure

Ensure the project contains exactly these files in a single flat directory structure (with `icons/` for local images if needed, or inline SVG data URIs to stay completely local):
```text
my-power-mode-ext/
├── manifest.json
├── popup.html
├── popup.js
├── popup.css
├── content.js
├── content.css
└── README.md
```

---

## 2. Component Specifications

### File 1: `manifest.json`
* **Version**: Manifest V3.
* **Permissions**: `"storage"`.
* **Content Scripts**: Match `<all_urls>` for `http://*/*` and `https://*/*`. Inject `content.css` and `content.js`.
* **Action**: Define `popup.html` as the default popup.
* **Security**: No `background` service worker needed. Ensure no external network requests or remote code permissions are declared.

### File 2: `popup.html` & `popup.css` & `popup.js`
* **UI Style**: Compact, clean, and styled modern settings panel.
* **Controls**:
  * **Power Mode Toggle**: A simple checkbox or switch to turn the extension features ON or OFF globally.
  * **Pet Selection Dropdown/Radio**: Options for: `All pets`, `Corgis & Kitties`, `Corgis`, `Kitties`, `Octopus`, and `Off`.
  * **Visual Previews**: Inline CSS-animated/drawn placeholders or small canvas previews showcasing the selected pet style.
* **Storage Integration**: On UI changes, immediately save settings to `chrome.storage.local`. Read and apply these saved preferences on popup open.

### File 3: `content.css`
* Contains styles for the isolated overlay canvas (`pointer-events: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 2147483647;`).
* Contains any custom shake keyframes (applied exclusively to the canvas or a wrapper container element, *never* the host webpage `<body>`).
* Styles for handling high-contrast or standard visibility options.

### File 4: `content.js`
This is the core script containing the typing tracker, the particle systems, the pet animation loop, and preference handling.

#### A. Typing Tracker & Combo Logic
* **Target Elements**: Listen to standard input fields (`input[type="text"]`, `textarea`) and `contenteditable="true"` regions on valid HTTP/HTTPS schemes. Exclude `input[type="password"]`.
* **Valid Edits Only**: Increment the combo score only on intentional keyboard alphanumeric/symbol character insertions, deletions, or modifications.
  * **Exclude**: Clipboard operations (paste), system shortcuts (e.g., Ctrl+C, Ctrl+A), arrow navigation, and programmatic `.value` updates.
  * **Composition (IME)**: Intercept `compositionstart`, `compositionupdate`, and `compositionend` events gracefully so that complex characters (e.g., CJK input strings) do not double-increment the counter.
* **Combo Bounds & Resets**:
  * Reset the counter to `0` instantly if the user changes focus to a different editor element or if `1.5 seconds` pass without a valid key-driven edit.
  * Score milestone effects trigger on the active overlay at specific intervals.

#### B. Visual Overlay, FX, & Animation Loop
* **Canvas Setup**: Inject a single, full-screen transparent `<canvas>` element over the webpage. Use `pointer-events: none` to guarantee all native webpage clicks pass through completely unimpeded.
* **Performance Constraints**:
  * Use a single `requestAnimationFrame` loop driven by delta-time math.
  * Cap execution/rendering logic to a target near **30 FPS** to minimize host CPU consumption.
  * **Accessibility**: Check `window.matchMedia('(prefers-reduced-motion: reduce)')`. If true, or if Power Mode is toggled off, suppress all canvas particle generation, shaking, and moving animations, drawing only a static text counter overlay.
  * **Page Visibility**: Halt the rendering loop entirely when `document.hidden` is true to protect device battery life.
* **Visual Effects**:
  * **Arcade Counter**: Render a stylized floating hit counter on the canvas near the active input caret or at a stable screen quadrant when the combo score reaches $\ge 3$.
  * **Neon Sparks**: Generate caret-adjacent neon-colored particle sparks upon hitting a combo of 3 or more. Max capacity: **150 typing particles**.
  * **Screen Shake**: When the combo hits multiples of 10 (10, 20, 30...), trigger a brief screen shake animation applied strictly to the overlay canvas or visual FX container. Do not shake the document body.

#### C. Ambient Pet Simulations
* **Rendering Rules**: Confine all ambient pet visual elements to the top **60 pixels** bounding box of the webpage view area. Do not attempt to draw inside Chrome's native window frame or tab bar. Max active pets limit: **3**.
* **Pet States**: Pets run automatically when the extension is active. They wander or perform behaviors continuously during page idling and must automatically respawn if cleared.
* **Behavior Framework**:
  * Implement procedural pixel-art animations using Canvas 2D contexts (rectangles, paths, arcs) for:
    * **Corgis**: Wiggling/walking behaviors.
    * **Kitties**: Pouncing/sitting behaviors.
    * **Octopuses**: Swimming cycles featuring moving tentacle tracks.
  * **Ink Clouds**: Octopuses periodically release fading ink blots that spread out randomly before disappearing. Max cap: **24 active ink blots**.
  * **Water Environment**: When `Octopus` or `All pets` mode is enabled, draw a soft translucent cyan background overlay and gently swaying vertical seaweed lines across the top 60px banner.

---

## 3. Privacy, Security, & Testing Guidelines
* **Zero Telemetry**: Do not record, log, cache, or transmit any typed keystrokes, URLs, or metadata. Keep all state variables local to runtime memory.
* **Error Resilience**: Implement try-catch blocks around `chrome.storage` API calls to handle situations where the extension context might become invalidated or disconnected during a page reload.
* **Robustness**: Ensure standard page event listeners are clean, throttled appropriately, and do not introduce layout thrashing.
