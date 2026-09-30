<script setup>
import { ref, computed, onMounted } from 'vue';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useI18n } from 'vue-i18n';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from 'next/ui/dialog';
import ResponseCard from '../../assistant/ResponseCard.vue';

const props = defineProps({
  captainDocument: {
    type: Object,
    required: true,
  },
});
const emit = defineEmits(['close']);
const { t } = useI18n();
const store = useStore();

const isOpen = ref(false);

const open = () => {
  isOpen.value = true;
};
const close = () => {
  isOpen.value = false;
  emit('close');
};

const uiFlags = useMapGetter('captainResponses/getUIFlags');
const responses = useMapGetter('captainResponses/getRecords');
const isFetching = computed(() => uiFlags.value.fetchingList);

onMounted(() => {
  store.dispatch('captainResponses/get', {
    assistantId: props.captainDocument.assistant.id,
    documentId: props.captainDocument.id,
  });
});

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
    <DialogContent class="max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{
          t('CAPTAIN.DOCUMENTS.RELATED_RESPONSES.TITLE')
        }}</DialogTitle>
        <DialogDescription>{{
          t('CAPTAIN.DOCUMENTS.RELATED_RESPONSES.DESCRIPTION')
        }}</DialogDescription>
      </DialogHeader>
      <div
        v-if="isFetching"
        class="flex items-center justify-center py-10 text-n-slate-11"
      >
        <Spinner class="size-6" />
      </div>
      <div v-else class="flex flex-col gap-3 min-h-48">
        <ResponseCard
          v-for="response in responses"
          :id="response.id"
          :key="response.id"
          :question="response.question"
          :status="response.status"
          :answer="response.answer"
          :assistant="response.assistant"
          :created-at="response.created_at"
          :updated-at="response.updated_at"
          compact
        />
      </div>
    </DialogContent>
  </Dialog>
</template>
