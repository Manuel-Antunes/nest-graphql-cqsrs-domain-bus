<script setup>
import { computed } from 'vue';
import 'highlight.js/styles/default.css';
import 'highlight.js/lib/common';
import { Button } from 'dashboard/components-next/ui/button';
import { Card } from 'dashboard/components-next/ui/card';
import { Input } from 'dashboard/components-next/ui/input';
import { copyTextToClipboard } from 'shared/helpers/clipboard';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';
import CardContent from 'next/ui/card/CardContent.vue';

const props = defineProps({
  script: {
    type: String,
    default: '',
  },
  lang: {
    type: String,
    default: 'javascript',
  },
  enableCodePen: {
    type: Boolean,
    default: false,
  },
  codepenTitle: {
    type: String,
    default: 'Chatwoot Codepen',
  },
});

const { t } = useI18n();

const scrubbedScript = computed(() => {
  // remove trailing and leading extra lines and not spaces
  const scrubbed = props.script.replace(/^\s*[\r\n]/gm, '');
  const lines = scrubbed.split('\n');

  // remove extra indentations
  const minIndent = lines.reduce((min, line) => {
    if (line.trim().length === 0) return min;
    const indent = line.match(/^\s*/)[0].length;
    return Math.min(min, indent);
  }, Infinity);

  return lines.map(line => line.slice(minIndent)).join('\n');
});

const codepenScriptValue = computed(() => {
  const lang = props.lang === 'javascript' ? 'js' : props.lang;
  return JSON.stringify({
    title: props.codepenTitle,
    private: true,
    [lang]: scrubbedScript.value,
  });
});

const onCopy = async e => {
  e.preventDefault();
  await copyTextToClipboard(scrubbedScript.value);
  useAlert(t('COMPONENTS.CODE.COPY_SUCCESSFUL'));
};
</script>

<template>
  <div class="flex gap-2 w-full">
    <Card v-if="script" class="min-w-0 flex-1 p-0">
      <CardContent class="overflow-x-auto p-2">
        <highlightjs
          :language="lang"
          :code="scrubbedScript"
          class="text-left text-sm [&_code]:whitespace-pre-wrap [&_code]:break-words [&_code]:!bg-transparent [&_code]:!p-0"
        />
      </CardContent>
    </Card>

    <div class="flex shrink-0 gap-2">
      <form
        v-if="enableCodePen"
        class="flex items-center"
        action="https://codepen.io/pen/define"
        method="POST"
        target="_blank"
      >
        <Input type="hidden" name="data" :value="codepenScriptValue" />
        <Button type="submit">
          {{ t('COMPONENTS.CODE.CODEPEN') }}
        </Button>
      </form>
      <Button @click="onCopy">
        {{ t('COMPONENTS.CODE.BUTTON_TEXT') }}
      </Button>
    </div>
  </div>
</template>
