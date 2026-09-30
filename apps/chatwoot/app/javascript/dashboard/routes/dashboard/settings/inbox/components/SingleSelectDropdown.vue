<script>
import { Label } from 'dashboard/components-next/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';

export default {
  components: {
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  },
  props: {
    label: {
      type: String,
      default: '',
    },
    options: {
      type: Array,
      default: () => [],
    },
    selected: {
      type: String,
      default: '',
    },
    action: {
      type: Function,
      default: () => {},
    },
  },
  data() {
    return {
      value: this.selected,
    };
  },
};
</script>

<template>
  <div class="flex flex-col gap-1">
    <Label v-if="label" for="dropdown-select">
      {{ label }}
    </Label>
    <Select v-model="value" @update:model-value="action(value)">
      <SelectTrigger id="dropdown-select" class="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="option in options"
          :key="option.key"
          :value="option.value"
        >
          {{ option.value }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
