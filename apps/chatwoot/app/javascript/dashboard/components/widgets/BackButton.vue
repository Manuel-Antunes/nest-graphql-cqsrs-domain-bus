<script setup>
import Icon from 'next/icon/Icon.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

const { visit } = useAppNavigation();

const props = defineProps({
  backUrl: {
    type: [String, Object],
    default: '',
  },
  buttonLabel: {
    type: String,
    default: '',
  },
  compact: {
    type: Boolean,
    default: false,
  },
});

// Navigate via useAppNavigation (dual-mode): under Inertia it does an SPA visit, under
// the legacy SPA it delegates to vue-router. The previous lazy `import(routes/index)` +
// `router.push` was a no-op under Inertia because that vue-router instance is never
// mounted in the Inertia app, so the back button did nothing. `window.history.back()`
// covers the no-backUrl case in both modes (both use HTML5 history).
const goBack = () => {
  if (props.backUrl !== '') {
    visit(props.backUrl);
  } else {
    window.history.back();
  }
};

const buttonStyleClass = props.compact ? 'text-sm' : 'text-base';
</script>

<template>
  <Button @click.capture="goBack" variant="ghost" size="icon">
    <!-- <i class="i-lucide-chevron-left -ml-1 text-lg" /> -->
    <Icon icon="i-lucide-chevron-left" />
    <!-- {{ buttonLabel || $t('GENERAL_SETTINGS.BACK') }} -->
  </Button>
  <!-- <button
    class="flex items-center p-0 font-normal cursor-pointer text-n-slate-11"
    :class="buttonStyleClass"
    @click.capture="goBack"
  >
    <i class="i-lucide-chevron-left -ml-1 text-lg" />
    {{ buttonLabel || $t('GENERAL_SETTINGS.BACK') }}
  </button> -->
</template>
