<script>
import { useAlert, useTrack } from 'dashboard/composables';
import { INBOX_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';

import { Button } from 'dashboard/components-next/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'dashboard/components-next/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'dashboard/components-next/ui/dropdown-menu';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import AppLink from 'dashboard/components-next/AppLink.vue';
import InboxDisplayMenu from './InboxDisplayMenu.vue';
import ComposeConversation from 'dashboard/components-next/NewConversation/ComposeConversation.vue';

export default {
  components: {
    AppLink,
    Button,
    Popover,
    PopoverContent,
    PopoverTrigger,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Icon,
    InboxDisplayMenu,
    ComposeConversation,
  },
  props: {
    isContextMenuOpen: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['redirect', 'filter'],
  data() {
    return {
      showInboxDisplayMenu: false,
    };
  },
  watch: {
    isContextMenuOpen: {
      handler(val) {
        if (val) {
          this.showInboxDisplayMenu = false;
        }
      },
      immediate: true,
    },
  },
  methods: {
    markAllRead() {
      useTrack(INBOX_EVENTS.MARK_ALL_NOTIFICATIONS_AS_READ);
      this.$store.dispatch('notifications/readAll').then(() => {
        useAlert(this.$t('INBOX.ALERTS.MARK_ALL_READ'));
      });
    },
    deleteAll() {
      this.$store.dispatch('notifications/deleteAll').then(() => {
        useAlert(this.$t('INBOX.ALERTS.DELETE_ALL'));
      });
    },
    deleteAllRead() {
      this.$store.dispatch('notifications/deleteAllRead').then(() => {
        useAlert(this.$t('INBOX.ALERTS.DELETE_ALL_READ'));
      });
    },
    onFilterChange(option) {
      this.$emit('filter', option);
      this.showInboxDisplayMenu = false;
      this.$emit('redirect');
    },
  },
};
</script>

<template>
  <div class="flex flex-col w-full">
    <!-- Title row -->
    <div class="flex items-center justify-between w-full gap-1 p-2">
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <h1 class="min-w-0 text-base font-medium truncate text-n-slate-12">
          {{ $t('INBOX.LIST.TITLE') }}
        </h1>
        <Popover
          :open="showInboxDisplayMenu"
          @update:open="showInboxDisplayMenu = $event"
        >
          <PopoverTrigger as-child>
            <Button variant="outline">
              {{ $t('INBOX.LIST.DISPLAY_DROPDOWN') }}
              <Icon :icon="'i-lucide-chevron-down'" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start">
            <InboxDisplayMenu @filter="onFilterChange" />
          </PopoverContent>
        </Popover>
      </div>
      <div class="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon">
              <Icon :icon="'i-lucide-sliders-vertical'" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              @select="
                markAllRead();
                $emit('redirect');
              "
            >
              {{ $t('INBOX.MENU_ITEM.MARK_ALL_READ') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              @select="
                deleteAll();
                $emit('redirect');
              "
            >
              {{ $t('INBOX.MENU_ITEM.DELETE_ALL') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              @select="
                deleteAllRead();
                $emit('redirect');
              "
            >
              {{ $t('INBOX.MENU_ITEM.DELETE_ALL_READ') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    <!-- Search + Compose row -->
    <div class="flex items-center gap-1.5 px-2 pb-2">
      <AppLink
        :to="{ name: 'search' }"
        class="flex flex-1 items-center gap-2 h-9 px-3 rounded-lg border border-n-weak bg-n-solid-1 text-sm text-n-slate-11 hover:border-n-strong hover:text-n-slate-12 transition-colors min-w-0 shadow-xs"
        :aria-label="$t('COMBOBOX.SEARCH_PLACEHOLDER')"
      >
        <Icon icon="i-lucide-search" />
        <span class="truncate">{{ $t('COMBOBOX.SEARCH_PLACEHOLDER') }}</span>
      </AppLink>
      <ComposeConversation align-position="right" />
    </div>
  </div>
</template>
