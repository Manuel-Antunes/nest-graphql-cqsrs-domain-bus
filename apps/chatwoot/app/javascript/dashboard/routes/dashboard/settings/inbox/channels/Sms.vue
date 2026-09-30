<script>
import PageHeader from '../../SettingsSubPageHeader.vue';
import BandwidthSms from './BandwidthSms.vue';
import Twilio from './Twilio.vue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';
import { Label } from 'dashboard/components-next/ui/label';

export default {
  components: {
    PageHeader,
    Twilio,
    BandwidthSms,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Label,
  },
  data() {
    return {
      provider: 'twilio',
    };
  },
};
</script>

<template>
  <div class="h-full w-full p-6 col-span-6">
    <PageHeader
      :header-title="$t('INBOX_MGMT.ADD.SMS.TITLE')"
      :header-content="$t('INBOX_MGMT.ADD.SMS.DESC')"
    />
    <div class="flex-shrink-0 flex-grow-0 pb-4">
      <Label class="flex-col items-stretch gap-1">
        {{ $t('INBOX_MGMT.ADD.SMS.PROVIDERS.LABEL') }}
        <Select v-model="provider">
          <SelectTrigger class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="twilio">
              {{ $t('INBOX_MGMT.ADD.SMS.PROVIDERS.TWILIO') }}
            </SelectItem>
            <SelectItem value="360dialog">
              {{ $t('INBOX_MGMT.ADD.SMS.PROVIDERS.BANDWIDTH') }}
            </SelectItem>
          </SelectContent>
        </Select>
      </Label>
    </div>
    <Twilio v-if="provider === 'twilio'" type="sms" />
    <BandwidthSms v-else />
  </div>
</template>
