<script>
import Response from './views/Response.vue';
import { Toaster } from 'next/ui/sonner';
import 'vue-sonner/style.css';

export default {
  name: 'App',
  components: {
    Response,
    Toaster,
  },
};
</script>

<template>
  <div id="app" dir="ltr" class="woot-survey-wrap min-h-screen">
    <Response />
    <Toaster />
  </div>
</template>

<style lang="scss">
@import './assets/scss/woot.scss';
</style>
