/**
 * 设置页（模块九）
 *
 * 入口分组：
 *   - 数据：账户管理、分类管理、预算管理
 *   - 工具：导出 / 导入 / 重置数据库
 *   - 关于：版本号、源码地址、感谢
 */
(function () {
  'use strict';

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
  }

  async function render() {
    if (!pageEl) return;

    // 加载快速统计数据
    const [accounts, categories, txs] = await Promise.all([
      window.Repo.Accounts.getAll(true),
      window.Repo.Categories.getAll(true),
      window.Repo.Transactions.getAll()
    ]);
    const accountCount = accounts.reduce((s, a) => s + 1 + a.children.length, 0);
    const totalAmount = txs.reduce((s, t) => s + (t.type === 'expense' ? t.amountCNY : 0), 0);

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

        <div class="list-section-title">工具</div>
        <div class="list-section">
          ${menuItem('📤', '导出数据', '保存为 JSON 文件', 'export')}
          ${menuItem('📥', '导入数据', '从 JSON 文件恢复', 'import')}
          ${menuItem('💱', '更新汇率', '手动拉取最新美元汇率', 'fetch-rate')}
          ${menuItem('🗑️', '重置数据库', '清除所有数据', 'reset', true)}
        </div>

        <div class="list-section-title">关于</div>
        <div class="list-section">
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">版本</div>
            </div>
            <div class="list-item-value">1.0.0</div>
          </div>
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">数据存储</div>
              <div class="list-item-subtitle">所有数据存在你的浏览器本地，不上传任何服务器</div>
            </div>
          </div>
        </div>

        <div class="settings-footer">浅木绿调 · 模块 1-9 · ${new Date().getFullYear()}</div>
      </div>
    `;

    pageEl.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', () => handleAction(el.dataset.action));
    });
  }

  function menuItem(icon, title, sub, action, danger = false) {
    return `
      <div class="list-item is-clickable" data-action="${action}">
        <div class="list-item-icon" style="background:${danger ? 'rgba(193,74,62,0.12)' : 'var(--color-tint-light)'};color:${danger ? 'var(--color-expense)' : 'var(--color-tint)'};font-size:18px">${icon}</div>
        <div class="list-item-main">
          <div class="list-item-title" style="${danger ? 'color:var(--color-expense)' : ''}">${title}</div>
          ${sub ? `<div class="list-item-subtitle">${sub}</div>` : ''}
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
      // 拍平账户（去掉 children 字段，恢复原始记录）
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

        // 1. 清库
        await window.DB.deleteDatabase();
        await window.DB.init();

        // 2. 写入：保留原 id（用 put）
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

        // meta：转换格式
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
