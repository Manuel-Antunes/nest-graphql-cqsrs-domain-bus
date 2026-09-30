<script setup>
import { Spinner } from 'dashboard/components-next/ui/spinner';

defineProps({
  message: { type: String, default: '' },
});
</script>

<template>
  <div class="flex items-center justify-center p-8">
    <h6
      class="flex items-center gap-3 text-base text-center w-100 text-n-slate-11"
    >
      <span class="text-body-main !text-base text-n-slate-12">
        {{ message }}
      </span>
      <Spinner class="text-n-brand size-6" />
    </h6>
  </div>
</template>
