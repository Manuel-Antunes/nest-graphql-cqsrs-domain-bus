<script>
import Spinner from 'shared/components/Spinner.vue';
import FluentIcon from 'shared/components/FluentIcon/Index.vue';
import { Button } from 'dashboard/components-next/ui/button';

export default {
  components: {
    FluentIcon,
    Spinner,
    Button,
  },
  props: {
    loading: {
      type: Boolean,
      default: false,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    color: {
      type: String,
      default: '#6e6f73',
    },
  },
};
</script>

<template>
  <Button
    type="submit"
    variant="ghost"
    size="icon"
    class="size-8"
    :disabled="disabled"
  >
    <FluentIcon v-if="!loading" icon="send" :style="`color: ${color}`" />
    <Spinner v-else size="small" />
  </Button>
</template>
