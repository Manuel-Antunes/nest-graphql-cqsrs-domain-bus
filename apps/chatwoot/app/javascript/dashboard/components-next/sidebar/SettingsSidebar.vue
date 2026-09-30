<script setup>
// Secondary sidebar for the settings section. Rendered by SettingsLayout (a persistent
// Inertia layout), NOT by the rail — so it exists only on settings pages, and survives
// navigation between them instead of being a panel toggled open over every screen.
import { useI18n } from 'vue-i18n';
import { useAccount } from 'dashboard/composables/useAccount';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useSettingsMenu } from './settingsMenu';
import AppLink from 'dashboard/components-next/AppLink.vue';
import Icon from 'next/icon/Icon.vue';

const { t } = useI18n();
const { accountScopedRoute } = useAccount();
const { currentRouteName } = useAppNavigation();
const { visibleItems } = useSettingsMenu();

// Closing settings means leaving the section — there is no panel to hide anymore.
const closeTo = accountScopedRoute('home');
</script>

<template>
  <div
    class="flex flex-col w-60 max-w-[78vw] h-full shrink-0 ltr:border-r rtl:border-l border-n-weak bg-n-solid-1"
  >
    <header
      class="flex items-center justify-between gap-2 px-3 py-3 border-b border-n-weak"
    >
      <span
        class="flex items-center min-w-0 gap-2 text-base font-semibold text-n-slate-12"
      >
        <Icon
          icon="i-lucide-settings"
          class="size-4 shrink-0 text-n-slate-11"
        />
        <span class="truncate">{{ t('SIDEBAR.SETTINGS') }}</span>
      </span>
      <AppLink
        :to="closeTo"
        class="grid rounded-md size-7 shrink-0 place-content-center text-n-slate-11 hover:bg-n-alpha-1 hover:text-n-slate-12"
        :aria-label="t('GENERAL_SETTINGS.BACK')"
      >
        <Icon icon="i-lucide-x" class="size-4" />
      </AppLink>
    </header>
    <nav class="flex flex-col gap-0.5 p-2 overflow-y-auto">
      <AppLink
        v-for="item in visibleItems"
        :key="item.name"
        :to="item.to"
        class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-n-slate-12 hover:bg-n-alpha-1 transition-colors min-w-0"
        :class="{
          'bg-n-brand/10 text-n-brand': currentRouteName === item.to?.name,
        }"
      >
        <Icon
          v-if="item.icon"
          :icon="item.icon"
          class="size-4 shrink-0 text-n-slate-11"
        />
        <span class="truncate">{{ item.label }}</span>
      </AppLink>
    </nav>
  </div>
</template>
