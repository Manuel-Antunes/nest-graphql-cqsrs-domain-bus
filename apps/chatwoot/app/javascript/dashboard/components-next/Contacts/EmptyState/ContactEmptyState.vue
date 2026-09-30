<script setup>
import EmptyStateLayout from 'dashboard/components-next/EmptyStateLayout.vue';
import CreateNewContactDialog from 'dashboard/components-next/Contacts/ContactsForm/CreateNewContactDialog.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import ContactsCard from 'dashboard/components-next/Contacts/ContactsCard/ContactsCard.vue';
import { Accordion } from 'dashboard/components-next/ui/accordion';
import contactContent from 'dashboard/components-next/Contacts/EmptyState/contactEmptyStateContent';

defineProps({
  title: {
    type: String,
    default: '',
  },
  subtitle: {
    type: String,
    default: '',
  },
  showButton: {
    type: Boolean,
    default: true,
  },
  buttonLabel: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['create']);
</script>

<template>
  <EmptyStateLayout :title="title" :subtitle="subtitle">
    <template #empty-state-item>
      <Accordion
        type="single"
        collapsible
        class="grid grid-cols-1 gap-4 p-px overflow-hidden"
      >
        <ContactsCard
          v-for="contact in contactContent.slice(0, 5)"
          :id="contact.id"
          :key="contact.id"
          :name="contact.name"
          :email="contact.email"
          :thumbnail="contact.thumbnail"
          :phone-number="contact.phoneNumber"
          :additional-attributes="contact.additionalAttributes"
        />
      </Accordion>
    </template>
    <template #actions>
      <div v-if="showButton">
        <CreateNewContactDialog @create="emit('create', $event)">
          <template #trigger>
            <Button
              ><Icon :icon="'i-lucide-plus'" class="size-4" />{{
                buttonLabel
              }}</Button
            >
          </template>
        </CreateNewContactDialog>
      </div>
    </template>
  </EmptyStateLayout>
</template>
