<script setup>
import { computed, ref } from 'vue';
import { useI18n, I18nT } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from 'dashboard/components-next/ui/command';

defineProps({
  conversationCount: {
    type: Number,
    required: true,
  },
});

const emit = defineEmits(['select']);

const { t } = useI18n();

const isOpen = ref(false);
const selectedTeam = ref(null);

const teams = useMapGetter('teams/getTeams');
const bulkActionsUiFlags = useMapGetter('bulkActions/getUIFlags');
const isUpdating = computed(() => bulkActionsUiFlags.value.isUpdating);

const teamOptions = computed(() => [
  { id: 0, name: t('BULK_ACTION.TEAMS.NONE') },
  ...teams.value,
]);

const isSelected = team =>
  selectedTeam.value !== null && selectedTeam.value.id === team.id;

const handleSelectTeam = team => {
  selectedTeam.value = team;
};

const handleCancel = () => {
  selectedTeam.value = null;
};

const onOpenChange = value => {
  isOpen.value = value;
  if (!value) selectedTeam.value = null;
};

const handleAssign = () => {
  if (isUpdating.value) return;
  emit('select', selectedTeam.value);
  onOpenChange(false);
};
</script>

<template>
  <Popover :open="isOpen" @update:open="onOpenChange">
    <PopoverTrigger as-child>
      <Button
        v-tooltip="$t('BULK_ACTION.ASSIGN_TEAM_TOOLTIP')"
        variant="outline"
        size="icon"
        :class="{ 'bg-n-alpha-2': isOpen }"
      >
        <Icon icon="i-lucide-users-round" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-60 p-0">
      <Command>
        <CommandInput
          :placeholder="t('BULK_ACTION.SEARCH_INPUT_PLACEHOLDER')"
        />
        <CommandList class="max-h-60">
          <CommandEmpty>
            {{ t('BULK_ACTION.TEAMS.NO_TEAMS_AVAILABLE') }}
          </CommandEmpty>
          <CommandGroup>
            <CommandItem
              v-for="team in teamOptions"
              :key="team.id"
              :value="`${team.name} ${team.id}`"
              @select="handleSelectTeam(team)"
            >
              <span class="flex-1 min-w-0 truncate">{{ team.name }}</span>
              <Icon
                v-if="isSelected(team)"
                icon="i-lucide-check"
                class="size-4 flex-shrink-0"
              />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
      <div
        v-if="selectedTeam"
        class="flex flex-col gap-2 p-2 border-t border-border"
      >
        <I18nT
          v-if="selectedTeam.id"
          keypath="BULK_ACTION.TEAMS.ASSIGN_TEAM_CONFIRMATION_LABEL"
          tag="p"
          class="text-xs text-n-slate-11 px-1 mb-0"
          :plural="conversationCount"
        >
          <template #n>
            <strong class="text-n-slate-12">{{ conversationCount }}</strong>
          </template>
          <template #teamName>
            <strong class="text-n-slate-12">{{ selectedTeam.name }}</strong>
          </template>
        </I18nT>
        <I18nT
          v-else
          keypath="BULK_ACTION.TEAMS.UNASSIGN_TEAM_CONFIRMATION_LABEL"
          tag="p"
          class="text-xs text-n-slate-11 px-1 mb-0"
          :plural="conversationCount"
        >
          <template #n>
            <strong class="text-n-slate-12">{{ conversationCount }}</strong>
          </template>
        </I18nT>
        <div class="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            class="flex-1"
            @click="handleCancel"
          >
            {{ t('BULK_ACTION.CANCEL') }}
          </Button>
          <Button
            size="sm"
            class="flex-1"
            :disabled="isUpdating"
            @click="handleAssign"
          >
            <Spinner v-if="isUpdating" class="size-4" />
            {{ t('BULK_ACTION.YES') }}
          </Button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
