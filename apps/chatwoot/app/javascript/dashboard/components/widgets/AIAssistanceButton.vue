<script>
import { ref } from 'vue';
import { mapGetters } from 'vuex';
import { useAdmin } from 'dashboard/composables/useAdmin';
import { useUISettings } from 'dashboard/composables/useUISettings';
import { useKeyboardEvents } from 'dashboard/composables/useKeyboardEvents';
import { useAI } from 'dashboard/composables/useAI';
import AICTAModal from './AICTAModal.vue';
import AIAssistanceModal from './AIAssistanceModal.vue';
import { CMD_AI_ASSIST } from 'dashboard/helper/commandbar/events';
import AIAssistanceCTAButton from './AIAssistanceCTAButton.vue';
import { emitter } from 'shared/helpers/mitt';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from 'next/ui/dialog';

export default {
  components: {
    Button,
    Icon,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    AIAssistanceModal,
    AICTAModal,
    AIAssistanceCTAButton,
  },
  emits: ['replaceText'],
  setup(props, { emit }) {
    const { uiSettings, updateUISettings } = useUISettings();

    const { isAIIntegrationEnabled, draftMessage, recordAnalytics } = useAI();

    const { isAdmin } = useAdmin();

    const initialMessage = ref('');

    const initializeMessage = draftMsg => {
      initialMessage.value = draftMsg;
    };
    const keyboardEvents = {
      '$mod+KeyZ': {
        action: () => {
          if (initialMessage.value) {
            emit('replaceText', initialMessage.value);
            initialMessage.value = '';
          }
        },
        allowOnFocusedInput: true,
      },
    };
    useKeyboardEvents(keyboardEvents);

    return {
      uiSettings,
      updateUISettings,
      isAdmin,
      initialMessage,
      initializeMessage,
      recordAnalytics,
      isAIIntegrationEnabled,
      draftMessage,
    };
  },
  data: () => ({
    showAIAssistanceModal: false,
    showAICtaModal: false,
    aiOption: '',
  }),
  computed: {
    ...mapGetters({
      isAChatwootInstance: 'globalConfig/isAChatwootInstance',
    }),
    isAICTAModalDismissed() {
      return this.uiSettings.is_open_ai_cta_modal_dismissed;
    },
    shouldShowAIAssistCTAButtonForAdmin() {
      return (
        this.isAdmin &&
        !this.isAIIntegrationEnabled &&
        !this.isAICTAModalDismissed &&
        this.isAChatwootInstance
      );
    },
    shouldShowAIAssistCTAButton() {
      return this.isAIIntegrationEnabled && !this.isAICTAModalDismissed;
    },
    aiAssistanceTitle() {
      const translationKey = this.aiOption?.toUpperCase();
      return translationKey
        ? this.$t('INTEGRATION_SETTINGS.OPEN_AI.WITH_AI', {
            option: this.$t(
              `INTEGRATION_SETTINGS.OPEN_AI.OPTIONS.${translationKey}`
            ),
          })
        : '';
    },
  },

  mounted() {
    emitter.on(CMD_AI_ASSIST, this.onAIAssist);
    this.initializeMessage(this.draftMessage);
  },

  methods: {
    hideAIAssistanceModal() {
      this.recordAnalytics('DISMISS_AI_SUGGESTION', {
        aiOption: this.aiOption,
      });
      this.showAIAssistanceModal = false;
    },
    openAIAssist() {
      if (!this.isAICTAModalDismissed) {
        this.updateUISettings({
          is_open_ai_cta_modal_dismissed: true,
        });
      }
      this.initializeMessage(this.draftMessage);
      const ninja = document.querySelector('ninja-keys');
      ninja.open({ parent: 'ai_assist' });
    },
    hideAICtaModal() {
      this.showAICtaModal = false;
    },
    openAICta() {
      this.showAICtaModal = true;
    },
    onAIAssist(option) {
      this.aiOption = option;
      this.showAIAssistanceModal = true;
    },
    insertText(message) {
      this.$emit('replaceText', message);
    },
  },
};
</script>

<template>
  <div>
    <div v-if="isAIIntegrationEnabled" class="relative">
      <AIAssistanceCTAButton
        v-if="shouldShowAIAssistCTAButton"
        @open="openAIAssist"
      />
      <Button
        v-else
        v-tooltip.top-end="$t('INTEGRATION_SETTINGS.OPEN_AI.AI_ASSIST')"
        variant="outline"
        size="icon"
        @click="openAIAssist"
      >
        <Icon icon="i-ph-magic-wand" />
      </Button>
      <Dialog
        :open="showAIAssistanceModal"
        @update:open="
          val => {
            if (!val) hideAIAssistanceModal();
          }
        "
      >
        <DialogContent class="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{{ aiAssistanceTitle }}</DialogTitle>
          </DialogHeader>
          <AIAssistanceModal
            :ai-option="aiOption"
            @apply-text="insertText"
            @close="hideAIAssistanceModal"
          />
        </DialogContent>
      </Dialog>
    </div>
    <div v-else-if="shouldShowAIAssistCTAButtonForAdmin" class="relative">
      <AIAssistanceCTAButton @click="openAICta" />
      <Dialog
        :open="showAICtaModal"
        @update:open="
          val => {
            if (!val) hideAICtaModal();
          }
        "
      >
        <DialogContent class="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {{ $t('INTEGRATION_SETTINGS.OPEN_AI.CTA_MODAL.TITLE') }}
            </DialogTitle>
          </DialogHeader>
          <AICTAModal @close="hideAICtaModal" />
        </DialogContent>
      </Dialog>
    </div>
  </div>
</template>
