<script setup>
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

defineProps({
  onClose: { type: Function, default: () => {} },
  onConfirm: { type: Function, default: () => {} },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  messageValue: { type: String, default: '' },
  confirmText: { type: String, default: '' },
  rejectText: { type: String, default: '' },
});

const show = defineModel('show', { type: Boolean, default: false });
</script>

<template>
  <AlertDialog :open="show" @update:open="show = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="message">
          {{ message
          }}<template v-if="messageValue">
            <strong>{{ messageValue }}</strong>
          </template>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="onClose">{{ rejectText }}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click="onConfirm">
          {{ confirmText }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
