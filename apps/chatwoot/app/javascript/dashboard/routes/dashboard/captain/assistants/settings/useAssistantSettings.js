import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useStore, useFunctionGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';

export function useAssistantSettings() {
  const { t } = useI18n();
  const { currentParams } = useAppNavigation();
  const store = useStore();

  const assistantId = computed(() => Number(currentParams.value.assistantId));
  const assistant = useFunctionGetter(
    'captainAssistants/getRecord',
    assistantId
  );

  const updateAssistant = async updatedAssistant => {
    try {
      await store.dispatch('captainAssistants/update', {
        id: assistantId.value,
        ...updatedAssistant,
      });
      useAlert(t('CAPTAIN.ASSISTANTS.EDIT.SUCCESS_MESSAGE'));
    } catch (error) {
      useAlert(error?.message || t('CAPTAIN.ASSISTANTS.EDIT.ERROR_MESSAGE'));
    }
  };

  return { assistantId, assistant, updateAssistant };
}
