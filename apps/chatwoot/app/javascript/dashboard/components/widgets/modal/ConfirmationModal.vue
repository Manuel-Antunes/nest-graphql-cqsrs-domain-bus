<script setup lang="ts">
import { ref } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from 'next/ui/dialog';
import { Button } from 'dashboard/components-next/ui/button';

withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }>(),
  {
    title: 'This is a title',
    description: 'This is your description',
    confirmLabel: 'Yes',
    cancelLabel: 'No',
  }
);

const show = ref(false);
let resolvePromise: (value: boolean) => void = () => {};

// Imperative API: parents call `confirmModalRef.value.showConfirmation()` and
// await the boolean. Kept identical to the former Options-API `$refs` contract.
const showConfirmation = (): Promise<boolean> => {
  show.value = true;
  return new Promise<boolean>(resolve => {
    resolvePromise = resolve;
  });
};

const confirm = () => {
  resolvePromise(true);
  show.value = false;
};

const cancel = () => {
  resolvePromise(false);
  show.value = false;
};

defineExpose({ showConfirmation });
</script>

<template>
  <Dialog
    :open="show"
    @update:open="
      val => {
        if (!val) cancel();
      }
    "
  >
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="description">
          {{ description }}
        </DialogDescription>
      </DialogHeader>
      <div class="flex flex-row justify-end gap-2 pt-2">
        <Button variant="outline" type="reset" @click="cancel">
          {{ cancelLabel }}
        </Button>
        <Button type="submit" @click="confirm">{{ confirmLabel }}</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
