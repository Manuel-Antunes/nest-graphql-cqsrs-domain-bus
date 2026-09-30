<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'vuex';
import { useAlert } from 'dashboard/composables';
import { useMapGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from 'dashboard/components-next/ui/alert-dialog';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';

import {
  isAConversationRoute,
  isAInboxViewRoute,
  getConversationDashboardRoute,
} from 'dashboard/helper/routeHelpers';

const props = defineProps({
  contact: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['close', 'deleted']);

const { t } = useI18n();
const store = useStore();
const { currentRouteName, visit } = useAppNavigation();

const uiFlags = useMapGetter('contacts/getUIFlags');

const isOpen = ref(false);

const confirmMessage = computed(
  () => `${t('DELETE_CONTACT.CONFIRM.MESSAGE')} ${props.contact.name}?`
);

const onOpenChange = value => {
  isOpen.value = value;
  if (!value) emit('close');
};

const onDelete = async () => {
  try {
    await store.dispatch('contacts/delete', props.contact.id);
    useAlert(t('DELETE_CONTACT.API.SUCCESS_MESSAGE'));
    onOpenChange(false);
    emit('deleted');

    const routeName = currentRouteName.value;
    if (isAConversationRoute(routeName)) {
      visit({ name: getConversationDashboardRoute(routeName) });
    } else if (isAInboxViewRoute(routeName)) {
      visit({ name: 'inbox_view' });
    } else if (routeName !== 'contacts_dashboard_index') {
      visit({ name: 'contacts_dashboard_index' });
    }
  } catch (error) {
    useAlert(error.message || t('DELETE_CONTACT.API.ERROR_MESSAGE'));
  }
};
</script>

<template>
  <AlertDialog :open="isOpen" @update:open="onOpenChange">
    <AlertDialogTrigger as-child>
      <slot name="trigger" />
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ $t('DELETE_CONTACT.CONFIRM.TITLE') }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ confirmMessage }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="uiFlags.isDeleting">
          {{ $t('DELETE_CONTACT.CONFIRM.NO') }}
        </AlertDialogCancel>
        <Button
          variant="destructive"
          :disabled="uiFlags.isDeleting"
          @click="onDelete"
        >
          <Spinner v-if="uiFlags.isDeleting" class="size-4" />
          {{ $t('DELETE_CONTACT.CONFIRM.YES') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
