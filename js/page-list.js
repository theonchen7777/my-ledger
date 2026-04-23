/**
 * 账单明细页（模块八）
 *
 * 显示所有账单，按日期分组。支持搜索和筛选。
 * 点击账单 → 编辑表单（复用 TxForm 的编辑模式）
 */
(function () {
  'use strict';

  const { formatMoney, formatTime, escapeHtml, toDateStr } = window.UIUtils;
  const { TX_TYPE } = window.DB_SCHEMA;

  let pageEl = null;
  let allTxs = [];
  let accountMap = {};
  let categoryMap = {};
  let filter = {
    type: 'all',     // all | expense | income
    accountId: 'all',
    categoryId: 'all',
    keyword: ''
  };

  async function init() {
    pageEl = document.querySelector('[data-page="list"]');
    if (!pageEl) return;

    pageEl.innerHTML = `
      <div class="list-page">
        <div class="list-toolbar">
          <input type="search" class="list-search" id="listSearch" placeholder="搜索备注、分类、账户..." autocomplete="off">
          <button class="list-filter-btn" id="listFilterBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span id="filterBadge"></span>
          </button>
        </div>
        <div class="list-summary" id="listSummary"></div>
        <div class="list-content" id="listContent"></div>
      </div>
    `;

    pageEl.querySelector('#listSearch').addEventListener('input', (e) => {
      filter.keyword = e.target.value.trim().toLowerCase();
      renderContent();
    });
    pageEl.querySelector('#listFilterBtn').addEventListener('click', openFilterPanel);

    await loadData();

    // 懒刷新：只在当前 Tab 是明细时才立即刷；否则标记为"需刷新"，切回来时再刷
    let needsReload = false;
    window.addEventListener('transactionchange', () => {
      if (pageEl.classList.contains('active')) {
        loadData();
      } else {
        needsReload = true;
      }
    });
    window.addEventListener('tabchange', (e) => {
      if (e.detail.tab === 'list' && needsReload) {
        needsReload = false;
        loadData();
      }
    });
  }

  async function loadData() {
    if (!pageEl) return;

    const [txs, accountsFlat, categories] = await Promise.all([
      window.Repo.Transactions.getAll(),
      window.Repo.Accounts.getFlatList(true),
      window.Repo.Categories.getAll(true)
    ]);

    allTxs = txs;
    accountMap = Object.fromEntries(accountsFlat.map(a => [a.id, a]));
    categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

    renderContent();
  }

  function applyFilter(txs) {
    return txs.filter(t => {
      if (filter.type !== 'all' && t.type !== filter.type) return false;
      if (filter.accountId !== 'all' && t.accountId !== Number(filter.accountId)) return false;
      if (filter.categoryId !== 'all' && t.categoryId !== Number(filter.categoryId)) return false;
      if (filter.keyword) {
        const cat = categoryMap[t.categoryId];
        const acc = accountMap[t.accountId];
        const hay = `${t.note} ${cat?.name || ''} ${acc?.displayName || ''}`.toLowerCase();
        if (!hay.includes(filter.keyword)) return false;
      }
      return true;
    });
  }

  function renderContent() {
    const filtered = applyFilter(allTxs);
    const summary = window.Repo.Transactions.summarize(filtered);
    const summaryEl = pageEl.querySelector('#listSummary');
    const contentEl = pageEl.querySelector('#listContent');

    summaryEl.innerHTML = `
      <span class="list-summary-item">${filtered.length} 笔</span>
      <span class="list-summary-divider">·</span>
      <span class="list-summary-item">支出 <span class="cal-expense">${formatMoney(summary.expense, { withCurrency: true })}</span></span>
      <span class="list-summary-divider">·</span>
      <span class="list-summary-item">收入 <span class="cal-income">${formatMoney(summary.income, { withCurrency: true })}</span></span>
    `;

    // 筛选标签数
    const activeCount = (filter.type !== 'all' ? 1 : 0) +
                        (filter.accountId !== 'all' ? 1 : 0) +
                        (filter.categoryId !== 'all' ? 1 : 0);
    const badgeEl = pageEl.querySelector('#filterBadge');
    badgeEl.textContent = activeCount > 0 ? activeCount : '';
    badgeEl.style.display = activeCount > 0 ? '' : 'none';

    if (filtered.length === 0) {
      contentEl.innerHTML = `
        <div class="day-empty">
          <div class="day-empty-icon">${filter.keyword ? '🔍' : '📋'}</div>
          <div class="day-empty-text">${filter.keyword ? '未找到匹配账单' : '还没有账单'}</div>
          <div class="day-empty-hint">${filter.keyword ? '试试别的关键字' : '到日历页加一笔吧'}</div>
        </div>
      `;
      return;
    }

    // 按日期分组
    const groups = {};
    filtered.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });

    const sortedDates = Object.keys(groups).sort().reverse();

    contentEl.innerHTML = sortedDates.map(date => {
      const items = groups[date];
      const daySum = window.Repo.Transactions.summarize(items);
      return `
        <div class="list-day-group">
          <div class="list-day-header">
            <span class="list-day-date">${formatDateLabel(date)}</span>
            <span class="list-day-stats">
              ${daySum.expense > 0 ? `<span class="cal-expense">支 ${formatMoney(daySum.expense, { withCurrency: true })}</span>` : ''}
              ${daySum.income > 0 ? `<span class="cal-income">收 ${formatMoney(daySum.income, { withCurrency: true })}</span>` : ''}
            </span>
          </div>
          <div class="list-day-body">
            ${items.map(t => renderTxItem(t)).join('')}
          </div>
        </div>
      `;
    }).join('');

    contentEl.querySelectorAll('[data-tx-id]').forEach(el => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.txId, 10);
        editTx(id);
      });
    });
  }

  function renderTxItem(tx) {
    const cat = categoryMap[tx.categoryId];
    const acc = accountMap[tx.accountId];
    const sign = tx.type === 'income' ? '+' : '-';
    const amountClass = tx.type === 'income' ? 'cal-income' : 'cal-expense';

    let amountHtml = `${sign}${formatMoney(tx.amountCNY, { withCurrency: true })}`;
    if (tx.currency !== 'CNY') {
      amountHtml += ` <span class="day-tx-original">(${tx.currency} ${(tx.amount / 100).toFixed(2)})</span>`;
    }

    const largeBadge = !tx.countInDailyBudget && tx.type === 'expense'
      ? '<span class="day-tx-badge">大额</span>'
      : '';

    return `
      <div class="day-tx-item is-clickable" data-tx-id="${tx.id}">
        <div class="day-tx-icon" style="background:${cat?.color || '#8e8775'}33; color:${cat?.color || '#8e8775'}">
          ${cat?.icon || '📝'}
        </div>
        <div class="day-tx-main">
          <div class="day-tx-line1">
            <span class="day-tx-cat">${escapeHtml(cat?.name || '未分类')}</span>
            ${largeBadge}
          </div>
          <div class="day-tx-line2">
            <span>${escapeHtml(acc?.displayName || '未指定账户')}</span>
            ${tx.note ? `<span class="day-tx-note">· ${escapeHtml(tx.note)}</span>` : ''}
            <span class="day-tx-time">${formatTime(tx.dateTime)}</span>
          </div>
        </div>
        <div class="day-tx-right">
          <div class="day-tx-amount ${amountClass}">${amountHtml}</div>
        </div>
      </div>
    `;
  }

  function formatDateLabel(dateStr) {
    const d = window.UIUtils.parseDate(dateStr);
    const today = new Date();
    const todayStr = toDateStr(today);
    const yesterdayDate = new Date(today); yesterdayDate.setDate(today.getDate() - 1);
    const yesterdayStr = toDateStr(yesterdayDate);

    if (dateStr === todayStr) return '今天';
    if (dateStr === yesterdayStr) return '昨天';

    const week = ['日','一','二','三','四','五','六'][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
  }

  // ============ 筛选面板 ============
  async function openFilterPanel() {
    const accountsFlat = await window.Repo.Accounts.getFlatList(true);
    const categories = await window.Repo.Categories.getAll(true);

    const html = `
      <div style="padding:8px 0;display:flex;flex-direction:column;gap:16px">
        <div class="form-group">
          <label class="form-label">类型</label>
          <select class="form-input" id="fType">
            <option value="all">全部</option>
            <option value="expense" ${filter.type === 'expense' ? 'selected' : ''}>支出</option>
            <option value="income" ${filter.type === 'income' ? 'selected' : ''}>收入</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">账户</label>
          <select class="form-input" id="fAccount">
            <option value="all">全部账户</option>
            ${accountsFlat.map(a => `<option value="${a.id}" ${String(a.id) === String(filter.accountId) ? 'selected' : ''}>${a.icon} ${escapeHtml(a.displayName)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">分类</label>
          <select class="form-input" id="fCategory">
            <option value="all">全部分类</option>
            ${categories.map(c => `<option value="${c.id}" ${String(c.id) === String(filter.categoryId) ? 'selected' : ''}>${c.icon} ${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>
    `;
    const footer = `
      <button class="sheet-btn-cancel" data-action="reset">重置</button>
      <button class="sheet-btn-cancel" data-action="cancel">取消</button>
      <button class="sheet-btn-primary" data-action="apply">应用</button>
    `;

    const sheet = window.UISheet.open({
      title: '筛选',
      content: html,
      footer,
      height: 'auto'
    });

    sheet.element.querySelector('[data-action="cancel"]').addEventListener('click', () => sheet.close());
    sheet.element.querySelector('[data-action="reset"]').addEventListener('click', () => {
      filter = { type: 'all', accountId: 'all', categoryId: 'all', keyword: filter.keyword };
      sheet.close();
      renderContent();
    });
    sheet.element.querySelector('[data-action="apply"]').addEventListener('click', () => {
      filter.type = sheet.element.querySelector('#fType').value;
      filter.accountId = sheet.element.querySelector('#fAccount').value;
      filter.categoryId = sheet.element.querySelector('#fCategory').value;
      sheet.close();
      renderContent();
    });
  }

  // ============ 编辑账单（点击账单进入） ============
  async function editTx(id) {
    const tx = await window.Repo.Transactions.getById(id);
    if (!tx) {
      alert('账单已不存在');
      loadData();
      return;
    }

    // 简单编辑界面：显示详情 + 删除按钮
    // 完整编辑直接复用 TxForm 太复杂，做一个简化版
    const cat = categoryMap[tx.categoryId];
    const acc = accountMap[tx.accountId];
    const sign = tx.type === 'income' ? '+' : '-';

    const html = `
      <div class="tx-detail">
        <div class="tx-detail-amount ${tx.type === 'income' ? 'cal-income' : 'cal-expense'}">
          ${sign}${formatMoney(tx.amountCNY, { withCurrency: true })}
        </div>
        ${tx.currency !== 'CNY' ? `
          <div class="tx-detail-original">原始金额: ${tx.currency} ${(tx.amount / 100).toFixed(2)} (汇率 ${tx.exchangeRate}${tx.isManualRate ? '·手动' : ''})</div>
        ` : ''}

        <div class="tx-detail-list">
          <div class="tx-detail-row">
            <span class="tx-detail-key">类型</span>
            <span>${tx.type === 'expense' ? '支出' : tx.type === 'income' ? '收入' : '转账'}</span>
          </div>
          <div class="tx-detail-row">
            <span class="tx-detail-key">分类</span>
            <span>${cat?.icon || '📝'} ${escapeHtml(cat?.name || '未分类')}</span>
          </div>
          <div class="tx-detail-row">
            <span class="tx-detail-key">账户</span>
            <span>${acc?.icon || '💰'} ${escapeHtml(acc?.displayName || '未指定')}</span>
          </div>
          <div class="tx-detail-row">
            <span class="tx-detail-key">日期</span>
            <span>${tx.date} ${formatTime(tx.dateTime)}</span>
          </div>
          ${tx.note ? `
          <div class="tx-detail-row">
            <span class="tx-detail-key">备注</span>
            <span>${escapeHtml(tx.note)}</span>
          </div>
          ` : ''}
          ${tx.type === 'expense' ? `
          <div class="tx-detail-row">
            <span class="tx-detail-key">日预算</span>
            <span>${tx.countInDailyBudget ? '✓ 计入' : '✗ 不计入（大额）'}</span>
          </div>
          ` : ''}
        </div>
      </div>
    `;
    const footer = `
      <button class="sheet-btn-cancel" data-action="delete" style="color:var(--color-expense)">删除</button>
      <button class="sheet-btn-primary" data-action="close">关闭</button>
    `;

    const sheet = window.UISheet.open({
      title: '账单详情',
      content: html,
      footer,
      height: 'auto'
    });

    sheet.element.querySelector('[data-action="close"]').addEventListener('click', () => sheet.close());
    sheet.element.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm('确定删除这笔账单？')) return;
      await window.Repo.Transactions.remove(id);
      window.dispatchEvent(new CustomEvent('transactionchange'));
      sheet.close();
    });
  }

  window.PageList = { init };
})();
