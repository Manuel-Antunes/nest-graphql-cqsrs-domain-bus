import type { ComponentPublicInstance, ShallowRef } from 'vue';
import type {
  MessageScrollerProviderProps,
  MessageScrollerScrollable,
  MessageScrollerScrollOptions,
  MessageScrollerVisibilityState,
  ScrollerMode,
} from './interface';
import { createInjectionState } from '@vueuse/core';
import {
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  readonly,
  shallowRef,
  watch,
} from 'vue';
import {
  AUTOSCROLL_TIMEOUT,
  computeContentHeight,
  computeScrollable,
  computeScrollTopForElement,
  computeSpacerHeightForScrollTop,
  computeVisibility,
  DEFAULT_VISIBILITY,
  EPSILON,
  findFirstUnhandledAnchor,
  findFirstVisibleMessage,
  findLastAnchor,
  findNextAnchorFrom,
  getMessageElements,
  getRowGap,
  hasMultipleAnchorsFrom,
  maxScrollTop,
  relativeTop,
  SCROLL_EDGE_THRESHOLD,
  SCROLL_MARGIN,
  SCROLL_PREVIOUS_ITEM_PEEK,
  scrollableEquals,
  visibilityEquals,
} from './utils';

type MaybeElementRef = Element | ComponentPublicInstance | null;

function resolveElement(ref: MaybeElementRef): HTMLElement | null {
  return ref instanceof HTMLElement ? ref : null;
}

interface InternalState {
  autoScroll: boolean;
  autoscrolling: boolean;
  autoscrollingTimeout: number | null;
  streamingTurn: HTMLElement | null;
  content: HTMLElement | null;
  defaultScrollPosition: NonNullable<
    MessageScrollerProviderProps['defaultScrollPosition']
  >;
  defaultScrollPositionApplied: boolean;
  firstItem: HTMLElement | null;
  itemCount: number;
  messageElements: Map<string, HTMLElement>;
  mode: ScrollerMode;
  pendingScrollFrame: number | null;
  pendingScrollToMessage: {
    messageId: string;
    options?: MessageScrollerScrollOptions;
  } | null;
  prependRestore: { element: HTMLElement; viewportTop: number } | null;
  preserveScrollOnPrepend: boolean;
  root: HTMLElement | null;
  scrollEdgeThreshold: number;
  scrollMargin: number;
  scrollPreviousItemPeek: number;
  spacerGap: number;
  spacerHeight: number;
  spacer: HTMLElement | null;
  stateFrame: number | null;
  viewport: HTMLElement | null;
  visibilityFrame: number | null;
  visibilityObserver: IntersectionObserver | null;
  visibleMessageIds: Set<string>;
  handledScrollAnchors: WeakSet<HTMLElement>;
}

export interface MessageScrollerContext {
  scrollToEnd: (options?: MessageScrollerScrollOptions) => boolean;
  scrollToStart: (options?: MessageScrollerScrollOptions) => boolean;
  scrollToMessage: (
    messageId: string,
    options?: MessageScrollerScrollOptions
  ) => boolean;
  scrollable: Readonly<ShallowRef<MessageScrollerScrollable>>;
  visibility: Readonly<ShallowRef<MessageScrollerVisibilityState>>;
  handleContentChange: () => void;
  handleResize: () => void;
  syncAfterScroll: () => void;
  userScrollIntent: () => void;
  registerMessage: (
    id: string,
    element: MaybeElementRef,
    previous: HTMLElement | null
  ) => void;
  setRootElement: (ref: MaybeElementRef) => void;
  setViewportElement: (ref: MaybeElementRef) => void;
  setContentElement: (ref: MaybeElementRef) => void;
  setSpacerElement: (ref: MaybeElementRef) => void;
  setPreserveScrollOnPrepend: (value: boolean) => void;
  subscribeVisibility: () => () => void;
}

