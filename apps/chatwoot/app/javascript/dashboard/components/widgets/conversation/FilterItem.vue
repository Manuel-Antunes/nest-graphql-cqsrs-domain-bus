<script>
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';

export default {
  components: {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  },
  props: {
    selectedValue: {
      type: String,
      required: true,
    },
    items: {
      type: Array,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    pathPrefix: {
      type: String,
      required: true,
    },
  },
  emits: ['onChangeFilter'],
  data() {
    return {
      activeValue: this.selectedValue,
    };
  },
  methods: {
    onTabChange() {
      if (this.type === 'status') {
        this.$store.dispatch('setChatStatusFilter', this.activeValue);
      } else {
        this.$store.dispatch('setChatSortFilter', this.activeValue);
      }
      this.$emit('onChangeFilter', this.activeValue, this.type);
    },
  },
};
</script>

<template>
  <Select v-model="activeValue" @update:model-value="onTabChange">
    <SelectTrigger size="sm" class="mx-1 w-32 text-xs">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="value in items" :key="value" :value="value">
        {{ $t(`${pathPrefix}.${value}.TEXT`) }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
