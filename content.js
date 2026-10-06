(() => {
  "use strict";

  if (window.__powerModeComboLoaded) return;
  window.__powerModeComboLoaded = true;

  const STORAGE_KEY = "powerModeSettings";
  const typingRules = globalThis.PowerModeTypingRules;
  if (!typingRules) return;
  const COMBO_TIMEOUT_MS = 1500;
  const FRAME_INTERVAL_MS = 1000 / 30;
  const MAX_PARTICLES = 150;
  const MAX_PETS = 3;
  const MAX_INK = 24;
  const MAX_CANVAS_PIXELS = 8_000_000;
  const DEFAULT_SETTINGS = { enabled: true, petMode: "all" };
  const PET_TYPES = ["corgi", "kitty", "octopus"];
  const colors = ["#45f0c2", "#79d7ff", "#ffcf5c", "#ff72a8", "#c5a2ff"];

  let settings = { ...DEFAULT_SETTINGS };
  let canvas;
  let context;
  let pixelRatio = 1;
  let combo = 0;
  let resetTimer = 0;
  let focusedEditor = null;
  let pendingEdit = null;
  let compositionEditor = null;
  let suppressCompositionInput = null;
  let rafId = 0;
  let previousFrame = 0;
  let elapsed = 0;
  let shakeTimer = 0;
  let visible = !document.hidden;
  let petRoster = [];
  const particles = [];
  const inkBlots = [];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function isMotionActive() {
    return settings.enabled && !reducedMotion.matches && visible;
  }

  function isAllowedEditor(target) {
    if (!(target instanceof Element)) return null;
    const editor = target.closest('input[type="text"], textarea, [contenteditable="true"]');
    if (!editor || !editor.isConnected) return null;
    if (editor instanceof HTMLInputElement && editor.type.toLowerCase() === "password") return null;
    return editor;
  }

  function normalizeSettings(value) {
    const validModes = ["all", "corgis-kitties", "corgis", "kitties", "octopus", "off"];
    return {
      enabled: value && typeof value.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
      petMode: value && validModes.includes(value.petMode) ? value.petMode : DEFAULT_SETTINGS.petMode
    };
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      settings = normalizeSettings(stored[STORAGE_KEY]);
    } catch {
      settings = { ...DEFAULT_SETTINGS };
    }
    syncAnimation();
    drawStatic();
  }

  function listenForSettings() {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes[STORAGE_KEY]) return;
        settings = normalizeSettings(changes[STORAGE_KEY].newValue);
        syncAnimation();
        drawStatic();
      });
    } catch {
      // The current document can outlive its extension context during reloads.
    }
  }

  function initializeCanvas() {
    if (canvas) return;
    canvas = document.getElementById("power-mode-combo-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      canvas = document.createElement("canvas");
      canvas.id = "power-mode-combo-canvas";
      canvas.setAttribute("aria-hidden", "true");
      (document.documentElement || document.body).appendChild(canvas);
    }
    context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    resizeCanvas();
  }

  function resizeCanvas() {
    if (!canvas || !context) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
    canvas.width = Math.max(1, Math.floor(width * pixelRatio));
    canvas.height = Math.max(1, Math.floor(height * pixelRatio));
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    drawStatic();
  }

  function clearCanvas() {
    if (!context) return;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function drawStatic() {
    if (!context || isMotionActive()) return;
    clearCanvas();
    drawComboCounter();
  }

  function drawComboCounter() {
    if (!context || combo < 3) return;
    const x = Math.max(18, window.innerWidth - 28);
    const y = 91;
    context.save();
    context.textAlign = "right";
    context.textBaseline = "middle";
    context.font = "800 23px ui-monospace, SFMono-Regular, Consolas, monospace";
    context.shadowColor = "rgba(0, 0, 0, 0.75)";
    context.shadowBlur = 5;
    context.lineWidth = 4;
    context.strokeStyle = "#12241e";
    context.strokeText(`${combo} HIT`, x, y);
    context.fillStyle = combo >= 10 ? "#ffcf5c" : "#67f3c6";
    context.fillText(`${combo} HIT`, x, y);
    context.restore();
  }

  function clearResetTimer() {
    if (resetTimer) window.clearTimeout(resetTimer);
    resetTimer = 0;
  }

  function resetCombo() {
    clearResetTimer();
    combo = 0;
    particles.length = 0;
    drawStatic();
    if (isMotionActive()) ensureAnimationLoop();
  }

  function scheduleComboReset() {
    clearResetTimer();
    resetTimer = window.setTimeout(resetCombo, COMBO_TIMEOUT_MS);
  }

  function focusEditor(editor) {
    if (focusedEditor !== editor) {
      focusedEditor = editor;
      resetCombo();
    }
  }

  function onKeyDown(event) {
    const editor = isAllowedEditor(event.target);
    if (!editor) return;
    focusEditor(editor);
    if (!typingRules.isEditKey(event)) {
      pendingEdit = null;
      return;
    }
    pendingEdit = { editor, expiresAt: performance.now() + 1000 };
  }

  function onInput(event) {
    const editor = isAllowedEditor(event.target);
    if (!editor || !event.isTrusted || compositionEditor) return;
    if (suppressCompositionInput === editor) {
      suppressCompositionInput = null;
      return;
    }
    const pending = pendingEdit;
    pendingEdit = null;
    if (!pending || pending.editor !== editor || performance.now() > pending.expiresAt) return;
    if (!typingRules.isTextMutation(event.inputType)) return;
    recordValidEdit(editor);
  }

  function onCompositionStart(event) {
    const editor = isAllowedEditor(event.target);
    if (!editor) return;
    focusEditor(editor);
    compositionEditor = editor;
    pendingEdit = null;
  }

  function onCompositionEnd(event) {
    const editor = isAllowedEditor(event.target);
    if (!editor || editor !== compositionEditor) return;
    compositionEditor = null;
    pendingEdit = null;
    suppressCompositionInput = editor;
    window.setTimeout(() => {
      if (suppressCompositionInput === editor) suppressCompositionInput = null;
    }, 500);
    if (event.isTrusted && typeof event.data === "string" && event.data.length > 0) {
      recordValidEdit(editor);
    }
  }

  function caretAnchor(editor) {
    const rect = editor.getBoundingClientRect();
    if (editor.isContentEditable) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) {
        const caretRect = selection.getRangeAt(0).getBoundingClientRect();
        if (caretRect.width || caretRect.height) return { x: caretRect.left, y: caretRect.top };
      }
    }
    return { x: Math.min(rect.right, rect.left + Math.max(16, rect.width * 0.45)), y: rect.top + rect.height / 2 };
  }

  function recordValidEdit(editor) {
    focusEditor(editor);
    combo += 1;
    scheduleComboReset();
    if (combo >= 3 && isMotionActive()) {
      spawnTypingParticles(caretAnchor(editor));
      if (combo % 10 === 0) triggerShake();
    }
    drawStatic();
    if (isMotionActive()) ensureAnimationLoop();
  }

  function spawnTypingParticles(origin) {
    const count = Math.min(6, MAX_PARTICLES - particles.length);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 34 + Math.random() * 92;
      particles.push({
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life: 0.42 + Math.random() * 0.42,
        age: 0,
        size: 2 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function triggerShake() {
    if (!canvas || !settings.enabled || reducedMotion.matches) return;
    canvas.classList.remove("power-mode-shake");
    void canvas.offsetWidth;
    canvas.classList.add("power-mode-shake");
    if (shakeTimer) window.clearTimeout(shakeTimer);
    shakeTimer = window.setTimeout(() => canvas.classList.remove("power-mode-shake"), 210);
  }

  function allowedPetTypes() {
    switch (settings.petMode) {
      case "corgis-kitties": return ["corgi", "corgi", "kitty"];
      case "corgis": return ["corgi", "corgi", "corgi"];
      case "kitties": return ["kitty", "kitty", "kitty"];
      case "octopus": return ["octopus"];
      case "all": return PET_TYPES;
      default: return [];
    }
  }

  function createPet(type, index) {
    const width = window.innerWidth;
    return {
      type,
      x: 28 + Math.random() * Math.max(1, width - 56),
      y: 35 + Math.random() * 12,
      phase: Math.random() * Math.PI * 2,
      speed: (type === "octopus" ? 9 : 13) + Math.random() * 13,
      direction: index % 2 ? -1 : 1,
      inkClock: 0
    };
  }

  function maintainPetRoster() {
    const wanted = allowedPetTypes().slice(0, MAX_PETS);
    for (let index = petRoster.length - 1; index >= 0; index -= 1) {
      if (!wanted.includes(petRoster[index].type) || petRoster.filter((pet) => pet.type === petRoster[index].type).length > wanted.filter((type) => type === petRoster[index].type).length) {
        petRoster.splice(index, 1);
      }
    }
    wanted.forEach((type, index) => {
      if (petRoster.filter((pet) => pet.type === type).length < wanted.slice(0, index + 1).filter((item) => item === type).length) {
        petRoster.push(createPet(type, index));
      }
    });
    if (petRoster.length > MAX_PETS) petRoster.length = MAX_PETS;
  }

  function drawWater(width, time) {
    context.fillStyle = "rgba(70, 205, 220, 0.13)";
    context.fillRect(0, 0, width, 60);
    context.lineWidth = 2;
    for (let index = 0; index < 7; index += 1) {
      const x = 14 + index * (width / 7);
      context.beginPath();
      context.moveTo(x, 60);
      context.quadraticCurveTo(x + Math.sin(time + index) * 8, 40, x + Math.cos(time * 0.7 + index) * 7, 21);
      context.strokeStyle = "rgba(35, 135, 124, 0.28)";
      context.stroke();
    }
  }

  function drawCorgi(pet) {
    const step = Math.sin(pet.phase * 5) * 2;
    const x = Math.round(pet.x);
    const y = Math.round(pet.y);
    context.save();
    if (pet.direction < 0) {
      context.translate(x * 2 + 0, 0);
      context.scale(-1, 1);
    }
    context.fillStyle = "#bd6236";
    context.fillRect(x - 13, y - 7, 24, 15);
    context.fillRect(x + 7, y - 13, 12, 13);
    context.fillStyle = "#f2b35c";
    context.fillRect(x + 8, y - 16, 5, 8);
    context.fillRect(x + 16, y - 16, 5, 8);
    context.fillStyle = "#fff0d4";
    context.fillRect(x + 12, y - 6, 9, 6);
    context.fillRect(x - 11, y + 4 + step, 5, 7);
    context.fillRect(x + 2, y + 4 - step, 5, 7);
    context.fillStyle = "#292922";
    context.fillRect(x + 16, y - 9, 2, 2);
    context.restore();
  }

  function drawKitty(pet) {
    const pounce = Math.max(0, Math.sin(pet.phase * 1.3)) * 5;
    const x = Math.round(pet.x);
    const y = Math.round(pet.y - pounce);
    context.save();
    if (pet.direction < 0) {
      context.translate(x * 2, 0);
      context.scale(-1, 1);
    }
    context.fillStyle = "#454952";
    context.fillRect(x - 10, y - 6, 19, 14);
    context.fillRect(x + 4, y - 13, 13, 12);
    context.fillRect(x + 5, y - 18, 5, 7);
    context.fillRect(x + 13, y - 18, 5, 7);
    context.fillRect(x - 12, y + 3, 4, 7);
    context.fillRect(x + 4, y + 3, 4, 7);
    context.fillStyle = "#f2a6a1";
    context.fillRect(x + 8, y - 10, 2, 2);
    context.fillStyle = "#f1f0dc";
    context.fillRect(x + 12, y - 10, 2, 2);
    context.restore();
  }

  function drawOctopus(pet, delta) {
    const x = pet.x;
    const y = pet.y - 4 + Math.sin(pet.phase * 1.5) * 3;
    context.fillStyle = "#dd75c7";
    context.beginPath();
    context.ellipse(x, y - 4, 12, 10, 0, Math.PI, 0);
    context.lineTo(x + 12, y + 1);
    context.quadraticCurveTo(x, y + 7, x - 12, y + 1);
    context.closePath();
    context.fill();
    context.fillStyle = "#fff5ed";
    context.fillRect(x - 5, y - 5, 3, 4);
    context.fillRect(x + 3, y - 5, 3, 4);
    context.fillStyle = "#30254a";
    context.fillRect(x - 4, y - 4, 2, 3);
    context.fillRect(x + 4, y - 4, 2, 3);
    context.strokeStyle = "#c552ae";
    context.lineWidth = 3;
    for (let arm = 0; arm < 4; arm += 1) {
      const startX = x - 8 + arm * 5;
      const sway = Math.sin(pet.phase * 2 + arm) * 4;
      context.beginPath();
      context.moveTo(startX, y + 3);
      context.quadraticCurveTo(startX + sway, y + 11, startX + sway * 0.5, y + 17);
      context.stroke();
    }
    pet.inkClock += delta;
    if (pet.inkClock > 5.5 && inkBlots.length < MAX_INK) {
      pet.inkClock = 0;
      const blotCount = Math.min(4, MAX_INK - inkBlots.length);
      for (let index = 0; index < blotCount; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 2 + Math.random() * 7;
        inkBlots.push({
          x: x + Math.cos(angle) * distance,
          y: y + 12 + Math.sin(angle) * distance,
          vx: (Math.random() - 0.5) * 9,
          vy: 4 + Math.random() * 8,
          spread: 4 + Math.random() * 4,
          radius: 1 + Math.random() * 2,
          age: 0,
          life: 1.2 + Math.random() * 0.8
        });
      }
    }
  }

  function updatePets(delta, time) {
    maintainPetRoster();
    const hasOctopus = petRoster.some((pet) => pet.type === "octopus");
    if (hasOctopus) drawWater(window.innerWidth, time);
    petRoster.forEach((pet) => {
      pet.x += pet.direction * pet.speed * delta;
      pet.phase += delta;
      if (pet.x < 24 || pet.x > window.innerWidth - 24) pet.direction *= -1;
      pet.y = Math.max(23, Math.min(55, pet.y));
      if (pet.type === "corgi") drawCorgi(pet);
      if (pet.type === "kitty") drawKitty(pet);
      if (pet.type === "octopus") drawOctopus(pet, delta);
    });
  }

  function updateParticles(delta) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.age += delta;
      if (particle.age >= particle.life) {
        particles.splice(index, 1);
        continue;
      }
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 75 * delta;
      context.globalAlpha = 1 - particle.age / particle.life;
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    context.globalAlpha = 1;
  }

  function updateInk(delta) {
    for (let index = inkBlots.length - 1; index >= 0; index -= 1) {
      const blot = inkBlots[index];
      blot.age += delta;
      if (blot.age >= blot.life) {
        inkBlots.splice(index, 1);
        continue;
      }
      blot.x += blot.vx * delta;
      blot.y += blot.vy * delta;
      blot.radius += delta * blot.spread;
      context.globalAlpha = (1 - blot.age / blot.life) * 0.5;
      context.fillStyle = "#384b91";
      context.beginPath();
      context.arc(blot.x, blot.y, blot.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function animationFrame(timestamp) {
    rafId = 0;
    if (!isMotionActive() || document.hidden) return;
    if (timestamp - previousFrame < FRAME_INTERVAL_MS) {
      ensureAnimationLoop();
      return;
    }
    const delta = Math.min((timestamp - (previousFrame || timestamp)) / 1000, 0.08);
    previousFrame = timestamp;
    elapsed += delta;
    clearCanvas();
    updatePets(delta, elapsed);
    updateInk(delta);
    updateParticles(delta);
    drawComboCounter();
    ensureAnimationLoop();
  }

  function ensureAnimationLoop() {
    if (!rafId && isMotionActive()) rafId = window.requestAnimationFrame(animationFrame);
  }

  function stopAnimationLoop() {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
    previousFrame = 0;
  }

  function syncAnimation() {
    if (isMotionActive()) {
      ensureAnimationLoop();
    } else {
      stopAnimationLoop();
      particles.length = 0;
      inkBlots.length = 0;
      drawStatic();
    }
  }

  document.addEventListener("focusin", (event) => {
    const editor = isAllowedEditor(event.target);
    if (editor) focusEditor(editor);
  }, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("compositionstart", onCompositionStart, true);
  document.addEventListener("compositionupdate", () => {}, true);
  document.addEventListener("compositionend", onCompositionEnd, true);
  window.addEventListener("resize", resizeCanvas, { passive: true });
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible) {
      syncAnimation();
      drawStatic();
    } else {
      stopAnimationLoop();
    }
  });
  reducedMotion.addEventListener?.("change", syncAnimation);

  initializeCanvas();
  listenForSettings();
  loadSettings();
})();