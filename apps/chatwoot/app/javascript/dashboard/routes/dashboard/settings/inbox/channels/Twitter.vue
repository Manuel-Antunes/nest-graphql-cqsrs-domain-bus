<script>
import { useAlert } from 'dashboard/composables';
import twitterClient from '../../../../../api/channel/twitterClient';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';

export default {
  components: {
    Button,
    Spinner,
    Icon,
  },
  data() {
    return { isRequestingAuthorization: false };
  },
  methods: {
    async requestAuthorization() {
      try {
        this.isRequestingAuthorization = true;
        const response = await twitterClient.generateAuthorization();
        const {
          data: { url },
        } = response;
        window.location.href = url;
      } catch (error) {
        useAlert(this.$t('INBOX_MGMT.ADD.TWITTER.ERROR_MESSAGE'));
      } finally {
        this.isRequestingAuthorization = false;
      }
    },
  },
};
</script>

<template>
  <div class="h-full w-full p-6 col-span-6">
    <div class="login-init h-full text-center">
      <form @submit.prevent="requestAuthorization">
        <Button type="submit" :disabled="isRequestingAuthorization">
          <Spinner
            v-if="isRequestingAuthorization"
            class="size-4 flex-shrink-0"
          />
          <template v-if="!isRequestingAuthorization">
            <Icon :icon="'i-ri-twitter-x-fill'" class="size-4" />
            Sign in with Twitter
          </template>
        </Button>
      </form>
      <p>{{ $t('INBOX_MGMT.ADD.TWITTER.HELP') }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login-init {
  @apply pt-[30%] text-center;
  p {
    @apply p-6;
  }
  > a > img {
    @apply w-60;
  }
}
</style>
