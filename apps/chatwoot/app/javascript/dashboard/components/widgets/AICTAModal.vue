<script>
import { useVuelidate } from '@vuelidate/core';
import { required } from '@vuelidate/validators';
import { useAlert } from 'dashboard/composables';
import { useUISettings } from 'dashboard/composables/useUISettings';
import { useAI } from 'dashboard/composables/useAI';
import { OPEN_AI_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';

import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';

export default {
  components: {
    Button,
    Input,
  },
  emits: ['close'],

  setup() {
    const { updateUISettings } = useUISettings();
    const { recordAnalytics } = useAI();
    const v$ = useVuelidate();

    return { updateUISettings, v$, recordAnalytics };
  },
  data() {
    return {
      value: '',
    };
  },
  validations: {
    value: {
      required,
    },
  },
  methods: {
    onClose() {
      this.$emit('close');
    },

    onDismiss() {
      useAlert(
        this.$t('INTEGRATION_SETTINGS.OPEN_AI.CTA_MODAL.DISMISS_MESSAGE')
      );
      this.updateUISettings({
        is_open_ai_cta_modal_dismissed: true,
      });
      this.onClose();
    },

    async finishOpenAI() {
      const payload = {
        app_id: 'openai',
        settings: {
          api_key: this.value,
        },
      };
      try {
        await this.$store.dispatch('integrations/createHook', payload);
        this.alertMessage = this.$t(
          'INTEGRATION_SETTINGS.OPEN_AI.CTA_MODAL.SUCCESS_MESSAGE'
        );
        this.recordAnalytics(
          OPEN_AI_EVENTS.ADDED_AI_INTEGRATION_VIA_CTA_BUTTON
        );
        this.onClose();
      } catch (error) {
        const errorMessage = error?.response?.data?.message;
        this.alertMessage =
          errorMessage || this.$t('INTEGRATION_APPS.ADD.API.ERROR_MESSAGE');
      } finally {
        useAlert(this.alertMessage);
      }
    },
    openOpenAIDoc() {
      window.open('https://www.chatwoot.com/blog/v2-17', '_blank');
    },
  },
};
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="finishOpenAI">
    <p class="text-sm text-muted-foreground">
      {{ $t('INTEGRATION_SETTINGS.OPEN_AI.CTA_MODAL.DESC') }}
    </p>
    <Input
      v-model="value"
      type="text"
      :placeholder="$t('INTEGRATION_SETTINGS.OPEN_AI.CTA_MODAL.KEY_PLACEHOLDER')"
      @blur="v$.value.$touch"
    />
    <div class="flex flex-row justify-between gap-2">
      <Button variant="ghost" type="button" @click.prevent="openOpenAIDoc">
        {{ $t('INTEGRATION_SETTINGS.OPEN_AI.CTA_MODAL.BUTTONS.NEED_HELP') }}
      </Button>
      <div class="flex items-center gap-1">
        <Button variant="outline" type="reset" @click.prevent="onDismiss">
          {{ $t('INTEGRATION_SETTINGS.OPEN_AI.CTA_MODAL.BUTTONS.DISMISS') }}
        </Button>
        <Button type="submit" :disabled="v$.value.$invalid">
          {{ $t('INTEGRATION_SETTINGS.OPEN_AI.CTA_MODAL.BUTTONS.FINISH') }}
        </Button>
      </div>
    </div>
  </form>
</template>
