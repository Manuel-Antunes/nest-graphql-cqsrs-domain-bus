<script>
import FluentIcon from 'shared/components/FluentIcon/Index.vue';
import { Button } from 'dashboard/components-next/ui/button';

export default {
  name: 'MessageReplyButton',
  components: { FluentIcon, Button },
};
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    class="mb-1 size-auto rounded-full p-1 text-n-slate-11 bg-n-slate-3 hover:bg-n-slate-3 hover:text-n-slate-12"
  >
    <FluentIcon icon="arrow-reply" size="11" class="flex-shrink-0" />
  </Button>
</template>
