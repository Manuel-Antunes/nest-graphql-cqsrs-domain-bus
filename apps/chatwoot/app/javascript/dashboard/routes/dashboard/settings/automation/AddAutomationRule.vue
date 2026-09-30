<script>
import { mapGetters } from 'vuex';
import FilterInputBox from 'dashboard/components/widgets/FilterInput/Index.vue';
import AutomationActionInput from 'dashboard/components/widgets/AutomationActionInput.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Input } from 'dashboard/components-next/ui/input';
import { Label } from 'dashboard/components-next/ui/label';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { useAutomation } from 'dashboard/composables/useAutomation';
import { validateAutomation } from 'dashboard/helper/validations';
import {
  generateAutomationPayload,
  getAttributes,
  getInputType,
  getOperators,
  getCustomAttributeType,
  showActionInput,
} from 'dashboard/helper/automationHelper';
import { AUTOMATION_RULE_EVENTS, AUTOMATION_ACTION_TYPES } from './constants';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from 'dashboard/components-next/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';

const start_value = {
  name: null,
  description: null,
  event_name: 'conversation_created',
  conditions: [
    {
      attribute_key: 'status',
      filter_operator: 'equal_to',
      values: '',
      query_operator: 'and',
      custom_attribute_type: '',
    },
  ],
  actions: [
    {
      action_name: 'assign_agent',
      action_params: [],
    },
  ],
};

export default {
  components: {
    FilterInputBox,
    AutomationActionInput,
    Button,
    Input,
    Label,
    Icon,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  },
  props: {
    open: {
      type: Boolean,
      default: false,
    },
    onClose: {
      type: Function,
      default: () => {},
    },
  },
  emits: ['saveAutomation'],
  setup() {
    const {
      automation,
      automationTypes,
      onEventChange,
      getConditionDropdownValues,
      appendNewCondition,
      appendNewAction,
      removeFilter,
      removeAction,
      resetFilter,
      resetAction,
      getActionDropdownValues,
      manifestCustomAttributes,
    } = useAutomation(start_value);
    return {
      automation,
      automationTypes,
      onEventChange,
      getConditionDropdownValues,
      appendNewCondition,
      appendNewAction,
      removeFilter,
      removeAction,
      resetFilter,
      resetAction,
      getActionDropdownValues,
      manifestCustomAttributes,
    };
  },
  data() {
    return {
      automationRuleEvent: AUTOMATION_RULE_EVENTS[0].key,
      automationMutated: false,
      show: true,
      showDeleteConfirmationModal: false,
      allCustomAttributes: [],
      mode: 'create',
      errors: {},
    };
  },
  computed: {
    ...mapGetters({
      accountId: 'getCurrentAccountId',
      isFeatureEnabledonAccount: 'accounts/isFeatureEnabledonAccount',
    }),
    automationRuleEvents() {
      return AUTOMATION_RULE_EVENTS.map(event => ({
        ...event,
        value: this.$t(`AUTOMATION.EVENTS.${event.value}`),
      }));
    },
    hasAutomationMutated() {
      if (
        this.automation.conditions[0].values ||
        this.automation.actions[0].action_params.length
      )
        return true;
      return false;
    },
    automationActionTypes() {
      const actionTypes = this.isFeatureEnabled('sla')
        ? AUTOMATION_ACTION_TYPES
        : AUTOMATION_ACTION_TYPES.filter(({ key }) => key !== 'add_sla');

      return actionTypes.map(action => ({
        ...action,
        label: this.$t(`AUTOMATION.ACTIONS.${action.label}`),
      }));
    },
  },
  mounted() {
    this.$store.dispatch('inboxes/get');
    this.$store.dispatch('agents/get');
    this.$store.dispatch('contacts/get');
    this.$store.dispatch('teams/get');
    this.$store.dispatch('labels/get');
    this.$store.dispatch('campaigns/get');
    this.allCustomAttributes = this.$store.getters['attributes/getAttributes'];
    this.manifestCustomAttributes();
  },
  methods: {
    getAttributes,
    getInputType,
    getOperators,
    getCustomAttributeType,
    showActionInput,
    isFeatureEnabled(flag) {
      return this.isFeatureEnabledonAccount(this.accountId, flag);
    },
    emitSaveAutomation() {
      this.errors = validateAutomation(this.automation);
      if (Object.keys(this.errors).length === 0) {
        const automation = generateAutomationPayload(this.automation);
        this.$emit('saveAutomation', automation, this.mode);
      }
    },
    getTranslatedAttributes(type, event) {
      return getAttributes(type, event).map(attribute => {
        // Skip translation
        // 1. If customAttributeType key is present then its rendering attributes from API
        // 2. If contact_custom_attribute or conversation_custom_attribute is present then its rendering section title
        const skipTranslation =
          attribute.customAttributeType ||
          [
            'contact_custom_attribute',
            'conversation_custom_attribute',
          ].includes(attribute.key);

        return {
          ...attribute,
          name: skipTranslation
            ? attribute.name
            : this.$t(`AUTOMATION.ATTRIBUTES.${attribute.name}`),
        };
      });
    },
  },
};
</script>

