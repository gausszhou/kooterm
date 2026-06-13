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
      path: '/vnc',
      component: () => import('@/views/vnc.vue')
    },
    {
      path: '/tcp',
      component: () => import('@/views/tcp.vue')
    }
  ]
});

export default router;
