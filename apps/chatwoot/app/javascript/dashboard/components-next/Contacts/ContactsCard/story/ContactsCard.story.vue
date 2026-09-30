<script setup>
import ContactsCard from '../ContactsCard.vue';
import { Accordion } from 'dashboard/components-next/ui/accordion';
import contacts from './fixtures';
</script>

<template>
  <Story
    title="Components/Contacts/ContactsCard"
    :layout="{ type: 'grid', width: '800px' }"
  >
    <Variant title="Default with expandable function">
      <Accordion type="single" collapsible class="flex flex-col p-4">
        <ContactsCard
          v-bind="contacts[0]"
          @update-contact="() => {}"
          @show-contact="() => {}"
        />
      </Accordion>
    </Variant>

    <Variant title="With Company Name and without phone number">
      <Accordion type="single" collapsible class="flex flex-col p-4">
        <ContactsCard
          v-bind="{ ...contacts[1], phoneNumber: '' }"
          @update-contact="() => {}"
          @show-contact="() => {}"
        />
      </Accordion>
    </Variant>

    <Variant title="Expanded State">
      <Accordion
        type="single"
        collapsible
        :default-value="String(contacts[2].id)"
        class="flex flex-col p-4"
      >
        <ContactsCard
          v-bind="contacts[2]"
          @update-contact="() => {}"
          @show-contact="() => {}"
        />
      </Accordion>
    </Variant>

    <Variant title="Without Email and Phone">
      <Accordion type="single" collapsible class="flex flex-col p-4">
        <ContactsCard
          v-bind="{ ...contacts[3], email: '', phoneNumber: '' }"
          @update-contact="() => {}"
          @show-contact="() => {}"
        />
      </Accordion>
    </Variant>
  </Story>
</template>
