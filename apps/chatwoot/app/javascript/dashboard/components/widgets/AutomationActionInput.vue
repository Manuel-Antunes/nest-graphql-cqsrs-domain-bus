<script>
import AutomationActionTeamMessageInput from './AutomationActionTeamMessageInput.vue';
import AutomationActionFileInput from './AutomationFileInput.vue';
import WootMessageEditor from 'dashboard/components/widgets/WootWriter/Editor.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';
import { AsyncSelect } from 'dashboard/components-next/ui/async-select';
import { Input } from 'dashboard/components-next/ui/input';

export default {
  components: {
    AutomationActionTeamMessageInput,
    AutomationActionFileInput,
    WootMessageEditor,
    Button,
    Icon,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    AsyncSelect,
    Input,
  },
  props: {
    modelValue: {
      type: Object,
      default: () => null,
    },
    actionTypes: {
      type: Array,
      default: () => [],
    },
    dropdownValues: {
      type: Array,
      default: () => [],
    },
    errorMessage: {
      type: String,
      default: '',
    },
    showActionInput: {
      type: Boolean,
      default: true,
    },
    initialFileName: {
      type: String,
      default: '',
    },
    isMacro: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue', 'input', 'removeAction', 'resetAction'],
  computed: {
    action_name: {
      get() {
        if (!this.modelValue) return null;
        return this.modelValue.action_name;
      },
      set(value) {
        const payload = this.modelValue || {};
        this.$emit('update:modelValue', { ...payload, action_name: value });
        this.$emit('input', { ...payload, action_name: value });
      },
    },
    action_params: {
      get() {
        if (!this.modelValue) return null;
        return this.modelValue.action_params;
      },
      set(value) {
        const payload = this.modelValue || {};
        this.$emit('update:modelValue', { ...payload, action_params: value });
        this.$emit('input', { ...payload, action_params: value });
      },
    },
    inputType() {
      return this.actionTypes.find(action => action.key === this.action_name)
        .inputType;
    },
    actionInputStyles() {
      return {
        'has-error': this.errorMessage,
        'is-a-macro': this.isMacro,
      };
    },
    castMessageVmodel: {
      get() {
        if (Array.isArray(this.action_params)) {
          return this.action_params[0];
        }
        return this.action_params;
      },
      set(value) {
        this.action_params = value;
      },
    },
    // `multi_select` stores params as an array of `{ id, name }`; AsyncSelect
    // speaks in arrays of id strings, so we map between the two shapes.
    multiParamValues() {
      return Array.isArray(this.action_params)
        ? this.action_params.map(v => String(v.id))
        : [];
    },
    // `search_select` is single-choice but is stored as an array of one
    // `{ id, name }` (matching how macros load it), so read the first item.
    singleParamValue() {
      const first = Array.isArray(this.action_params)
        ? this.action_params[0]
        : this.action_params;
      return first?.id != null ? String(first.id) : '';
    },
  },
  methods: {
    removeAction() {
      this.$emit('removeAction');
    },
    resetAction() {
      this.$emit('resetAction');
    },
    onMultiParamUpdate(ids) {
      this.action_params = (this.dropdownValues ?? [])
        .filter(option => ids.includes(String(option.id)))
        .map(option => ({ id: option.id, name: option.name }));
    },
    onSingleParamUpdate(value) {
      const option = this.dropdownValues?.find(o => String(o.id) === value);
      this.action_params = option ? [{ id: option.id, name: option.name }] : [];
    },
  },
};
</script>

<template>
  <div class="filter" :class="actionInputStyles">
    <div class="filter-inputs">
      <Select v-model="action_name" @update:model-value="resetAction()">
        <SelectTrigger
          class="mb-0 mr-1"
          :class="showActionInput ? 'w-full max-w-[50%]' : 'w-full'"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="attribute in actionTypes"
            :key="attribute.key"
            :value="attribute.key"
          >
            {{ attribute.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <div v-if="showActionInput" class="filter__answer--wrap">
        <div v-if="inputType" class="w-full">
          <AsyncSelect
            v-if="inputType === 'search_select'"
            disable-portal
            popover-align="start"
            :model-value="singleParamValue"
            :options="dropdownValues"
            :get-option-value="option => String(option.id)"
            :get-option-label="option => option.name"
            :placeholder="$t('FORMS.MULTISELECT.SELECT')"
            @update:model-value="onSingleParamUpdate"
          />
          <AsyncSelect
            v-else-if="inputType === 'multi_select'"
            multi
            disable-portal
            popover-align="start"
            :model-value="multiParamValues"
            :options="dropdownValues"
            :get-option-value="option => String(option.id)"
            :get-option-label="option => option.name"
            :placeholder="$t('FORMS.MULTISELECT.SELECT')"
            @update:model-value="onMultiParamUpdate"
          />
          <Input
            v-else-if="inputType === 'email'"
            v-model="action_params"
            type="email"
            :placeholder="$t('AUTOMATION.ACTION.EMAIL_INPUT_PLACEHOLDER')"
          />
          <Input
            v-else-if="inputType === 'url'"
            v-model="action_params"
            type="url"
            :placeholder="$t('AUTOMATION.ACTION.URL_INPUT_PLACEHOLDER')"
          />
          <AutomationActionFileInput
            v-if="inputType === 'attachment'"
            v-model="action_params"
            :initial-file-name="initialFileName"
          />
        </div>
      </div>
      <Button v-if="!isMacro" variant="ghost" size="icon" @click="removeAction">
        <Icon icon="i-lucide-x" />
      </Button>
    </div>
    <AutomationActionTeamMessageInput
      v-if="inputType === 'team_message'"
      v-model="action_params"
      :teams="dropdownValues"
    />
    <WootMessageEditor
      v-if="inputType === 'textarea'"
      v-model="castMessageVmodel"
      rows="4"
      enable-variables
      :placeholder="$t('AUTOMATION.ACTION.TEAM_MESSAGE_INPUT_PLACEHOLDER')"
      class="action-message"
    />
    <p v-if="errorMessage" class="filter-error">
      {{ errorMessage }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.filter {
  @apply bg-n-background p-2 border border-solid border-n-strong dark:border-n-strong rounded-lg mb-2;

  &.is-a-macro {
    @apply mb-0 bg-n-background dark:bg-n-solid-1 p-0 border-0 rounded-none;
  }
}

.no-margin-bottom {
  @apply mb-0;
}

.filter.has-error {
  @apply bg-n-ruby-8/20 border-n-ruby-5 dark:border-n-ruby-5;

  &.is-a-macro {
    @apply bg-transparent;
  }
}

.filter-inputs {
  @apply flex gap-1;
}

.filter-error {
  @apply text-n-ruby-9 dark:text-n-ruby-9 block my-1 mx-0;
}

.action__question,
.filter__operator {
  @apply mb-0 mr-1;
}

.action__question {
  @apply max-w-[50%];
}

.action__question.full-width {
  @apply max-w-full;
}

.filter__answer--wrap {
  @apply max-w-[50%] flex-grow mr-1 flex w-full items-center justify-start;

  input {
    @apply mb-0;
  }
}
.filter__answer {
  &.answer--text-input {
    @apply mb-0;
  }
}

.filter__join-operator-wrap {
  @apply relative z-20 m-0;
}

.filter__join-operator {
  @apply flex items-center justify-center relative my-2.5 mx-0;

  .operator__line {
    @apply absolute w-full border-b border-solid border-n-weak;
  }

  .operator__select {
    margin-bottom: 0 !important;
    @apply relative w-auto;
  }
}

.action-message {
  @apply mt-2 mx-0 mb-0;
}
// Prosemirror does not have a native way of hiding the menu bar, hence
::v-deep .ProseMirror-menubar {
  @apply hidden;
}
</style>
