const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isTypingTarget(target) {
  return Boolean(target && (TYPING_TAGS.has(target.tagName) || target.isContentEditable));
}
