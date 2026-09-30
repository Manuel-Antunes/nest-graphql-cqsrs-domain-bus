<script>
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

export default {
  components: {
    Button,
    Icon,
  },
  props: {
    totalLength: {
      type: Number,
      default: 0,
    },
    currentIndex: {
      type: Number,
      default: 0,
    },
  },
  emits: ['prev', 'next'],
  computed: {
    isUpDisabled() {
      return this.currentIndex === 1;
    },
    isDownDisabled() {
      return this.currentIndex === this.totalLength || this.totalLength <= 1;
    },
  },
  methods: {
    handleUpClick() {
      if (this.currentIndex > 1) {
        this.$emit('prev');
      }
    },
    handleDownClick() {
      if (this.currentIndex < this.totalLength) {
        this.$emit('next');
      }
    },
  },
};
</script>

<template>
  <div class="flex gap-2 items-center">
    <div class="flex gap-1 items-center">
      <Button
        variant="outline"
        size="icon"
        :disabled="isUpDisabled"
        @click="handleUpClick"
      >
        <Icon icon="i-lucide-chevron-up" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        :disabled="isDownDisabled"
        @click="handleDownClick"
      >
        <Icon icon="i-lucide-chevron-down" />
      </Button>
    </div>
    <div class="flex items-center gap-1 whitespace-nowrap">
      <span class="text-sm font-medium text-n-slate-12 tabular-nums">
        {{ totalLength <= 1 ? '1' : currentIndex }}
      </span>
      <span
        v-if="totalLength > 1"
        class="text-sm text-n-slate-9 relative -top-px"
      >
        /
      </span>
      <span v-if="totalLength > 1" class="text-sm text-n-slate-9 tabular-nums">
        {{ totalLength }}
      </span>
    </div>
  </div>
</template>
