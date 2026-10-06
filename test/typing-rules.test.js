const test = require("node:test");
const assert = require("node:assert/strict");
const { isEditKey, isTextMutation } = require("../typing-rules.js");

function keyEvent(key, overrides = {}) {
  return {
    key,
    isTrusted: true,
    defaultPrevented: false,
    isComposing: false,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    getModifierState: () => false,
    ...overrides
  };
}

test("accepts printable keys, deletion, and Enter", () => {
  for (const key of ["a", "7", "?", "Backspace", "Delete", "Enter"]) {
    assert.equal(isEditKey(keyEvent(key)), true, key);
  }
});

test("rejects shortcuts, navigation, repeats, composition, and synthetic keys", () => {
  const excluded = [
    keyEvent("c", { ctrlKey: true }),
    keyEvent("a", { metaKey: true }),
    keyEvent("x", { altKey: true }),
    keyEvent("ArrowLeft"),
    keyEvent("Tab"),
    keyEvent("b", { repeat: true }),
    keyEvent("あ", { isComposing: true }),
    keyEvent("x", { isTrusted: false })
  ];
  for (const event of excluded) assert.equal(isEditKey(event), false, event.key);
});

test("permits printable AltGraph characters", () => {
  assert.equal(isEditKey(keyEvent("€", {
    ctrlKey: true,
    altKey: true,
    getModifierState: (modifier) => modifier === "AltGraph"
  })), true);
});

test("accepts text insertions, replacements, and keyboard deletions", () => {
  for (const inputType of [
    "insertText",
    "insertLineBreak",
    "insertParagraph",
    "insertReplacementText",
    "deleteContentBackward",
    "deleteContentForward",
    "deleteWordBackward",
    "deleteSoftLineForward"
  ]) {
    assert.equal(isTextMutation(inputType), true, inputType);
  }
});

test("rejects clipboard, drag/drop, formatting, and unknown mutations", () => {
  for (const inputType of [
    "insertFromPaste",
    "insertFromDrop",
    "deleteByCut",
    "formatBold",
    "historyUndo",
    ""
  ]) {
    assert.equal(isTextMutation(inputType), false, inputType);
  }
});