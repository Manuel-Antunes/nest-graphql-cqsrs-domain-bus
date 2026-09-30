<script setup lang="ts">
import { reactive, computed } from 'vue';
import { required } from '@vuelidate/validators';
import { useVuelidate } from '@vuelidate/core';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from 'next/ui/alert-dialog';
import { Input } from 'dashboard/components-next/ui/input';

const props = withDefaults(
  defineProps<{
    show?: boolean;
    title?: string;
    message?: string;
    confirmText?: string;
    rejectText?: string;
    confirmValue?: string;
    confirmPlaceHolderText?: string;
  }>(),
  {
    show: false,
    title: '',
    message: '',
    confirmText: '',
    rejectText: '',
    confirmValue: '',
    confirmPlaceHolderText: '',
  }
);

const emit = defineEmits<{
  (e: 'onClose'): void;
  (e: 'onConfirm'): void;
  (e: 'update:show', value: boolean): void;
}>();

const form = reactive({ value: '' });

const rules = computed(() => ({
  value: {
    required,
    isEqual: (input: string) =>
      (input || '').trim() === (props.confirmValue || '').trim(),
  },
}));

const v$ = useVuelidate(rules, form);

const localShow = computed({
  get: () => props.show,
  set: (val: boolean) => emit('update:show', val),
});

const closeModal = () => {
  form.value = '';
  emit('onClose');
};

const onConfirm = () => {
  emit('onConfirm');
};
</script>

<template>
  <AlertDialog :open="localShow" @update:open="localShow = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="message">
          {{ message }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div class="py-2">
        <Input
          v-model="form.value"
          type="text"
          :placeholder="confirmPlaceHolderText"
          @blur="v$.value.$touch"
        />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel @click="closeModal">
          {{ rejectText }}
        </AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          :disabled="v$.value.$invalid"
          @click="onConfirm"
        >
          {{ confirmText }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
