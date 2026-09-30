<script setup>
import { computed } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useI18n } from 'vue-i18n';
import { useAccount } from 'dashboard/composables/useAccount';
import { useAdmin } from 'dashboard/composables/useAdmin';
import { getHelpUrlForFeature } from 'dashboard/helper/featureHelper';
import AppLink from 'dashboard/components-next/AppLink.vue';

const { t } = useI18n();
const { currentParams } = useAppNavigation();
const { isOnChatwootCloud } = useAccount();
const { isAdmin } = useAdmin();

const assistantParams = computed(() => ({
  accountId: currentParams.value.accountId,
  assistantId: currentParams.value.assistantId,
}));

const links = computed(() =>
  [
    {
      key: 'docs',
      title: t('CAPTAIN.OVERVIEW.LINKS.DOCS.TITLE'),
      description: t('CAPTAIN.OVERVIEW.LINKS.DOCS.DESCRIPTION'),
      icon: 'i-lucide-book-open',
      href: getHelpUrlForFeature('captain'),
    },
    {
      key: 'playground',
      title: t('CAPTAIN.OVERVIEW.LINKS.PLAYGROUND.TITLE'),
      description: t('CAPTAIN.OVERVIEW.LINKS.PLAYGROUND.DESCRIPTION'),
      icon: 'i-lucide-flask-conical',
      to: {
        name: 'captain_assistants_playground_index',
        params: assistantParams.value,
      },
    },
    {
      key: 'billing',
      title: t('CAPTAIN.OVERVIEW.LINKS.BILLING.TITLE'),
      description: t('CAPTAIN.OVERVIEW.LINKS.BILLING.DESCRIPTION'),
      icon: 'i-lucide-credit-card',
      to: {
        name: 'billing_settings_index',
        params: { accountId: currentParams.value.accountId },
      },
    },
  ].filter(link => link.key !== 'billing' || isAdmin.value)
);

const linkAttrs = link =>
  link.href
    ? { href: link.href, target: '_blank', rel: 'noopener noreferrer' }
    : { to: link.to };
</script>

<template>
  <div v-if="isOnChatwootCloud" class="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <component
      :is="link.href ? 'a' : AppLink"
      v-for="link in links"
      :key="link.key"
      v-bind="linkAttrs(link)"
      class="flex items-center gap-3 p-4 transition-colors border rounded-xl bg-n-solid-1 border-n-weak hover:bg-n-alpha-1 group/link"
    >
      <span
        class="grid rounded-lg size-9 shrink-0 place-content-center bg-n-alpha-2 text-n-slate-11"
      >
        <span :class="link.icon" class="size-4" />
      </span>
      <div class="flex flex-col min-w-0">
        <span class="text-sm font-medium text-n-slate-12">
          {{ link.title }}
        </span>
        <span class="text-xs truncate text-n-slate-11">
          {{ link.description }}
        </span>
      </div>
      <span
        :class="
          link.href ? 'i-lucide-arrow-up-right' : 'i-lucide-chevron-right'
        "
        class="ml-auto transition-opacity opacity-0 size-4 text-n-slate-10 group-hover/link:opacity-100"
      />
    </component>
  </div>
</template>
