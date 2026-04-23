/**
 * 月视图日历
 *
 * 核心逻辑：
 *   1. 切换月份 → 加载整月账单 + 当前预算
 *   2. 按日聚合 → 每天的总支出 / 总收入 / 笔数
 *   3. 按周聚合 → 每周的总支出 / 周色块状态
 *   4. 渲染 6 行 × 7 列网格 + 左侧周列
 *   5. 点击格子 → 触发回调（由 page-calendar 接管）
 *
 * 颜色档位：
 *   < 80% → 绿
 *   80-100% → 橙
 *   > 100% → 红
 *   无消费 / 未设预算 → 中性灰
 */
(function () {
  'use strict';

  const {
    formatMoneyCompact, toDateStr, buildMonthMatrix, getWeekKey, escapeHtml
  } = window.UIUtils;

  // ============ 颜色判定 ============
  /**
   * @param {number} spentCents - 当日/周总支出（分）
   * @param {number|null} budgetYuan - 预算（元）
   * @returns {'empty'|'normal'|'warning'|'over'|'neutral'}
   */
  function getColorLevel(spentCents, budgetYuan) {
    // 未设预算 → 中性
    if (budgetYuan == null) return 'neutral';
    // 没消费 → 空
    if (spentCents === 0) return 'empty';

    const budgetCents = budgetYuan * 100;
    const ratio = spentCents / budgetCents;

    if (ratio > 1) return 'over';
    if (ratio >= 0.8) return 'warning';
    return 'normal';
  }

  // ============ 数据聚合 ============
  /**
   * 把账单数组按日聚合
   * @returns {Object} { 'YYYY-MM-DD': { expense, income, count } }
   */
  function aggregateByDay(transactions) {
    const map = {};
    transactions.forEach(t => {
      if (!map[t.date]) map[t.date] = { expense: 0, income: 0, count: 0 };
      const day = map[t.date];
      if (t.type === 'expense') {
        day.expense += t.amountCNY;
        day.count++;
      } else if (t.type === 'income') {
        day.income += t.amountCNY;
        day.count++;
      }
    });
    return map;
  }

  /**
   * 按周聚合（用 ISO week key）
   * @returns {Object} { 'YYYY-Www': { expense } }
   */
  function aggregateByWeek(transactions) {
    const map = {};
    transactions.forEach(t => {
      if (t.type !== 'expense') return;
      const wk = getWeekKey(t.date);
      if (!map[wk]) map[wk] = { expense: 0 };
      map[wk].expense += t.amountCNY;
    });
    return map;
  }

  // ============ 视图类 ============
  class CalendarView {
    constructor(container) {
      this.container = container;
      this.year = new Date().getFullYear();
      this.month = new Date().getMonth() + 1;
      this.dailyBudget = null;
      this.weeklyBudget = null;
      this.dayData = {};
      this.weekData = {};
      this.matrix = null;
      this.onDayClick = null;
      this.onMonthChange = null;
    }

    /**
     * 加载并渲染指定月份
     */
    async loadMonth(year, month) {
      this.year = year;
      this.month = month;

      // 并行加载
      const [transactions, budgets] = await Promise.all([
        window.Repo.Transactions.getByMonth(year, month),
        window.BudgetPanel.getBudgets()
      ]);

      // 跨周聚合需要包含上月末/下月初的账单
      // 简化做法：日聚合用本月账单（足够），周聚合需补加边缘周的账单
      this.dayData = aggregateByDay(transactions);
      this.dailyBudget = budgets.daily;
      this.weeklyBudget = budgets.weekly;

      // 周聚合：需要本月所在 6 周内的所有账单
      this.matrix = buildMonthMatrix(year, month);
      const startDate = this.matrix[0][0].date;
      const endDate = this.matrix[5][6].date;
      const weekTxs = await window.Repo.Transactions.getByDateRange(startDate, endDate);
      this.weekData = aggregateByWeek(weekTxs);

      this.render();

      if (this.onMonthChange) this.onMonthChange(year, month);
    }

    /**
     * 重新加载当前月份（用于添加/删除账单后刷新）
     */
    async reload() {
      await this.loadMonth(this.year, this.month);
    }

    /**
     * 上一月 / 下一月
     */
    async prevMonth() {
      let y = this.year, m = this.month - 1;
      if (m < 1) { m = 12; y--; }
      await this.loadMonth(y, m);
    }

    async nextMonth() {
      let y = this.year, m = this.month + 1;
      if (m > 12) { m = 1; y++; }
      await this.loadMonth(y, m);
    }

    /**
     * 跳到今天
     */
    async goToday() {
      const now = new Date();
      await this.loadMonth(now.getFullYear(), now.getMonth() + 1);
    }

    // ============ 渲染 ============
    render() {
      const monthTotal = this.calcMonthTotal();

      this.container.innerHTML = `
        <div class="cal-header">
          <div class="cal-month-nav">
            <button class="cal-nav-btn" data-nav="prev" aria-label="上月">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button class="cal-month-title" data-action="year-view">
              ${this.year} 年 ${this.month} 月
              <svg class="cal-month-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button class="cal-nav-btn" data-nav="next" aria-label="下月">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <div class="cal-actions">
            <button class="cal-action-btn" data-action="today">今天</button>
            <button class="cal-action-btn cal-action-icon" data-action="budget" aria-label="预算设置">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>
        </div>

        <div class="cal-summary">
          <div class="cal-summary-item">
            <div class="cal-summary-label">本月支出</div>
            <div class="cal-summary-value cal-expense">¥${(monthTotal.expense / 100).toFixed(2)}</div>
          </div>
          <div class="cal-summary-divider"></div>
          <div class="cal-summary-item">
            <div class="cal-summary-label">本月收入</div>
            <div class="cal-summary-value cal-income">¥${(monthTotal.income / 100).toFixed(2)}</div>
          </div>
          <div class="cal-summary-divider"></div>
          <div class="cal-summary-item">
            <div class="cal-summary-label">结余</div>
            <div class="cal-summary-value">¥${((monthTotal.income - monthTotal.expense) / 100).toFixed(2)}</div>
          </div>
        </div>

        <div class="cal-grid-wrap">
          ${this.renderGrid()}
        </div>
      `;

      this.bindEvents();
    }

    renderGrid() {
      const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

      // 表头：左侧 W 列 + 7 个工作日
      let headerHtml = '<div class="cal-row cal-row-header">';
      headerHtml += '<div class="cal-week-cell cal-week-header">W</div>';
      weekdays.forEach((w, i) => {
        const isWeekend = i >= 5;
        headerHtml += `<div class="cal-day-header ${isWeekend ? 'is-weekend' : ''}">${w}</div>`;
      });
      headerHtml += '</div>';

      // 6 行
      let bodyHtml = '';
      this.matrix.forEach((week, rowIdx) => {
        bodyHtml += this.renderWeekRow(week, rowIdx);
      });

      return headerHtml + bodyHtml;
    }

    renderWeekRow(week, rowIdx) {
      // 周色块：用本周一作为代表日期
      const weekKey = week[0].weekKey;
      const weekExpenseCents = this.weekData[weekKey]?.expense ?? 0;
      const weekColor = getColorLevel(weekExpenseCents, this.weeklyBudget);

      // 周编号显示：取本周四所在的 ISO 周
      const weekNum = weekKey.split('W')[1];

      let html = `<div class="cal-row">`;
      // 左侧周列
      html += `
        <div class="cal-week-cell" data-week-color="${weekColor}">
          <div class="cal-week-num">${parseInt(weekNum, 10)}</div>
          ${weekExpenseCents > 0 ? `<div class="cal-week-amount">${formatMoneyCompact(weekExpenseCents)}</div>` : ''}
        </div>
      `;

      // 7 个日格子
      week.forEach(cell => {
        html += this.renderDayCell(cell);
      });

      html += `</div>`;
      return html;
    }

    renderDayCell(cell) {
      const data = this.dayData[cell.dateStr];
      const expenseCents = data?.expense ?? 0;

      // 不在本月的格子：弱化显示，但仍可点击
      const dimmed = !cell.isCurrentMonth;
      const colorLevel = dimmed ? 'empty' : getColorLevel(expenseCents, this.dailyBudget);

      const todayClass = cell.isToday ? 'is-today' : '';
      const dimClass = dimmed ? 'is-dimmed' : '';

      return `
        <div class="cal-day-cell ${todayClass} ${dimClass}"
             data-color="${colorLevel}"
             data-date="${cell.dateStr}">
          <div class="cal-day-num">${cell.day}</div>
          ${expenseCents > 0 && !dimmed
            ? `<div class="cal-day-amount">${formatMoneyCompact(expenseCents)}</div>`
            : '<div class="cal-day-amount-placeholder"></div>'}
        </div>
      `;
    }

    calcMonthTotal() {
      let expense = 0, income = 0;
      Object.entries(this.dayData).forEach(([dateStr, data]) => {
        // 只统计本月的（dayData 是按本月账单聚合的，已经是本月）
        const d = window.UIUtils.parseDate(dateStr);
        if (d.getMonth() + 1 === this.month && d.getFullYear() === this.year) {
          expense += data.expense;
          income += data.income;
        }
      });
      return { expense, income };
    }

    bindEvents() {
      // 月份导航
      this.container.querySelectorAll('[data-nav]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.dataset.nav === 'prev') this.prevMonth();
          else this.nextMonth();
        });
      });

      // 今天
      this.container.querySelector('[data-action="today"]')?.addEventListener('click', () => {
        this.goToday();
      });

      // 预算设置
      this.container.querySelector('[data-action="budget"]')?.addEventListener('click', () => {
        window.BudgetPanel.open();
      });

      // 年视图
      this.container.querySelector('[data-action="year-view"]')?.addEventListener('click', () => {
        if (this.onYearViewRequest) this.onYearViewRequest();
      });

      // 日格子点击
      this.container.querySelectorAll('.cal-day-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          window.UIUtils.vibrate(8);
          if (this.onDayClick) this.onDayClick(cell.dataset.date);
        });
      });
    }
  }

  window.CalendarView = CalendarView;
})();
