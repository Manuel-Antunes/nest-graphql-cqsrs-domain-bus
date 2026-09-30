<script setup>
import { ref, computed } from 'vue';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import {
  DuplicateContactException,
  ExceptionWithMessage,
} from 'shared/helpers/CustomErrors';
import ContactsCard from 'dashboard/components-next/Contacts/ContactsCard/ContactsCard.vue';
import { Accordion } from 'dashboard/components-next/ui/accordion';

const props = defineProps({
  contacts: { type: Array, required: true },
  selectedContactIds: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['toggleContact']);

const { t } = useI18n();
const store = useStore();
const { currentRouteName, currentParams, resolvePath, visit } =
  useAppNavigation();

const uiFlags = useMapGetter('contacts/getUIFlags');
const isUpdating = computed(() => uiFlags.value.isUpdating);
const expandedCardId = ref(undefined);
const hoveredAvatarId = ref(null);

const selectedIdsSet = computed(() => new Set(props.selectedContactIds || []));

const updateContact = async updatedData => {
  try {
    await store.dispatch('contacts/update', updatedData);
    useAlert(t('CONTACTS_LAYOUT.CARD.EDIT_DETAILS_FORM.SUCCESS_MESSAGE'));
  } catch (error) {
    const i18nPrefix = 'CONTACTS_LAYOUT.CARD.EDIT_DETAILS_FORM.FORM';
    if (error instanceof DuplicateContactException) {
      if (error.data.includes('email')) {
        useAlert(t(`${i18nPrefix}.EMAIL_ADDRESS.DUPLICATE`));
      } else if (error.data.includes('phone_number')) {
        useAlert(t(`${i18nPrefix}.PHONE_NUMBER.DUPLICATE`));
      }
    } else if (error instanceof ExceptionWithMessage) {
      useAlert(error.data);
    } else {
      useAlert(t(`${i18nPrefix}.ERROR_MESSAGE`));
    }
  }
};

const onClickViewDetails = async id => {
  const routeTypes = {
    contacts_dashboard_segments_index: ['contacts_edit_segment', 'segmentId'],
    contacts_dashboard_labels_index: ['contacts_edit_label', 'label'],
  };
  const [name, paramKey] = routeTypes[currentRouteName.value] || [
    'contacts_edit',
  ];
  const params = {
    contactId: id,
    ...(paramKey && { [paramKey]: currentParams.value[paramKey] }),
  };

  // Preserve the current query string (e.g. ?page=N) across the navigation.
  // visit() with an object target drops query, so resolve the path and re-append it.
  const search = window.location.search;
  visit(`${resolvePath({ name, params })}${search}`);
};

const isSelected = id => selectedIdsSet.value.has(id);

const shouldShowSelection = id => {
  return hoveredAvatarId.value === id || isSelected(id);
};

const handleSelect = (id, value) => {
  emit('toggleContact', { id, value });
};

const handleAvatarHover = (id, isHovered) => {
  hoveredAvatarId.value = isHovered ? id : null;
};
</script>

<template>
  <Accordion
    v-model="expandedCardId"
    type="single"
    collapsible
    class="flex flex-col gap-4"
  >
    <ContactsCard
      v-for="contact in contacts"
      :id="contact.id"
      :key="contact.id"
      :name="contact.name"
      :email="contact.email"
      :thumbnail="contact.thumbnail"
      :phone-number="contact.phoneNumber"
      :additional-attributes="contact.additionalAttributes"
      :availability-status="contact.availabilityStatus"
      :is-updating="isUpdating"
      :selectable="shouldShowSelection(contact.id)"
      :is-selected="isSelected(contact.id)"
      @update-contact="updateContact"
      @show-contact="onClickViewDetails"
      @select="value => handleSelect(contact.id, value)"
      @avatar-hover="value => handleAvatarHover(contact.id, value)"
    />
  </Accordion>
</template>