<template>
  <Dialog
    :open="open"
    @update:open="
      val => {
        if (!val) $emit('close');
      }
    "
  >
    <DialogContent class="max-w-5xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ $t('AUTOMATION.ADD.TITLE') }}</DialogTitle>
      </DialogHeader>
      <div class="flex flex-col">
        <div class="w-full">
          <div class="flex flex-col w-full gap-1 mb-4">
            <Label>{{ $t('AUTOMATION.ADD.FORM.NAME.LABEL') }}</Label>
            <Input
              v-model="automation.name"
              type="text"
              :aria-invalid="errors.name || undefined"
              :placeholder="$t('AUTOMATION.ADD.FORM.NAME.PLACEHOLDER')"
            />
            <p v-if="errors.name" class="text-sm text-n-ruby-9">
              {{ $t('AUTOMATION.ADD.FORM.NAME.ERROR') }}
            </p>
          </div>
          <div class="flex flex-col w-full gap-1 mb-4">
            <Label>{{ $t('AUTOMATION.ADD.FORM.DESC.LABEL') }}</Label>
            <Input
              v-model="automation.description"
              type="text"
              :aria-invalid="errors.description || undefined"
              :placeholder="$t('AUTOMATION.ADD.FORM.DESC.PLACEHOLDER')"
            />
            <p v-if="errors.description" class="text-sm text-n-ruby-9">
              {{ $t('AUTOMATION.ADD.FORM.DESC.ERROR') }}
            </p>
          </div>
          <div class="mb-6">
            <label
              class="block mb-1 text-sm font-medium"
              :class="{ 'text-destructive': errors.event_name }"
            >
              {{ $t('AUTOMATION.ADD.FORM.EVENT.LABEL') }}
            </label>
            <Select
              v-model="automation.event_name"
              @update:model-value="onEventChange(automation)"
            >
              <SelectTrigger
                class="w-full"
                :class="{ 'border-destructive': errors.event_name }"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="event in automationRuleEvents"
                  :key="event.key"
                  :value="event.key"
                >
                  {{ event.value }}
                </SelectItem>
              </SelectContent>
            </Select>
            <span v-if="errors.event_name" class="text-sm text-destructive">
              {{ $t('AUTOMATION.ADD.FORM.EVENT.ERROR') }}
            </span>
            <p
              v-if="hasAutomationMutated"
              class="text-xs text-right text-n-teal-10 pt-1"
            >
              {{ $t('AUTOMATION.FORM.RESET_MESSAGE') }}
            </p>
          </div>
          <!-- // Conditions Start -->
          <section>
            <label>
              {{ $t('AUTOMATION.ADD.FORM.CONDITIONS.LABEL') }}
            </label>
            <div
              class="w-full p-4 mb-4 border border-solid rounded-lg bg-n-slate-2 dark:bg-n-solid-2 border-n-strong"
            >
              <FilterInputBox
                v-for="(condition, i) in automation.conditions"
                :key="i"
                v-model="automation.conditions[i]"
                :filter-attributes="
                  getTranslatedAttributes(
                    automationTypes,
                    automation.event_name
                  )
                "
                :input-type="
                  getInputType(
                    allCustomAttributes,
                    automationTypes,
                    automation,
                    automation.conditions[i].attribute_key
                  )
                "
                :operators="
                  getOperators(
                    allCustomAttributes,
                    automationTypes,
                    automation,
                    mode,
                    automation.conditions[i].attribute_key
                  )
                "
                :dropdown-values="
                  getConditionDropdownValues(
                    automation.conditions[i].attribute_key
                  )
                "
                :show-query-operator="i !== automation.conditions.length - 1"
                :custom-attribute-type="
                  getCustomAttributeType(
                    automationTypes,
                    automation,
                    automation.conditions[i].attribute_key
                  )
                "
                :error-message="
                  errors[`condition_${i}`]
                    ? $t(`AUTOMATION.ERRORS.${errors[`condition_${i}`]}`)
                    : ''
                "
                @reset-filter="resetFilter(i, automation.conditions[i])"
                @remove-filter="removeFilter(i)"
              />
              <div class="mt-4">
                <Button @click="appendNewCondition">
                  <Icon icon="i-lucide-plus" class="size-4" />
                  {{ $t('AUTOMATION.ADD.CONDITION_BUTTON_LABEL') }}
                </Button>
              </div>
            </div>
          </section>
          <!-- // Conditions End -->
          <!-- // Actions Start -->
          <section>
            <label>
              {{ $t('AUTOMATION.ADD.FORM.ACTIONS.LABEL') }}
            </label>
            <div
              class="w-full p-4 mb-4 border border-solid rounded-lg bg-n-slate-2 dark:bg-n-solid-2 border-n-strong"
            >
              <AutomationActionInput
                v-for="(action, i) in automation.actions"
                :key="i"
                v-model="automation.actions[i]"
                :action-types="automationActionTypes"
                :dropdown-values="
                  getActionDropdownValues(automation.actions[i].action_name)
                "
                :show-action-input="
                  showActionInput(
                    automationActionTypes,
                    automation.actions[i].action_name
                  )
                "
                :error-message="
                  errors[`action_${i}`]
                    ? $t(`AUTOMATION.ERRORS.${errors[`action_${i}`]}`)
                    : ''
                "
                @reset-action="resetAction(i)"
                @remove-action="removeAction(i)"
              />
              <div class="mt-4">
                <Button @click="appendNewAction">
                  <Icon icon="i-lucide-plus" class="size-4" />
                  {{ $t('AUTOMATION.ADD.ACTION_BUTTON_LABEL') }}
                </Button>
              </div>
            </div>
          </section>
          <DialogFooter>
            <DialogClose as-child>
              <Button variant="outline" type="reset" @click.prevent="onClose">
                {{ $t('AUTOMATION.ADD.CANCEL_BUTTON_TEXT') }}
              </Button>
            </DialogClose>
            <Button variant="default" type="submit" @click="emitSaveAutomation">
              {{ $t('AUTOMATION.ADD.SUBMIT') }}
            </Button>
          </DialogFooter>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
