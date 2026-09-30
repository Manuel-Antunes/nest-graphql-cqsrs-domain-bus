import type { HTMLAttributes } from 'vue';

export type MessageScrollerDefaultScrollPosition = 'start' | 'end' | 'last-anchor';
export type MessageScrollerButtonDirection = 'start' | 'end';
export type MessageScrollerScrollAlign = 'start' | 'center' | 'end' | 'nearest';

export type ScrollerMode =
  | 'following-bottom'
  | 'free-scrolling'
  | 'settling-jump'
  | 'anchored-to-message';

export interface MessageScrollerScrollOptions {
  align?: MessageScrollerScrollAlign;
  behavior?: ScrollBehavior;
  scrollMargin?: number;
}

export interface MessageScrollerScrollable {
  start: boolean;
  end: boolean;
}

export interface MessageScrollerVisibilityState {
  currentAnchorId: string | null;
  visibleMessageIds: string[];
}

export interface MessageScrollerProviderProps {
  /** Keep the viewport pinned to the newest message while at the bottom. */
  autoScroll?: boolean;
  /** Where to place the viewport on the first content render. */
  defaultScrollPosition?: MessageScrollerDefaultScrollPosition;
  /** Distance (px) from an edge before it is reported as scrollable. */
  scrollEdgeThreshold?: number;
  /** Space (px) kept visible above an anchored message. */
  scrollPreviousItemPeek?: number;
  /** Extra offset (px) applied when aligning a message. */
  scrollMargin?: number;
}

export interface WithClassAsProps {
  class?: HTMLAttributes['class'];
}
