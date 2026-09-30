<script setup>
import { ref, reactive, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAlert, useTrack } from 'dashboard/composables';
import { PORTALS_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
import { convertToCategorySlug } from 'dashboard/helper/commons.js';
import { useVuelidate } from '@vuelidate/core';
import { required, minLength, helpers } from '@vuelidate/validators';
import { buildPortalURL } from 'dashboard/helper/portalHelper';
import { isValidSlug } from 'shared/helpers/Validators';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'next/ui/dialog';
import { Button } from 'next/ui/button';
import { Spinner } from 'next/ui/spinner';
import Input from 'dashboard/components-next/input/Input.vue';

const emit = defineEmits(['create']);

const { t } = useI18n();
const store = useStore();

const isOpen = ref(false);
const open = () => {
  isOpen.value = true;
};
const close = () => {
  isOpen.value = false;
};

const isCreatingPortal = useMapGetter('portals/isCreatingPortal');

const state = reactive({
  name: '',
  slug: '',
  domain: '',
  logoUrl: '',
  avatarBlobId: '',
});

const rules = {
  name: { required, minLength: minLength(2) },
  slug: {
    required: helpers.withMessage(
      () => t('HELP_CENTER.CREATE_PORTAL_DIALOG.SLUG.ERROR'),
      required
    ),
    isValidSlug: helpers.withMessage(
      () => t('HELP_CENTER.CREATE_PORTAL_DIALOG.SLUG.FORMAT_ERROR'),
      isValidSlug
    ),
  },
};

const v$ = useVuelidate(rules, state);

const nameError = computed(() =>
  v$.value.name.$error ? t('HELP_CENTER.CREATE_PORTAL_DIALOG.NAME.ERROR') : ''
);

const slugError = computed(() => {
  return v$.value.slug.$errors[0]?.$message || '';
});

const isSubmitDisabled = computed(() => v$.value.$invalid);

watch(
  () => state.name,
  () => {
    state.slug = convertToCategorySlug(state.name);
  }
);

const redirectToPortal = portal => {
  emit('create', { slug: portal.slug, locale: 'en' });
};

const resetForm = () => {
  Object.keys(state).forEach(key => {
    state[key] = '';
  });
  v$.value.$reset();
};
const createPortal = async portal => {
  try {
    await store.dispatch('portals/create', portal);
    close();

    const analyticsPayload = {
      has_custom_domain: Boolean(portal.custom_domain),
    };
    useTrack(PORTALS_EVENTS.ONBOARD_BASIC_INFORMATION, analyticsPayload);
    useTrack(PORTALS_EVENTS.CREATE_PORTAL, analyticsPayload);

    useAlert(
      t('HELP_CENTER.PORTAL_SETTINGS.API.CREATE_PORTAL.SUCCESS_MESSAGE')
    );

    resetForm();
    redirectToPortal(portal);
  } catch (error) {
    close();

    useAlert(
      error?.message ||
        t('HELP_CENTER.PORTAL_SETTINGS.API.CREATE_PORTAL.ERROR_MESSAGE')
    );
  }
};

const handleDialogConfirm = async () => {
  const isFormCorrect = await v$.value.$validate();
  if (!isFormCorrect) return;

  const portal = {
    name: state.name,
    slug: state.slug,
    custom_domain: state.domain,
    blob_id: state.avatarBlobId || null,
    color: '#2781F6', // The default color is set to Chatwoot brand color
  };
  await createPortal(portal);
};

defineExpose({ dialogRef: { open, close } });
</script>

<template>
  <Dialog
    :open="isOpen"
    @update:open="
      val => {
        if (!val) close();
      }
    "
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ t('HELP_CENTER.CREATE_PORTAL_DIALOG.TITLE') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('HELP_CENTER.CREATE_PORTAL_DIALOG.DESCRIPTION') }}
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-6">
        <Input
          id="portal-name"
          v-model="state.name"
          type="text"
          :placeholder="t('HELP_CENTER.CREATE_PORTAL_DIALOG.NAME.PLACEHOLDER')"
          :label="t('HELP_CENTER.CREATE_PORTAL_DIALOG.NAME.LABEL')"
          :message-type="nameError ? 'error' : 'info'"
          :message="
            nameError || t('HELP_CENTER.CREATE_PORTAL_DIALOG.NAME.MESSAGE')
          "
          @blur="v$.name.$touch()"
        />
        <Input
          id="portal-slug"
          v-model="state.slug"
          type="text"
          :placeholder="t('HELP_CENTER.CREATE_PORTAL_DIALOG.SLUG.PLACEHOLDER')"
          :label="t('HELP_CENTER.CREATE_PORTAL_DIALOG.SLUG.LABEL')"
          :message-type="slugError ? 'error' : 'info'"
          :message="slugError || buildPortalURL(state.slug)"
          @input="v$.slug.$touch()"
          @blur="v$.slug.$touch()"
        />
      </div>
      <DialogFooter class="flex items-center justify-between gap-3">
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </DialogClose>
        <Button
          variant="default"
          class="w-full"
          :disabled="isSubmitDisabled || isCreatingPortal"
          @click="handleDialogConfirm"
        >
          <Spinner v-if="isCreatingPortal" class="size-4 flex-shrink-0" />
          <template v-if="!isCreatingPortal">
            {{ t('HELP_CENTER.CREATE_PORTAL_DIALOG.CONFIRM_BUTTON_LABEL') }}
          </template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
