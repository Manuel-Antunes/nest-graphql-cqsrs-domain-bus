<script>
/* eslint-disable vue/no-reserved-component-names -- shadcn Button component name */
import LabelDropdownItem from './LabelDropdownItem.vue';
import Hotkey from 'dashboard/components/base/Hotkey.vue';
import AddLabelModal from 'dashboard/routes/dashboard/settings/labels/AddLabel.vue';
import { picoSearch } from '@scmmishra/pico-search';
import { sanitizeLabel } from 'shared/helpers/sanitizeData';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

export default {
  components: {
    LabelDropdownItem,
    AddLabelModal,
    Hotkey,
    Button,
    Icon,
  },

  props: {
    accountLabels: {
      type: Array,
      default: () => [],
    },
    selectedLabels: {
      type: Array,
      default: () => [],
    },
    allowCreation: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update', 'add', 'remove', 'createModalToggle'],

  data() {
    return {
      search: '',
      createModalVisible: false,
    };
  },

  computed: {
    createLabelPlaceholder() {
      const label = this.$t('CONTACT_PANEL.LABELS.LABEL_SELECT.CREATE_LABEL');
      return this.search ? `${label}:` : label;
    },

    filteredActiveLabels() {
      if (!this.search) return this.accountLabels;

      return picoSearch(this.accountLabels, this.search, ['title'], {
        threshold: 0.9,
      });
    },

    noResult() {
      return this.filteredActiveLabels.length === 0;
    },

    hasExactMatchInResults() {
      return this.filteredActiveLabels.some(
        label => label.title === this.search
      );
    },

    shouldShowCreate() {
      return this.allowCreation && this.filteredActiveLabels.length < 3;
    },

    parsedSearch() {
      return sanitizeLabel(this.search);
    },
  },

  mounted() {
    this.focusInput();
  },

  methods: {
    focusInput() {
      this.$refs.searchbar.focus();
    },

    updateLabels(label) {
      this.$emit('update', label);
    },

    onAdd(label) {
      this.$emit('add', label);
    },

    onRemove(label) {
      this.$emit('remove', label);
    },

    onAddRemove(label) {
      if (this.selectedLabels.includes(label.title)) {
        this.onRemove(label.title);
      } else {
        this.onAdd(label);
      }
    },

    showCreateModal() {
      this.createModalVisible = true;
      // Tell the parent (LabelBox) the create Dialog is open so its
      // `v-on-clickaway` doesn't treat clicks inside the body-portaled Dialog
      // (e.g. the colour picker) as "outside" and unmount us mid-create.
      this.$emit('createModalToggle', true);
    },

    hideCreateModal() {
      this.createModalVisible = false;
      this.$emit('createModalToggle', false);
    },
  },
};
</script>

<template>
  <div class="flex flex-col w-full max-h-[12.5rem]">
    <div class="flex items-center justify-center mb-1">
      <h4
        class="flex-grow m-0 overflow-hidden text-sm text-n-slate-12 whitespace-nowrap text-ellipsis"
      >
        {{ $t('CONTACT_PANEL.LABELS.LABEL_SELECT.TITLE') }}
      </h4>
      <Hotkey
        custom-class="border border-solid text-n-slate-12 bg-n-slate-2 text-xxs border-n-strong flex-shrink-0"
      >
        {{ 'L' }}
      </Hotkey>
    </div>
    <div class="flex-auto flex-grow-0 flex-shrink-0 mb-2 max-h-8">
      <input
        ref="searchbar"
        v-model="search"
        type="text"
        class="search-input"
        autofocus="true"
        :placeholder="$t('CONTACT_PANEL.LABELS.LABEL_SELECT.PLACEHOLDER')"
      />
    </div>
    <div
      class="flex items-start justify-start flex-auto flex-grow flex-shrink overflow-auto"
    >
      <div class="w-full my-1">
        <woot-dropdown-menu>
          <LabelDropdownItem
            v-for="label in filteredActiveLabels"
            :key="label.title"
            :title="label.title"
            :color="label.color"
            :selected="selectedLabels.includes(label.title)"
            @select-label="onAddRemove(label)"
          />
        </woot-dropdown-menu>
        <div
          v-if="noResult"
          class="flex justify-center py-4 px-2.5 font-medium text-xs text-n-slate-11"
        >
          {{ $t('CONTACT_PANEL.LABELS.LABEL_SELECT.NO_RESULT') }}
        </div>
        <div
          v-if="allowCreation && shouldShowCreate"
          class="flex pt-1 border-t border-solid border-n-weak"
        >
          <Button
            variant="ghost"
            size="sm"
            :disabled="hasExactMatchInResults"
            @click="showCreateModal"
          >
            <Icon icon="i-lucide-plus" />
            {{ `${createLabelPlaceholder} ${parsedSearch}` }}
          </Button>

          <!-- AddLabel is a self-contained shadcn Dialog (reka-ui portals its
               content to <body>), so it must be driven by its own `:open` prop —
               NOT wrapped in a legacy woot-modal (that left the inner Dialog
               closed → empty modal, and trapped the backdrop inside the Reka
               popover). -->
          <AddLabelModal
            :open="createModalVisible"
            :prefill-title="parsedSearch"
            @close="hideCreateModal"
          />
        </div>
      </div>
    </div>
  </div>
</template>
