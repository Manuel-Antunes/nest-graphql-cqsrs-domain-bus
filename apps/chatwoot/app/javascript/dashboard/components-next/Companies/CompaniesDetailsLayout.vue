<script setup>
import { computed, useSlots } from 'vue';

import { Button } from 'dashboard/components-next/ui/button';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from 'dashboard/components-next/ui/sheet';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from 'dashboard/components-next/ui/breadcrumb';

const props = defineProps({
  breadcrumbItems: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['back']);

const slots = useSlots();

const sidebarTitle = computed(
  () => props.breadcrumbItems[props.breadcrumbItems.length - 1]?.label || ''
);
</script>

<template>
  <section
    class="flex w-full h-full overflow-hidden justify-evenly bg-n-surface-1"
  >
    <div class="flex flex-col w-full h-full">
      <header class="sticky top-0 z-10 px-6 3xl:px-0">
        <div class="w-full mx-auto max-w-[40.625rem]">
          <div
            class="flex flex-col xs:flex-row items-start xs:items-center justify-between w-full py-7 gap-2"
          >
            <BreadcrumbRoot>
              <BreadcrumbList>
                <template v-for="(item, index) in breadcrumbItems" :key="index">
                  <BreadcrumbSeparator v-if="index > 0" />
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      v-if="index !== breadcrumbItems.length - 1"
                      as="button"
                      type="button"
                      class="cursor-pointer border-0 bg-transparent p-0"
                      @click="emit('back')"
                    >
                      {{ item.label }}
                    </BreadcrumbLink>
                    <BreadcrumbPage v-else>
                      {{ item.label }}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </template>
              </BreadcrumbList>
            </BreadcrumbRoot>
            <Sheet v-if="slots.sidebar">
              <SheetTrigger as-child>
                <Button variant="outline" size="icon">
                  <Icon icon="i-lucide-panel-right-open" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                class="w-full max-w-96 sm:max-w-xl gap-0 pt-12"
              >
                <SheetTitle class="sr-only">
                  {{ sidebarTitle }}
                </SheetTitle>
                <div class="shrink-0">
                  <slot name="sidebarHeader" />
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto pb-6 pt-3">
                  <slot name="sidebar" />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main class="flex-1 px-6 overflow-y-auto 3xl:px-px">
        <div class="w-full py-4 mx-auto max-w-[40.625rem]">
          <slot />
        </div>
      </main>
    </div>
  </section>
</template>
