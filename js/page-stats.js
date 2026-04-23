/**
 * 统计报表页（模块六）
 *
 * 不引入图表库，纯 SVG 手写。优点：体积小、风格可控、无依赖。
 *
 * 三个图表：
 *   1. 分类饼图（按分类聚合本月/本年支出）
 *   2. 趋势柱图（月视图：每日支出；年视图：每月支出）
 *   3. TOP 分类排行
 */
(function () {
  'use strict';

  const { formatMoney, escapeHtml } = window.UIUtils;

  let pageEl = null;
  let viewMode = 'month';   // 'month' | 'year'
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth() + 1;

  async function init() {
    pageEl = document.querySelector('[data-page="stats"]');
    if (!pageEl) return;

    pageEl.innerHTML = `<div class="stats-page" id="statsPage"></div>`;

    await render();

    let needsReload = false;
    window.addEventListener('transactionchange', () => {
      if (pageEl.classList.contains('active')) {
        render();
      } else {
        needsReload = true;
      }
    });
    window.addEventListener('tabchange', (e) => {
      if (e.detail.tab === 'stats' && needsReload) {
        needsReload = false;
        render();
      }
    });
  }

  async function render() {
    if (!pageEl) return;

    const container = pageEl.querySelector('#statsPage') || pageEl;

    // 加载数据
    let transactions, periodLabel;
    if (viewMode === 'month') {
      transactions = await window.Repo.Transactions.getByMonth(currentYear, currentMonth);
      periodLabel = `${currentYear} 年 ${currentMonth} 月`;
    } else {
      const startDate = new Date(currentYear, 0, 1);
      const endDate = new Date(currentYear, 11, 31);
      transactions = await window.Repo.Transactions.getByDateRange(startDate, endDate);
      periodLabel = `${currentYear} 年`;
    }

    const expenses = transactions.filter(t => t.type === 'expense');
    const incomes = transactions.filter(t => t.type === 'income');
    const totalExpense = expenses.reduce((s, t) => s + t.amountCNY, 0);
    const totalIncome = incomes.reduce((s, t) => s + t.amountCNY, 0);

    // 分类聚合
    const categories = await window.Repo.Categories.getAll(true);
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const byCategory = aggregateByCategory(expenses, catMap);

    // 时间序列聚合
    const series = viewMode === 'month'
      ? aggregateByDayInMonth(expenses, currentYear, currentMonth)
      : aggregateByMonth(expenses, currentYear);

    container.innerHTML = `
      <div class="stats-toolbar">
        <div class="stats-mode-segment">
          <button class="stats-mode-btn ${viewMode === 'month' ? 'active' : ''}" data-mode="month">月</button>
          <button class="stats-mode-btn ${viewMode === 'year' ? 'active' : ''}" data-mode="year">年</button>
        </div>
        <div class="stats-period">
          <button class="stats-period-nav" data-nav="prev">‹</button>
          <span class="stats-period-label">${periodLabel}</span>
          <button class="stats-period-nav" data-nav="next">›</button>
        </div>
      </div>

      <div class="stats-summary-card">
        <div class="stats-summary-grid">
          <div class="stats-summary-item">
            <div class="stats-summary-label">支出</div>
            <div class="stats-summary-value cal-expense">${formatMoney(totalExpense, { withCurrency: true })}</div>
          </div>
          <div class="stats-summary-item">
            <div class="stats-summary-label">收入</div>
            <div class="stats-summary-value cal-income">${formatMoney(totalIncome, { withCurrency: true })}</div>
          </div>
          <div class="stats-summary-item">
            <div class="stats-summary-label">结余</div>
            <div class="stats-summary-value">${formatMoney(totalIncome - totalExpense, { withCurrency: true })}</div>
          </div>
        </div>
      </div>

      ${expenses.length === 0 ? `
        <div class="stats-empty">
          <div class="stats-empty-icon">📊</div>
          <div class="stats-empty-text">本期暂无支出数据</div>
        </div>
      ` : `
        <div class="stats-card">
          <div class="stats-card-title">支出分布</div>
          ${renderPieChart(byCategory)}
        </div>

        <div class="stats-card">
          <div class="stats-card-title">${viewMode === 'month' ? '每日支出趋势' : '每月支出趋势'}</div>
          ${renderBarChart(series, viewMode)}
        </div>

        <div class="stats-card">
          <div class="stats-card-title">分类排行</div>
          ${renderRanking(byCategory, totalExpense)}
        </div>
      `}
    `;

    bindEvents(container);
  }

  // ============ 数据聚合 ============
  function aggregateByCategory(expenses, catMap) {
    const map = {};
    expenses.forEach(t => {
      const key = t.categoryId || 'uncategorized';
      if (!map[key]) {
        const cat = catMap[t.categoryId];
        map[key] = {
          id: t.categoryId,
          name: cat?.name || '未分类',
          icon: cat?.icon || '📝',
          color: cat?.color || '#8e8775',
          amount: 0,
          count: 0
        };
      }
      map[key].amount += t.amountCNY;
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }

  function aggregateByDayInMonth(expenses, year, month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const series = [];
    for (let d = 1; d <= daysInMonth; d++) {
      series.push({ label: String(d), amount: 0 });
    }
    expenses.forEach(t => {
      const d = parseInt(t.date.split('-')[2], 10);
      if (d >= 1 && d <= daysInMonth) {
        series[d - 1].amount += t.amountCNY;
      }
    });
    return series;
  }

  function aggregateByMonth(expenses, year) {
    const series = [];
    for (let m = 1; m <= 12; m++) {
      series.push({ label: String(m) + '月', amount: 0 });
    }
    expenses.forEach(t => {
      const m = parseInt(t.date.split('-')[1], 10);
      if (m >= 1 && m <= 12) {
        series[m - 1].amount += t.amountCNY;
      }
    });
    return series;
  }

  // ============ 饼图 ============
  function renderPieChart(byCategory) {
    if (byCategory.length === 0) return '';

    const total = byCategory.reduce((s, c) => s + c.amount, 0);
    const size = 200;
    const cx = size / 2, cy = size / 2;
    const radius = 80;
    const innerRadius = 50;   // 环形

    let cumAngle = -Math.PI / 2;   // 从顶部开始
    const slices = byCategory.map(c => {
      const angle = (c.amount / total) * Math.PI * 2;
      const startAngle = cumAngle;
      const endAngle = cumAngle + angle;
      cumAngle = endAngle;
      return { ...c, startAngle, endAngle, percent: c.amount / total };
    });

    function arcPath(start, end, r, ir) {
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const x3 = cx + ir * Math.cos(end);
      const y3 = cy + ir * Math.sin(end);
      const x4 = cx + ir * Math.cos(start);
      const y4 = cy + ir * Math.sin(start);
      const largeArc = (end - start) > Math.PI ? 1 : 0;
      return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${ir} ${ir} 0 ${largeArc} 0 ${x4} ${y4} Z`;
    }

    const slicesHtml = slices.map(s => `
      <path d="${arcPath(s.startAngle, s.endAngle, radius, innerRadius)}"
            fill="${s.color}"
            stroke="var(--color-bg-elevated)"
            stroke-width="2"/>
    `).join('');

    // 中心总额
    const centerHtml = `
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="11" fill="var(--color-label-secondary)">总支出</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="14" font-weight="600" fill="var(--color-label)">${formatMoney(total, { withCurrency: true })}</text>
    `;

    // 图例（显示 TOP 5）
    const legend = slices.slice(0, 5).map(s => `
      <div class="pie-legend-item">
        <span class="pie-legend-dot" style="background:${s.color}"></span>
        <span class="pie-legend-name">${s.icon} ${escapeHtml(s.name)}</span>
        <span class="pie-legend-pct">${(s.percent * 100).toFixed(1)}%</span>
      </div>
    `).join('');
    const moreCount = slices.length - 5;
    const moreLine = moreCount > 0 ? `<div class="pie-legend-more">还有 ${moreCount} 个分类</div>` : '';

    return `
      <div class="pie-chart-wrap">
        <svg class="pie-chart" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
          ${slicesHtml}
          ${centerHtml}
        </svg>
        <div class="pie-legend">
          ${legend}
          ${moreLine}
        </div>
      </div>
    `;
  }

  // ============ 柱图 ============
  function renderBarChart(series, mode) {
    const max = Math.max(...series.map(s => s.amount), 1);
    const W = 320;
    const H = 140;
    const padding = { top: 10, right: 10, bottom: 24, left: 10 };
    const innerW = W - padding.left - padding.right;
    const innerH = H - padding.top - padding.bottom;

    const barWidth = innerW / series.length;
    const barGap = mode === 'month' ? 1 : 4;

    const bars = series.map((s, i) => {
      const h = (s.amount / max) * innerH;
      const x = padding.left + i * barWidth;
      const y = padding.top + innerH - h;
      const w = Math.max(barWidth - barGap, 2);
      return { x, y, w, h, ...s };
    });

    const barsHtml = bars.map(b => `
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"
            fill="${b.amount > 0 ? 'var(--color-tint)' : 'transparent'}"
            rx="2"/>
    `).join('');

    // X 轴标签：月视图 5/10/15/20/25/30，年视图全部显示
    const labels = mode === 'month'
      ? series.map((s, i) => ((i + 1) % 5 === 0 || i === 0) ? s.label : '')
      : series.map(s => s.label);

    const labelsHtml = labels.map((l, i) => l ? `
      <text x="${padding.left + i * barWidth + barWidth/2}" y="${H - 6}"
            text-anchor="middle" font-size="10" fill="var(--color-label-tertiary)">${l}</text>
    ` : '').join('');

    return `
      <svg class="bar-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${barsHtml}
        ${labelsHtml}
      </svg>
      <div class="bar-chart-info">
        峰值 ${formatMoney(max, { withCurrency: true })}
      </div>
    `;
  }

  // ============ 排行 ============
  function renderRanking(byCategory, total) {
    if (byCategory.length === 0) return '';
    const top = byCategory.slice(0, 8);

    return `
      <div class="ranking-list">
        ${top.map((c, i) => {
          const pct = total > 0 ? (c.amount / total * 100) : 0;
          return `
            <div class="ranking-item">
              <div class="ranking-rank">${i + 1}</div>
              <div class="ranking-icon" style="background:${c.color}22;color:${c.color}">${c.icon}</div>
              <div class="ranking-main">
                <div class="ranking-name">${escapeHtml(c.name)}</div>
                <div class="ranking-bar"><div class="ranking-bar-fill" style="width:${pct}%;background:${c.color}"></div></div>
              </div>
              <div class="ranking-meta">
                <div class="ranking-amount">${formatMoney(c.amount, { withCurrency: true })}</div>
                <div class="ranking-pct">${pct.toFixed(1)}% · ${c.count}笔</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ============ 事件 ============
  function bindEvents(container) {
    container.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        viewMode = btn.dataset.mode;
        render();
      });
    });

    container.querySelector('[data-nav="prev"]')?.addEventListener('click', () => {
      if (viewMode === 'month') {
        currentMonth--;
        if (currentMonth < 1) { currentMonth = 12; currentYear--; }
      } else {
        currentYear--;
      }
      render();
    });

    container.querySelector('[data-nav="next"]')?.addEventListener('click', () => {
      if (viewMode === 'month') {
        currentMonth++;
        if (currentMonth > 12) { currentMonth = 1; currentYear++; }
      } else {
        currentYear++;
      }
      render();
    });
  }

  window.PageStats = { init };
})();
