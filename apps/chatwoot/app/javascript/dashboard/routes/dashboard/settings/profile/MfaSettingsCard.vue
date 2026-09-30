<script setup>
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const { currentParams, visit } = useAppNavigation();

const navigateToMfa = () => {
  visit({
    name: 'profile_settings_mfa',
    params: {
      accountId: currentParams.value.accountId,
    },
  });
};
</script>

<template>
  <div class="bg-n-background rounded-xl p-4 border border-n-slate-4">
    <div class="flex flex-col xs:flex-row items-center justify-between gap-4">
      <div class="flex flex-col items-start gap-1.5">
        <div class="flex items-center gap-2">
          <Icon
            icon="i-lucide-lock-keyhole"
            class="size-4 text-n-slate-10 flex-shrink-0"
          />
          <h5 class="text-sm font-semibold text-n-slate-12">
            {{ $t('MFA_SETTINGS.TITLE') }}
          </h5>
        </div>
        <p class="text-sm text-n-slate-11">
          {{ $t('MFA_SETTINGS.DESCRIPTION') }}
        </p>
      </div>
      <Button type="button" variant="outline" @click="navigateToMfa">
        <Icon :icon="'i-lucide-settings'" />
        {{ $t('PROFILE_SETTINGS.FORM.SECURITY_SECTION.MFA_BUTTON') }}
      </Button>
    </div>
  </div>
</template>
