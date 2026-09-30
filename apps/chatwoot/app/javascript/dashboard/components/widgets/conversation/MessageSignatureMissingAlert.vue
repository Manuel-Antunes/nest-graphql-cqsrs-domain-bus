<script setup>
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { Button } from 'dashboard/components-next/ui/button';

const { visit } = useAppNavigation();

const openProfileSettings = () => {
  return visit({ name: 'profile_settings_index' });
};
</script>

<template>
  <div
    class="m-2 px-2 mt-0 flex max-h-[8vh] items-baseline justify-between hover:bg-n-slate-1 border border-dashed border-n-weak rounded-sm overflow-auto"
  >
    <p class="w-fit !m-0">
      {{ $t('CONVERSATION.FOOTER.MESSAGE_SIGNATURE_NOT_CONFIGURED') }}

      <Button variant="link" @click="openProfileSettings">
        {{ $t('CONVERSATION.FOOTER.CLICK_HERE') }}
      </Button>
    </p>
  </div>
</template>
