<script setup>
import { computed, useSlots } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

import { Button } from 'dashboard/components-next/ui/button';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from 'dashboard/components-next/ui/sheet';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from 'dashboard/components-next/ui/breadcrumb';
import ComposeConversation from 'dashboard/components-next/NewConversation/ComposeConversation.vue';
import VoiceCallButton from 'dashboard/components-next/Contacts/VoiceCallButton.vue';

const props = defineProps({
  selectedContact: {
    type: Object,
    default: () => ({}),
  },
  isUpdating: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['goToContactsList', 'toggleBlock']);

const { t } = useI18n();
const slots = useSlots();
const { currentParams } = useAppNavigation();

const contactId = computed(() => currentParams.value.contactId);

const selectedContactName = computed(() => {
  return props.selectedContact?.name;
});

const breadcrumbItems = computed(() => {
  const items = [
    {
      label: t('CONTACTS_LAYOUT.HEADER.BREADCRUMB.CONTACTS'),
      link: '#',
    },
  ];
  if (props.selectedContact) {
    items.push({
      label: selectedContactName.value,
    });
  }
  return items;
});

const isContactBlocked = computed(() => {
  return props.selectedContact?.blocked;
});

const handleBreadcrumbClick = () => {
  emit('goToContactsList');
};

const toggleBlock = () => {
  emit('toggleBlock', isContactBlocked.value);
};
</script>

<template>
  <section
    class="flex w-full h-full overflow-hidden justify-evenly bg-n-surface-1"
  >
    <div class="flex flex-col w-full h-full">
      <header class="sticky top-0 z-10 px-6 3xl:px-0">
        <div class="w-full mx-auto max-w-[40.625rem]">
          <div
            class="flex flex-col xs:flex-row items-start xs:items-center justify-between w-full py-7 gap-2"
          >
            <BreadcrumbRoot>
              <BreadcrumbList>
                <template v-for="(item, index) in breadcrumbItems" :key="index">
                  <BreadcrumbSeparator v-if="index > 0" />
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      v-if="index !== breadcrumbItems.length - 1"
                      as="button"
                      type="button"
                      class="cursor-pointer border-0 bg-transparent p-0"
                      @click="handleBreadcrumbClick(item, index)"
                    >
                      {{ item.label }}
                    </BreadcrumbLink>
                    <BreadcrumbPage v-else>
                      {{
                        item.emoji ? `${item.emoji} ${item.label}` : item.label
                      }}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </template>
              </BreadcrumbList>
            </BreadcrumbRoot>
            <div class="flex items-center gap-2">
              <Button
                variant="outline"
                :disabled="isUpdating"
                @click="toggleBlock"
              >
                <Spinner v-if="isUpdating" class="size-4 flex-shrink-0" />
                <template v-if="!isUpdating">
                  {{
                    !isContactBlocked
                      ? $t('CONTACTS_LAYOUT.HEADER.BLOCK_CONTACT')
                      : $t('CONTACTS_LAYOUT.HEADER.UNBLOCK_CONTACT')
                  }}
                </template>
              </Button>
              <VoiceCallButton
                :phone="selectedContact?.phoneNumber"
                :contact-id="contactId"
                :label="$t('CONTACT_PANEL.CALL')"
                size="sm"
              />
              <ComposeConversation :contact-id="contactId">
                <template #trigger>
                  <Button variant="default">
                    {{ $t('CONTACTS_LAYOUT.HEADER.SEND_MESSAGE') }}
                  </Button>
                </template>
              </ComposeConversation>
              <Sheet v-if="slots.sidebar">
                <SheetTrigger as-child>
                  <Button variant="outline" size="icon">
                    <Icon icon="i-lucide-panel-right-open" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  class="w-full max-w-96 sm:max-w-xl gap-0 pt-12"
                >
                  <SheetTitle class="sr-only">
                    {{ selectedContactName }}
                  </SheetTitle>
                  <div class="shrink-0">
                    <slot name="sidebarHeader" />
                  </div>
                  <div class="flex-1 min-h-0 overflow-y-auto pb-6 pt-3">
                    <slot name="sidebar" />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>
      <main class="flex-1 px-6 overflow-y-auto 3xl:px-px">
        <div class="w-full py-4 mx-auto max-w-[40.625rem]">
          <slot name="default" />
        </div>
      </main>
    </div>
  </section>
</template>
