<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogContent,
  AlertDialogFooter,
} from 'next/ui/alert-dialog';
import { Button } from 'next/ui/button';
import { Spinner } from 'next/ui/spinner';

const emit = defineEmits(['delete']);

const FILTER_TYPE_CONTACT = 'contact';

const { t } = useI18n();

const uiFlags = useMapGetter('customViews/getUIFlags');
const isDeleting = computed(() => uiFlags.value.isDeleting);

const isOpen = ref(false);

const close = () => {
  isOpen.value = false;
};

const handleDialogConfirm = async () => {
  emit('delete', {
    filterType: FILTER_TYPE_CONTACT,
  });
};
</script>

<template>
  <AlertDialog
    :open="isOpen"
    @update:open="
      val => {
        if (!val) close();
      }
    "
  >
    <AlertDialogTrigger as-child>
      <slot name="trigger" />
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogTitle>
        {{ t('CONTACTS_LAYOUT.HEADER.ACTIONS.FILTERS.DELETE_SEGMENT.TITLE') }}
      </AlertDialogTitle>
      <AlertDialogDescription>
        {{
          t('CONTACTS_LAYOUT.HEADER.ACTIONS.FILTERS.DELETE_SEGMENT.DESCRIPTION')
        }}
      </AlertDialogDescription>

      <AlertDialogFooter>
        <AlertDialogCancel as-child>
          <Button variant="outline">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          :disabled="isDeleting"
          @click="handleDialogConfirm"
        >
          <Spinner v-if="isDeleting" class="size-4 flex-shrink-0" />
          <template v-if="!isDeleting">
            {{
              t('CONTACTS_LAYOUT.HEADER.ACTIONS.FILTERS.DELETE_SEGMENT.CONFIRM')
            }}
          </template>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
