/**
 * 设置页（模块九）
 *
 * v1.6 更新：
 *   - 导出成功时记录 lastBackupAt
 *   - 备份状态行：显示"最近备份：X 天前"
 *   - 超过 7 天未备份时，顶部弹提醒条
 */
(function () {
  'use strict';

  // 每次升级改这里 + service-worker.js 里的 CACHE_VERSION
  const APP_VERSION = '1.6.0';

  // 超过多少天没备份就提醒
  const BACKUP_REMIND_DAYS = 7;

  const { formatMoney } = window.UIUtils;

  let pageEl = null;

  async function init() {
    pageEl = document.querySelector('[data-page="settings"]');
    if (!pageEl) return;
    await render();

    let needsReload = false;
    const markDirty = () => {
      if (pageEl.classList.contains('active')) {
        render();
      } else {
        needsReload = true;
      }
    };
    window.addEventListener('transactionchange', markDirty);
    window.addEventListener('budgetchange', markDirty);
    window.addEventListener('tabchange', (e) => {
      if (e.detail.tab === 'settings' && needsReload) {
        needsReload = false;
        render();
      }
    });

    // 启动时检查备份提醒（延迟 2 秒，避免打断首次打开体验）
    setTimeout(() => maybeShowBackupBanner(), 2000);
  }

  // ============ 备份时间工具 ============
  async function getLastBackupAt() {
    return await window.Repo.Meta.get('lastBackupAt');
  }

  async function setLastBackupAt(ts) {
    await window.Repo.Meta.set('lastBackupAt', ts);
  }

  function formatBackupAgo(ts) {
    if (!ts) return null;
    const diffMs = Date.now() - ts;
    const days = Math.floor(diffMs / (24 * 3600 * 1000));
    if (days === 0) {
      const hours = Math.floor(diffMs / (3600 * 1000));
      if (hours === 0) return '刚刚';
      return `${hours} 小时前`;
    }
    if (days < 30) return `${days} 天前`;
    const months = Math.floor(days / 30);
    return `${months} 个月前`;
  }

  // ============ 备份提醒条（顶部） ============
  async function maybeShowBackupBanner() {
    const last = await getLastBackupAt();
    const txs = await window.Repo.Transactions.getAll();

    // 没有任何账单，不提醒
    if (txs.length === 0) return;

    // 有备份且还在 7 天内，不提醒
    if (last && Date.now() - last < BACKUP_REMIND_DAYS * 24 * 3600 * 1000) return;

    // 本次会话已关掉过提醒，不再弹
    if (sessionStorage.getItem('backupBannerDismissed') === '1') return;

    showBackupBanner(last);
  }

  function showBackupBanner(last) {
    if (document.getElementById('backupBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'backupBanner';
    banner.className = 'backup-banner';

    const msg = last
      ? `已有 ${formatBackupAgo(last)} 未备份`
      : '还未备份过数据';

    banner.innerHTML = `
      <div class="backup-banner-icon">⚠️</div>
      <div class="backup-banner-text">${msg}</div>
      <button class="backup-banner-btn" data-action="backup-now">立即备份</button>
      <button class="backup-banner-close" data-action="dismiss" aria-label="关闭">×</button>
    `;

    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('active'));

    banner.querySelector('[data-action="backup-now"]').addEventListener('click', async () => {
      await exportData();
      hideBackupBanner();
    });
    banner.querySelector('[data-action="dismiss"]').addEventListener('click', () => {
      sessionStorage.setItem('backupBannerDismissed', '1');
      hideBackupBanner();
    });
  }

  function hideBackupBanner() {
    const banner = document.getElementById('backupBanner');
    if (!banner) return;
    banner.classList.remove('active');
    setTimeout(() => banner.remove(), 250);
  }

  // ============ 主渲染 ============
  async function render() {
    if (!pageEl) return;

    const [accounts, categories, txs, lastBackupAt] = await Promise.all([
      window.Repo.Accounts.getAll(true),
      window.Repo.Categories.getAll(true),
      window.Repo.Transactions.getAll(),
      getLastBackupAt()
    ]);
    const accountCount = accounts.reduce((s, a) => s + 1 + a.children.length, 0);

    // 备份状态行
    let backupStatusHtml;
    let backupStatusClass = '';
    if (lastBackupAt) {
      const ago = formatBackupAgo(lastBackupAt);
      const days = Math.floor((Date.now() - lastBackupAt) / (24 * 3600 * 1000));
      if (days >= BACKUP_REMIND_DAYS) {
        backupStatusClass = 'backup-status-warn';
        backupStatusHtml = `最近备份：${ago} <span class="backup-status-note">建议备份</span>`;
      } else {
        backupStatusClass = 'backup-status-ok';
        backupStatusHtml = `最近备份：${ago}`;
      }
    } else {
      backupStatusClass = 'backup-status-none';
      backupStatusHtml = `从未备份 <span class="backup-status-note">建议立即备份</span>`;
    }

    pageEl.innerHTML = `
      <div class="settings-page">
        <div class="settings-header">
          <div class="settings-stats">
            <div><div class="settings-stats-num">${txs.length}</div><div class="settings-stats-label">账单</div></div>
            <div><div class="settings-stats-num">${accountCount}</div><div class="settings-stats-label">账户</div></div>
            <div><div class="settings-stats-num">${categories.length}</div><div class="settings-stats-label">分类</div></div>
          </div>
        </div>

        <div class="list-section-title">数据管理</div>
        <div class="list-section">
          ${menuItem('🏦', '账户管理', '管理资产/信用账户', 'accounts')}
          ${menuItem('🏷️', '分类管理', '自定义支出/收入分类', 'categories')}
          ${menuItem('🎯', '预算管理', '日/周/月预算', 'budgets')}
        </div>

        <div class="list-section-title">数据备份</div>
        <div class="list-section">
          <div class="list-item backup-status-row ${backupStatusClass}">
            <div class="list-item-icon" style="background:var(--color-tint-light);color:var(--color-tint);font-size:18px">💾</div>
            <div class="list-item-main">
              <div class="list-item-title">${backupStatusHtml}</div>
              <div class="list-item-subtitle">iOS 删除主屏幕 App 会清除所有数据，请定期备份</div>
            </div>
          </div>
          ${menuItem('📤', '导出数据', '保存为 JSON 文件', 'export')}
          ${menuItem('📥', '导入数据', '从 JSON 文件恢复', 'import')}
        </div>

        <div class="list-section-title">工具</div>
        <div class="list-section">
          ${menuItem('💱', '更新汇率', '手动拉取最新美元汇率', 'fetch-rate')}
          ${menuItem('🗑️', '重置数据库', '清除所有数据', 'reset', true)}
        </div>

        <div class="list-section-title">关于</div>
        <div class="list-section">
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">版本</div>
            </div>
            <div class="list-item-value">${APP_VERSION}</div>
          </div>
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">数据存储</div>
              <div class="list-item-subtitle">所有数据存在你的浏览器本地，不上传任何服务器</div>
            </div>
          </div>
        </div>

        <div class="settings-footer">浅木绿调 · v${APP_VERSION} · ${new Date().getFullYear()}</div>
      </div>
    `;

    pageEl.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', () => handleAction(el.dataset.action));
    });
  }

  function menuItem(icon, title, sub, action, danger = false) {
    const iconBg = danger ? 'rgba(193,74,62,0.12)' : 'var(--color-tint-light)';
    const iconColor = danger ? 'var(--color-expense)' : 'var(--color-tint)';
    const titleStyle = danger ? 'color:var(--color-expense)' : '';
    const subHtml = sub ? `<div class="list-item-subtitle">${sub}</div>` : '';

    return `
      <div class="list-item is-clickable" data-action="${action}">
        <div class="list-item-icon" style="background:${iconBg};color:${iconColor};font-size:18px">${icon}</div>
        <div class="list-item-main">
          <div class="list-item-title" style="${titleStyle}">${title}</div>
          ${subHtml}
        </div>
        <svg class="list-item-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `;
  }

  async function handleAction(action) {
    switch (action) {
      case 'accounts':   window.PageAccounts.open(); break;
      case 'categories': window.PageCategories.open(); break;
      case 'budgets':    window.PageBudgets.open(); break;
      case 'export':     await exportData(); break;
      case 'import':     await importData(); break;
      case 'fetch-rate': await fetchRate(); break;
      case 'reset':      await resetDB(); break;
    }
  }

  // ============ 导出 ============
  async function exportData() {
    try {
      const [accounts, categories, transactions, meta] = await Promise.all([
        window.Repo.Accounts.getAll(true),
        window.Repo.Categories.getAll(true),
        window.Repo.Transactions.getAll(),
        window.Repo.Meta.getAll()
      ]);
      const flatAccounts = [];
      accounts.forEach(p => {
        const { children, ...rest } = p;
        flatAccounts.push(rest);
        children.forEach(c => flatAccounts.push(c));
      });

      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        accounts: flatAccounts,
        categories,
        transactions,
        meta
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // 记录本次备份时间
      await setLastBackupAt(Date.now());

      // 刷新设置页显示
      if (pageEl && pageEl.classList.contains('active')) {
        render();
      }
    } catch (err) {
      alert('导出失败：' + err.message);
    }
  }

  // ============ 导入 ============
  async function importData() {
    if (!confirm('导入会清空当前所有数据并替换为文件中的数据。\n\n建议先导出当前数据备份。\n\n继续？')) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.version || !Array.isArray(data.transactions)) {
          throw new Error('文件格式错误，请使用本应用导出的备份文件');
        }

        await window.DB.deleteDatabase();
        await window.DB.init();

        async function writeAll(storeName, items) {
          if (!items || items.length === 0) return;
          const { store, done } = window.DB.tx(storeName, 'readwrite');
          for (const item of items) {
            store.put(item);
          }
          await done;
        }

        await writeAll('accounts', data.accounts);
        await writeAll('categories', data.categories);
        await writeAll('transactions', data.transactions);

        if (data.meta) {
          const metaItems = Object.entries(data.meta).map(([key, value]) => ({ key, value, updatedAt: Date.now() }));
          await writeAll('meta', metaItems);
        }

        alert(`导入成功：${data.transactions.length} 条账单。\n\n应用即将重新加载。`);
        location.reload();
      } catch (err) {
        alert('导入失败：' + err.message);
      }
    });
    input.click();
  }

  async function fetchRate() {
    try {
      const result = await window.Repo.ExchangeRates.getSmartRate('USD', 'CNY');
      alert(`USD → CNY 汇率: ${result.rate}\n来源: ${result.fromCache ? '本地缓存' : '在线（frankfurter）'}\n时间: ${new Date(result.fetchedAt).toLocaleString()}`);
    } catch (err) {
      alert('获取失败：' + err.message);
    }
  }

  async function resetDB() {
    if (!confirm('⚠️ 这会清空所有账单、账户、分类、预算！\n\n确定继续？')) return;
    if (!confirm('再次确认：所有数据将被永久删除，无法恢复。继续？')) return;
    await window.DB.deleteDatabase();
    location.reload();
  }

  window.PageSettings = { init };
})();
