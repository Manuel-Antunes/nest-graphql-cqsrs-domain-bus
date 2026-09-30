<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import {
  appendSignature,
  removeSignature,
  extractTextFromMarkdown,
} from 'dashboard/helper/editorHelper';
import { createTypingIndicator } from '@chatwoot/utils';

const TYPING_INDICATOR_IDLE_TIME = 4000;

const props = withDefaults(
  defineProps<{
    placeholder?: string;
    modelValue?: string;
    minHeight?: number;
    signature?: string;
    rows?: number;
    // add this as a prop, so that we won't have to add useUISettings
    sendWithSignature?: boolean;
    // allowSignature is a kill switch, ensuring no signature methods are
    // triggered except when this flag is true
    allowSignature?: boolean;
  }>(),
  {
    placeholder: '',
    modelValue: '',
    minHeight: 2,
    signature: '',
    rows: 2,
    sendWithSignature: false,
    allowSignature: false,
  }
);

const emit = defineEmits<{
  (e: 'typingOn'): void;
  (e: 'typingOff'): void;
  (e: 'update:modelValue', value: string): void;
  (e: 'input', value: string): void;
  (e: 'blur'): void;
  (e: 'focus'): void;
}>();

// The root element IS the textarea, so this single ref serves both the former
// `this.$el` and `this.$refs.textarea`.
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const typingIndicator = createTypingIndicator(
  () => emit('typingOn'),
  () => emit('typingOff'),
  TYPING_INDICATOR_IDLE_TIME
);

// clean the signature, this will ensure that we don't have any markdown
// formatted text in the signature
const cleanedSignature = computed(() => extractTextFromMarkdown(props.signature));

const resizeTextarea = () => {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  if (!props.modelValue) {
    el.style.height = `${props.minHeight}rem`;
  } else {
    el.style.height = `${el.scrollHeight}px`;
  }
};

const setCursor = () => {
  const bodyWithoutSignature = removeSignature(
    props.modelValue,
    cleanedSignature.value,
    ''
  );

  // only trim at end, so if there are spaces at the start, those are not removed
  const bodyEndsAt = bodyWithoutSignature.trimEnd().length;
  const textarea = textareaRef.value;

  if (textarea) {
    textarea.focus();
    textarea.setSelectionRange(bodyEndsAt, bodyEndsAt);
  }
};

const focus = () => {
  textareaRef.value?.focus();
};

// The toggleSignatureInEditor gets the new value from the watcher, this means
// that if the value is true, the signature is supposed to be added, else we
// remove it.
const toggleSignatureInEditor = (signatureEnabled: boolean) => {
  let valueWithSignature = signatureEnabled
    ? appendSignature(props.modelValue, cleanedSignature.value, '')
    : removeSignature(props.modelValue, cleanedSignature.value, '');

  // Clean up whitespace when removing signature from empty body
  if (!signatureEnabled && !valueWithSignature.trim()) {
    valueWithSignature = '';
  }

  emit('update:modelValue', valueWithSignature);
  emit('input', valueWithSignature);

  nextTick(() => {
    resizeTextarea();
    setCursor();
  });
};

const onInput = (event: Event) => {
  const { value } = event.target as HTMLTextAreaElement;
  emit('update:modelValue', value);
  emit('input', value);
  resizeTextarea();
};

const onKeyup = () => {
  typingIndicator.start();
};

const onBlur = () => {
  typingIndicator.stop();
  emit('blur');
};

const onFocus = () => {
  emit('focus');
};

watch(
  () => props.modelValue,
  () => {
    resizeTextarea();
    // 🚨 watch triggers every time the value is changed, we cannot set this to
    // focus then. When this runs, it sets the cursor to the end of the body,
    // ignoring the signature. Suppose if someone manually set the cursor to the
    // middle of the body and starts typing, the cursor will be set to the end of
    // the body. A surprise cursor jump? Definitely not user-friendly.
    if (document.activeElement !== textareaRef.value) {
      nextTick(() => {
        setCursor();
      });
    }
  }
);

watch(
  () => props.sendWithSignature,
  newValue => {
    if (props.allowSignature) {
      toggleSignatureInEditor(newValue);
    }
  }
);

onMounted(() => {
  nextTick(() => {
    if (props.modelValue) {
      resizeTextarea();
      setCursor();
    } else {
      focus();
    }
  });
});

defineExpose({ focus });
</script>

<template>
  <textarea
    ref="textareaRef"
    :placeholder="placeholder"
    :rows="rows"
    :value="modelValue"
    @input="onInput"
    @focus="onFocus"
    @keyup="onKeyup"
    @blur="onBlur"
  />
</template>
