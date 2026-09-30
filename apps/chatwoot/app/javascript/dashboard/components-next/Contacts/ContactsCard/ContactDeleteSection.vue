<script setup>
import { useI18n } from 'vue-i18n';
import { useToggle } from '@vueuse/core';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import ConfirmContactDeleteDialog from 'dashboard/components-next/Contacts/ContactsForm/ConfirmContactDeleteDialog.vue';
import Policy from 'dashboard/components/policy.vue';

defineProps({
  selectedContact: {
    type: Object,
    required: true,
  },
});

const { t } = useI18n();

const [showDeleteSection, toggleDeleteSection] = useToggle();
</script>

<template>
  <Policy :permissions="['administrator']">
    <div class="flex flex-col items-start border-t border-n-strong px-6 py-5">
      <Button
        variant="link"
        class="hover:!no-underline text-n-slate-12"
        @click="toggleDeleteSection()"
        >{{ t('CONTACTS_LAYOUT.DETAILS.DELETE_CONTACT')
        }}<Icon icon="i-lucide-chevron-down" class="size-4"
      /></Button>

      <div
        class="transition-all duration-300 ease-in-out grid w-full overflow-hidden"
        :class="
          showDeleteSection
            ? 'grid-rows-[1fr] opacity-100 mt-2'
            : 'grid-rows-[0fr] opacity-0 mt-0'
        "
      >
        <div class="overflow-hidden min-h-0 flex flex-col gap-4">
          <span class="inline-flex text-n-slate-11 text-sm items-center gap-1">
            {{ t('CONTACTS_LAYOUT.CARD.DELETE_CONTACT.MESSAGE') }}
          </span>
          <div>
            <ConfirmContactDeleteDialog :selected-contact="selectedContact">
              <template #trigger>
                <Button variant="destructive"
                  >{{ t('CONTACTS_LAYOUT.CARD.DELETE_CONTACT.BUTTON') }}
                </Button>
              </template>
            </ConfirmContactDeleteDialog>
          </div>
        </div>
      </div>
    </div>
  </Policy>
</template>
