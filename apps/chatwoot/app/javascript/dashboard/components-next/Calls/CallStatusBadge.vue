<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Badge } from 'dashboard/components-next/ui/badge';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { CALL_KIND } from './constants';

const props = defineProps({
  kind: {
    type: String,
    required: true,
  },
});

const { t } = useI18n();

const KIND_CONFIG = {
  [CALL_KIND.ONGOING]: {
    icon: 'i-lucide-phone-call',
    class: 'bg-n-teal-3 text-n-teal-11',
  },
  [CALL_KIND.INCOMING]: {
    icon: 'i-lucide-phone-incoming',
    class: 'bg-n-slate-3 text-n-slate-11',
  },
  [CALL_KIND.OUTGOING]: {
    icon: 'i-lucide-phone-outgoing',
    class: 'bg-n-slate-3 text-n-slate-11',
  },
  [CALL_KIND.MISSED]: {
    icon: 'i-lucide-phone-missed',
    class: 'bg-n-ruby-3 text-n-ruby-11',
  },
  [CALL_KIND.NO_REPLY]: {
    icon: 'i-lucide-phone-outgoing',
    class: 'bg-n-amber-3 text-n-amber-11',
  },
  [CALL_KIND.FAILED]: {
    icon: 'i-lucide-phone-off',
    class: 'bg-n-ruby-3 text-n-ruby-11',
  },
};

const config = computed(() => KIND_CONFIG[props.kind]);
</script>

<template>
  <Badge
    variant="secondary"
    :data-kind="kind"
    class="gap-1.5 rounded-md min-w-20 h-6"
    :class="config.class"
  >
    <Icon :icon="config.icon" class="size-3 flex-shrink-0" />
    <span class="truncate">{{
      t(`CALLS_PAGE.STATUS.${kind.toUpperCase()}`)
    }}</span>
  </Badge>
</template>
