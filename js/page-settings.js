/**
 * 设置页（模块九）
 *
 * v1.7 更新：
 *   - 导出使用 navigator.share()，iOS 上可直接选"存到 iCloud 云盘"
 *   - 首次成功备份后弹出操作指引
 *   - 加"如何备份到 iCloud"帮助入口
 */
(function () {
  'use strict';

  const APP_VERSION = '1.7.0';
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

    setTimeout(() => maybeShowBackupBanner(), 2000);
  }

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

  async function maybeShowBackupBanner() {
    const last = await getLastBackupAt();
    const txs = await window.Repo.Transactions.getAll();
    if (txs.length === 0) return;
    if (last && Date.now() - last < BACKUP_REMIND_DAYS * 24 * 3600 * 1000) return;
    if (sessionStorage.getItem('backupBannerDismissed') === '1') return;
    showBackupBanner(last);
  }

  function showBackupBanner(last) {
    if (document.getElementById('backupBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'backupBanner';
    banner.className = 'backup-banner';
    const msg = last ? `已有 ${formatBackupAgo(last)} 未备份` : '还未备份过数据';
    banner.innerHTML = `
      <div class="backup-banner-icon">⚠️</div>
      <div class="backup-banner-text">${msg}</div>
      <button class="backup-banner-btn" data-action="backup-now">立即备份</button>
      <button class="backup-banner-close" data-action="dismiss" aria-label="关闭">×</button>
    `;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('active'));

    banner.querySelector('[data-action="backup-now"]').addEventListener('click', async () => {
      hideBackupBanner();
      await exportData();
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

  async function render() {
    if (!pageEl) return;

    const [accounts, categories, txs, lastBackupAt] = await Promise.all([
      window.Repo.Accounts.getAll(true),
      window.Repo.Categories.getAll(true),
      window.Repo.Transactions.getAll(),
      getLastBackupAt()
    ]);
    const accountCount = accounts.reduce((s, a) => s + 1 + a.children.length, 0);

    let backupStatusHtml, backupStatusClass = '';
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

        <div class="list-section-title">数据备份（iCloud）</div>
        <div class="list-section">
          <div class="list-item backup-status-row ${backupStatusClass}">
            <div class="list-item-icon" style="background:var(--color-tint-light);color:var(--color-tint);font-size:18px">💾</div>
            <div class="list-item-main">
              <div class="list-item-title">${backupStatusHtml}</div>
              <div class="list-item-subtitle">iOS 删除主屏幕 App 会清除数据，请定期备份到 iCloud 云盘</div>
            </div>
          </div>
          ${menuItem('☁️', '备份到 iCloud', '生成 JSON 文件并保存到云盘', 'export')}
          ${menuItem('📥', '从 iCloud 恢复', '选择备份文件导入', 'import')}
          ${menuItem('❓', '如何备份到 iCloud', '查看详细步骤', 'help')}
        </div>

        <div class="list-section-title">工具</div>
        <div class="list-section">
          ${menuItem('💱', '更新汇率', '手动拉取最新美元汇率', 'fetch-rate')}
          ${menuItem('🗑️', '重置数据库', '清除所有数据', 'reset', true)}
        </div>

        <div class="list-section-title">关于</div>
        <div class="list-section">
          <div class="list-item">
            <div class="list-item-main"><div class="list-item-title">版本</div></div>
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
      case 'help':       showBackupHelp(); break;
      case 'fetch-rate': await fetchRate(); break;
      case 'reset':      await resetDB(); break;
    }
  }

  // ============ 导出（v1.7：用 Web Share API） ============
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
      const filename = `ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([json], { type: 'application/json' });

      let shared = false;
      try {
        const file = new File([blob], filename, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: '记账备份',
            text: `记账 App 数据备份 · ${transactions.length} 条账单`
          });
          shared = true;
        }
      } catch (err) {
        // 用户取消分享不算失败
        if (err.name === 'AbortError') return;
        console.warn('Share failed, fallback to download:', err);
      }

      if (!shared) {
        // 降级：下载到默认位置
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      await setLastBackupAt(Date.now());

      // 首次成功备份，弹帮助
      const helpShown = await window.Repo.Meta.get('backupHelpShown');
      if (!helpShown) {
        await window.Repo.Meta.set('backupHelpShown', true);
        setTimeout(() => showBackupHelp(), 500);
      }

      if (pageEl && pageEl.classList.contains('active')) {
        render();
      }
    } catch (err) {
      alert('导出失败：' + err.message);
    }
  }

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

  // ============ 备份帮助弹窗 ============
  function showBackupHelp() {
    const html = `
      <div class="backup-help">
        <div class="backup-help-section">
          <div class="backup-help-section-title">📤 备份步骤</div>
          <ol class="backup-help-steps">
            <li>点<b>"备份到 iCloud"</b>按钮</li>
            <li>iOS 弹出分享菜单，选 <b>"存储到文件"</b></li>
            <li>选择 <b>"iCloud 云盘"</b> → 新建或选择"记账备份"文件夹</li>
            <li>点<b>"存储"</b>，完成</li>
          </ol>
        </div>

        <div class="backup-help-section">
          <div class="backup-help-section-title">📥 恢复步骤（新手机 / 重装时）</div>
          <ol class="backup-help-steps">
            <li>新设备添加主屏幕 App 后打开</li>
            <li>进入 <b>设置 → 从 iCloud 恢复</b></li>
            <li>iOS 弹出文件选择器，<b>点左上角"浏览"</b></li>
            <li>选 <b>"iCloud 云盘"</b> → 找到 JSON 备份文件</li>
            <li>点击文件，等待导入完成</li>
          </ol>
        </div>

        <div class="backup-help-tip">
          💡 <b>小贴士</b>：备份文件名含日期，例如 <code>ledger-backup-2026-04-23.json</code>。每次备份都会覆盖同一天的文件，不同天的备份会并存。
        </div>

        <div class="backup-help-tip">
          ⚠️ <b>注意</b>：如果你的设备不支持"分享到文件"，导出会降级为直接下载到"下载"文件夹，之后你可以手动移到 iCloud 云盘。
        </div>
      </div>
    `;

    window.UISheet.open({
      title: 'iCloud 备份指南',
      content: html,
      height: 'full'
    });
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
