/**
 * 应用主控
 *
 * 启动顺序：
 *   1. 初始化数据库
 *   2. 写入默认数据（首次）
 *   3. 初始化各页面模块
 *   4. 显示日历
 */
(function () {
  'use strict';

  const TABS = {
    calendar: { title: '日历' },
    list:     { title: '账单明细' },
    stats:    { title: '统计报表' },
    settings: { title: '设置' }
  };

  const tabBar = document.getElementById('tabBar');
  const navTitle = document.getElementById('navTitle');
  const pages = document.querySelectorAll('.page');
  const tabItems = document.querySelectorAll('.tab-item');

  function switchTab(tabName) {
    if (!TABS[tabName]) return;

    tabItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.tab === tabName);
    });
    pages.forEach((page) => {
      page.classList.toggle('active', page.dataset.page === tabName);
    });
    navTitle.textContent = TABS[tabName].title;

    window.dispatchEvent(new CustomEvent('tabchange', { detail: { tab: tabName } }));
  }

  tabBar.addEventListener('click', (e) => {
    const tabItem = e.target.closest('.tab-item');
    if (!tabItem) return;
    switchTab(tabItem.dataset.tab);
  });

  async function bootstrap() {
    try {
      await window.DB.init();
      await window.DBSeed.runIfNeeded();
      console.log('[App] 数据层就绪');

      // 初始化所有页面模块
      await Promise.all([
        window.PageCalendar.init(),
        window.PageList.init(),
        window.PageStats.init(),
        window.PageSettings.init()
      ]);
      console.log('[App] 所有页面就绪');
    } catch (err) {
      console.error('[App] 启动失败：', err);
      alert('启动失败：' + err.message);
    }

    switchTab('calendar');
  }

  window.App = { switchTab, TABS };

  bootstrap();
})();
