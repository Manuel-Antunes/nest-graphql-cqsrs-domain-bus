<script>
import SLAPopoverCard from 'dashboard/components/widgets/conversation/components/SLAPopoverCard.vue';
import { Button } from 'dashboard/components-next/ui/button';

export default {
  components: {
    SLAPopoverCard,
    Button,
  },
  props: {
    slaEvents: {
      type: Array,
      default: () => [],
    },
  },

  data() {
    return {
      showSlaPopoverCard: false,
    };
  },

  methods: {
    closeSlaEvents() {
      this.showSlaPopoverCard = false;
    },
    openSlaEvents() {
      this.showSlaPopoverCard = !this.showSlaPopoverCard;
    },
  },
};
</script>

<template>
  <div
    v-on-clickaway="closeSlaEvents"
    class="flex items-center col-span-2 text-n-slate-11 justify-end"
  >
    <div class="relative">
      <Button
        variant="link"
        type="button"
        @click="openSlaEvents"
      >{{ $t('SLA_REPORTS.TABLE.VIEW_DETAILS') }}</Button>
      <SLAPopoverCard
        v-if="showSlaPopoverCard"
        :sla-missed-events="slaEvents"
        class="right-0"
      />
    </div>
  </div>
</template>
