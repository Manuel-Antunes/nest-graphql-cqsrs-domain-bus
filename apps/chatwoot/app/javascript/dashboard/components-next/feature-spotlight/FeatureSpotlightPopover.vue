<script setup>
import { ref } from 'vue';
import { Button } from 'dashboard/components-next/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'dashboard/components-next/ui/popover';
import Icon from 'dashboard/components-next/icon/Icon.vue';

defineProps({
  buttonLabel: { type: String, default: '' },
  title: { type: String, default: '' },
  note: { type: String, default: '' },
  videoUrl: { type: String, default: '' },
  thumbnail: { type: String, default: '' },
  fallbackThumbnail: { type: String, default: '' },
  fallbackThumbnailDark: { type: String, default: '' },
  learnMoreUrl: { type: String, default: '' },
  hideActions: { type: Boolean, default: false },
});

const imageError = ref(false);
const isPopupVisible = ref(false);

const handleImageError = () => {
  imageError.value = true;
};

const openLink = link => {
  if (link) {
    window.open(link, '_blank');
  }
};
</script>

<template>
  <Popover v-model:open="isPopupVisible">
    <PopoverTrigger as-child>
      <Button variant="ghost" :class="{ 'bg-n-alpha-2': isPopupVisible }">
        {{ buttonLabel }}
      </Button>
    </PopoverTrigger>
    <PopoverContent
      class="p-0 border-none shadow-none bg-transparent w-auto rounded-none"
      align="start"
      :side-offset="24"
    >
      <section
        class="relative outline outline-1 outline-n-weak bg-n-alpha-3 backdrop-blur-[100px] rounded-xl p-4 w-80"
      >
        <div
          class="absolute -top-[0.77rem] ltr:left-12 rtl:right-12 w-6 h-6 ltr:rotate-45 rtl:-rotate-45 rtl:rounded-tr ltr:rounded-tl rtl:border-r ltr:border-l border-t border-n-weak bg-n-alpha-3 z-10"
        />

        <div class="relative flex flex-col items-start gap-4 z-20">
          <div class="flex-shrink-0 bg-gray-800 w-full h-[7.5rem] rounded-lg">
            <img
              v-if="!imageError && thumbnail"
              :src="thumbnail"
              :alt="title"
              draggable="false"
              loading="lazy"
              class="w-full h-full object-cover rounded-lg"
              @error="handleImageError"
            />

            <template v-else>
              <img
                v-if="fallbackThumbnailDark"
                :src="fallbackThumbnailDark"
                :alt="title"
                draggable="false"
                loading="lazy"
                class="w-full h-full object-cover hidden dark:block"
              />

              <img
                v-if="fallbackThumbnail"
                :src="fallbackThumbnail"
                :alt="title"
                draggable="false"
                loading="lazy"
                class="w-full h-full object-cover block dark:hidden"
              />
            </template>
          </div>

          <p v-if="note" class="text-n-slate-12 text-start text-sm mb-0">
            {{ note }}
          </p>

          <div v-if="!hideActions" class="flex gap-3 justify-between w-full">
            <slot name="actions">
              <Button
                v-if="videoUrl"
                variant="outline"
                class="w-full"
                @click="openLink(videoUrl)"
              >
                <Icon icon="i-lucide-circle-play" class="size-4" />{{
                  $t('FEATURE_SPOTLIGHT.WATCH_VIDEO')
                }}
              </Button>

              <Button
                v-if="learnMoreUrl"
                variant="outline"
                class="w-full"
                @click="openLink(learnMoreUrl)"
              >
                {{ $t('FEATURE_SPOTLIGHT.LEARN_MORE')
                }}<Icon icon="i-lucide-arrow-up-right" class="size-4" />
              </Button>
            </slot>
          </div>
        </div>
      </section>
    </PopoverContent>
  </Popover>
</template>
