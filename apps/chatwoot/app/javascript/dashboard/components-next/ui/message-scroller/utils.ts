import type {
  MessageScrollerScrollable,
  MessageScrollerScrollAlign,
  MessageScrollerVisibilityState,
} from './interface';

export const SCROLL_EDGE_THRESHOLD = 8;
export const SCROLL_PREVIOUS_ITEM_PEEK = 64;
export const SCROLL_MARGIN = 0;
/** Sub-pixel tolerance for scrollTop comparisons. */
export const EPSILON = 0.5;
/** How long the `data-autoscrolling` flag lingers after a programmatic scroll. */
export const AUTOSCROLL_TIMEOUT = 180;
/** Keys that count as an explicit user intent to move the viewport. */
export const SCROLL_INTENT_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  ' ',
]);

export const DEFAULT_SCROLLABLE: MessageScrollerScrollable = {
  start: false,
  end: false,
};
export const DEFAULT_VISIBILITY: MessageScrollerVisibilityState = {
  currentAnchorId: null,
  visibleMessageIds: [],
};

function parseFloatSafe(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Direct children of `content` that represent messages (everything but the spacer). */
export function getMessageElements(
  content: HTMLElement,
  spacer: HTMLElement | null
): HTMLElement[] {
  return Array.from(content.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child !== spacer
  );
}

function getBlockPadding(element: HTMLElement): { start: number; end: number } {
  const style = window.getComputedStyle(element);
  return {
    end: parseFloatSafe(style.paddingBlockEnd || style.paddingBottom),
    start: parseFloatSafe(style.paddingBlockStart || style.paddingTop),
  };
}

function getSpacerParentPadding(spacer: HTMLElement | null): {
  start: number;
  end: number;
} {
  const parent = spacer?.parentElement;
  return parent ? getBlockPadding(parent) : { start: 0, end: 0 };
}

export function getRowGap(element: HTMLElement | null): number {
  if (!element) return 0;
  const style = window.getComputedStyle(element);
  const gap = style.rowGap === 'normal' ? style.gap : style.rowGap;
  return parseFloatSafe(gap);
}

/** Element top relative to the content origin, accounting for current scroll. */
function offsetTop(element: HTMLElement, viewport: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  return rect.top - viewportRect.top + viewport.scrollTop;
}

/** Element top relative to the viewport's current visible box. */
export function relativeTop(element: HTMLElement, viewport: HTMLElement): number {
  return (
    element.getBoundingClientRect().top - viewport.getBoundingClientRect().top
  );
}

export function maxScrollTop(element: HTMLElement): number {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

export function computeContentHeight(params: {
  content: HTMLElement;
  spacer: HTMLElement | null;
  viewport: HTMLElement;
}): number {
  const { content, spacer, viewport } = params;
  const messages = getMessageElements(content, spacer);
  const padding = getBlockPadding(content);
  const viewportRect = viewport.getBoundingClientRect();
  const scrollTop = viewport.scrollTop;
  let height = padding.start + padding.end;
  for (const message of messages) {
    const rect = message.getBoundingClientRect();
    height = Math.max(
      height,
      rect.bottom - viewportRect.top + scrollTop + padding.end
    );
  }
  return height;
}

export function computeScrollable(params: {
  content: HTMLElement | null;
  scrollEdgeThreshold: number;
  spacer: HTMLElement | null;
  viewport: HTMLElement | null;
}): MessageScrollerScrollable {
  const { content, scrollEdgeThreshold, spacer, viewport } = params;
  if (!viewport || !content) return { ...DEFAULT_SCROLLABLE };
  const contentHeight = computeContentHeight({ content, spacer, viewport });
  return {
    start: viewport.scrollTop > scrollEdgeThreshold,
    end:
      contentHeight - viewport.scrollTop - viewport.clientHeight >
      scrollEdgeThreshold,
  };
}

export function computeVisibility(params: {
  content: HTMLElement | null;
  scrollMargin: number;
  scrollPreviousItemPeek: number;
  spacer: HTMLElement | null;
  viewport: HTMLElement | null;
  visibleMessageIds: Set<string>;
}): MessageScrollerVisibilityState {
  const {
    content,
    scrollMargin,
    scrollPreviousItemPeek,
    spacer,
    viewport,
    visibleMessageIds,
  } = params;
  if (!content || !viewport) return DEFAULT_VISIBILITY;
  const viewportRect = viewport.getBoundingClientRect();
  const anchorLine = viewportRect.top + scrollMargin + scrollPreviousItemPeek;
  const noObserver = typeof IntersectionObserver === 'undefined';
  const visible: string[] = [];
  let currentAnchorId: string | null = null;
  for (const element of getMessageElements(content, spacer)) {
    const id = element.dataset.messageId;
    if (!id) continue;
    const isAnchor = element.dataset.scrollAnchor === 'true';
    const rect = isAnchor || noObserver ? element.getBoundingClientRect() : null;
    const isVisible =
      noObserver && rect
        ? rect.bottom > anchorLine && rect.top < viewportRect.bottom
        : visibleMessageIds.has(id);
    if (isVisible) visible.push(id);
    if (isAnchor && rect && rect.top <= anchorLine + EPSILON) currentAnchorId = id;
  }
  return visible.length === 0 && currentAnchorId === null
    ? DEFAULT_VISIBILITY
    : { currentAnchorId, visibleMessageIds: visible };
}

export function findNextAnchorFrom(
  elements: HTMLElement[],
  startIndex: number
): HTMLElement | null {
  for (let i = startIndex; i < elements.length; i++) {
    if (elements[i]?.dataset.scrollAnchor === 'true') return elements[i];
  }
  return null;
}

export function findFirstUnhandledAnchor(
  elements: HTMLElement[],
  handled: WeakSet<HTMLElement>
): HTMLElement | null {
  for (const element of elements) {
    if (element.dataset.scrollAnchor === 'true' && !handled.has(element)) {
      return element;
    }
  }
  return null;
}

export function hasMultipleAnchorsFrom(
  elements: HTMLElement[],
  startIndex: number
): boolean {
  let count = 0;
  for (let i = startIndex; i < elements.length; i++) {
    if (elements[i]?.dataset.scrollAnchor === 'true') {
      count += 1;
      if (count > 1) return true;
    }
  }
  return false;
}

export function findLastAnchor(elements: HTMLElement[]): HTMLElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (elements[i]?.dataset.scrollAnchor === 'true') return elements[i];
  }
  return null;
}

