<script setup>
import { ref, defineComponent, h } from 'vue';
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
} from './index';

// ── Shared dummy message state ──────────────────────────────────────────────
let seq = 0;
const makeMsg = (label, anchor = false) => ({
  id: `m${(seq += 1)}`,
  label,
  anchor,
  // vary height so scrolling behaviour is realistic
  lines: 1 + (seq % 4),
});

const build = (n = 24) =>
  Array.from({ length: n }, (_, i) => makeMsg(`Message ${i + 1}`, i % 6 === 0));

const messages = ref(build());

const appendOne = () =>
  messages.value.push(makeMsg(`Appended ${messages.value.length + 1}`, true));
const appendThree = () => {
  for (let i = 0; i < 3; i += 1) appendOne();
};
const prependFive = () => {
  const older = Array.from({ length: 5 }, (_, i) =>
    makeMsg(`Older ${i + 1}`, i === 0)
  );
  messages.value.unshift(...older);
};
const reset = () => {
  seq = 0;
  messages.value = build();
};

// Controls that need the scroller context (must live INSIDE the Provider).
const ScrollerControls = defineComponent({
  name: 'ScrollerControls',
  setup() {
    const { scrollToEnd, scrollToStart, scrollToMessage } = useMessageScroller();
    const btn = (onClick, text) =>
      h(
        'button',
        {
          class:
            'rounded-md border border-n-weak px-2 py-1 text-xs hover:bg-n-alpha-1',
          onClick,
        },
        text
      );
    return () =>
      h('div', { class: 'flex flex-wrap gap-2' }, [
        btn(() => scrollToStart({ behavior: 'smooth' }), 'scrollToStart'),
        btn(() => scrollToEnd({ behavior: 'smooth' }), 'scrollToEnd'),
        btn(() => scrollToMessage('m10', { behavior: 'smooth' }), 'scrollToMessage(m10)'),
      ]);
  },
});
</script>

<template>
  <Story title="UI/MessageScroller" :layout="{ type: 'single', iframe: false }">
    <Variant title="Autoscroll (following bottom)">
      <div class="flex w-[600px] flex-col gap-3 p-4">
        <div class="flex flex-wrap gap-2">
          <button class="rounded-md border border-n-weak px-2 py-1 text-xs hover:bg-n-alpha-1" @click="appendOne">Append 1</button>
          <button class="rounded-md border border-n-weak px-2 py-1 text-xs hover:bg-n-alpha-1" @click="appendThree">Append 3 (stream)</button>
          <button class="rounded-md border border-n-weak px-2 py-1 text-xs hover:bg-n-alpha-1" @click="prependFive">Prepend 5 (older)</button>
          <button class="rounded-md border border-n-weak px-2 py-1 text-xs hover:bg-n-alpha-1" @click="reset">Reset</button>
        </div>
        <MessageScrollerProvider :auto-scroll="true" default-scroll-position="end">
          <ScrollerControls />
          <MessageScroller class="h-[440px] rounded-xl border border-n-weak bg-n-solid-1">
            <MessageScrollerViewport class="p-3">
              <MessageScrollerContent class="gap-3">
                <MessageScrollerItem
                  v-for="m in messages"
                  :key="m.id"
                  :message-id="m.id"
                  :scroll-anchor="m.anchor"
                >
                  <div
                    class="rounded-lg border border-n-weak px-3 py-3"
                    :class="m.anchor ? 'bg-n-brand/10' : 'bg-n-alpha-1'"
                  >
                    <p class="text-sm font-medium">
                      {{ m.label }} <span v-if="m.anchor">⚓ (anchor)</span>
                    </p>
                    <p v-for="l in m.lines" :key="l" class="text-xs text-n-slate-11">
                      lorem ipsum dolor sit amet line {{ l }}
                    </p>
                  </div>
                </MessageScrollerItem>
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton direction="end" />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
    </Variant>

    <Variant title="Free scrolling (no autoscroll)">
      <div class="flex w-[600px] flex-col gap-3 p-4">
        <MessageScrollerProvider :auto-scroll="false" default-scroll-position="start">
          <MessageScroller class="h-[440px] rounded-xl border border-n-weak bg-n-solid-1">
            <MessageScrollerViewport class="p-3">
              <MessageScrollerContent class="gap-3">
                <MessageScrollerItem
                  v-for="m in messages"
                  :key="m.id"
                  :message-id="m.id"
                >
                  <div class="rounded-lg border border-n-weak bg-n-alpha-1 px-3 py-3">
                    <p class="text-sm font-medium">{{ m.label }}</p>
                  </div>
                </MessageScrollerItem>
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton direction="start" />
            <MessageScrollerButton direction="end" />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
    </Variant>
  </Story>
</template>
