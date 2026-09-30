<script setup>
defineProps({
  active: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    default: '',
  },
  lightImage: {
    type: String,
    default: '',
  },
  darkImage: {
    type: String,
    default: '',
  },
});
</script>

<template>
  <button
    type="button"
    class="flex flex-col w-full gap-4 p-4 text-start transition-all duration-200 ease-in-out border rounded-xl outline-none cursor-pointer h-fit bg-n-solid-1 hover:bg-n-alpha-1"
    :class="
      active
        ? 'border-n-brand ring-1 ring-n-brand'
        : 'border-n-weak hover:border-n-slate-6'
    "
  >
    <div class="flex flex-col items-center w-full gap-2">
      <div class="grid grid-cols-[1fr_auto] items-center w-full gap-1">
        <div
          class="overflow-hidden text-base font-medium text-left text-n-slate-12"
        >
          <span class="block truncate">{{ title }}</span>
        </div>
        <input
          :checked="active"
          type="radio"
          :name="`hotkey-${title}`"
          class="grid w-5 h-5 border-2 rounded-full appearance-none cursor-pointer shadow-sm place-items-center border-n-strong checked:bg-n-brand before:content-[''] before:bg-n-brand before:border-4 before:rounded-full before:border-n-strong checked:before:w-[18px] checked:before:h-[18px] checked:border checked:border-n-brand"
        />
      </div>
      <span
        class="w-full text-sm text-n-slate-11 line-clamp-2 leading-[1.4] text-start"
      >
        {{ description }}
      </span>
    </div>

    <div class="w-full overflow-hidden rounded-lg">
      <img
        :src="lightImage"
        :alt="`Light themed image for ${title}`"
        class="block object-cover w-full dark:hidden"
      />
      <img
        :src="darkImage"
        :alt="`Dark themed image for ${title}`"
        class="hidden object-cover w-full dark:block"
      />
    </div>
  </button>
</template>
