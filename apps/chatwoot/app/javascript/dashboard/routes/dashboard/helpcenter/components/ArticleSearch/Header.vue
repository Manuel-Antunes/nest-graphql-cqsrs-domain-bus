<script setup>
import { ref, onMounted } from 'vue';
import { useKeyboardEvents } from 'dashboard/composables/useKeyboardEvents';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';

defineProps({
  title: {
    type: String,
    default: 'Chatwoot',
  },
});

const emit = defineEmits(['search', 'close']);

const searchInputRef = ref(null);
const searchQuery = ref('');

onMounted(() => {
  searchInputRef.value.focus();
});

const onInput = e => {
  emit('search', e.target.value);
};

const onClose = () => {
  emit('close');
};

const keyboardEvents = {
  Slash: {
    action: e => {
      e.preventDefault();
      searchInputRef.value?.$el?.focus();
    },
  },
  Escape: {
    action: () => {
      onClose();
    },
    allowOnFocusedInput: true,
  },
};
useKeyboardEvents(keyboardEvents);
</script>

<template>
  <div class="flex flex-col py-1">
    <div class="flex items-center justify-between py-2 mb-1">
      <h3 class="text-base text-n-slate-12">
        {{ title }}
      </h3>
      <Button variant="ghost" size="icon" @click="onClose">
        <Icon icon="i-lucide-x" />
      </Button>
    </div>

    <InputGroup>
      <InputGroupAddon>
        <Icon icon="i-lucide-search" class="size-4 text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput
        ref="searchInputRef"
        type="text"
        :placeholder="$t('HELP_CENTER.ARTICLE_SEARCH.PLACEHOLDER')"
        :value="searchQuery"
        @input="onInput"
      />
    </InputGroup>
  </div>
</template>
