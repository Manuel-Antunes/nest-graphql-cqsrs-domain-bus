export const isEnter = (e: KeyboardEvent): boolean => {
  return e.key === 'Enter';
};

export const isEscape = (e: KeyboardEvent): boolean => {
  return e.key === 'Escape';
};

export const hasPressedShift = (e: KeyboardEvent): boolean => {
  return e.shiftKey;
};

export const hasPressedCommand = (e: KeyboardEvent): boolean => {
  return e.metaKey;
};

export const hasPressedEnterAndNotCmdOrShift = (e: KeyboardEvent): boolean => {
  return isEnter(e) && !hasPressedCommand(e) && !hasPressedShift(e);
};

export const hasPressedCommandAndEnter = (e: KeyboardEvent): boolean => {
  return hasPressedCommand(e) && isEnter(e);
};

// If layout is QWERTZ then we add the Shift+keysToModify to fix an known issue
// https://github.com/chatwoot/chatwoot/issues/9492
export const keysToModifyInQWERTZ = new Set(['Alt+KeyP', 'Alt+KeyL']);

export const LAYOUT_QWERTY = 'QWERTY';
export const LAYOUT_QWERTZ = 'QWERTZ';
export const LAYOUT_AZERTY = 'AZERTY';

/**
 * Determines whether the active element is typeable.
 *
 * @param e - The keyboard event object.
 * @returns `true` if the active element is typeable, `false` otherwise.
 *
 * @example
 * document.addEventListener('keydown', e => {
 *   if (isActiveElementTypeable(e)) {
 *     handleTypeableElement(e);
 *   }
 * });
 */
export const isActiveElementTypeable = (e: KeyboardEvent): boolean => {
  const activeElement =
    (e.target as HTMLElement | null) ||
    (document.activeElement as HTMLElement | null);

  return !!(
    activeElement?.tagName === 'INPUT' ||
    activeElement?.tagName === 'NINJA-KEYS' ||
    activeElement?.tagName === 'TEXTAREA' ||
    activeElement?.contentEditable === 'true' ||
    activeElement?.className?.includes('ProseMirror')
  );
};
