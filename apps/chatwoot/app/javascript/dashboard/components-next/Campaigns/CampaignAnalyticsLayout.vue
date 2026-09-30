<script setup>
import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from 'dashboard/components-next/ui/breadcrumb';

defineProps({
  breadcrumbItems: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['breadcrumbClick']);
</script>

<template>
  <section class="flex flex-col w-full h-full overflow-hidden bg-n-surface-1">
    <header class="sticky top-0 z-10 px-6">
      <div class="w-full max-w-5xl mx-auto">
        <div class="flex items-center justify-between w-full h-20 gap-4">
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
                    @click="emit('breadcrumbClick', item, index)"
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
        </div>
      </div>
    </header>
    <main class="flex-1 px-6 overflow-y-auto">
      <div class="w-full max-w-5xl mx-auto py-4">
        <slot />
      </div>
    </main>
  </section>
</template>
