/**
 * Service Worker 注册
 * 必须在 HTTPS 或 localhost 环境下才能工作
 */
if ('serviceWorker' in navigator) {
  // 等页面加载完成再注册，避免和首屏渲染抢资源
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then((registration) => {
        console.log('[SW] 注册成功，作用域：', registration.scope);
      })
      .catch((error) => {
        console.warn('[SW] 注册失败：', error);
      });
  });
}