function createMessageScroller(
  props: MessageScrollerProviderProps
): MessageScrollerContext {
  const scrollable = shallowRef<MessageScrollerScrollable>({
    start: false,
    end: false,
  });
  const visibility = shallowRef<MessageScrollerVisibilityState>(
    DEFAULT_VISIBILITY
  );

  const initialAutoScroll = props.autoScroll ?? false;
  const st: InternalState = {
    autoScroll: initialAutoScroll,
    autoscrolling: false,
    autoscrollingTimeout: null,
    streamingTurn: null,
    content: null,
    defaultScrollPosition: props.defaultScrollPosition ?? 'end',
    defaultScrollPositionApplied: false,
    firstItem: null,
    itemCount: 0,
    messageElements: new Map(),
    mode: initialAutoScroll ? 'following-bottom' : 'free-scrolling',
    pendingScrollFrame: null,
    pendingScrollToMessage: null,
    prependRestore: null,
    preserveScrollOnPrepend: true,
    root: null,
    scrollEdgeThreshold: props.scrollEdgeThreshold ?? SCROLL_EDGE_THRESHOLD,
    scrollMargin: props.scrollMargin ?? SCROLL_MARGIN,
    scrollPreviousItemPeek:
      props.scrollPreviousItemPeek ?? SCROLL_PREVIOUS_ITEM_PEEK,
    spacerGap: 0,
    spacerHeight: 0,
    spacer: null,
    stateFrame: null,
    viewport: null,
    visibilityFrame: null,
    visibilityObserver: null,
    visibleMessageIds: new Set(),
    handledScrollAnchors: new WeakSet(),
  };

  let visibilityListeners = 0;
  function hasVisibilityListeners(): boolean {
    return visibilityListeners > 0;
  }

  function setScrollable(next: MessageScrollerScrollable): void {
    if (!scrollableEquals(scrollable.value, next)) scrollable.value = next;
  }
  function setVisibility(next: MessageScrollerVisibilityState): void {
    if (!visibilityEquals(visibility.value, next)) visibility.value = next;
  }

  // ── Reactive attribute + mode reconciliation ────────────────────────────
  function applyScrollableAttributes(state: MessageScrollerScrollable): void {
    const value = [state.start ? 'start' : '', state.end ? 'end' : '']
      .filter(Boolean)
      .join(' ');
    const autoscrolling = st.autoscrolling;
    for (const element of [st.root, st.viewport]) {
      if (!element) continue;
      if (value) element.setAttribute('data-scrollable', value);
      else element.removeAttribute('data-scrollable');
      element.toggleAttribute('data-autoscrolling', autoscrolling);
    }
  }

  function updateModeFromScrollable(state: MessageScrollerScrollable): void {
    if (st.autoScroll && !state.end && st.mode !== 'settling-jump') {
      st.mode = 'following-bottom';
    } else if (
      st.mode === 'following-bottom' &&
      state.end &&
      !st.autoscrolling
    ) {
      st.mode = 'free-scrolling';
    }
  }

  function commitScrollState(): void {
    const next = computeScrollable({
      content: st.content,
      scrollEdgeThreshold: st.scrollEdgeThreshold,
      spacer: st.spacer,
      viewport: st.viewport,
    });
    updateModeFromScrollable(next);
    applyScrollableAttributes(next);
    setScrollable(next);
  }

  function scheduleStateCommit(): void {
    if (st.stateFrame !== null) return;
    st.stateFrame = requestAnimationFrame(() => {
      st.stateFrame = null;
      commitScrollState();
    });
  }

  function scheduleVisibilitySync(): void {
    if (!hasVisibilityListeners() || st.visibilityFrame !== null) return;
    st.visibilityFrame = requestAnimationFrame(() => {
      st.visibilityFrame = null;
      if (!hasVisibilityListeners()) return;
      setVisibility(
        computeVisibility({
          content: st.content,
          scrollMargin: st.scrollMargin,
          scrollPreviousItemPeek: st.scrollPreviousItemPeek,
          spacer: st.spacer,
          viewport: st.viewport,
          visibleMessageIds: st.visibleMessageIds,
        })
      );
    });
  }

  // ── Imperative scroll controller ────────────────────────────────────────
  function setAutoscrolling(value: boolean): void {
    if (st.autoscrollingTimeout !== null) {
      window.clearTimeout(st.autoscrollingTimeout);
      st.autoscrollingTimeout = null;
    }
    if (st.autoscrolling !== value) {
      st.autoscrolling = value;
      commitScrollState();
    }
    if (value) {
      st.autoscrollingTimeout = window.setTimeout(() => {
        st.autoscrollingTimeout = null;
        st.autoscrolling = false;
        commitScrollState();
      }, AUTOSCROLL_TIMEOUT);
    }
  }

  function setSpacerHeight(px: number): void {
    const spacer = st.spacer;
    if (!spacer) return;
    const height = Math.max(0, Math.ceil(px));
    if (st.spacerHeight === height) return;
    st.spacerHeight = height;
    spacer.hidden = height === 0;
    spacer.style.height = `${height}px`;
    spacer.style.marginTop = height > 0 ? `${-st.spacerGap}px` : '';
  }

  function scrollViewportTo(
    top: number,
    options: { behavior?: ScrollBehavior; autoscrolling?: boolean } = {}
  ): void {
    const { behavior = 'auto', autoscrolling = false } = options;
    const viewport = st.viewport;
    if (!viewport) return;
    const target = Math.max(0, top);
    if (Math.abs(viewport.scrollTop - target) <= EPSILON) {
      viewport.scrollTop = target;
      commitScrollState();
      return;
    }
    if (autoscrolling) setAutoscrolling(true);
    viewport.scrollTo({ top: target, behavior });
    scheduleStateCommit();
  }

  function scrollToStart(options: MessageScrollerScrollOptions = {}): boolean {
    if (!st.viewport) return false;
    setSpacerHeight(0);
    st.streamingTurn = null;
    st.mode = 'free-scrolling';
    scrollViewportTo(0, { behavior: options.behavior ?? 'auto' });
    scheduleVisibilitySync();
    return true;
  }

  function scrollToEnd(options: MessageScrollerScrollOptions = {}): boolean {
    const viewport = st.viewport;
    if (!viewport) return false;
    setSpacerHeight(0);
    st.streamingTurn = null;
    st.mode = st.autoScroll ? 'following-bottom' : 'free-scrolling';
    scrollViewportTo(maxScrollTop(viewport), {
      autoscrolling: true,
      behavior: options.behavior ?? 'auto',
    });
    scheduleVisibilitySync();
    return true;
  }

  function scrollToElement(
    element: HTMLElement,
    options: MessageScrollerScrollOptions = {},
    meta: { keepPreviousPeek?: boolean } = {}
  ): boolean {
    const content = st.content;
    const viewport = st.viewport;
    if (!content || !viewport || !content.contains(element)) return false;
    const keepPreviousPeek = meta.keepPreviousPeek ?? false;
    const baseScrollMargin = options.scrollMargin ?? st.scrollMargin;
    const target = computeScrollTopForElement({
      align: options.align ?? 'start',
      element,
      scrollMargin: keepPreviousPeek
        ? baseScrollMargin + st.scrollPreviousItemPeek
        : baseScrollMargin,
      spacer: st.spacer,
      viewport,
    });
    const spacerHeight = computeSpacerHeightForScrollTop({
      content,
      scrollTop: target,
      spacer: st.spacer,
      viewport,
    });
    setSpacerHeight(spacerHeight);
    st.prependRestore = { element, viewportTop: relativeTop(element, viewport) };
    st.mode = keepPreviousPeek ? 'anchored-to-message' : 'settling-jump';
    st.streamingTurn = keepPreviousPeek ? element : null;
    scrollViewportTo(target, { behavior: options.behavior ?? 'auto' });
    scheduleVisibilitySync();
    return true;
  }

  function reanchorToAnchoredMessage(): boolean {
    const element = st.streamingTurn;
    if (!element || !element.isConnected || st.mode !== 'anchored-to-message') {
      return false;
    }
    return scrollToElement(element, { align: 'start' }, { keepPreviousPeek: true });
  }

  function scrollToMessage(
    messageId: string,
    options: MessageScrollerScrollOptions = {}
  ): boolean {
    const element = st.messageElements.get(messageId);
    if (element) {
      st.defaultScrollPositionApplied = true;
      if (scrollToElement(element, options)) {
        st.pendingScrollToMessage = null;
        return true;
      }
      st.pendingScrollToMessage = { messageId, options };
      return true;
    }
    if (st.itemCount === 0) {
      st.pendingScrollToMessage = { messageId, options };
      st.defaultScrollPositionApplied = true;
      return true;
    }
    return false;
  }

  function flushPendingScrollToMessage(): boolean {
    const pending = st.pendingScrollToMessage;
    if (!pending) return false;
    const element = st.messageElements.get(pending.messageId);
    if (!element || !scrollToElement(element, pending.options)) return false;
    st.pendingScrollToMessage = null;
    st.defaultScrollPositionApplied = true;
    return true;
  }

  // ── Prepend anchoring (keep the reading position stable) ────────────────
  function maintainPrependAnchor(): boolean {
    const restore = st.prependRestore;
    const viewport = st.viewport;
    if (!restore || !viewport || !restore.element.isConnected) return false;
    const delta = relativeTop(restore.element, viewport) - restore.viewportTop;
    if (Math.abs(delta) <= EPSILON) return false;
    viewport.scrollTop += delta;
    restore.viewportTop = relativeTop(restore.element, viewport);
    scheduleStateCommit();
    scheduleVisibilitySync();
    return true;
  }

  function capturePrependAnchor(): void {
    const content = st.content;
    const viewport = st.viewport;
    if (!content || !viewport) {
      st.prependRestore = null;
      return;
    }
    const element = findFirstVisibleMessage({
      content,
      spacer: st.spacer,
      viewport,
    });
    st.prependRestore = element
      ? { element, viewportTop: relativeTop(element, viewport) }
      : null;
  }

  function scheduleFlushPendingScrollToMessage(): void {
    if (st.pendingScrollFrame !== null) return;
    st.pendingScrollFrame = requestAnimationFrame(() => {
      st.pendingScrollFrame = null;
      if (flushPendingScrollToMessage()) capturePrependAnchor();
    });
  }

  function applyDefaultScrollPosition(): boolean {
    const position = st.defaultScrollPosition;
    if (!position || st.defaultScrollPositionApplied || st.itemCount === 0) {
      return false;
    }
    let done = false;
    if (position === 'last-anchor') {
      const content = st.content;
      const viewport = st.viewport;
      const anchor =
        content && viewport
          ? findLastAnchor(getMessageElements(content, st.spacer))
          : null;
      if (!content || !viewport || !anchor) {
        done = scrollToEnd({ behavior: 'auto' });
      } else {
        const anchorTop =
          anchor.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top +
          viewport.scrollTop;
        done =
          computeContentHeight({ content, spacer: st.spacer, viewport }) -
            anchorTop <=
          viewport.clientHeight
            ? scrollToEnd({ behavior: 'auto' })
            : scrollToElement(anchor, { align: 'start' }, { keepPreviousPeek: true });
      }
    } else {
      done =
        position === 'end'
          ? scrollToEnd({ behavior: 'auto' })
          : scrollToStart({ behavior: 'auto' });
    }
    if (done) {
      st.defaultScrollPositionApplied = true;
      return true;
    }
    return false;
  }

  // ── Content diffing (drives autoscroll / anchoring on message changes) ──
  function reconcileContentChange(
    elements: HTMLElement[],
    previousCount: number,
    previousFirst: HTMLElement | null
  ): void {
    if (flushPendingScrollToMessage()) return;

    if (previousCount === 0) {
      if (
        applyDefaultScrollPosition() ||
        (elements.length > 0 && st.autoScroll && scrollToEnd({ behavior: 'auto' }))
      ) {
        return;
      }
      commitScrollState();
      scheduleVisibilitySync();
      return;
    }

    const previousIndex = previousFirst ? elements.indexOf(previousFirst) : -1;
    if (st.preserveScrollOnPrepend && previousIndex > 0) {
      maintainPrependAnchor();
      return;
    }

    if (elements.length > previousCount) {
      const anchor = findNextAnchorFrom(elements, previousCount);
      if (anchor) {
        if (
          st.autoScroll &&
          st.mode === 'following-bottom' &&
          hasMultipleAnchorsFrom(elements, previousCount)
        ) {
          scrollToEnd({ behavior: 'auto' });
          return;
        }
        scrollToElement(anchor, { align: 'start' }, { keepPreviousPeek: true });
        st.handledScrollAnchors.add(anchor);
        return;
      }
    }

    if (elements.length === previousCount) {
      const anchor = findFirstUnhandledAnchor(elements, st.handledScrollAnchors);
      if (anchor) {
        scrollToElement(anchor, { align: 'start' }, { keepPreviousPeek: true });
        st.handledScrollAnchors.add(anchor);
        return;
      }
    }

    if (st.mode === 'following-bottom' && st.autoScroll) {
      scrollToEnd({ behavior: 'auto' });
    } else {
      commitScrollState();
      scheduleVisibilitySync();
    }
  }

  function handleContentChange(): void {
    const content = st.content;
    if (!content) return;
    const elements = getMessageElements(content, st.spacer);
    const previousCount = st.itemCount;
    const previousFirst = st.firstItem;
    st.itemCount = elements.length;
    st.firstItem = elements[0] ?? null;
    reconcileContentChange(elements, previousCount, previousFirst);
    capturePrependAnchor();
  }

  function handleResize(): void {
    if (st.mode === 'following-bottom' && st.autoScroll) {
      scrollToEnd({ behavior: 'auto' });
      return;
    }
    if (!reanchorToAnchoredMessage()) {
      scheduleStateCommit();
      scheduleVisibilitySync();
    }
  }

  // ── Visibility tracking (IntersectionObserver, opt-in) ──────────────────
  function observeVisibility(): void {
    const viewport = st.viewport;
    if (!viewport || !hasVisibilityListeners()) return;
    if (typeof IntersectionObserver === 'undefined') {
      scheduleVisibilitySync();
      return;
    }
    if (!st.visibilityObserver) {
      st.visibilityObserver = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.messageId;
            if (!id) continue;
            if (entry.isIntersecting) st.visibleMessageIds.add(id);
            else st.visibleMessageIds.delete(id);
          }
          scheduleVisibilitySync();
        },
        {
          root: viewport,
          rootMargin: `${-(st.scrollMargin + st.scrollPreviousItemPeek)}px 0px 0px 0px`,
          threshold: [0, 0.01, 0.5, 1],
        }
      );
    }
    st.messageElements.forEach(element => {
      st.visibilityObserver?.observe(element);
    });
    scheduleVisibilitySync();
  }

  function unobserveVisibility(): void {
    if (st.visibilityFrame !== null) {
      cancelAnimationFrame(st.visibilityFrame);
      st.visibilityFrame = null;
    }
    st.visibilityObserver?.disconnect();
    st.visibilityObserver = null;
    st.visibleMessageIds.clear();
    setVisibility(DEFAULT_VISIBILITY);
  }

  function subscribeVisibility(): () => void {
    visibilityListeners += 1;
    if (visibilityListeners === 1) observeVisibility();
    return () => {
      visibilityListeners -= 1;
      if (visibilityListeners === 0) unobserveVisibility();
    };
  }

  // ── Registration + user intent ──────────────────────────────────────────
  function registerMessage(
    id: string,
    elementRef: MaybeElementRef,
    previous: HTMLElement | null
  ): void {
    const element = resolveElement(elementRef);
    if (element) {
      st.messageElements.set(id, element);
      st.visibilityObserver?.observe(element);
      scheduleVisibilitySync();
      if (st.pendingScrollToMessage?.messageId === id) {
        scheduleFlushPendingScrollToMessage();
      }
      return;
    }
    if (previous && st.messageElements.get(id) === previous) {
      st.messageElements.delete(id);
      st.visibleMessageIds.delete(id);
      st.visibilityObserver?.unobserve(previous);
      scheduleVisibilitySync();
    }
  }

  function userScrollIntent(): void {
    if (
      st.mode === 'following-bottom' ||
      st.mode === 'anchored-to-message' ||
      st.mode === 'settling-jump'
    ) {
      st.streamingTurn = null;
      st.mode = 'free-scrolling';
    }
  }

  function syncAfterScroll(): void {
    commitScrollState();
    scheduleVisibilitySync();
    capturePrependAnchor();
  }

  // ── Element wiring (function refs) ──────────────────────────────────────
  function setRootElement(ref: MaybeElementRef): void {
    st.root = resolveElement(ref);
    if (st.root) applyScrollableAttributes(scrollable.value);
  }
  function setViewportElement(ref: MaybeElementRef): void {
    st.viewport = resolveElement(ref);
    if (st.viewport) applyScrollableAttributes(scrollable.value);
  }
  function setContentElement(ref: MaybeElementRef): void {
    st.content = resolveElement(ref);
  }
  function setSpacerElement(ref: MaybeElementRef): void {
    st.spacer = resolveElement(ref);
    st.spacerGap = getRowGap(st.spacer?.parentElement ?? null);
  }
  function setPreserveScrollOnPrepend(value: boolean): void {
    st.preserveScrollOnPrepend = value;
  }

  // ── Prop reactivity + lifecycle ─────────────────────────────────────────
  watch(
    () => props.autoScroll ?? false,
    value => {
      st.autoScroll = value;
      if (value && st.mode === 'following-bottom' && st.itemCount > 0) {
        scrollToEnd({ behavior: 'auto' });
      } else {
        commitScrollState();
      }
    }
  );
  watch(
    () => props.scrollEdgeThreshold ?? SCROLL_EDGE_THRESHOLD,
    value => {
      st.scrollEdgeThreshold = value;
    }
  );
  watch(
    () => props.scrollMargin ?? SCROLL_MARGIN,
    value => {
      st.scrollMargin = value;
    }
  );
  watch(
    () => props.scrollPreviousItemPeek ?? SCROLL_PREVIOUS_ITEM_PEEK,
    value => {
      st.scrollPreviousItemPeek = value;
    }
  );
  watch(
    () => props.defaultScrollPosition ?? 'end',
    value => {
      st.defaultScrollPosition = value;
      st.defaultScrollPositionApplied = false;
      applyDefaultScrollPosition();
    }
  );

  onMounted(() => {
    // The content MutationObserver may have set itemCount before the viewport
    // was wired; now that the whole subtree is mounted, place the viewport.
    applyDefaultScrollPosition();
    if (st.autoScroll && st.mode === 'following-bottom' && st.itemCount > 0) {
      scrollToEnd({ behavior: 'auto' });
    } else {
      commitScrollState();
    }
    if (hasVisibilityListeners()) observeVisibility();
  });

  onBeforeUnmount(() => {
    if (st.stateFrame !== null) cancelAnimationFrame(st.stateFrame);
    if (st.visibilityFrame !== null) cancelAnimationFrame(st.visibilityFrame);
    if (st.pendingScrollFrame !== null) cancelAnimationFrame(st.pendingScrollFrame);
    if (st.autoscrollingTimeout !== null) {
      window.clearTimeout(st.autoscrollingTimeout);
    }
    st.visibilityObserver?.disconnect();
    st.visibilityObserver = null;
  });

  return {
    scrollToEnd,
    scrollToStart,
    scrollToMessage,
    scrollable: readonly(scrollable) as Readonly<
      ShallowRef<MessageScrollerScrollable>
    >,
    visibility: readonly(visibility) as Readonly<
      ShallowRef<MessageScrollerVisibilityState>
    >,
    handleContentChange,
    handleResize,
    syncAfterScroll,
    userScrollIntent,
    registerMessage,
    setRootElement,
    setViewportElement,
    setContentElement,
    setSpacerElement,
    setPreserveScrollOnPrepend,
    subscribeVisibility,
  };
}

