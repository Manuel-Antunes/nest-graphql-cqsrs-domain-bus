<script>
import { mapGetters } from 'vuex';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from 'dashboard/components-next/ui/empty';

export default {
  components: {
    Spinner,
    Empty,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
  },
  props: {
    emptyStateMessage: {
      type: String,
      default: '',
    },
  },
  computed: {
    ...mapGetters({
      uiFlags: 'notifications/getUIFlags',
    }),
    emptyMessage() {
      if (this.emptyStateMessage) {
        return this.emptyStateMessage;
      }
      return this.$t('INBOX.LIST.NOTE');
    },
  },
};
</script>

<template>
  <div
    class="items-center justify-center hidden w-full h-full text-center bg-n-surface-1 lg:flex"
  >
    <div v-if="uiFlags.isFetching" class="flex justify-center my-4">
      <Spinner class="text-n-brand size-6" />
    </div>
    <Empty v-else>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <span class="i-lucide-inbox size-6" />
        </EmptyMedia>
        <EmptyTitle>{{ emptyMessage }}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  </div>
</template>
