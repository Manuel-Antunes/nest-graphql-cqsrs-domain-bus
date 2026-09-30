<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'vuex';
import { useAlert } from 'dashboard/composables';
import { useBranding } from 'shared/composables/useBranding';
import { copyTextToClipboard } from 'shared/helpers/clipboard';
import WebhookForm from './WebhookForm.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Label } from 'dashboard/components-next/ui/label';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from 'dashboard/components-next/ui/dialog';

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  onClose: {
    type: Function,
    required: true,
  },
});

const emit = defineEmits(['close']);

const { t } = useI18n();
const store = useStore();
const { replaceInstallationName } = useBranding();

const createdWebhook = ref(null);

const uiFlags = computed(() => store.getters['webhooks/getUIFlags']);

const onSubmit = async webhook => {
  try {
    const result = await store.dispatch('webhooks/create', { webhook });
    createdWebhook.value = result;
  } catch (error) {
    const message =
      error.response.data.message ||
      t('INTEGRATION_SETTINGS.WEBHOOK.EDIT.API.ERROR_MESSAGE');
    useAlert(message);
  }
};

const handleCopySecret = async () => {
  await copyTextToClipboard(createdWebhook.value.secret);
  useAlert(t('INTEGRATION_SETTINGS.WEBHOOK.SECRET.COPY_SUCCESS'));
};
</script>

<template>
  <Dialog
    :open="open"
    @update:open="
      val => {
        if (!val) emit('close');
      }
    "
  >
    <DialogContent class="max-h-[90vh] overflow-y-auto">
      <template v-if="createdWebhook">
        <DialogHeader>
          <DialogTitle>
            {{ t('INTEGRATION_SETTINGS.WEBHOOK.ADD.API.SUCCESS_MESSAGE') }}
          </DialogTitle>
          <DialogDescription>
            {{ t('INTEGRATION_SETTINGS.WEBHOOK.SECRET.CREATED_DESC') }}
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-1">
          <Label>{{ t('INTEGRATION_SETTINGS.WEBHOOK.SECRET.LABEL') }}</Label>
          <div class="flex items-center gap-2">
            <Input
              :model-value="createdWebhook.secret"
              type="text"
              readonly
              class="font-mono"
            />
            <Button
              v-tooltip.top="t('INTEGRATION_SETTINGS.WEBHOOK.SECRET.COPY')"
              variant="outline"
              size="icon"
              class="flex-shrink-0"
              @click="handleCopySecret"
            >
              <Icon icon="i-lucide-copy" class="size-4" />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button @click="props.onClose()">
            {{ t('INTEGRATION_SETTINGS.WEBHOOK.SECRET.DONE') }}
          </Button>
        </DialogFooter>
      </template>
      <template v-else>
        <DialogHeader>
          <DialogTitle>
            {{ t('INTEGRATION_SETTINGS.WEBHOOK.ADD.TITLE') }}
          </DialogTitle>
          <DialogDescription>
            {{
              replaceInstallationName(
                t('INTEGRATION_SETTINGS.WEBHOOK.FORM.DESC')
              )
            }}
          </DialogDescription>
        </DialogHeader>
        <WebhookForm
          :is-submitting="uiFlags.creatingItem"
          :submit-label="t('INTEGRATION_SETTINGS.WEBHOOK.FORM.ADD_SUBMIT')"
          @submit="onSubmit"
          @cancel="props.onClose()"
        />
      </template>
    </DialogContent>
  </Dialog>
</template>
