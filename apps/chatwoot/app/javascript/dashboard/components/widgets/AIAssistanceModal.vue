<script>
import { useMessageFormatter } from 'shared/composables/useMessageFormatter';
import { useAI } from 'dashboard/composables/useAI';
import AILoader from './AILoader.vue';
import { Button } from 'dashboard/components-next/ui/button';

export default {
  components: {
    AILoader,
    Button,
  },
  props: {
    aiOption: {
      type: String,
      required: true,
    },
  },
  emits: ['close', 'applyText'],
  setup() {
    const { formatMessage } = useMessageFormatter();
    const { draftMessage, processEvent, recordAnalytics } = useAI();
    return { draftMessage, processEvent, recordAnalytics, formatMessage };
  },
  data() {
    return {
      generatedContent: '',
      isGenerating: true,
    };
  },
  mounted() {
    this.generateAIContent(this.aiOption);
  },

  methods: {
    onClose() {
      this.$emit('close');
    },

    async generateAIContent(type = 'rephrase') {
      this.isGenerating = true;
      this.generatedContent = await this.processEvent(type);
      this.isGenerating = false;
    },
    applyText() {
      this.recordAnalytics(this.aiOption);
      this.$emit('applyText', this.generatedContent);
      this.onClose();
    },
  },
};
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="applyText">
    <div v-if="draftMessage">
      <h4 class="mt-1 text-base text-n-slate-12">
        {{ $t('INTEGRATION_SETTINGS.OPEN_AI.ASSISTANCE_MODAL.DRAFT_TITLE') }}
      </h4>
      <p v-dompurify-html="formatMessage(draftMessage, false)" />
      <h4 class="mt-1 text-base text-n-slate-12">
        {{
          $t('INTEGRATION_SETTINGS.OPEN_AI.ASSISTANCE_MODAL.GENERATED_TITLE')
        }}
      </h4>
    </div>
    <div>
      <AILoader v-if="isGenerating" />
      <p v-else v-dompurify-html="formatMessage(generatedContent, false)" />
    </div>
    <div class="flex flex-row justify-end gap-2">
      <Button variant="outline" type="reset" @click.prevent="onClose">
        {{ $t('INTEGRATION_SETTINGS.OPEN_AI.ASSISTANCE_MODAL.BUTTONS.CANCEL') }}
      </Button>
      <Button type="submit" :disabled="!generatedContent">
        {{ $t('INTEGRATION_SETTINGS.OPEN_AI.ASSISTANCE_MODAL.BUTTONS.APPLY') }}
      </Button>
    </div>
  </form>
</template>
