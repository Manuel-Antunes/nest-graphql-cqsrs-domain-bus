<script setup>
import { defineProps, defineEmits, computed } from 'vue';
import ArticleListItem from './ArticleListItem.vue';
import { useMapGetter } from 'dashboard/composables/store';
import { Button } from 'dashboard/components-next/ui/button';

const props = defineProps({
  articles: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['view', 'viewAll']);

const widgetColor = useMapGetter('appConfig/getWidgetColor');

const articlesToDisplay = computed(() => props.articles.slice(0, 6));

const onArticleClick = link => {
  emit('view', link);
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <h3 class="font-medium text-n-slate-12">
      {{ $t('PORTAL.POPULAR_ARTICLES') }}
    </h3>
    <div class="flex flex-col gap-4">
      <ArticleListItem
        v-for="article in articlesToDisplay"
        :key="article.slug"
        :link="article.link"
        :title="article.title"
        @select-article="onArticleClick"
      />
    </div>
    <div>
      <Button variant="link" class="px-0" @click="$emit('viewAll')">
        {{ $t('PORTAL.VIEW_ALL_ARTICLES') }}
      </Button>
    </div>
  </div>
</template>
