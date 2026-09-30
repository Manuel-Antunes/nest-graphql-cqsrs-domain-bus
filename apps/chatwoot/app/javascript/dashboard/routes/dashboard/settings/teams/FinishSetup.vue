<script>
import { Button } from 'dashboard/components-next/ui/button';
import EmptyState from '../../../../components/widgets/EmptyState.vue';
import AppLink from 'dashboard/components-next/AppLink.vue';

export default {
  components: {
    Button,
    EmptyState,
    AppLink,
  },
};
</script>

<template>
  <div class="h-full w-full p-6 col-span-6">
    <EmptyState
      :title="$t('TEAMS_SETTINGS.FINISH.TITLE')"
      :message="$t('TEAMS_SETTINGS.FINISH.MESSAGE')"
      :button-text="$t('TEAMS_SETTINGS.FINISH.BUTTON_TEXT')"
    >
      <div class="w-full text-center">
        <AppLink
          :to="{
            name: 'settings_teams_list',
          }"
        >
          <Button variant="default" class="bg-n-teal-9 text-white hover:bg-n-teal-10">{{ $t('TEAMS_SETTINGS.FINISH.BUTTON_TEXT') }}</Button>
        </AppLink>
      </div>
    </EmptyState>
  </div>
</template>
