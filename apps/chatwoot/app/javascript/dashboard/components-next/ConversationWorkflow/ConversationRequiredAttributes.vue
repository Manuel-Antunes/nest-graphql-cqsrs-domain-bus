<script setup>
import { computed, ref, watch } from 'vue';
import { useToggle } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useMapGetter } from 'dashboard/composables/store';
import { useAccount } from 'dashboard/composables/useAccount';
import { useAlert } from 'dashboard/composables';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import ConversationRequiredAttributeItem from 'dashboard/components-next/ConversationWorkflow/ConversationRequiredAttributeItem.vue';
import ConversationRequiredEmpty from 'dashboard/components-next/Conversation/ConversationRequiredEmpty.vue';
import BasePaywallModal from 'dashboard/routes/dashboard/settings/components/BasePaywallModal.vue';

const props = defineProps({
  isEnabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['click']);
const { visit } = useAppNavigation();
const { t } = useI18n();
const { currentAccount, accountId, isOnChatwootCloud, updateAccount } =
  useAccount();
const [showDropdown, toggleDropdown] = useToggle(false);
const searchQuery = ref('');
const [isSaving, toggleSaving] = useToggle(false);
const conversationAttributes = useMapGetter(
  'attributes/getConversationAttributes'
);
const currentUser = useMapGetter('getCurrentUser');

const isSuperAdmin = computed(() => currentUser.value.type === 'SuperAdmin');
const showPaywall = computed(() => !props.isEnabled && isOnChatwootCloud.value);
const i18nKey = computed(() =>
  isOnChatwootCloud.value ? 'PAYWALL' : 'ENTERPRISE_PAYWALL'
);

const goToBillingSettings = () => {
  visit({
    name: 'billing_settings_index',
    params: { accountId: accountId.value },
  });
};

const handleClick = () => {
  emit('click');
};

const selectedAttributeKeys = computed(
  () => currentAccount.value?.settings?.conversation_required_attributes || []
);

const allAttributeOptions = computed(() =>
  (conversationAttributes.value || []).map(attribute => ({
    ...attribute,
    action: 'add',
    value: attribute.attributeKey,
    label: attribute.attributeDisplayName,
    type: attribute.attributeDisplayType,
  }))
);

const attributeOptions = computed(() => {
  const selectedKeysSet = new Set(selectedAttributeKeys.value);
  return allAttributeOptions.value.filter(
    attribute => !selectedKeysSet.has(attribute.value)
  );
});

const filteredAttributeOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return attributeOptions.value;
  return attributeOptions.value.filter(attribute =>
    attribute.label?.toLowerCase().includes(query)
  );
});

watch(showDropdown, isOpen => {
  if (!isOpen) searchQuery.value = '';
});

const conversationRequiredAttributes = computed(() => {
  const attributeMap = new Map(
    allAttributeOptions.value.map(attr => [attr.value, attr])
  );
  return selectedAttributeKeys.value
    .map(key => attributeMap.get(key))
    .filter(Boolean);
});

const saveRequiredAttributes = async keys => {
  try {
    toggleSaving(true);
    await updateAccount(
      { conversation_required_attributes: keys },
      { silent: true }
    );
    useAlert(t('CONVERSATION_WORKFLOW.REQUIRED_ATTRIBUTES.SAVE.SUCCESS'));
  } catch (error) {
    useAlert(t('CONVERSATION_WORKFLOW.REQUIRED_ATTRIBUTES.SAVE.ERROR'));
  } finally {
    toggleSaving(false);
    toggleDropdown(false);
  }
};

const handleAttributeAction = ({ value }) => {
  if (!value || isSaving.value) return;
  const updatedKeys = Array.from(
    new Set([...selectedAttributeKeys.value, value])
  );
  saveRequiredAttributes(updatedKeys);
};

const handleDelete = attribute => {
  if (isSaving.value) return;
  const updatedKeys = selectedAttributeKeys.value.filter(
    key => key !== attribute.value
  );
  saveRequiredAttributes(updatedKeys);
};
</script>

<template>
  <div
    v-if="isEnabled || showPaywall"
    class="flex flex-col w-full outline-1 outline outline-n-container rounded-xl bg-n-solid-2 divide-y divide-n-weak"
    @click="handleClick"
  >
    <div class="flex flex-col gap-2 items-start px-5 py-4">
      <div class="flex justify-between items-center w-full">
        <div class="flex flex-col gap-2">
          <h3 class="text-heading-2 text-n-slate-12">
            {{ $t('CONVERSATION_WORKFLOW.REQUIRED_ATTRIBUTES.TITLE') }}
          </h3>
          <p class="mb-0 text-body-para text-n-slate-11">
            {{ $t('CONVERSATION_WORKFLOW.REQUIRED_ATTRIBUTES.DESCRIPTION') }}
          </p>
        </div>
        <Popover v-if="isEnabled" v-model:open="showDropdown">
          <PopoverTrigger as-child>
            <Button :disabled="isSaving || attributeOptions.length === 0">
              <Spinner v-if="isSaving" class="size-4" />
              <Icon v-else icon="i-lucide-circle-plus" />
              {{ $t('CONVERSATION_WORKFLOW.REQUIRED_ATTRIBUTES.ADD.TITLE') }}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            class="flex flex-col w-52 max-h-[20rem] overflow-y-auto p-1"
          >
            <InputGroup class="border-0 mb-1">
              <InputGroupAddon>
                <Icon
                  icon="i-lucide-search"
                  class="size-4 text-muted-foreground"
                />
              </InputGroupAddon>
              <InputGroupInput
                v-model="searchQuery"
                :placeholder="
                  $t(
                    'CONVERSATION_WORKFLOW.REQUIRED_ATTRIBUTES.ADD.SEARCH_PLACEHOLDER'
                  )
                "
              />
            </InputGroup>
            <button
              v-for="attribute in filteredAttributeOptions"
              :key="attribute.value"
              type="button"
              class="flex items-center w-full min-w-0 px-2 py-1.5 text-sm text-start rounded-md text-n-slate-12 hover:bg-n-alpha-2"
              @click="handleAttributeAction(attribute)"
            >
              <span class="truncate">{{ attribute.label }}</span>
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </div>

    <template v-if="isEnabled">
      <ConversationRequiredEmpty
        v-if="conversationRequiredAttributes.length === 0"
      />

      <ConversationRequiredAttributeItem
        v-for="attribute in conversationRequiredAttributes"
        :key="attribute.value"
        :attribute="attribute"
        @delete="handleDelete"
      />
    </template>

    <BasePaywallModal
      v-else
      class="mx-auto my-8"
      feature-prefix="CONVERSATION_WORKFLOW.REQUIRED_ATTRIBUTES"
      :i18n-key="i18nKey"
      :is-on-chatwoot-cloud="isOnChatwootCloud"
      :is-super-admin="isSuperAdmin"
      @upgrade="goToBillingSettings"
    />
  </div>
</template>
