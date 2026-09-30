<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  useFunctionGetter,
  useMapGetter,
  useStore,
} from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import Integration from './Integration.vue';
import integrationAPI from 'dashboard/api/integrations';

import Input from 'dashboard/components-next/input/Input.vue';
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
import { Spinner } from 'dashboard/components-next/ui/spinner';
import SettingsLayout from '../SettingsLayout.vue';
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';

defineProps({
  error: {
    type: String,
    default: '',
  },
});

const store = useStore();
const { t } = useI18n();
const isOpen = ref(false);
const integrationLoaded = ref(false);
const storeUrl = ref('');
const isSubmitting = ref(false);
const storeUrlError = ref('');
const integration = useFunctionGetter('integrations/getIntegration', 'shopify');
const uiFlags = useMapGetter('integrations/getUIFlags');

const integrationAction = computed(() => {
  if (integration.value.enabled) {
    return 'disconnect';
  }
  return 'connect';
});

const hideStoreUrlModal = () => {
  storeUrl.value = '';
  storeUrlError.value = '';
  isSubmitting.value = false;
};

const validateStoreUrl = url => {
  const pattern =
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.myshopify\.(?:com|io)$/i;
  return pattern.test(url);
};

const openStoreUrlDialog = () => {
  isOpen.value = true;
};

const handleStoreUrlDialogOpenChange = open => {
  if (open) return;
  isOpen.value = false;
  hideStoreUrlModal();
};

const handleStoreUrlSubmit = async () => {
  try {
    storeUrlError.value = '';
    if (!validateStoreUrl(storeUrl.value)) {
      storeUrlError.value =
        'Please enter a valid Shopify store URL (e.g., your-store.myshopify.com)';
      return;
    }

    isSubmitting.value = true;
    const { data } = await integrationAPI.connectShopify({
      shopDomain: storeUrl.value,
    });

    if (data.redirect_url) {
      window.location.href = data.redirect_url;
    }
  } catch (error) {
    storeUrlError.value = error.message;
  } finally {
    isSubmitting.value = false;
  }
};

const initializeShopifyIntegration = async () => {
  await store.dispatch('integrations/get', 'shopify');
  integrationLoaded.value = true;
};

onMounted(() => {
  initializeShopifyIntegration();
});
</script>

<template>
  <SettingsLayout :is-loading="!integrationLoaded || uiFlags.isCreatingShopify">
    <template #header>
      <BaseSettingsHeader
        :title="$t('INTEGRATION_SETTINGS.SHOPIFY.HEADER')"
        description=""
        feature-name="shopify_integration"
        :back-button-label="$t('INTEGRATION_SETTINGS.HEADER')"
      />
    </template>
    <template #body>
      <div class="flex flex-col gap-6">
        <Integration
          :integration-id="integration.id"
          :integration-logo="integration.logo"
          :integration-name="integration.name"
          :integration-description="integration.description"
          :integration-enabled="integration.enabled"
          :integration-action="integrationAction"
          :delete-confirmation-text="{
            title: t('INTEGRATION_SETTINGS.SHOPIFY.DELETE.TITLE'),
            message: t('INTEGRATION_SETTINGS.SHOPIFY.DELETE.MESSAGE'),
          }"
        >
          <template #action>
            <Button
              variant="default"
              class="bg-n-teal-9 text-white hover:bg-n-teal-10"
              @click="openStoreUrlDialog"
            >
              {{ t('INTEGRATION_SETTINGS.CONNECT.BUTTON_TEXT') }}
            </Button>
          </template>
        </Integration>
        <div
          v-if="error"
          class="flex items-center justify-center flex-1 outline outline-n-container outline-1 bg-n-alpha-3 rounded-md shadow p-6"
        >
          <p class="text-n-ruby-9">
            {{ t('INTEGRATION_SETTINGS.SHOPIFY.ERROR') }}
          </p>
        </div>
        <Dialog :open="isOpen" @update:open="handleStoreUrlDialogOpenChange">
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {{ t('INTEGRATION_SETTINGS.SHOPIFY.STORE_URL.TITLE') }}
              </DialogTitle>
              <DialogDescription />
            </DialogHeader>
            <Input
              v-model="storeUrl"
              :label="t('INTEGRATION_SETTINGS.SHOPIFY.STORE_URL.LABEL')"
              :placeholder="
                t('INTEGRATION_SETTINGS.SHOPIFY.STORE_URL.PLACEHOLDER')
              "
              :message="
                !storeUrlError
                  ? t('INTEGRATION_SETTINGS.SHOPIFY.STORE_URL.HELP')
                  : storeUrlError
              "
              :message-type="storeUrlError ? 'error' : 'info'"
            />
            <DialogFooter class="flex items-center justify-between gap-3">
              <DialogClose as-child>
                <Button variant="outline" class="w-full">
                  {{ t('DIALOG.BUTTONS.CANCEL') }}
                </Button>
              </DialogClose>
              <Button
                variant="default"
                class="w-full"
                :disabled="isSubmitting"
                @click="handleStoreUrlSubmit"
              >
                <Spinner v-if="isSubmitting" class="size-4 flex-shrink-0" />
                {{ t('DIALOG.BUTTONS.CONFIRM') }}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </template>
  </SettingsLayout>
</template>
