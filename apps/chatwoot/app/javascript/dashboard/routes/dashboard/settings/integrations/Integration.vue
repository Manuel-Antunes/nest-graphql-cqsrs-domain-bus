<script setup>
import { ref, computed } from 'vue';
import { useStore } from 'vuex';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import AppLink from 'dashboard/components-next/AppLink.vue';
import { useI18n } from 'vue-i18n';
import { frontendURL } from '../../../../helper/URLHelper';
import { useAlert } from 'dashboard/composables';
import { useBranding } from 'shared/composables/useBranding';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';
import { Button } from 'dashboard/components-next/ui/button';

const props = defineProps({
  integrationId: {
    type: [String, Number],
    required: true,
  },
  integrationName: { type: String, default: '' },
  integrationDescription: { type: String, default: '' },
  integrationEnabled: { type: Boolean, default: false },
  integrationAction: { type: String, default: '' },
  actionButtonText: { type: String, default: '' },
  deleteConfirmationText: { type: Object, default: () => ({}) },
});

const { t } = useI18n();
const store = useStore();
const { visit } = useAppNavigation();
const { replaceInstallationName } = useBranding();

const isOpen = ref(false);

const accountId = computed(() => store.getters.getCurrentAccountId);

const openDeletePopup = () => {
  isOpen.value = true;
};

const closeDeletePopup = () => {
  isOpen.value = false;
};

const deleteIntegration = async () => {
  try {
    await store.dispatch('integrations/deleteIntegration', props.integrationId);
    useAlert(t('INTEGRATION_SETTINGS.DELETE.API.SUCCESS_MESSAGE'));
  } catch (error) {
    useAlert(t('INTEGRATION_SETTINGS.WEBHOOK.DELETE.API.ERROR_MESSAGE'));
  }
};

const confirmDeletion = () => {
  closeDeletePopup();
  deleteIntegration();
  visit({ name: 'settings_applications' });
};
</script>

<template>
  <div
    class="flex flex-col items-start justify-between lg:flex-row lg:items-center p-6 outline outline-n-container outline-1 bg-n-card rounded-xl gap-6"
  >
    <div
      class="flex items-start lg:items-center justify-start flex-1 m-0 gap-6 flex-col lg:flex-row"
    >
      <div class="flex h-16 w-16 items-center justify-center flex-shrink-0">
        <img
          :src="`/dashboard/images/integrations/${integrationId}.png`"
          class="max-w-full rounded-md border border-n-weak shadow-sm block dark:hidden bg-n-alpha-3 dark:bg-n-alpha-2"
        />
        <img
          :src="`/dashboard/images/integrations/${integrationId}-dark.png`"
          class="max-w-full rounded-md border border-n-weak shadow-sm hidden dark:block bg-n-alpha-3 dark:bg-n-alpha-2"
        />
      </div>
      <div>
        <h3 class="mb-1 text-heading-1 text-n-slate-12">
          {{ integrationName }}
        </h3>
        <p class="text-n-slate-11 text-body-main">
          {{ replaceInstallationName(integrationDescription) }}
        </p>
      </div>
    </div>
    <div class="flex justify-center items-center mb-0">
      <AppLink
        :to="
          frontendURL(
            `accounts/${accountId}/settings/integrations/` + integrationId
          )
        "
      >
        <div v-if="integrationEnabled">
          <div v-if="integrationAction === 'disconnect'">
            <Button variant="destructive" @click="openDeletePopup">
              {{
                actionButtonText ||
                $t('INTEGRATION_SETTINGS.WEBHOOK.DELETE.BUTTON_TEXT')
              }}
            </Button>
          </div>
          <div v-else>
            <Button>{{ t('INTEGRATION_SETTINGS.WEBHOOK.CONFIGURE') }}</Button>
          </div>
        </div>
      </AppLink>
      <div v-if="!integrationEnabled">
        <slot name="action">
          <a :href="integrationAction">
            <Button>{{ t('INTEGRATION_SETTINGS.CONNECT.BUTTON_TEXT') }}</Button>
          </a>
        </slot>
      </div>
    </div>
    <Dialog
      :open="isOpen"
      @update:open="
        val => {
          if (!val) isOpen.value = false;
        }
      "
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {{
              deleteConfirmationText.title ||
              t('INTEGRATION_SETTINGS.WEBHOOK.DELETE.CONFIRM.TITLE')
            }}
          </DialogTitle>
          <DialogDescription>
            {{
              deleteConfirmationText.message ||
              t('INTEGRATION_SETTINGS.WEBHOOK.DELETE.CONFIRM.MESSAGE')
            }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="flex items-center justify-between gap-3">
          <DialogClose as-child>
            <Button variant="outline" class="w-full">
              {{ $t('DIALOG.BUTTONS.CANCEL') }}
            </Button>
          </DialogClose>
          <Button variant="default" class="w-full" @click="confirmDeletion">
            {{ t('INTEGRATION_SETTINGS.WEBHOOK.DELETE.CONFIRM.YES') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
