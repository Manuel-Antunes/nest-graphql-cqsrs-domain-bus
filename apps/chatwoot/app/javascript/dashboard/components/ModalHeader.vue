<script setup lang="ts">
withDefaults(
  defineProps<{
    headerTitle?: string;
    headerContent?: string;
    headerContentValue?: string;
    headerImage?: string;
  }>(),
  {
    headerTitle: '',
    headerContent: '',
    headerContentValue: '',
    headerImage: '',
  }
);
</script>

<!-- eslint-disable vue/no-unused-refs -->
<!-- Added ref for writing specs -->
<template>
  <div class="flex flex-col items-start px-8 pt-8 pb-0">
    <img v-if="headerImage" :src="headerImage" alt="No image" />
    <h2
      data-test-id="modal-header-title"
      class="text-base font-semibold leading-6 text-n-slate-12"
    >
      {{ headerTitle }}
    </h2>
    <p
      v-if="headerContent"
      data-test-id="modal-header-content"
      class="w-full mt-2 text-sm leading-5 break-words text-n-slate-11"
    >
      {{ headerContent }}
      <span
        v-if="headerContentValue"
        class="text-sm font-semibold text-n-slate-11"
      >
        {{ headerContentValue }}
      </span>
    </p>
    <slot />
  </div>
</template>