export function findFirstVisibleMessage(params: {
  content: HTMLElement;
  spacer: HTMLElement | null;
  viewport: HTMLElement;
}): HTMLElement | null {
  const { content, spacer, viewport } = params;
  const viewportRect = viewport.getBoundingClientRect();
  for (const element of getMessageElements(content, spacer)) {
    if (!element.dataset.messageId) continue;
    const rect = element.getBoundingClientRect();
    if (rect.bottom > viewportRect.top && rect.top < viewportRect.bottom) {
      return element;
    }
  }
  return null;
}

export function computeScrollTopForElement(params: {
  align: MessageScrollerScrollAlign;
  element: HTMLElement;
  scrollMargin: number;
  spacer: HTMLElement | null;
  viewport: HTMLElement;
}): number {
  const { align, element, scrollMargin, spacer, viewport } = params;
  const top = offsetTop(element, viewport);
  const height = element.getBoundingClientRect().height;
  const padding = getSpacerParentPadding(spacer);
  if (align === 'center') {
    const available = Math.max(
      0,
      viewport.clientHeight - padding.start - padding.end
    );
    return top - padding.start - (available - height) / 2 - scrollMargin;
  }
  if (align === 'end') {
    return top - viewport.clientHeight + height + padding.end + scrollMargin;
  }
  if (align === 'nearest') {
    const bottom = top + height;
    const visibleStart = viewport.scrollTop + padding.start;
    const visibleEnd = viewport.scrollTop + viewport.clientHeight - padding.end;
    if (top >= visibleStart && bottom <= visibleEnd) return viewport.scrollTop;
    return top < visibleStart
      ? top - padding.start - scrollMargin
      : bottom - viewport.clientHeight + padding.end + scrollMargin;
  }
  return top - padding.start - scrollMargin;
}

export function computeSpacerHeightForScrollTop(params: {
  content: HTMLElement;
  scrollTop: number;
  spacer: HTMLElement | null;
  viewport: HTMLElement;
}): number {
  const { content, scrollTop, spacer, viewport } = params;
  const contentHeight = computeContentHeight({ content, spacer, viewport });
  return scrollTop + viewport.clientHeight - contentHeight;
}

export function scrollableEquals(
  a: MessageScrollerScrollable,
  b: MessageScrollerScrollable
): boolean {
  return a.start === b.start && a.end === b.end;
}

export function visibilityEquals(
  a: MessageScrollerVisibilityState,
  b: MessageScrollerVisibilityState
): boolean {
  if (a.currentAnchorId !== b.currentAnchorId) return false;
  if (a.visibleMessageIds.length !== b.visibleMessageIds.length) return false;
  return a.visibleMessageIds.every((id, index) => id === b.visibleMessageIds[index]);
}
