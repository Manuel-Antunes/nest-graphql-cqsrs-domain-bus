<script setup>
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import EmptyStateLayout from 'dashboard/components-next/EmptyStateLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const { t } = useI18n();
const { visit } = useAppNavigation();

const setupVoiceChannel = () => {
  visit({ name: 'settings_inbox_new' });
};
</script>

<template>
  <EmptyStateLayout
    :title="t('CALLS_PAGE.SETUP.TITLE')"
    :subtitle="t('CALLS_PAGE.SETUP.SUBTITLE')"
    :show-backdrop="false"
    :action-perms="['administrator']"
    class="bg-n-background"
  >
    <template #media>
      <Icon icon="i-lucide-phone" class="size-6" />
    </template>
    <template #actions>
      <Button @click="setupVoiceChannel">
        <Icon icon="i-lucide-plus" />
        {{ t('CALLS_PAGE.SETUP.ACTION') }}
      </Button>
    </template>
  </EmptyStateLayout>
</template>
