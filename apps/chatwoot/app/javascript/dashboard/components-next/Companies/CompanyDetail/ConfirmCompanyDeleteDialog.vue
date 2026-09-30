<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from 'next/ui/alert-dialog';
import { Button } from 'next/ui/button';
import { Spinner } from 'next/ui/spinner';

const props = defineProps({
  company: {
    type: Object,
    default: () => ({}),
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['confirm']);

const { t } = useI18n();

const isOpen = ref(false);

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const description = computed(() =>
  props.company?.name
    ? t('COMPANIES.DETAIL.DELETE.DESCRIPTION_WITH_NAME', {
        companyName: props.company.name,
      })
    : t('COMPANIES.DETAIL.DELETE.DESCRIPTION')
);

defineExpose({ dialogRef: { open, close } });
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
    <AlertDialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ t('COMPANIES.DETAIL.DELETE.TITLE') }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ description }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel as-child>
          <Button variant="outline">
            {{ t('DIALOG.BUTTONS.CANCEL') }}
          </Button>
        </AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          :disabled="isLoading"
          @click="emit('confirm')"
        >
          <Spinner v-if="isLoading" class="size-4 flex-shrink-0" />
          <template v-if="!isLoading">
            {{ t('COMPANIES.DETAIL.DELETE.CONFIRM') }}
          </template>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
