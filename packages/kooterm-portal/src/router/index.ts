import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '',
      redirect: '/terminal'
    },
    {
      path: '/vnc',
      redirect: '/desktop'
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
    },
    {
      path: '/lab',
      redirect: '/jupyter'
    },
    {
      path: '/jupyter',
      component: () => import('@/views/jupyter.vue')
    }
  ]
});

export default router;
