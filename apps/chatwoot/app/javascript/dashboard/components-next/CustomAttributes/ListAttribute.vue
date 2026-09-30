<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';

const props = defineProps({
  attribute: {
    type: Object,
    required: true,
  },
  isEditingView: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update', 'delete']);

const { t } = useI18n();

const showAttributeListDropdown = ref(false);
const attributeSearch = ref('');

const attributeListMenuItems = computed(() => {
  return (
    props.attribute.attributeValues?.map(value => ({
      label: value,
      value,
      action: 'select',
      isSelected: value === props.attribute.value,
    })) || []
  );
});

const filteredAttributeItems = computed(() => {
  if (!showAttributeListDropdown.value) return [];
  if (!attributeSearch.value) return attributeListMenuItems.value;
  return attributeListMenuItems.value.filter(item =>
    item.label.toLowerCase().includes(attributeSearch.value.toLowerCase())
  );
});

watch(showAttributeListDropdown, val => {
  if (!val) {
    attributeSearch.value = '';
  }
});

const handleAttributeAction = async action => {
  emit('update', action.value);
};
</script>

<template>
  <div
    class="flex items-center w-full min-w-0 gap-2"
    :class="{
      'justify-start': isEditingView,
      'justify-end': !isEditingView,
    }"
  >
    <Popover v-if="!isEditingView" v-model:open="showAttributeListDropdown">
      <PopoverTrigger as-child>
        <span
          class="min-w-0 text-sm cursor-pointer text-n-slate-11 hover:text-n-slate-12 py-2 select-none font-medium"
        >
          {{
            attribute.value ||
            t('CONTACTS_LAYOUT.SIDEBAR.ATTRIBUTES.TRIGGER.SELECT')
          }}
        </span>
      </PopoverTrigger>
      <PopoverContent class="p-0 w-64">
        <div class="p-2 border-b border-n-weak">
          <input
            v-model="attributeSearch"
            type="search"
            placeholder="Search..."
            class="w-full text-sm bg-transparent outline-none text-n-slate-12 placeholder:text-n-slate-9"
          />
        </div>
        <div class="flex flex-col max-h-60 overflow-y-auto p-1">
          <Button
            v-for="item in filteredAttributeItems"
            :key="item.value"
            variant="ghost"
            class="justify-start"
            :class="
              item.action === 'delete'
                ? 'text-destructive hover:text-destructive'
                : ''
            "
            :disabled="item.disabled"
            @click="handleAttributeAction(item)"
          >
            <Icon
              v-if="item.icon"
              :icon="item.icon"
              class="size-3.5 flex-shrink-0"
            />
            <span v-if="item.emoji" class="flex-shrink-0">{{
              item.emoji
            }}</span>
            {{ item.label }}
          </Button>
        </div>
      </PopoverContent>
    </Popover>

    <template v-else>
      <span class="min-w-0 text-sm text-n-slate-12 truncate flex-1">
        {{
          attribute.value ||
          t('CONTACTS_LAYOUT.SIDEBAR.ATTRIBUTES.TRIGGER.SELECT')
        }}
      </span>
      <Popover v-model:open="showAttributeListDropdown">
        <PopoverTrigger as-child>
          <Button variant="outline" size="icon">
            <Icon icon="i-lucide-pencil" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="p-0 w-64">
          <div class="p-2 border-b border-n-weak">
            <input
              v-model="attributeSearch"
              type="search"
              placeholder="Search..."
              class="w-full text-sm bg-transparent outline-none text-n-slate-12 placeholder:text-n-slate-9"
            />
          </div>
          <div class="flex flex-col max-h-60 overflow-y-auto p-1">
            <Button
              v-for="item in filteredAttributeItems"
              :key="item.value"
              variant="ghost"
              class="justify-start"
              :class="
                item.action === 'delete'
                  ? 'text-destructive hover:text-destructive'
                  : ''
              "
              :disabled="item.disabled"
              @click="handleAttributeAction(item)"
            >
              <Icon
                v-if="item.icon"
                :icon="item.icon"
                class="size-3.5 flex-shrink-0"
              />
              <span v-if="item.emoji" class="flex-shrink-0">{{
                item.emoji
              }}</span>
              {{ item.label }}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Button variant="destructive" size="icon" @click="emit('delete')">
        <Icon icon="i-lucide-trash" />
      </Button>
    </template>
  </div>
</template>
