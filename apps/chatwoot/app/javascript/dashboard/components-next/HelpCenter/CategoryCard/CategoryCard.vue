<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import CardLayout from 'dashboard/components-next/CardLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';

const props = defineProps({
  id: {
    type: Number,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  articlesCount: {
    type: Number,
    required: true,
  },
  slug: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['click', 'action']);

const { t } = useI18n();

const isOpen = ref(false);

const categoryMenuItems = [
  {
    label: 'Edit',
    action: 'edit',
    value: 'edit',
    icon: 'i-lucide-pencil',
  },
  {
    label: 'Delete',
    action: 'delete',
    value: 'delete',
    icon: 'i-lucide-trash',
  },
];

const categoryTitleWithIcon = computed(() => {
  return `${props.icon} ${props.title}`;
});

const description = computed(() => {
  return props.description ? props.description : 'No description added';
});

const hasDescription = computed(() => {
  return props.description.length > 0;
});

const handleClick = slug => {
  emit('click', slug);
};

const handleAction = ({ action, value }) => {
  isOpen.value = false;
  emit('action', { action, value, id: props.id });
};
</script>

<template>
  <CardLayout>
    <div class="flex w-full gap-2">
      <div class="flex justify-between w-full gap-2">
        <div class="flex items-center justify-start w-full min-w-0 gap-2">
          <span
            class="text-base truncate cursor-pointer hover:underline underline-offset-2 hover:text-n-blue-text text-n-slate-12"
            @click="handleClick(slug)"
          >
            {{ categoryTitleWithIcon }}
          </span>
          <span
            class="inline-flex items-center justify-center h-6 px-2 py-1 text-xs text-center border rounded-lg bg-n-slate-1 whitespace-nowrap shrink-0 text-n-slate-11 border-n-slate-4"
          >
            {{
              t('HELP_CENTER.CATEGORY_PAGE.CATEGORY_CARD.ARTICLES_COUNT', {
                count: articlesCount,
              })
            }}
          </span>
        </div>
        <Popover v-model:open="isOpen">
          <PopoverTrigger as-child>
            <Button variant="ghost" size="icon">
              <Icon icon="i-lucide-ellipsis-vertical" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" class="flex flex-col p-1 w-auto min-w-36">
            <Button
              v-for="item in categoryMenuItems"
              :key="item.value"
              variant="ghost"
              class="justify-start"
              :class="item.action === 'delete' ? 'text-destructive hover:text-destructive' : ''"
              :disabled="item.disabled"
              @click="handleAction(item)"
            >
              <Icon v-if="item.icon" :icon="item.icon" class="size-3.5 flex-shrink-0" />
              <span v-if="item.emoji" class="flex-shrink-0">{{ item.emoji }}</span>
              {{ item.label }}
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
    <span
      class="text-sm line-clamp-3"
      :class="hasDescription ? 'text-n-slate-11' : 'text-n-slate-9'"
    >
      {{ description }}
    </span>
  </CardLayout>
</template>
