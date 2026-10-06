(() => {
  "use strict";

  const STORAGE_KEY = "powerModeSettings";
  const defaults = { enabled: true, petMode: "all" };
  const enabledInput = document.getElementById("power-enabled");
  const petSelect = document.getElementById("pet-mode");
  const previewMark = document.getElementById("preview-mark");
  const previewTitle = document.getElementById("preview-title");
  const previewSubtitle = document.getElementById("preview-subtitle");
  const status = document.getElementById("status");
  const previews = {
    all: ["🐕", "All pets", "Corgis, kitties, and a little deep-sea company."],
    "corgis-kitties": ["🐈", "Corgis & Kitties", "A tiny top-of-page dog-and-cat parade."],
    corgis: ["🐕", "Corgis", "Wiggly pixel corgis patrol the top edge."],
    kitties: ["🐈", "Kitties", "Pouncing and sitting, one combo at a time."],
    octopus: ["🐙", "Octopus", "A drifting octopus with a calm cyan tide."],
    off: ["✦", "Pets off", "The typing combo counter can still light up."]
  };

  function normalizeSettings(value) {
    if (!value || typeof value !== "object") return { ...defaults };
    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
      petMode: Object.hasOwn(previews, value.petMode) ? value.petMode : defaults.petMode
    };
  }

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.dataset.error = String(isError);
  }

  function renderPreview(mode) {
    const [mark, title, subtitle] = previews[mode] || previews.all;
    previewMark.textContent = mark;
    previewTitle.textContent = title;
    previewSubtitle.textContent = subtitle;
  }

  async function saveSettings() {
    const settings = {
      enabled: enabledInput.checked,
      petMode: petSelect.value
    };
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: settings });
      showStatus("Saved on this device.");
    } catch {
      showStatus("Could not save. Try reopening the popup.", true);
    }
  }

  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const settings = normalizeSettings(stored[STORAGE_KEY]);
      enabledInput.checked = settings.enabled;
      petSelect.value = settings.petMode;
      renderPreview(settings.petMode);
      showStatus("");
    } catch {
      enabledInput.checked = defaults.enabled;
      petSelect.value = defaults.petMode;
      renderPreview(defaults.petMode);
      showStatus("Using defaults. Local storage is unavailable.", true);
    }
  }

  enabledInput.addEventListener("change", saveSettings);
  petSelect.addEventListener("change", () => {
    renderPreview(petSelect.value);
    saveSettings();
  });
  loadSettings();
})();