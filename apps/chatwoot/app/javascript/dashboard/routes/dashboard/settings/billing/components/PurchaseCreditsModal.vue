<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from 'next/ui/dialog';
import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import CreditPackageCard from './CreditPackageCard.vue';
import EnterpriseAccountAPI from 'dashboard/api/enterprise/account';

const emit = defineEmits(['close', 'success']);

const { t } = useI18n();

const TOPUP_OPTIONS = [
  { credits: 1000, amount: 20.0, currency: 'usd' },
  { credits: 2500, amount: 50.0, currency: 'usd' },
  { credits: 6000, amount: 100.0, currency: 'usd' },
  { credits: 12000, amount: 200.0, currency: 'usd' },
];

const POPULAR_CREDITS_AMOUNT = 6000;
const STEP_SELECT = 'select';
const STEP_CONFIRM = 'confirm';

const dialogOpen = ref(false);
const selectedCredits = ref(null);
const isLoading = ref(false);
const currentStep = ref(STEP_SELECT);

const selectedOption = computed(() => {
  return TOPUP_OPTIONS.find(o => o.credits === selectedCredits.value);
});

const formattedAmount = computed(() => {
  if (!selectedOption.value) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: selectedOption.value.currency.toUpperCase(),
  }).format(selectedOption.value.amount);
});

const formattedCredits = computed(() => {
  if (!selectedOption.value) return '';
  return selectedOption.value.credits.toLocaleString();
});

const dialogTitle = computed(() => {
  return currentStep.value === STEP_SELECT
    ? t('BILLING_SETTINGS.TOPUP.MODAL_TITLE')
    : t('BILLING_SETTINGS.TOPUP.CONFIRM.TITLE');
});

const dialogDescription = computed(() => {
  return currentStep.value === STEP_SELECT
    ? t('BILLING_SETTINGS.TOPUP.MODAL_DESCRIPTION')
    : '';
});

const dialogWidthClass = computed(() => {
  return currentStep.value === STEP_SELECT ? 'max-w-xl' : 'max-w-md';
});

const handlePackageSelect = credits => {
  selectedCredits.value = credits;
};

// Reset the modal to its initial state whenever it opens (replaces the old
// imperative open() — the trigger now drives `dialogOpen` directly).
watch(dialogOpen, isOpen => {
  if (!isOpen) return;
  const popularOption = TOPUP_OPTIONS.find(
    o => o.credits === POPULAR_CREDITS_AMOUNT
  );
  selectedCredits.value = popularOption?.credits || TOPUP_OPTIONS[0]?.credits;
  currentStep.value = STEP_SELECT;
  isLoading.value = false;
});

const close = () => {
  dialogOpen.value = false;
};

const handleClose = () => {
  emit('close');
};

const goToConfirmStep = () => {
  if (!selectedOption.value) return;
  currentStep.value = STEP_CONFIRM;
};

const goBackToSelectStep = () => {
  currentStep.value = STEP_SELECT;
};

const handlePurchase = async () => {
  if (!selectedOption.value) return;

  isLoading.value = true;
  try {
    const response = await EnterpriseAccountAPI.createTopupCheckout(
      selectedOption.value.credits
    );

    close();
    emit('success', response.data);
    useAlert(
      t('BILLING_SETTINGS.TOPUP.PURCHASE_SUCCESS', {
        credits: response.data.credits,
      })
    );
  } catch (error) {
    const errorMessage =
      error.response?.data?.error || t('BILLING_SETTINGS.TOPUP.PURCHASE_ERROR');
    useAlert(errorMessage);
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <Dialog
    :open="dialogOpen"
    @update:open="
      val => {
        dialogOpen = val;
        if (!val) handleClose();
      }
    "
  >
    <DialogTrigger as-child>
      <slot name="trigger" />
    </DialogTrigger>
    <DialogContent :class="dialogWidthClass">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription v-if="dialogDescription">
          {{ dialogDescription }}
        </DialogDescription>
      </DialogHeader>

      <!-- Step 1: Select Credits Package -->
      <template v-if="currentStep === 'select'">
        <div class="grid grid-cols-2 gap-4">
          <CreditPackageCard
            v-for="option in TOPUP_OPTIONS"
            :key="option.credits"
            name="credit-package"
            :credits="option.credits"
            :amount="option.amount"
            :currency="option.currency"
            :is-popular="option.credits === POPULAR_CREDITS_AMOUNT"
            :is-selected="selectedCredits === option.credits"
            @select="handlePackageSelect(option.credits)"
          />
        </div>

        <div class="p-4 mt-6 rounded-lg bg-n-solid-2 border border-n-weak">
          <p class="text-sm text-muted-foreground">
            <span class="font-semibold text-n-slate-12">{{
              $t('BILLING_SETTINGS.TOPUP.NOTE_TITLE')
            }}</span>
            {{ $t('BILLING_SETTINGS.TOPUP.NOTE_DESCRIPTION') }}
          </p>
        </div>
      </template>

      <!-- Step 2: Confirm Purchase -->
      <template v-else>
        <div class="flex flex-col gap-4">
          <p class="text-muted-foreground">
            {{
              $t('BILLING_SETTINGS.TOPUP.CONFIRM.DESCRIPTION', {
                credits: formattedCredits,
                amount: formattedAmount,
              })
            }}
          </p>

          <div class="p-2.5 rounded-lg bg-n-amber-2 border border-n-amber-6">
            <p class="text-sm text-n-amber-11">
              {{ $t('BILLING_SETTINGS.TOPUP.CONFIRM.INSTANT_DEDUCTION_NOTE') }}
            </p>
          </div>
        </div>
      </template>

      <!-- Footer (was #footer slot, now inline content) -->
      <!-- Step 1 Footer -->
      <DialogFooter
        v-if="currentStep === 'select'"
        class="flex items-center justify-between w-full gap-3"
      >
        <DialogClose as-child>
          <Button variant="outline" class="w-full">
            {{ $t('BILLING_SETTINGS.TOPUP.CANCEL') }}
          </Button>
        </DialogClose>
        <Button
          variant="default"
          class="w-full"
          :disabled="!selectedCredits"
          @click="goToConfirmStep"
        >
          {{ $t('BILLING_SETTINGS.TOPUP.PURCHASE') }}
        </Button>
      </DialogFooter>

      <!-- Step 2 Footer -->
      <DialogFooter
        v-else
        class="flex items-center justify-between w-full gap-3"
      >
        <Button
          variant="outline"
          class="w-full"
          :disabled="isLoading"
          @click="goBackToSelectStep"
        >
          {{ $t('BILLING_SETTINGS.TOPUP.CONFIRM.GO_BACK') }}
        </Button>
        <Button
          variant="default"
          class="w-full"
          :disabled="isLoading"
          @click="handlePurchase"
        >
          <Spinner v-if="isLoading" class="size-4 flex-shrink-0" />
          <template v-if="!isLoading">
            {{ $t('BILLING_SETTINGS.TOPUP.CONFIRM.CONFIRM_PURCHASE') }}
          </template>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
