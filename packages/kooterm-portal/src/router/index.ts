import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '',
      redirect: '/terminal'
    },
    {
      path: '/terminal',
      component: () => import('@/views/terminal.vue')
    },
    {
      path: '/desktop',
      component: () => import('@/views/vnc.vue')
    },
    {
      path: '/opencode',
      component: () => import('@/views/opencode.vue')
    },
    {
      path: '/openvscode',
      component: () => import('@/views/openvscode.vue')
    }
  ]
});

export default router;
