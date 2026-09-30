<script setup>
import { ref, computed, unref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useAlert, useTrack } from 'dashboard/composables';
import { CONTACTS_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
import filterQueryGenerator from 'dashboard/helper/filterQueryGenerator';
import contactFilterItems from 'dashboard/routes/dashboard/contacts/contactFilterItems';
import {
  DuplicateContactException,
  ExceptionWithMessage,
} from 'shared/helpers/CustomErrors';
import { generateValuesForEditCustomViews } from 'dashboard/helper/customViewsHelper';
import countries from 'shared/constants/countries';
import {
  useCamelCase,
  useSnakeCase,
} from 'dashboard/composables/useTransformKeys';

import ContactsHeader from 'dashboard/components-next/Contacts/ContactsHeader/ContactHeader.vue';
import CreateNewContactDialog from 'dashboard/components-next/Contacts/ContactsForm/CreateNewContactDialog.vue';
import ContactExportDialog from 'dashboard/components-next/Contacts/ContactsForm/ContactExportDialog.vue';
import ContactImportDialog from 'dashboard/components-next/Contacts/ContactsForm/ContactImportDialog.vue';
import CreateSegmentDialog from 'dashboard/components-next/Contacts/ContactsForm/CreateSegmentDialog.vue';
import DeleteSegmentDialog from 'dashboard/components-next/Contacts/ContactsForm/DeleteSegmentDialog.vue';
import ContactsFilter from 'dashboard/components-next/filter/ContactsFilter.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'dashboard/components-next/ui/popover';

const props = defineProps({
  showSearch: { type: Boolean, default: true },
  searchValue: { type: String, default: '' },
  activeSort: { type: String, default: 'last_activity_at' },
  activeOrdering: { type: String, default: '' },
  headerTitle: { type: String, default: '' },
  segmentsId: { type: [String, Number], default: 0 },
  activeSegment: { type: Object, default: null },
  hasAppliedFilters: { type: Boolean, default: false },
  isLabelView: { type: Boolean, default: false },
  isActiveView: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:sort',
  'search',
  'applyFilter',
  'clearFilters',
]);

const { t } = useI18n();
const store = useStore();
const { resolvePath, visit } = useAppNavigation();

const createNewContactDialogRef = ref(null);
const contactExportDialogRef = ref(null);
const contactImportDialogRef = ref(null);

const showFiltersModal = ref(false);
const appliedFilter = ref([]);
const segmentsQuery = ref({});

const appliedFilters = useMapGetter('contacts/getAppliedContactFiltersV4');
const contactAttributes = useMapGetter('attributes/getContactAttributes');
const labels = useMapGetter('labels/getLabels');
const hasActiveSegments = computed(
  () => props.activeSegment && props.segmentsId !== 0
);
const activeSegmentName = computed(() => props.activeSegment?.name);

const openCreateNewContactDialog = () => {
  createNewContactDialogRef.value?.dialogRef.open();
};
const openContactImportDialog = () =>
  contactImportDialogRef.value?.dialogRef.open();
const openContactExportDialog = () =>
  contactExportDialogRef.value?.dialogRef.open();

const onCreate = async contact => {
  try {
    await store.dispatch('contacts/create', contact);
    createNewContactDialogRef.value?.onSuccess();
    useAlert(
      t('CONTACTS_LAYOUT.HEADER.ACTIONS.CONTACT_CREATION.SUCCESS_MESSAGE')
    );
  } catch (error) {
    const i18nPrefix = 'CONTACTS_LAYOUT.HEADER.ACTIONS.CONTACT_CREATION';
    if (error instanceof DuplicateContactException) {
      if (error.data.includes('email')) {
        useAlert(t(`${i18nPrefix}.EMAIL_ADDRESS_DUPLICATE`));
      } else if (error.data.includes('phone_number')) {
        useAlert(t(`${i18nPrefix}.PHONE_NUMBER_DUPLICATE`));
      }
    } else if (error instanceof ExceptionWithMessage) {
      useAlert(error.data);
    } else {
      useAlert(t(`${i18nPrefix}.ERROR_MESSAGE`));
    }
  }
};

const onImport = async file => {
  try {
    await store.dispatch('contacts/import', file);
    contactImportDialogRef.value?.dialogRef.close();
    useAlert(
      t('CONTACTS_LAYOUT.HEADER.ACTIONS.IMPORT_CONTACT.SUCCESS_MESSAGE')
    );
    useTrack(CONTACTS_EVENTS.IMPORT_SUCCESS);
  } catch (error) {
    useAlert(
      error.message ??
        t('CONTACTS_LAYOUT.HEADER.ACTIONS.IMPORT_CONTACT.ERROR_MESSAGE')
    );
    useTrack(CONTACTS_EVENTS.IMPORT_FAILURE);
  }
};

const onExport = async query => {
  try {
    await store.dispatch('contacts/export', query);
    useAlert(
      t('CONTACTS_LAYOUT.HEADER.ACTIONS.EXPORT_CONTACT.SUCCESS_MESSAGE')
    );
  } catch (error) {
    useAlert(
      error.message ||
        t('CONTACTS_LAYOUT.HEADER.ACTIONS.EXPORT_CONTACT.ERROR_MESSAGE')
    );
  }
};

const onCreateSegment = async payload => {
  try {
    const payloadData = {
      ...payload,
      query: segmentsQuery.value,
    };
    const response = await store.dispatch('customViews/create', payloadData);
    useAlert(
      t('CONTACTS_LAYOUT.HEADER.ACTIONS.FILTERS.CREATE_SEGMENT.SUCCESS_MESSAGE')
    );
    const segmentId = response?.data?.id;
    if (!segmentId) return;
    // Navigate to the created segment (?page=1 appended since visit() drops query).
    visit(
      `${resolvePath({
        name: 'contacts_dashboard_segments_index',
        params: { segmentId },
      })}?page=1`
    );
  } catch {
    useAlert(
      t('CONTACTS_LAYOUT.HEADER.ACTIONS.FILTERS.CREATE_SEGMENT.ERROR_MESSAGE')
    );
  }
};

const onDeleteSegment = async payload => {
  try {
    await store.dispatch('customViews/delete', {
      id: Number(props.segmentsId),
      ...payload,
    });
    visit(`${resolvePath({ name: 'contacts_dashboard_index' })}?page=1`);
    useAlert(
      t('CONTACTS_LAYOUT.HEADER.ACTIONS.FILTERS.DELETE_SEGMENT.SUCCESS_MESSAGE')
    );
  } catch (error) {
    useAlert(
      t('CONTACTS_LAYOUT.HEADER.ACTIONS.FILTERS.DELETE_SEGMENT.ERROR_MESSAGE')
    );
  }
};

const closeAdvanceFiltersModal = () => {
  showFiltersModal.value = false;
  appliedFilter.value = [];
};

const clearFilters = async () => {
  emit('clearFilters');
};

const onApplyFilter = async payload => {
  payload = useSnakeCase(payload);
  segmentsQuery.value = filterQueryGenerator(payload);
  emit('applyFilter', filterQueryGenerator(payload));
  showFiltersModal.value = false;
};

const onUpdateSegment = async (payload, segmentName) => {
  payload = useSnakeCase(payload);
  const payloadData = {
    ...props.activeSegment,
    name: segmentName,
    query: filterQueryGenerator(payload),
  };
  await store.dispatch('customViews/update', payloadData);
  closeAdvanceFiltersModal();
};

const setParamsForEditSegmentModal = () => {
  return {
    countries,
    filterTypes: contactFilterItems,
    allCustomAttributes: useSnakeCase(contactAttributes.value),
    labels: labels.value || [],
  };
};

const initializeSegmentToFilterModal = segment => {
  const query = unref(segment)?.query?.payload;
  if (!Array.isArray(query)) return;

  const newFilters = query.map(filter => {
    const transformed = useCamelCase(filter);
    const values = Array.isArray(transformed.values)
      ? generateValuesForEditCustomViews(
          useSnakeCase(filter),
          setParamsForEditSegmentModal()
        )
      : [];

    return {
      attributeKey: transformed.attributeKey,
      attributeModel: transformed.attributeModel,
      customAttributeType: transformed.customAttributeType,
      filterOperator: transformed.filterOperator,
      queryOperator: transformed.queryOperator ?? 'and',
      values,
    };
  });

  appliedFilter.value = [...appliedFilter.value, ...newFilters];
};

const initializeFilters = () => {
  appliedFilter.value = [];
  if (hasActiveSegments.value) {
    initializeSegmentToFilterModal(props.activeSegment);
  } else {
    appliedFilter.value = props.hasAppliedFilters
      ? [...appliedFilters.value]
      : [
          {
            attributeKey: 'name',
            filterOperator: 'equal_to',
            values: '',
            queryOperator: 'and',
            attributeModel: 'standard',
          },
        ];
  }
};

const onFilterPopoverChange = val => {
  showFiltersModal.value = val;
  if (val) initializeFilters();
  else appliedFilter.value = [];
};

defineExpose({
  onToggleFilters: () => onFilterPopoverChange(true),
});
</script>

<template>
  <ContactsHeader
    :show-search="showSearch"
    :search-value="searchValue"
    :active-sort="activeSort"
    :active-ordering="activeOrdering"
    :header-title="headerTitle"
    :is-segments-view="hasActiveSegments"
    :is-label-view="isLabelView"
    :is-active-view="isActiveView"
    :has-active-filters="hasAppliedFilters"
    :button-label="t('CONTACTS_LAYOUT.HEADER.MESSAGE_BUTTON')"
    @search="emit('search', $event)"
    @update:sort="emit('update:sort', $event)"
    @add="openCreateNewContactDialog"
    @import="openContactImportDialog"
    @export="openContactExportDialog"
  >
    <template #create-segment>
      <CreateSegmentDialog @create="onCreateSegment">
        <template #trigger>
          <Button size="icon" variant="ghost">
            <Icon icon="i-lucide-save" />
          </Button>
        </template>
      </CreateSegmentDialog>
    </template>
    <template #delete-segment>
      <DeleteSegmentDialog @delete="onDeleteSegment">
        <template #trigger>
          <Button size="icon" variant="ghost">
            <Icon icon="i-lucide-trash" />
          </Button>
        </template>
      </DeleteSegmentDialog>
    </template>
    <template #filter>
      <Popover :open="showFiltersModal" @update:open="onFilterPopoverChange">
        <PopoverTrigger as-child>
          <Button size="icon" variant="ghost" class="relative">
            <Icon
              :icon="
                hasActiveSegments ? 'i-lucide-pen-line' : 'i-lucide-list-filter'
              "
            />
            <div
              v-if="hasAppliedFilters && !hasActiveSegments"
              class="absolute top-0 right-0 w-2 h-2 rounded-full bg-n-brand"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          :side-offset="8"
          class="p-0 w-auto overflow-visible"
        >
          <ContactsFilter
            v-model="appliedFilter"
            :segment-name="activeSegmentName"
            :is-segment-view="hasActiveSegments"
            @apply-filter="onApplyFilter"
            @update-segment="onUpdateSegment"
            @clear-filters="clearFilters"
          />
        </PopoverContent>
      </Popover>
    </template>
  </ContactsHeader>

  <CreateNewContactDialog ref="createNewContactDialogRef" @create="onCreate" />
  <ContactExportDialog ref="contactExportDialogRef" @export="onExport" />
  <ContactImportDialog ref="contactImportDialogRef" @import="onImport" />
</template>
