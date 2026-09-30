<script setup>
import { ref } from 'vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import ConfirmButton from 'dashboard/components-next/button/ConfirmButton.vue';
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from 'dashboard/components-next/ui/input-group';

const props = defineProps({
  value: { type: String, default: '' },
  showResetButton: { type: Boolean, default: true },
});

const emit = defineEmits(['onCopy', 'onReset']);

const inputType = ref('password');

const toggleMasked = () => {
  inputType.value = inputType.value === 'password' ? 'text' : 'password';
};

const onClick = () => {
  emit('onCopy', props.value);
};

const onReset = () => {
  emit('onReset');
};
</script>

<template>
  <div class="flex flex-row justify-between gap-4">
    <InputGroup class="flex-1">
      <InputGroupInput
        name="access_token"
        :type="inputType"
        :model-value="value"
        readonly
        class="cursor-not-allowed"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          type="button"
          size="icon-xs"
          variant="ghost"
          :aria-label="
            inputType === 'password'
              ? 'Show access token'
              : 'Hide access token'
          "
          @click="toggleMasked"
        >
          <Icon
            :icon="inputType === 'password' ? 'i-lucide-eye' : 'i-lucide-eye-off'"
            class="size-4"
          />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
    <div class="flex flex-row gap-2">
      <Button variant="ghost" type="button" class="rounded-xl" @click="onClick">
        <Icon icon="i-lucide-copy" class="size-4" />
        {{ $t('PROFILE_SETTINGS.FORM.ACCESS_TOKEN.COPY') }}
      </Button>
      <ConfirmButton v-if="showResetButton" :label="$t('PROFILE_SETTINGS.FORM.ACCESS_TOKEN.RESET')"
        :confirm-label="$t('PROFILE_SETTINGS.FORM.ACCESS_TOKEN.CONFIRM_RESET')"
        :confirm-hint="$t('PROFILE_SETTINGS.FORM.ACCESS_TOKEN.CONFIRM_HINT')" variant="ghost"
        confirm-variant="destructive" icon="i-lucide-key-round" class="rounded-xl" @click="onReset" />
    </div>
  </div>
</template>
