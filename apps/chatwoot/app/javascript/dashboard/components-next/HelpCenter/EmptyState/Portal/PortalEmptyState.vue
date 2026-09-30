<script setup>
import { ref } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import EmptyStateLayout from 'dashboard/components-next/EmptyStateLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import ArticleCard from 'dashboard/components-next/HelpCenter/ArticleCard/ArticleCard.vue';
import articleContent from './portalEmptyStateContent';
import CreatePortalDialog from 'dashboard/components-next/HelpCenter/PortalSwitcher/CreatePortalDialog.vue';

const createPortalDialogRef = ref(null);
const openDialog = () => {
  createPortalDialogRef.value.dialogRef.open();
};

const { visit } = useAppNavigation();

const onPortalCreate = ({ slug: portalSlug, locale }) => {
  visit({
    name: 'portals_articles_index',
    params: { portalSlug, locale },
  });
};
</script>

<template>
  <EmptyStateLayout
    :title="$t('HELP_CENTER.TITLE')"
    :subtitle="$t('HELP_CENTER.NEW_PAGE.DESCRIPTION')"
    class="bg-n-surface-1"
  >
    <template #empty-state-item>
      <div class="grid grid-cols-2 gap-4 p-px">
        <div class="space-y-4">
          <ArticleCard
            v-for="(article, index) in articleContent"
            :id="article.id"
            :key="`article-${index}`"
            :title="article.title"
            :status="article.status"
            :updated-at="article.updatedAt"
            :author="article.author"
            :category="article.category"
            :views="article.views"
          />
        </div>
        <div class="space-y-4">
          <ArticleCard
            v-for="(article, index) in articleContent.reverse()"
            :id="article.id"
            :key="`article-${index}`"
            :title="article.title"
            :status="article.status"
            :updated-at="article.updatedAt"
            :author="article.author"
            :category="article.category"
            :views="article.views"
          />
        </div>
      </div>
    </template>
    <template #actions>
      <Button variant="default" @click="openDialog">
        <Icon icon="i-lucide-plus" class="size-4" />
        {{ $t('HELP_CENTER.NEW_PAGE.CREATE_PORTAL_BUTTON') }}
      </Button>
      <CreatePortalDialog
        ref="createPortalDialogRef"
        @create="onPortalCreate"
      />
    </template>
  </EmptyStateLayout>
</template>