const [useProvideMessageScroller, useInjectMessageScroller] =
  createInjectionState(createMessageScroller);

export { useProvideMessageScroller };

/** Internal: resolve the scroller context or throw for out-of-tree usage. */
export function useMessageScrollerContext(): MessageScrollerContext {
  const context = useInjectMessageScroller();
  if (!context) {
    throw new Error(
      'MessageScroller components must be used within <MessageScrollerProvider>.'
    );
  }
  return context;
}

/** Imperative scroll controls for the enclosing scroller. */
export function useMessageScroller(): Pick<
  MessageScrollerContext,
  'scrollToEnd' | 'scrollToStart' | 'scrollToMessage'
> {
  const { scrollToEnd, scrollToStart, scrollToMessage } =
    useMessageScrollerContext();
  return { scrollToEnd, scrollToStart, scrollToMessage };
}

/** Reactive `{ start, end }` describing whether either edge can be scrolled. */
export function useMessageScrollerScrollable(): Readonly<
  ShallowRef<MessageScrollerScrollable>
> {
  return useMessageScrollerContext().scrollable;
}

/** Reactive set of visible message ids + the current anchor (opt-in tracking). */
export function useMessageScrollerVisibility(): Readonly<
  ShallowRef<MessageScrollerVisibilityState>
> {
  const context = useMessageScrollerContext();
  const unsubscribe = context.subscribeVisibility();
  onScopeDispose(unsubscribe);
  return context.visibility;
}
