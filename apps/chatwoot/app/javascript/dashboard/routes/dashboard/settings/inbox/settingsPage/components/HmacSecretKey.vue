<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { copyTextToClipboard } from 'shared/helpers/clipboard';
import AccessToken from 'dashboard/routes/dashboard/settings/profile/AccessToken.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'dashboard/components-next/ui/alert-dialog';

const props = defineProps({
  inbox: {
    type: Object,
    required: true,
  },
});

const { t } = useI18n();
const store = useStore();

const isDialogOpen = ref(false);
const isRotating = ref(false);

const copyKey = async () => {
  try {
    await copyTextToClipboard(props.inbox.hmac_token);
    useAlert(t('COMPONENTS.CODE.COPY_SUCCESSFUL'));
  } catch (error) {
    useAlert(t('COMPONENTS.CODE.COPY_ERROR'));
  }
};

const rotate = async () => {
  isRotating.value = true;
  try {
    await store.dispatch('inboxes/rotateHmacToken', props.inbox.id);
    isDialogOpen.value = false;
    useAlert(t('INBOX_MGMT.SETTINGS_POPUP.IDENTITY_VALIDATION.ROTATE.SUCCESS'));
  } catch (error) {
    useAlert(t('INBOX_MGMT.SETTINGS_POPUP.IDENTITY_VALIDATION.ROTATE.ERROR'));
  } finally {
    isRotating.value = false;
  }
};
</script>

<template>
  <!-- Remount when the key changes so a rotated secret starts masked even if the previous key was revealed. -->
  <AccessToken
    :key="inbox.hmac_token"
    :value="inbox.hmac_token"
    :show-reset-button="false"
    @on-copy="copyKey"
  >
    <template #actions>
      <Button
        variant="outline"
        type="button"
        class="rounded-xl"
        @click="isDialogOpen = true"
      >
        <Icon icon="i-lucide-key-round" class="size-4" />
        {{ $t('INBOX_MGMT.SETTINGS_POPUP.IDENTITY_VALIDATION.ROTATE.BUTTON') }}
      </Button>
    </template>
  </AccessToken>
  <AlertDialog :open="isDialogOpen" @update:open="isDialogOpen = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ $t('INBOX_MGMT.SETTINGS_POPUP.IDENTITY_VALIDATION.ROTATE.TITLE') }}
        </AlertDialogTitle>
        <AlertDialogDescription as-child>
          <div class="flex flex-col gap-2 text-sm text-n-slate-11">
            <p class="mb-0">
              <span class="font-medium text-n-slate-12">
                {{
                  $t(
                    'INBOX_MGMT.SETTINGS_POPUP.IDENTITY_VALIDATION.ROTATE.WARNING'
                  )
                }}
              </span>
              {{
                $t(
                  'INBOX_MGMT.SETTINGS_POPUP.IDENTITY_VALIDATION.ROTATE.WARNING_DETAIL'
                )
              }}
            </p>
            <p class="mb-0">
              {{
                $t(
                  'INBOX_MGMT.SETTINGS_POPUP.IDENTITY_VALIDATION.ROTATE.IMPACT'
                )
              }}
            </p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="isRotating">
          {{
            $t('INBOX_MGMT.SETTINGS_POPUP.IDENTITY_VALIDATION.ROTATE.CANCEL')
          }}
        </AlertDialogCancel>
        <Button variant="destructive" :disabled="isRotating" @click="rotate">
          <Spinner v-if="isRotating" class="size-4 flex-shrink-0" />
          {{
            $t('INBOX_MGMT.SETTINGS_POPUP.IDENTITY_VALIDATION.ROTATE.CONFIRM')
          }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
