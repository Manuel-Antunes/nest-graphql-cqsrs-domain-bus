<script setup>
import { computed } from 'vue';
import { useMapGetter } from 'dashboard/composables/store.js';

import HelpCenterLayout from 'dashboard/components-next/HelpCenter/HelpCenterLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import LocaleList from 'dashboard/components-next/HelpCenter/Pages/LocalePage/LocaleList.vue';
import AddLocaleDialog from 'dashboard/components-next/HelpCenter/Pages/LocalePage/AddLocaleDialog.vue';

const props = defineProps({
  locales: {
    type: Array,
    required: true,
  },
  portal: {
    type: Object,
    default: () => ({}),
  },
});

const isSwitchingPortal = useMapGetter('portals/isSwitchingPortal');

const localeCount = computed(() => props.locales?.length);
</script>

<template>
  <HelpCenterLayout :show-pagination-footer="false">
    <template #header-actions>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <span class="text-sm font-medium text-n-slate-12">
            {{ $t('HELP_CENTER.LOCALES_PAGE.LOCALES_COUNT', localeCount) }}
          </span>
        </div>
        <AddLocaleDialog :portal="portal">
          <template #trigger>
            <Button variant="default">
              <Icon icon="i-lucide-plus" class="mr-1" />
              {{ $t('HELP_CENTER.LOCALES_PAGE.NEW_LOCALE_BUTTON_TEXT') }}
            </Button>
          </template>
        </AddLocaleDialog>
      </div>
    </template>
    <template #content>
      <div
        v-if="isSwitchingPortal"
        class="flex items-center justify-center py-10 text-n-slate-11"
      >
        <Spinner class="size-6" />
      </div>
      <LocaleList v-else :locales="locales" :portal="portal" />
    </template>
  </HelpCenterLayout>
</template>
