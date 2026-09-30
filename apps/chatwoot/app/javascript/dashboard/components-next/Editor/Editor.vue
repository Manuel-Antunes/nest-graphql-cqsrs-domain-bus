<script setup>
import { computed, watch, useSlots } from 'vue';

import WootEditor from 'dashboard/components/widgets/WootWriter/Editor.vue';
import { Label } from 'next/ui/label';
import { InputGroup, InputGroupAddon } from 'next/ui/input-group';

const props = defineProps({
  modelValue: { type: String, default: '' },
  editorKey: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  focusOnMount: { type: Boolean, default: false },
  maxLength: { type: Number, default: 200 },
  showCharacterCount: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  message: { type: String, default: '' },
  messageType: {
    type: String,
    default: 'info',
    validator: value => ['info', 'error', 'success'].includes(value),
  },
  enableVariables: { type: Boolean, default: false },
  enableCannedResponses: { type: Boolean, default: true },
  enableCaptainTools: { type: Boolean, default: false },
  signature: { type: String, default: '' },
  allowSignature: { type: Boolean, default: false },
  sendWithSignature: { type: Boolean, default: false },
  channelType: { type: String, default: '' },
  medium: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue', 'executeCopilotAction']);

const slots = useSlots();

const characterCount = computed(() => props.modelValue?.length ?? 0);

const messageClass = computed(() => {
  switch (props.messageType) {
    case 'error':
      return 'text-n-ruby-9 dark:text-n-ruby-9';
    case 'success':
      return 'text-n-teal-10 dark:text-n-teal-10';
    default:
      return 'text-n-slate-11 dark:text-n-slate-11';
  }
});

// Container styling is layered on top of the shadcn InputGroup base (border,
// radius, layout). Focus is handled by CSS :focus-within instead of tracking
// focus in JS, and the border colours use our design tokens.
const containerClass = computed(() => [
  'editor-wrapper h-auto flex-col items-stretch gap-2 rounded-lg p-2 bg-n-alpha-black2 transition-all duration-500 ease-in-out focus-within:ring-0',
  props.disabled && 'cursor-not-allowed opacity-50 pointer-events-none',
  props.messageType === 'error'
    ? 'border-n-ruby-8 dark:border-n-ruby-8 hover:border-n-ruby-9 dark:hover:border-n-ruby-9 focus-within:border-n-ruby-9 dark:focus-within:border-n-ruby-9'
    : 'border-n-weak dark:border-n-weak hover:border-n-slate-6 dark:hover:border-n-slate-6 focus-within:border-n-brand dark:focus-within:border-n-brand',
]);

const handleInput = value => {
  if (!props.disabled) {
    emit('update:modelValue', value);
  }
};

watch(
  () => props.modelValue,
  newValue => {
    if (props.maxLength && props.showCharacterCount && !slots.actions) {
      if (characterCount.value >= props.maxLength) {
        emit('update:modelValue', newValue.slice(0, props.maxLength));
      }
    }
  }
);
</script>

<template>
  <div class="flex flex-col min-w-0 gap-1">
    <Label v-if="label">
      {{ label }}
    </Label>

    <InputGroup :class="containerClass">
      <WootEditor
        :editor-id="editorKey"
        :model-value="modelValue"
        :placeholder="placeholder"
        :focus-on-mount="focusOnMount"
        :disabled="disabled"
        :enable-variables="enableVariables"
        :enable-canned-responses="enableCannedResponses"
        :enable-captain-tools="enableCaptainTools"
        :signature="signature"
        :allow-signature="allowSignature"
        :send-with-signature="sendWithSignature"
        :channel-type="channelType"
        :medium="medium"
        @input="handleInput"
        @execute-copilot-action="
          (...args) => emit('executeCopilotAction', ...args)
        "
      />
      <InputGroupAddon
        v-if="showCharacterCount || slots.actions"
        align="block-end"
        class="justify-end p-0"
      >
        <span
          v-if="showCharacterCount && !slots.actions"
          class="text-xs tabular-nums text-n-slate-10"
        >
          {{ characterCount }} / {{ maxLength }}
        </span>
        <slot v-else name="actions" />
      </InputGroupAddon>
    </InputGroup>
    <p
      v-if="message"
      class="min-w-0 mt-1 mb-0 text-xs truncate transition-all duration-500 ease-in-out"
      :class="messageClass"
    >
      {{ message }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.editor-wrapper {
  :deep(.ProseMirror-menubar-wrapper) {
    @apply min-w-0 max-w-full;

    .ProseMirror.ProseMirror-woot-style {
      @apply min-w-0 break-words;

      // Long unbroken tokens (URLs, etc.) must wrap instead of widening
      // the editor and overflowing the layout.
      overflow-wrap: anywhere;

      p {
        @apply first:mt-0! break-words;
      }

      .empty-node {
        @apply m-0!;

        &::before {
          // dark variant was redundant (same colour); kept variant-free so
          // @apply doesn't emit nested rules inside a ::before pseudo-element.
          @apply text-n-slate-11;
        }
      }
    }

    .ProseMirror-menubar {
      width: fit-content !important;
      position: relative !important;
      top: unset !important;
      @apply ltr:left-[-0.188rem]! rtl:right-[-0.188rem]!;
    }
  }
}
</style>
