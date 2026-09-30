<script>
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

export default {
  components: {
    Button,
    Icon,
  },
  props: {
    bannerMessage: {
      type: String,
      default: '',
    },
    hrefLink: {
      type: String,
      default: '',
    },
    hrefLinkText: {
      type: String,
      default: '',
    },
    hasActionButton: {
      type: Boolean,
      default: false,
    },
    actionButtonVariant: {
      type: String,
      default: 'faded',
    },
    actionButtonLabel: {
      type: String,
      default: '',
    },
    actionButtonIcon: {
      type: String,
      default: 'i-lucide-arrow-right',
    },
    colorScheme: {
      type: String,
      default: '',
    },
    hasCloseButton: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['primaryAction', 'close'],
  computed: {
    bannerClasses() {
      const classList = [this.colorScheme];

      if (this.hasActionButton || this.hasCloseButton) {
        classList.push('has-button');
      }
      return classList;
    },
    // Maps colorScheme to shadcn variant
    getButtonVariant() {
      const variantMap = {
        primary: 'default',
        secondary: 'secondary',
        alert: 'destructive',
        warning: 'secondary',
      };
      return variantMap[this.colorScheme] || 'default';
    },
  },
  methods: {
    onClick(e) {
      this.$emit('primaryAction', e);
    },
    onClickClose(e) {
      this.$emit('close', e);
    },
  },
};
</script>

<template>
  <div
    class="flex items-center justify-center h-12 gap-4 px-4 py-3 text-xs text-white banner dark:text-white woot-banner"
    :class="bannerClasses"
  >
    <span class="banner-message">
      {{ bannerMessage }}
      <a
        v-if="hrefLink"
        :href="hrefLink"
        rel="noopener noreferrer nofollow"
        target="_blank"
      >
        {{ hrefLinkText }}
      </a>
    </span>
    <div class="actions">
      <Button
        v-if="hasActionButton"
        :variant="getButtonVariant"
        size="icon"
        @click="onClick"
      >
        <Icon :icon="actionButtonIcon" />
        <span v-if="actionButtonLabel" class="sr-only">{{
          actionButtonLabel
        }}</span>
      </Button>
      <Button
        v-if="hasCloseButton"
        :variant="getButtonVariant"
        size="icon"
        @click="onClickClose"
      >
        <Icon icon="i-lucide-circle-x" />
        <span class="sr-only">{{ $t('GENERAL_SETTINGS.DISMISS') }}</span>
      </Button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.banner {
  &.primary {
    @apply bg-n-brand;
  }

  &.secondary {
    @apply bg-n-slate-3 dark:bg-n-solid-3 text-n-slate-12;
    a {
      @apply text-n-slate-12;
    }
  }

  &.alert {
    @apply bg-n-ruby-3 text-n-ruby-12;

    a {
      @apply text-n-ruby-12;
    }
  }

  &.warning {
    @apply bg-n-amber-5 text-n-amber-12;
    a {
      @apply text-n-amber-12;
    }
  }

  &.gray {
    @apply text-n-gray-10 dark:text-n-gray-10;
  }

  a {
    @apply ml-1 underline text-n-amber-12 text-xs;
  }

  .banner-message {
    @apply flex items-center;
  }

  .actions {
    @apply flex gap-1 right-3;
  }
}
</style>
