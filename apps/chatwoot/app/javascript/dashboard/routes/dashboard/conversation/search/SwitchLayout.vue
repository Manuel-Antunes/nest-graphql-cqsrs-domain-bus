<script>
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

export default {
  components: {
    Button,
    Icon,
  },
  props: {
    isOnExpandedLayout: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['toggle'],
  methods: {
    toggle() {
      this.$emit('toggle');
    },
  },
};
</script>

<template>
  <Button
    v-tooltip.left="$t('CONVERSATION.SWITCH_VIEW_LAYOUT')"
    variant="ghost"
    size="icon"
    @click="toggle"
  >
    <Icon
      :icon="
        isOnExpandedLayout
          ? 'i-lucide-arrow-left-to-line'
          : 'i-lucide-arrow-right-to-line'
      "
    />
  </Button>
</template>
