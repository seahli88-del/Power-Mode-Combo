(() => {
  "use strict";

  function isEditKey(event) {
    if (!event || !event.isTrusted || event.defaultPrevented || event.isComposing || event.repeat) return false;
    const altGraph = event.getModifierState?.("AltGraph") === true;
    if ((event.ctrlKey || event.metaKey || event.altKey) && !altGraph) return false;
    return event.key.length === 1 || ["Backspace", "Delete", "Enter"].includes(event.key);
  }

  function isTextMutation(inputType) {
    return /^(insertText|insertLineBreak|insertParagraph|insertReplacementText|deleteContent|deleteWord|deleteSoftLine|deleteHardLine|deleteEntireSoftLine)/.test(inputType || "");
  }

  const api = Object.freeze({ isEditKey, isTextMutation });
  globalThis.PowerModeTypingRules = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();