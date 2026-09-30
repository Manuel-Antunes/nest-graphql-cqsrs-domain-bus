<script>
const MINUTE_IN_MILLI_SECONDS = 60000;
const HOUR_IN_MILLI_SECONDS = MINUTE_IN_MILLI_SECONDS * 60;
const DAY_IN_MILLI_SECONDS = HOUR_IN_MILLI_SECONDS * 24;

import { dynamicTime, shortTimestamp } from 'shared/helpers/timeHelper';
import { useExactTimestamp } from 'shared/composables/useExactTimestamp';

export default {
  name: 'TimeAgo',
  props: {
    isAutoRefreshEnabled: {
      type: Boolean,
      default: true,
    },
    lastActivityTimestamp: {
      type: [String, Date, Number],
      default: '',
    },
    createdAtTimestamp: {
      type: [String, Date, Number],
      default: '',
    },
    conversationId: {
      type: [String, Number],
      default: '',
    },
  },
  setup() {
    return { exactTimestamp: useExactTimestamp() };
  },
  data() {
    return {
      lastActivityAtTimeAgo: dynamicTime(this.lastActivityTimestamp),
      createdAtTimeAgo: dynamicTime(this.createdAtTimestamp),
      // Short forms are state, not computed from the long ones: they come from
      // the TIMESTAMP now (`shortTimestamp` reads English words, so it must not
      // be fed the localized string), and the refresh timer has to be able to
      // tick them — a computed over an unchanging prop never would.
      lastActivityTime: shortTimestamp(this.lastActivityTimestamp),
      createdAtTime: shortTimestamp(this.createdAtTimestamp),
      timer: null,
    };
  },
  computed: {
    createdAt() {
      return `${this.$t(
        'CHAT_LIST.CHAT_TIME_STAMP.CREATED.OLDEST'
      )} ${this.exactTimestamp(this.createdAtTimestamp)}`;
    },
    lastActivity() {
      return `${this.$t(
        'CHAT_LIST.CHAT_TIME_STAMP.LAST_ACTIVITY.NOT_ACTIVE'
      )} ${this.exactTimestamp(this.lastActivityTimestamp)}`;
    },
    tooltipText() {
      return `${this.createdAt}\n${this.lastActivity}`;
    },
  },
  watch: {
    lastActivityTimestamp() {
      this.refreshLastActivity();
    },
    createdAtTimestamp() {
      this.refreshCreatedAt();
    },
    conversationId() {
      // Reset display values and timer when the row is recycled to a different conversation.
      this.refreshLastActivity();
      this.refreshCreatedAt();
      if (this.isAutoRefreshEnabled) {
        clearTimeout(this.timer);
        this.createTimer();
      }
    },
  },
  mounted() {
    if (this.isAutoRefreshEnabled) {
      this.createTimer();
    }
  },
  unmounted() {
    clearTimeout(this.timer);
  },
  methods: {
    refreshLastActivity() {
      this.lastActivityAtTimeAgo = dynamicTime(this.lastActivityTimestamp);
      this.lastActivityTime = shortTimestamp(this.lastActivityTimestamp);
    },
    refreshCreatedAt() {
      this.createdAtTimeAgo = dynamicTime(this.createdAtTimestamp);
      this.createdAtTime = shortTimestamp(this.createdAtTimestamp);
    },
    createTimer() {
      this.timer = setTimeout(() => {
        this.refreshLastActivity();
        this.refreshCreatedAt();
        this.createTimer();
      }, this.refreshTime());
    },
    refreshTime() {
      const timeDiff = Date.now() - this.lastActivityTimestamp * 1000;
      if (timeDiff > DAY_IN_MILLI_SECONDS) {
        return DAY_IN_MILLI_SECONDS;
      }
      if (timeDiff > HOUR_IN_MILLI_SECONDS) {
        return HOUR_IN_MILLI_SECONDS;
      }

      return MINUTE_IN_MILLI_SECONDS;
    },
  },
};
</script>

<template>
  <div
    v-tooltip.top="{
      content: tooltipText,
      popperClass: 'whitespace-pre-line',
      delay: { show: 1000, hide: 0 },
    }"
    class="ml-auto leading-4 text-xxs text-n-slate-10 hover:text-n-slate-11"
  >
    <span>{{ `${createdAtTime} • ${lastActivityTime}` }}</span>
  </div>
</template>
