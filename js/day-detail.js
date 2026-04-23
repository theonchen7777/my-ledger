/**
 * 当日详情抽屉
 *
 * 在抽屉里显示某一天的账单列表
 * 支持：删除单条账单
 * "加账单"按钮：模块四会接管
 */
(function () {
  'use strict';

  const { formatMoney, formatTime, formatDateLabel, escapeHtml } = window.UIUtils;

  let currentSheet = null;
  let currentDate = null;
  let onChangeCallback = null;

  /**
   * 打开当日抽屉
   * @param {string} dateStr - 'YYYY-MM-DD'
   * @param {Function} onChange - 数据变更后的回调（用于刷新日历）
   */
  async function open(dateStr, onChange) {
    currentDate = dateStr;
    onChangeCallback = onChange;

    const content = await renderContent();
    const footer = `
      <button class="sheet-btn-primary" data-action="add">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;margin-right:6px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        添加账单
      </button>
    `;

    currentSheet = window.UISheet.open({
      title: formatDateLabel(dateStr),
      content,
      footer,
      height: 70,
      onClose: () => {
        currentSheet = null;
        currentDate = null;
        onChangeCallback = null;
      }
    });

    bindEvents();
  }

  /**
   * 重新渲染内容（删除账单后用）
   */
  async function refresh() {
    if (!currentSheet || !currentDate) return;
    const content = await renderContent();
    currentSheet.update(content);
    bindEvents();
    if (onChangeCallback) onChangeCallback();
  }

  // ============ 渲染 ============
  async function renderContent() {
    // 加载该日账单 + 账户/分类映射（用于显示名字）
    const [transactions, accountsFlat, categories] = await Promise.all([
      window.Repo.Transactions.getByDate(currentDate),
      window.Repo.Accounts.getFlatList(true),
      window.Repo.Categories.getAll(true)
    ]);

    const accountMap = Object.fromEntries(accountsFlat.map(a => [a.id, a]));
    const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

    // 汇总
    const summary = window.Repo.Transactions.summarize(transactions);
    const dailyOnlySummary = window.Repo.Transactions.summarize(transactions, { onlyDailyBudget: true });

    // 头部统计
    let headerHtml = `
      <div class="day-summary">
        <div class="day-summary-row">
          <span class="day-summary-label">总支出</span>
          <span class="day-summary-value cal-expense">${formatMoney(summary.expense, { withCurrency: true })}</span>
        </div>
        <div class="day-summary-row">
          <span class="day-summary-label">总收入</span>
          <span class="day-summary-value cal-income">${formatMoney(summary.income, { withCurrency: true })}</span>
        </div>
        ${summary.expense !== dailyOnlySummary.expense ? `
        <div class="day-summary-row day-summary-sub">
          <span class="day-summary-label">└ 计入日预算的支出</span>
          <span class="day-summary-value">${formatMoney(dailyOnlySummary.expense, { withCurrency: true })}</span>
        </div>
        ` : ''}
      </div>
    `;

    // 账单列表
    let listHtml = '';
    if (transactions.length === 0) {
      listHtml = `
        <div class="day-empty">
          <div class="day-empty-icon">📭</div>
          <div class="day-empty-text">这天还没有账单</div>
          <div class="day-empty-hint">点击下方"添加账单"开始记录</div>
        </div>
      `;
    } else {
      listHtml = '<div class="day-tx-list">';
      transactions.forEach(t => {
        listHtml += renderTxItem(t, accountMap, categoryMap);
      });
      listHtml += '</div>';
    }

    return headerHtml + listHtml;
  }

  function renderTxItem(tx, accountMap, categoryMap) {
    const cat = categoryMap[tx.categoryId];
    const acc = accountMap[tx.accountId];

    const sign = tx.type === 'income' ? '+' : '-';
    const amountClass = tx.type === 'income' ? 'cal-income' : 'cal-expense';

    // 显示金额：原币种为非 CNY 时同时显示
    let amountHtml = `${sign}${formatMoney(tx.amountCNY, { withCurrency: true })}`;
    if (tx.currency !== 'CNY') {
      amountHtml += ` <span class="day-tx-original">(${tx.currency} ${(tx.amount / 100).toFixed(2)})</span>`;
    }

    // 大额标记
    const largeBadge = !tx.countInDailyBudget && tx.type === 'expense'
      ? '<span class="day-tx-badge">大额</span>'
      : '';

    return `
      <div class="day-tx-item" data-tx-id="${tx.id}">
        <div class="day-tx-icon" style="background:${cat?.color || '#8e8e93'}33; color:${cat?.color || '#8e8e93'}">
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
          <button class="day-tx-delete" data-action="delete" data-tx-id="${tx.id}" aria-label="删除">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  // ============ 事件绑定 ============
  function bindEvents() {
    if (!currentSheet) return;

    // footer 加账单按钮
    currentSheet.element.querySelector('[data-action="add"]')?.addEventListener('click', () => {
      // 打开账单表单，预填日期
      window.TxForm.open({
        date: currentDate,
        onSaved: () => {
          // 保存成功后刷新当日抽屉
          refresh();
        }
      });
    });

    // 删除账单
    currentSheet.element.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const txId = parseInt(btn.dataset.txId, 10);
        if (!confirm('删除这条账单？')) return;
        await window.Repo.Transactions.remove(txId);
        await refresh();
      });
    });
  }

  window.DayDetail = { open, refresh };
})();
