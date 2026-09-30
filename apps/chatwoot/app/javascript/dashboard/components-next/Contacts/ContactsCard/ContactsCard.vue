<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

import CardLayout from 'dashboard/components-next/CardLayout.vue';
import ContactsForm from 'dashboard/components-next/Contacts/ContactsForm/ContactsForm.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Avatar from 'dashboard/components-next/avatar/Avatar.vue';
import Flag from 'dashboard/components-next/flag/Flag.vue';
import ContactDeleteSection from 'dashboard/components-next/Contacts/ContactsCard/ContactDeleteSection.vue';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from 'dashboard/components-next/ui/accordion';
import countries from 'shared/constants/countries';

const props = defineProps({
  id: { type: Number, required: true },
  name: { type: String, default: '' },
  email: { type: String, default: '' },
  additionalAttributes: { type: Object, default: () => ({}) },
  phoneNumber: { type: String, default: '' },
  thumbnail: { type: String, default: '' },
  availabilityStatus: { type: String, default: null },
  isUpdating: { type: Boolean, default: false },
  selectable: { type: Boolean, default: false },
  isSelected: { type: Boolean, default: false },
});

const emit = defineEmits([
  'updateContact',
  'showContact',
  'select',
  'avatarHover',
]);

const { t } = useI18n();

const contactsFormRef = ref(null);

const getInitialContactData = () => ({
  id: props.id,
  name: props.name,
  email: props.email,
  phoneNumber: props.phoneNumber,
  additionalAttributes: props.additionalAttributes,
});

const contactData = ref(getInitialContactData());

const isFormInvalid = computed(() => contactsFormRef.value?.isFormInvalid);

const countriesMap = computed(() => {
  return countries.reduce((acc, country) => {
    acc[country.code] = country;
    acc[country.id] = country;
    return acc;
  }, {});
});

const countryDetails = computed(() => {
  const attributes = props.additionalAttributes || {};
  const { country, countryCode, city } = attributes;

  if (!country && !countryCode) return null;

  const activeCountry =
    countriesMap.value[country] || countriesMap.value[countryCode];

  if (!activeCountry) return null;

  return {
    countryCode: activeCountry.id,
    city: city ? `${city},` : null,
    name: activeCountry.name,
  };
});

const formattedLocation = computed(() => {
  if (!countryDetails.value) return '';

  return [countryDetails.value.city, countryDetails.value.name]
    .filter(Boolean)
    .join(' ');
});

const handleFormUpdate = updatedData => {
  Object.assign(contactData.value, updatedData);
};

const handleUpdateContact = () => {
  emit('updateContact', contactData.value);
};

const resetContactData = () => {
  contactData.value = getInitialContactData();
};

const onClickViewDetails = () => emit('showContact', props.id);

const toggleSelect = checked => {
  emit('select', checked);
};

const handleAvatarHover = isHovered => {
  emit('avatarHover', isHovered);
};
</script>

<template>
  <AccordionItem :value="String(id)" class="relative border-b-0">
    <CardLayout
      layout="row"
      :class="{
        'outline-n-weak !bg-n-slate-3 dark:!bg-n-solid-3': isSelected,
      }"
    >
      <div
        class="flex items-center justify-start flex-1 gap-4 cursor-pointer min-w-0"
        :title="t('CONTACTS_LAYOUT.CARD.VIEW_DETAILS')"
        @click="onClickViewDetails"
      >
        <div
          class="relative"
          @mouseenter="handleAvatarHover(true)"
          @mouseleave="handleAvatarHover(false)"
        >
          <Avatar
            :name="name"
            :src="thumbnail"
            :size="48"
            :status="availabilityStatus"
            hide-offline-status
            rounded-full
          >
            <template v-if="selectable" #overlay="{ size }">
              <label
                class="flex items-center justify-center rounded-full cursor-pointer absolute inset-0 z-10 backdrop-blur-[2px] border border-border"
                :style="{ width: `${size}px`, height: `${size}px` }"
                @click.stop
              >
                <Checkbox
                  :checked="isSelected"
                  @update:checked="toggleSelect"
                />
              </label>
            </template>
          </Avatar>
        </div>
        <div class="flex flex-col gap-0.5 flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
            <span
              class="text-base font-medium truncate text-n-slate-12 min-w-0"
            >
              {{ name }}
            </span>
            <span class="inline-flex items-center gap-1">
              <span
                v-if="additionalAttributes?.companyName"
                class="i-ph-building-light size-4 text-n-slate-10 mb-0.5"
              />
              <span
                v-if="additionalAttributes?.companyName"
                class="text-sm truncate text-muted-foreground"
              >
                {{ additionalAttributes.companyName }}
              </span>
            </span>
          </div>
          <div
            class="flex flex-wrap items-center justify-start gap-x-3 gap-y-1"
          >
            <div v-if="email" class="truncate max-w-72" :title="email">
              <span class="text-sm text-muted-foreground">
                {{ email }}
              </span>
            </div>
            <div v-if="email" class="w-px h-3 truncate bg-n-slate-6" />
            <span
              v-if="phoneNumber"
              class="text-sm truncate text-muted-foreground"
            >
              {{ phoneNumber }}
            </span>
            <div v-if="phoneNumber" class="w-px h-3 truncate bg-n-slate-6" />
            <span
              v-if="countryDetails"
              class="flex items-center gap-1 text-sm text-muted-foreground min-w-0"
            >
              <!-- <Flag
                :country="countryDetails.countryCode"
                class="size-4 shrink-0"
              /> -->
              <span class="truncate min-w-0">{{ formattedLocation }}</span>
            </span>
          </div>
        </div>
      </div>

      <AccordionTrigger
        class="flex-none w-10 h-10 p-0 justify-center self-center rounded-md hover:bg-accent hover:text-accent-foreground hover:no-underline"
        @click="resetContactData"
      />

      <template #after>
        <AccordionContent class="p-0">
          <div class="flex flex-col gap-6 p-6 border-t border-border">
            <ContactsForm
              ref="contactsFormRef"
              :contact-data="contactData"
              @update="handleFormUpdate"
            />
            <div>
              <Button
                variant="default"
                :disabled="isUpdating || isFormInvalid"
                @click="handleUpdateContact"
              >
                <Spinner v-if="isUpdating" class="size-4 flex-shrink-0" />
                <template v-if="!isUpdating">{{
                  t('CONTACTS_LAYOUT.CARD.EDIT_DETAILS_FORM.UPDATE_BUTTON')
                }}</template>
              </Button>
            </div>
          </div>
          <ContactDeleteSection
            :selected-contact="{
              id: props.id,
              name: props.name,
            }"
          />
        </AccordionContent>
      </template>
    </CardLayout>
  </AccordionItem>
</template>
