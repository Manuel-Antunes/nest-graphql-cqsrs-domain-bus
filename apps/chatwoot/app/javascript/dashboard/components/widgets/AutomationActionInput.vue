<script>
/* eslint-disable vue/no-reserved-component-names -- shadcn Button/Select/Input component names */
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

const CONTACT_EMAIL_TOKEN = '{{contact.email}}';

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
    dropdownMaxHeight: {
      type: String,
      default: 'max-h-80',
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
    isVerticalLayout() {
      return ['team_message', 'textarea', 'email'].includes(this.inputType);
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
    multiParamValues() {
      return Array.isArray(this.action_params)
        ? this.action_params.map(v => String(v.id))
        : [];
    },
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
    insertContactEmailToken() {
      const existingEmails = (this.castMessageVmodel || '')
        .split(',')
        .map(email => email.trim())
        .filter(Boolean);

      const hasContactEmail = existingEmails.some(
        email => email.replace(/\s+/g, '') === CONTACT_EMAIL_TOKEN
      );
      if (hasContactEmail) return;

      this.action_params = [[...existingEmails, CONTACT_EMAIL_TOKEN].join(',')];
    },
  },
};
</script>

<template>
  <li class="list-none py-2 first:pt-0 last:pb-0">
    <div
      class="flex flex-col gap-2"
      :class="{ 'animate-wiggle': errorMessage }"
    >
      <div class="flex items-center gap-2">
        <Select v-model="action_name" @update:model-value="resetAction()">
          <SelectTrigger
            class="mb-0"
            :class="
              showActionInput && !isVerticalLayout
                ? 'w-full max-w-[50%]'
                : 'w-full'
            "
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="attribute in actionTypes"
              :key="attribute.key"
              :value="attribute.key"
            >
              <Icon v-if="attribute.icon" :icon="attribute.icon" />
              {{ attribute.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <div
          v-if="showActionInput && !isVerticalLayout"
          class="flex-grow min-w-0"
        >
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
            v-else-if="inputType === 'url'"
            v-model="action_params"
            type="url"
            :placeholder="$t('AUTOMATION.ACTION.URL_INPUT_PLACEHOLDER')"
          />
          <AutomationActionFileInput
            v-else-if="inputType === 'attachment'"
            v-model="action_params"
            :initial-file-name="initialFileName"
          />
        </div>
        <Button
          v-if="!isMacro"
          variant="outline"
          size="icon"
          class="flex-shrink-0"
          @click="removeAction"
        >
          <Icon icon="i-lucide-trash" />
        </Button>
      </div>
      <div v-if="inputType === 'email'" class="flex items-center w-full gap-2">
        <Input
          v-model="castMessageVmodel"
          type="text"
          class="flex-1"
          :placeholder="$t('AUTOMATION.ACTION.EMAIL_INPUT_PLACEHOLDER')"
        />
        <Button
          variant="outline"
          class="flex-shrink-0 whitespace-nowrap"
          @click="insertContactEmailToken"
        >
          {{ $t('AUTOMATION.ACTION.INSERT_CONTACT_EMAIL') }}
        </Button>
      </div>
      <AutomationActionTeamMessageInput
        v-else-if="inputType === 'team_message'"
        v-model="action_params"
        :teams="dropdownValues"
        :dropdown-max-height="dropdownMaxHeight"
      />
      <WootMessageEditor
        v-else-if="inputType === 'textarea'"
        v-model="castMessageVmodel"
        rows="4"
        enable-variables
        :placeholder="$t('AUTOMATION.ACTION.TEAM_MESSAGE_INPUT_PLACEHOLDER')"
        class="[&_.ProseMirror-menubar]:hidden px-3 py-1 bg-n-alpha-1 rounded-lg outline outline-1 outline-n-weak dark:outline-n-strong"
      />
    </div>
    <span v-if="errorMessage" class="text-sm text-n-ruby-11">
      {{ errorMessage }}
    </span>
  </li>
</template>
