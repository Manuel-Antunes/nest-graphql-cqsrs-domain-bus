<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Separator } from 'dashboard/components-next/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from 'dashboard/components-next/ui/dropdown-menu';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';

const props = defineProps({
  // Null while a fetch is in flight so stale counts are never shown.
  totalCount: {
    type: Number,
    default: null,
  },
  agents: {
    type: Array,
    default: () => [],
  },
  inboxes: {
    type: Array,
    default: () => [],
  },
  // Self-scoped viewers only ever see their own calls, so the assignee filter
  // is meaningless for them — only admins get it.
  showAssignee: {
    type: Boolean,
    default: false,
  },
});

const activity = defineModel('activity', { type: String, default: null });
const assigneeId = defineModel('assigneeId', { type: Number, default: null });
const inboxId = defineModel('inboxId', { type: Number, default: null });

const { t } = useI18n();

const ACTIVITY_ICONS = {
  missed: 'i-lucide-phone-missed',
  no_reply: 'i-lucide-phone-outgoing',
  incoming: 'i-lucide-phone-incoming',
  outgoing: 'i-lucide-phone-outgoing',
  in_progress: 'i-lucide-phone-call',
};

const BASE_ACTIVITIES = ['missed', 'no_reply'];
const OTHER_ACTIVITIES = ['incoming', 'outgoing', 'in_progress'];

const assigneeSearch = ref('');

const activityLabel = value => t(`CALLS_PAGE.FILTERS.${value.toUpperCase()}`);

const activeChipLabel = computed(() => {
  const label = activityLabel(activity.value);
  return props.totalCount === null ? label : `${label} (${props.totalCount})`;
});

const inactiveChips = computed(() =>
  BASE_ACTIVITIES.filter(value => value !== activity.value)
);

const otherActivityItems = computed(() =>
  OTHER_ACTIVITIES.map(value => ({
    label: activityLabel(value),
    value,
    icon: ACTIVITY_ICONS[value],
    isSelected: activity.value === value,
  }))
);

const assigneeItems = computed(() => {
  const query = assigneeSearch.value.trim().toLowerCase();
  const agents = props.agents
    .filter(agent => !query || agent.name?.toLowerCase().includes(query))
    .map(agent => ({
      label: agent.name,
      value: agent.id,
      thumbnail: { name: agent.name, src: agent.thumbnail },
      isSelected: assigneeId.value === agent.id,
    }));
  if (query) return agents;
  return [
    {
      label: t('CALLS_PAGE.FILTERS.ALL_ASSIGNEES'),
      value: null,
      isSelected: !assigneeId.value,
    },
    ...agents,
  ];
});

const inboxItems = computed(() => [
  {
    label: t('CALLS_PAGE.FILTERS.ALL_INBOXES'),
    value: null,
    isSelected: !inboxId.value,
  },
  ...props.inboxes.map(inbox => ({
    label: inbox.name,
    value: inbox.id,
    isSelected: inboxId.value === inbox.id,
  })),
]);

const selectedAssignee = computed(
  () => props.agents.find(agent => agent.id === assigneeId.value) || null
);

const selectedAssigneeLabel = computed(
  () => selectedAssignee.value?.name || t('CALLS_PAGE.FILTERS.ASSIGNEE')
);

const isOtherActivitySelected = computed(() =>
  OTHER_ACTIVITIES.includes(activity.value)
);

const hasMoreFilters = computed(() => Boolean(inboxId.value));

const setActivity = value => {
  activity.value = value;
};

const setAssignee = value => {
  assigneeId.value = value;
};

const setInbox = value => {
  inboxId.value = value;
};

