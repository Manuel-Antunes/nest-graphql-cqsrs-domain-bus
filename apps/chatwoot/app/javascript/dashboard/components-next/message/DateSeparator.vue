<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fromUnixTime, isToday, isYesterday, isSameYear, format } from 'date-fns';
import { Badge } from 'next/ui/badge';

const props = defineProps({
  date: {
    type: Number,
    required: true,
  },
});

const { t } = useI18n();

const label = computed(() => {
  const value = fromUnixTime(props.date);

  if (isToday(value)) return t('CONVERSATION.DATE_SEPARATOR.TODAY');
  if (isYesterday(value)) return t('CONVERSATION.DATE_SEPARATOR.YESTERDAY');

  return format(value, isSameYear(value, new Date()) ? 'MMMM d' : 'MMMM d, yyyy');
});
</script>

<template>
  <div class="flex justify-center my-3 select-none">
    <Badge
      variant="secondary"
      class="rounded-full border-transparent bg-n-solid-3 px-3 py-1 text-n-slate-11 shadow-sm"
    >
      {{ label }}
    </Badge>
  </div>
</template>
