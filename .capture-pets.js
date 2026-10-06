const { spawn } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const root = process.cwd();
const profile = mkdtempSync(path.join(tmpdir(), "power-combo-pets-test-"));
const port = 9350;
const browser = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
  "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`,
  "--remote-allow-origins=*", `--user-data-dir=${profile}`, "--window-size=1440,900",
  "https://www.google.com"
], { stdio: "ignore" });
let socket;

(async () => {
  try {
    let targets;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        if (targets.some((target) => target.type === "page" && target.url.includes("google"))) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const target = targets?.find((entry) => entry.type === "page" && entry.url.includes("google"));
    if (!target) throw new Error("Could not open Google in the test browser.");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });

    let nextId = 0;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!pending.has(message.id)) return;
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message);
    });
    const cdp = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out calling ${method}`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });

    await cdp("Page.enable");
    await cdp("Runtime.enable");
    await cdp("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
    });
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const stateExpression = `JSON.stringify({
      url: location.href,
      search: Boolean(document.getElementsByName("q")[0]),
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches
    })`;
    const stateResponse = await cdp("Runtime.evaluate", { expression: stateExpression, returnByValue: true });
    const state = JSON.parse(stateResponse.result.result.value);
    if (!state.search) throw new Error("Google search field was not available.");
    if (state.reducedMotion) throw new Error("The browser still reports reduced motion enabled.");

    const setup = `(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      window.__comboRafCount = 0;
      const requestFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => { window.__comboRafCount += 1; return requestFrame(callback); };
      Object.defineProperty(window.chrome, "storage", { configurable: true, value: {
        local: { get: async (key) => { window.__storageKey = key; return { powerModeSettings: { enabled: true, petMode: "all" } }; }, set: async () => {} },
        onChanged: { addListener: () => {} }
      }});
      const style = document.createElement("style");
      style.textContent = ${JSON.stringify(readFileSync(path.join(root, "styles.css"), "utf8"))};
      document.head.appendChild(style);
    })()`;
    const setupResponse = await cdp("Runtime.evaluate", { expression: setup });
    if (setupResponse.result.exceptionDetails) throw new Error(`Test setup failed: ${setupResponse.result.exceptionDetails.text}`);
    for (const file of ["typing-rules.js", "content.js"]) {
      let source = readFileSync(path.join(root, file), "utf8");
      if (file === "content.js") {
        source = source.replace(
          "return settings.enabled && !reducedMotion.matches && visible;",
          "window.__petState = { enabled: settings.enabled, petMode: settings.petMode, reduced: reducedMotion.matches, visible }; return settings.enabled && !reducedMotion.matches && visible;"
        );
      }
      const result = await cdp("Runtime.evaluate", { expression: source });
      if (result.result.exceptionDetails) throw new Error(`${file}: ${result.result.exceptionDetails.text}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
    const debugResponse = await cdp("Runtime.evaluate", {
      expression: `(() => { const canvas = document.getElementById("power-mode-combo-canvas"); const ctx = canvas.getContext("2d"); const pixels = ctx.getImageData(0, 0, Math.min(600, canvas.width), Math.min(60, canvas.height)).data; let visiblePixels = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) visiblePixels += 1; return JSON.stringify({petState:window.__petState,storageKey:window.__storageKey,hidden:document.hidden,visibility:document.visibilityState,focused:document.hasFocus(),reduced:matchMedia("(prefers-reduced-motion: reduce)").matches,raf:window.__comboRafCount,bannerPixels:visiblePixels}); })()`,
      returnByValue: true
    });
    console.log("Animation diagnostics:", debugResponse.result.result.value);
    await cdp("Runtime.evaluate", {
      expression: `(() => { const field = document.getElementsByName("q")[0]; field.value = ""; field.focus(); })()`
    });

    const phrase = "power mode combo test";
    for (const character of phrase) {
      const isSpace = character === " ";
      const key = isSpace ? " " : character;
      const code = isSpace ? "Space" : `Key${character.toUpperCase()}`;
      const keyCode = isSpace ? 32 : character.toUpperCase().charCodeAt(0);
      await cdp("Input.dispatchKeyEvent", {
        type: "keyDown", key, code, text: character, unmodifiedText: character,
        windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode
      });
      await cdp("Input.dispatchKeyEvent", {
        type: "keyUp", key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    const valueResponse = await cdp("Runtime.evaluate", {
      expression: `document.getElementsByName("q")[0].value`, returnByValue: true
    });
    const typed = valueResponse.result.result.value;
    if (typed !== phrase) throw new Error(`Search text mismatch: ${typed}`);

    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    const screenshot = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 1925, height: 600, scale: 1 }
    });
    writeFileSync(path.join(root, "screenshots", "google-combo.png"), Buffer.from(screenshot.result.data, "base64"));
    console.log(JSON.stringify({ page: state.url, typed, reducedMotion: state.reducedMotion, screenshot: "screenshots/google-combo.png" }));
  } finally {
    try { socket?.close(); } catch {}
    try { browser.kill(); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
