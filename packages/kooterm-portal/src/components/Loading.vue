<template>
  <div class="loading">
    <div class="spinner"></div>
    <span>{{ message }}</span>
  </div>
</template>
<script lang="ts" setup>
const props = defineProps({
  message: {
    type: String,
    default: 'Connecting...'
  }
})
</script>
<style scoped>
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
