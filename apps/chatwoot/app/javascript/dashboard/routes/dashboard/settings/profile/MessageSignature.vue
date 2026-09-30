<script setup>
import { ref, watch } from 'vue';
import WootMessageEditor from 'dashboard/components/widgets/WootWriter/Editor.vue';
import { Button } from 'dashboard/components-next/ui/button';

const props = defineProps({
  messageSignature: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['updateSignature']);
const signature = ref(props.messageSignature);
watch(
  () => props.messageSignature ?? '',
  newValue => {
    signature.value = newValue;
  }
);

const updateSignature = () => {
  emit('updateSignature', signature.value);
};
</script>

<template>
  <form class="flex flex-col gap-6" @submit.prevent="updateSignature()">
    <WootMessageEditor
      id="message-signature-input"
      v-model="signature"
      class="message-editor h-[10rem] !px-3"
      is-format-mode
      :placeholder="$t('PROFILE_SETTINGS.FORM.MESSAGE_SIGNATURE.PLACEHOLDER')"
      channel-type="Context::MessageSignature"
      :enable-suggestions="false"
      show-image-resize-toolbar
    />
    <div>
      <Button type="submit">
        {{ $t('PROFILE_SETTINGS.FORM.MESSAGE_SIGNATURE_SECTION.BTN_TEXT') }}
      </Button>
    </div>
  </form>
</template>
