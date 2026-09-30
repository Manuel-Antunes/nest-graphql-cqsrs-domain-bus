<script>
import Draggable from 'vuedraggable';
import MacroNode from './MacroNode.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { getFileName } from './macroHelper';

export default {
  components: {
    Draggable,
    MacroNode,
    Button,
    Icon,
  },
  props: {
    errors: {
      type: Object,
      default: () => ({}),
    },
    modelValue: {
      type: Array,
      default: () => [],
    },
    files: {
      type: Array,
      default: () => [],
    },
  },
  emits: ['update:modelValue', 'resetAction', 'deleteNode', 'addNewNode'],
  computed: {
    actionData: {
      get() {
        return this.modelValue;
      },
      set(value) {
        this.$emit('update:modelValue', value);
      },
    },
  },
  methods: {
    fileName() {
      return getFileName(...arguments);
    },
  },
};
</script>

<template>
  <div class="macros__nodes">
    <div class="macro__node">
      <div>
        <span
          class="bg-n-solid-blue text-n-blue-text py-1 px-1.5 leading-none text-sm rounded-md"
        >
          {{ $t('MACROS.EDITOR.START_FLOW') }}
        </span>
      </div>
    </div>
    <Draggable
      :list="actionData"
      animation="200"
      item-key="id"
      ghost-class="ghost"
      tag="div"
      class="macros__nodes-draggable"
      handle=".macros__node-drag-handle"
    >
      <template #item="{ index: i }">
        <div :key="i" class="macro__node">
          <MacroNode
            v-model="actionData[i]"
            class="macros__node-action"
            type="add"
            :index="i"
            :error-key="errors[`action_${i}`]"
            :file-name="
              fileName(
                actionData[i].action_params[0],
                actionData[i].action_name,
                files
              )
            "
            :single-node="actionData.length === 1"
            @reset-action="$emit('resetAction', i)"
            @delete-node="$emit('deleteNode', i)"
          />
        </div>
      </template>
    </Draggable>
    <div class="macro__node">
      <div>
        <Button
          :title="$t('MACROS.EDITOR.ADD_BTN_TOOLTIP')"
          @click="$emit('addNewNode')"
        >
          <Icon :icon="'i-lucide-plus-circle'" />
          {{ $t('MACROS.EDITOR.ADD_BTN_TOOLTIP') }}
        </Button>
      </div>
    </div>
    <div class="macro__node">
      <div>
        <span
          class="bg-n-solid-blue text-n-blue-text py-1 px-1.5 leading-none text-sm rounded-md"
        >
          {{ $t('MACROS.EDITOR.END_FLOW') }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.macros__nodes {
  max-width: 800px;
}

.macro__node:not(:last-child) {
  position: relative;
  padding-bottom: 2rem;
}

// Plain CSS (not @apply): Tailwind v4 expands variant utilities like
// `ltr:`/`rtl:` into nested `&:where(...)` rules, which @vitejs/plugin-vue's
// scoped-style transform cannot parse inside a ::after pseudo-element.
.macro__node:not(:last-child):not(.sortable-chosen):after,
.macros__nodes-draggable:after {
  content: '';
  position: absolute;
  height: 2rem;
  width: 0.25rem;
  border-left: 1px dashed rgb(var(--blue-7));
  margin-inline-start: 1.5rem;
}
.dark .macro__node:not(:last-child):not(.sortable-chosen):after,
.dark .macros__nodes-draggable:after {
  border-color: rgb(var(--blue-11));
}

.macros__nodes-draggable {
  position: relative;
  padding-bottom: 2rem;
}

.macros__node-action-container {
  position: relative;
  .drag-handle {
    position: absolute;
    left: -1.5rem;
    top: 0.25rem;
    cursor: move;
  }
}
</style>
