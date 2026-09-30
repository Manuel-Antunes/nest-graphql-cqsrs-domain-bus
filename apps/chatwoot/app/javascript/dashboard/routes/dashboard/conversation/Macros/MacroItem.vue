<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useStore } from 'dashboard/composables/store';
import { CONVERSATION_EVENTS } from '../../../../helper/AnalyticsHelper/events';
import { useTrack } from 'dashboard/composables';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import MacroPreview from './MacroPreview.vue';

const props = defineProps({
  macro: {
    type: Object,
    required: true,
  },
  conversationId: {
    type: [Number, String],
    required: true,
  },
});

const store = useStore();
const { t } = useI18n();

const isExecuting = ref(false);
const showPreview = ref(false);

const executeMacro = async macro => {
  try {
    isExecuting.value = true;
    await store.dispatch('macros/execute', {
      macroId: macro.id,
      conversationIds: [props.conversationId],
    });
    useTrack(CONVERSATION_EVENTS.EXECUTED_A_MACRO);
    useAlert(t('MACROS.EXECUTE.EXECUTED_SUCCESSFULLY'));
  } catch (error) {
    useAlert(t('MACROS.ERROR'));
  } finally {
    isExecuting.value = false;
  }
};

const toggleMacroPreview = () => {
  showPreview.value = !showPreview.value;
};

const closeMacroPreview = () => {
  showPreview.value = false;
};
</script>

<template>
  <div
    class="relative flex items-center justify-between leading-4 rounded-md h-10 pl-3 pr-2"
    :class="showPreview ? 'cursor-default' : 'drag-handle cursor-grab'"
  >
    <span
      class="overflow-hidden whitespace-nowrap text-ellipsis font-medium text-n-slate-12"
    >
      {{ macro.name }}
    </span>
    <div class="flex items-center gap-1 justify-end">
      <Button
        v-tooltip.left-start="$t('MACROS.EXECUTE.PREVIEW')"
        variant="outline"
        size="icon"
        @click="toggleMacroPreview"
      >
        <Icon icon="i-lucide-info" />
      </Button>
      <Button
        v-tooltip.left-start="$t('MACROS.EXECUTE.BUTTON_TOOLTIP')"
        variant="outline"
        size="icon"
        :disabled="isExecuting"
        @click="executeMacro(macro)"
      >
        <Spinner v-if="isExecuting" class="size-4 flex-shrink-0" />
        <template v-if="!isExecuting">
          <Icon icon="i-lucide-play" />
        </template>
      </Button>
    </div>
    <transition name="menu-slide">
      <MacroPreview
        v-if="showPreview"
        v-on-clickaway="closeMacroPreview"
        :macro="macro"
      />
    </transition>
  </div>
</template>
