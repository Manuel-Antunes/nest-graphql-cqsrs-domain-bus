<script setup>
import { computed, getCurrentInstance, ref, useTemplateRef } from 'vue';
import { downloadFile } from '@chatwoot/utils';
import { useEmitter } from 'dashboard/composables/emitter';
import { emitter } from 'shared/helpers/mitt';
import { Button } from 'dashboard/components-next/ui/button';
import { Separator } from 'dashboard/components-next/ui/separator';
import { Slider } from 'dashboard/components-next/ui/slider';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  src: {
    type: String,
    required: true,
  },
  fallbackDuration: {
    type: Number,
    default: 0,
  },
});

const PLAYBACK_SPEEDS = [1, 1.5, 2];

const audioPlayer = useTemplateRef('audioPlayer');
const { uid } = getCurrentInstance();

const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(props.fallbackDuration);
const playbackSpeed = ref(1);

const onLoadedMetadata = () => {
  const loadedDuration = audioPlayer.value?.duration;
  if (Number.isFinite(loadedDuration)) duration.value = loadedDuration;
};

const formatTime = time => {
  if (!time || Number.isNaN(time)) return '00:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const playbackSpeedLabel = computed(() => `${playbackSpeed.value}x`);

const displayedTime = computed(() =>
  formatTime(
    isPlaying.value || currentTime.value ? currentTime.value : duration.value
  )
);

const sliderMax = computed(() => Math.max(duration.value || 0, 1));

// Only one recording should play at a time across the list.
useEmitter('pause_playing_audio', currentPlayingId => {
  if (currentPlayingId !== uid && isPlaying.value) {
    audioPlayer.value?.pause();
    isPlaying.value = false;
  }
});

const playOrPause = () => {
  if (isPlaying.value) {
    audioPlayer.value.pause();
    isPlaying.value = false;
  } else {
    emitter.emit('pause_playing_audio', uid);
    audioPlayer.value.play();
    isPlaying.value = true;
  }
};

const onTimeUpdate = () => {
  currentTime.value = audioPlayer.value?.currentTime;
};

const seek = ([time]) => {
  if (!audioPlayer.value) return;
  audioPlayer.value.currentTime = time;
  currentTime.value = time;
};

const onEnd = () => {
  isPlaying.value = false;
  currentTime.value = 0;
};

const changePlaybackSpeed = () => {
  const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed.value);
  playbackSpeed.value =
    PLAYBACK_SPEEDS[(currentIndex + 1) % PLAYBACK_SPEEDS.length];
  audioPlayer.value.playbackRate = playbackSpeed.value;
};

const downloadRecording = () => {
  downloadFile({ url: props.src, type: 'audio' });
};
</script>

<template>
  <div
    class="flex items-center h-8 gap-2 px-1.5 rounded-full bg-n-alpha-1 dark:bg-n-alpha-2 overflow-hidden"
    @click.stop
  >
    <audio
      ref="audioPlayer"
      class="hidden"
      playsinline
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @ended="onEnd"
    >
      <source :src="src" />
    </audio>
    <Button
      variant="ghost"
      size="icon-xs"
      class="rounded-full shrink-0"
      data-test="play-toggle"
      @click="playOrPause"
    >
      <Icon
        :icon="isPlaying ? 'i-woot-audio-pause' : 'i-woot-audio-play'"
        class="size-4 text-n-slate-11"
      />
    </Button>
    <Slider
      :model-value="[currentTime]"
      :max="sliderMax"
      :step="0.1"
      class="flex-1 min-w-16"
      @update:model-value="seek"
    />
    <span class="text-label-small tabular-nums text-n-slate-11 shrink-0">
      {{ displayedTime }}
    </span>
    <Separator orientation="vertical" class="h-3.5" />
    <Button
      variant="ghost"
      size="xs"
      class="px-1 min-w-6 rounded-full text-n-slate-11 tabular-nums shrink-0"
      @click="changePlaybackSpeed"
    >
      {{ playbackSpeedLabel }}
    </Button>
    <Separator orientation="vertical" class="h-3.5" />
    <Button
      variant="ghost"
      size="icon-xs"
      class="rounded-full shrink-0"
      @click="downloadRecording"
    >
      <Icon icon="i-lucide-download" class="size-4 text-n-slate-11" />
    </Button>
  </div>
</template>
