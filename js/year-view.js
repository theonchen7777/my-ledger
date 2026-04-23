/**
 * 年视图：12 个月小预览
 *
 * 每个月显示一个迷你日历方阵（用色块表示每天的预算状态）
 * 点击某月跳转到对应月视图
 *
 * 数据策略：
 *   一次性加载全年所有账单（一年 365 天，按 GC 经验通常 < 5000 条，可承受）
 *   按日聚合后，每个月份独立渲染
 */
(function () {
  'use strict';

  const { buildMonthMatrix, toDateStr } = window.UIUtils;

  class YearView {
    constructor(container) {
      this.container = container;
      this.year = new Date().getFullYear();
      this.dayData = {};
      this.dailyBudget = null;
      this.onMonthClick = null;
      this.onClose = null;
    }

    async loadYear(year) {
      this.year = year;

      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31);

      const [transactions, budgets] = await Promise.all([
        window.Repo.Transactions.getByDateRange(startDate, endDate),
        window.BudgetPanel.getBudgets()
      ]);

      // 按日聚合
      this.dayData = {};
      transactions.forEach(t => {
        if (t.type !== 'expense') return;
        if (!this.dayData[t.date]) this.dayData[t.date] = 0;
        this.dayData[t.date] += t.amountCNY;
      });

      this.dailyBudget = budgets.daily;
      this.render();
    }

    getColorLevel(spentCents) {
      if (this.dailyBudget == null) return 'neutral';
      if (spentCents === 0 || spentCents == null) return 'empty';
      const ratio = spentCents / (this.dailyBudget * 100);
      if (ratio > 1) return 'over';
      if (ratio >= 0.8) return 'warning';
      return 'normal';
    }

    render() {
      const today = new Date();
      const yearTotal = Object.values(this.dayData).reduce((s, v) => s + v, 0);

      let monthsHtml = '';
      for (let m = 1; m <= 12; m++) {
        monthsHtml += this.renderMonthMini(m, today);
      }

      this.container.innerHTML = `
        <div class="year-view">
          <div class="year-header">
            <button class="year-nav-btn" data-nav="prev" aria-label="上一年">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div class="year-title">${this.year} 年</div>
            <button class="year-nav-btn" data-nav="next" aria-label="下一年">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <div class="year-summary">
            全年支出 <strong>¥${(yearTotal / 100).toFixed(2)}</strong>
          </div>

          <div class="year-grid">
            ${monthsHtml}
          </div>
        </div>
      `;

      this.bindEvents();
    }

    renderMonthMini(month, today) {
      const matrix = buildMonthMatrix(this.year, month);
      const isCurrentMonth = today.getFullYear() === this.year
                          && today.getMonth() + 1 === month;

      let cellsHtml = '';
      matrix.forEach(week => {
        week.forEach(cell => {
          if (!cell.isCurrentMonth) {
            cellsHtml += '<div class="year-day year-day-empty"></div>';
          } else {
            const spent = this.dayData[cell.dateStr] ?? 0;
            const color = this.getColorLevel(spent);
            const todayMark = cell.isToday ? 'is-today' : '';
            cellsHtml += `<div class="year-day ${todayMark}" data-color="${color}"></div>`;
          }
        });
      });

      return `
        <div class="year-month ${isCurrentMonth ? 'is-current' : ''}" data-month="${month}">
          <div class="year-month-name">${month} 月</div>
          <div class="year-month-grid">${cellsHtml}</div>
        </div>
      `;
    }

    bindEvents() {
      this.container.querySelectorAll('[data-nav]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.dataset.nav === 'prev') this.loadYear(this.year - 1);
          else this.loadYear(this.year + 1);
        });
      });

      this.container.querySelectorAll('[data-month]').forEach(monthEl => {
        monthEl.addEventListener('click', () => {
          window.UIUtils.vibrate(8);
          const month = parseInt(monthEl.dataset.month, 10);
          if (this.onMonthClick) this.onMonthClick(this.year, month);
        });
      });
    }
  }

  window.YearView = YearView;
})();
