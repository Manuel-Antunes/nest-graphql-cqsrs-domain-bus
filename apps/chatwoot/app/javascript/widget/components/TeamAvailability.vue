<script setup>
import { IFrameHelper } from 'widget/helpers/utils';
import { CHATWOOT_ON_START_CONVERSATION } from '../constants/sdkEvents';
import AvailabilityContainer from 'widget/components/Availability/AvailabilityContainer.vue';
import { useMapGetter } from 'dashboard/composables/store.js';
import { Button } from 'dashboard/components-next/ui/button';

const props = defineProps({
  availableAgents: { type: Array, default: () => [] },
  hasConversation: { type: Boolean, default: false },
});

const emit = defineEmits(['startConversation']);

const widgetColor = useMapGetter('appConfig/getWidgetColor');

const startConversation = () => {
  emit('startConversation');
  if (!props.hasConversation) {
    IFrameHelper.sendMessage({
      event: 'onEvent',
      eventIdentifier: CHATWOOT_ON_START_CONVERSATION,
      data: { hasConversation: false },
    });
  }
};
</script>

<template>
  <div
    class="flex flex-col gap-3 w-full shadow outline-1 outline outline-n-container rounded-xl bg-n-background dark:bg-n-solid-2 px-5 py-4"
  >
    <AvailabilityContainer :agents="availableAgents" show-header show-avatars />
    <Button
      variant="link"
      class="justify-start px-0 self-start"
      @click="startConversation"
    >
      <span>
        {{
          hasConversation
            ? $t('CONTINUE_CONVERSATION')
            : $t('START_CONVERSATION')
        }}
      </span>
      <i class="i-lucide-chevron-right size-5 mt-px" />
    </Button>
  </div>
</template>