const onAssigneeMenuToggle = isOpen => {
  if (isOpen) assigneeSearch.value = '';
};
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <span
        v-if="!activity"
        class="text-heading-3 text-n-slate-11 shrink-0"
        data-test="all-calls"
      >
        {{
          totalCount === null
            ? t('CALLS_PAGE.ALL_CALLS')
            : t('CALLS_PAGE.ALL_CALLS_COUNT', { count: totalCount })
        }}
      </span>
      <Button
        v-else
        variant="outline"
        size="xs"
        class="shrink-0 border-n-blue-border text-n-blue-text"
        data-test="active-activity"
        @click="setActivity(null)"
      >
        <Icon :icon="ACTIVITY_ICONS[activity]" class="size-3.5" />
        {{ activeChipLabel }}
        <Icon icon="i-lucide-x" class="size-3.5" />
      </Button>
      <Separator orientation="vertical" class="h-3.5 mx-1" />
      <Button
        v-for="chip in inactiveChips"
        :key="chip"
        variant="outline"
        size="xs"
        class="shrink-0 text-n-slate-11"
        :data-test="`activity-${chip}`"
        @click="setActivity(chip)"
      >
        <Icon :icon="ACTIVITY_ICONS[chip]" class="size-3.5" />
        {{ activityLabel(chip) }}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="outline"
            size="xs"
            class="shrink-0"
            :class="
              isOtherActivitySelected ? 'text-n-slate-12' : 'text-n-slate-11'
            "
            data-test="other-activity"
          >
            <Icon icon="i-lucide-phone" class="size-3.5" />
            {{ t('CALLS_PAGE.FILTERS.OTHER_ACTIVITY') }}
            <Icon icon="i-lucide-chevron-down" class="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-48">
          <DropdownMenuItem
            v-for="item in otherActivityItems"
            :key="item.value"
            :class="
              item.isSelected ? 'bg-n-alpha-1 dark:bg-n-solid-active' : ''
            "
            @select="setActivity(item.value)"
          >
            <Icon :icon="item.icon" class="size-4" />
            <span class="flex-1 min-w-0 truncate">{{ item.label }}</span>
            <Icon v-if="item.isSelected" icon="i-lucide-check" class="size-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <DropdownMenu v-if="showAssignee" @update:open="onAssigneeMenuToggle">
        <DropdownMenuTrigger as-child>
          <Button
            variant="outline"
            size="xs"
            class="max-w-52"
            :class="assigneeId ? 'text-n-slate-12' : 'text-n-slate-11'"
            data-test="assignee-filter"
          >
            <Avatar
              v-if="selectedAssignee"
              :src="selectedAssignee.thumbnail"
              :name="selectedAssignee.name"
              :size="16"
              rounded-full
            />
            <Icon v-else icon="i-woot-empty-assignee" class="size-3.5" />
            <span class="truncate">{{ selectedAssigneeLabel }}</span>
            <Icon icon="i-lucide-chevron-down" class="size-3.5 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-60 max-h-72">
          <div class="sticky top-0 z-10 mb-1 bg-n-alpha-3 backdrop-blur-sm">
            <InputGroup>
              <InputGroupAddon>
                <Icon icon="i-lucide-search" class="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                :value="assigneeSearch"
                type="search"
                :placeholder="t('DROPDOWN_MENU.SEARCH_PLACEHOLDER')"
                @input="assigneeSearch = $event.target.value"
              />
            </InputGroup>
          </div>
          <DropdownMenuItem
            v-for="item in assigneeItems"
            :key="item.value ?? 'all'"
            :class="
              item.isSelected ? 'bg-n-alpha-1 dark:bg-n-solid-active' : ''
            "
            @select="setAssignee(item.value)"
          >
            <Avatar
              v-if="item.thumbnail"
              :name="item.thumbnail.name"
              :src="item.thumbnail.src"
              :size="20"
              rounded-full
            />
            <span class="flex-1 min-w-0 truncate">{{ item.label }}</span>
            <Icon v-if="item.isSelected" icon="i-lucide-check" class="size-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="outline"
            size="xs"
            :class="
              hasMoreFilters
                ? 'border-n-blue-border text-n-blue-text'
                : 'text-n-slate-11'
            "
            data-test="more-filters"
          >
            <Icon icon="i-lucide-list-filter" class="size-3.5" />
            {{ t('CALLS_PAGE.FILTERS.MORE_FILTERS') }}
            <Icon icon="i-lucide-chevron-down" class="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-60 max-h-80">
          <DropdownMenuLabel>
            {{ t('CALLS_PAGE.FILTERS.INBOX') }}
          </DropdownMenuLabel>
          <DropdownMenuItem
            v-for="item in inboxItems"
            :key="item.value ?? 'all'"
            :class="
              item.isSelected ? 'bg-n-alpha-1 dark:bg-n-solid-active' : ''
            "
            @select="setInbox(item.value)"
          >
            <span class="flex-1 min-w-0 truncate">{{ item.label }}</span>
            <Icon v-if="item.isSelected" icon="i-lucide-check" class="size-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>
