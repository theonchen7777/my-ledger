/**
 * 预算管理（模块七）
 *
 * 替换 ui-budget-panel 的临时面板。
 *
 * 三种预算：
 *   - 日预算（计入日预算的支出）
 *   - 周预算
 *   - 月预算（按你的设计：大额预算 + 总预算两种）
 *
 * 数据存储仍用 Repo.Meta（简化），未来可迁移到 budgets 表
 *   - tempDailyBudget
 *   - tempWeeklyBudget
 *   - tempMonthlyTotalBudget
 *   - tempMonthlyLargeBudget
 */
(function () {
  'use strict';

  const { formatMoney } = window.UIUtils;

  const KEYS = {
    daily: 'tempDailyBudget',
    weekly: 'tempWeeklyBudget',
    monthlyTotal: 'tempMonthlyTotalBudget',
    monthlyLarge: 'tempMonthlyLargeBudget'
  };

  async function getAllBudgets() {
    const [daily, weekly, monthlyTotal, monthlyLarge] = await Promise.all([
      window.Repo.Meta.get(KEYS.daily),
      window.Repo.Meta.get(KEYS.weekly),
      window.Repo.Meta.get(KEYS.monthlyTotal),
      window.Repo.Meta.get(KEYS.monthlyLarge)
    ]);
    return { daily, weekly, monthlyTotal, monthlyLarge };
  }

  async function open() {
    const budgets = await getAllBudgets();
    const usage = await calcUsage();

    const html = `
      <div class="budget-page">
        <p class="budget-page-hint">
          设置预算后日历格子按消费进度变色：绿（&lt;80%）/橙（接近）/红（超支）。留空则不限制。
        </p>

        <div class="budget-section">
          <div class="budget-section-title">日常消费预算</div>
          ${renderBudgetItem('日预算', '今日已用', budgets.daily, usage.todayDaily, '元/天', 'daily')}
          ${renderBudgetItem('周预算', '本周已用', budgets.weekly, usage.weekDaily, '元/周', 'weekly')}
        </div>

        <div class="budget-section">
          <div class="budget-section-title">本月总览</div>
          ${renderBudgetItem('月总预算', '本月总支出', budgets.monthlyTotal, usage.monthTotal, '元/月', 'monthlyTotal')}
          ${renderBudgetItem('大额预算', '本月大额支出', budgets.monthlyLarge, usage.monthLarge, '元/月', 'monthlyLarge')}
        </div>

        <p class="budget-page-foot">
          "日常 vs 大额"由你在记账时通过开关决定。<br>
          关闭"计入日预算"开关的账单会算到大额预算里。
        </p>
      </div>
    `;

    const sheet = window.UISheet.open({
      title: '预算管理',
      content: html,
      height: 'full'
    });

    sheet.element.querySelectorAll('[data-budget-key]').forEach(el => {
      el.addEventListener('click', () => {
        editSingleBudget(el.dataset.budgetKey, el.dataset.budgetLabel, async () => {
          // 刷新本页
          sheet.close();
          open();
        });
      });
    });
  }

  function renderBudgetItem(label, usageLabel, budget, used, unit, key) {
    const usedYuan = used / 100;

    let progressBar = '';
    let badge = '';
    if (budget != null && budget > 0) {
      const ratio = usedYuan / budget;
      const pct = Math.min(ratio * 100, 100);
      let cls = 'normal';
      if (ratio > 1) cls = 'over';
      else if (ratio >= 0.8) cls = 'warning';
      progressBar = `
        <div class="budget-progress">
          <div class="budget-progress-fill budget-progress-${cls}" style="width:${pct}%"></div>
        </div>
        <div class="budget-progress-text budget-progress-${cls}">
          已用 ¥${usedYuan.toFixed(2)} / ¥${budget} (${(ratio * 100).toFixed(0)}%)
        </div>
      `;
    } else {
      progressBar = `
        <div class="budget-progress-text budget-progress-empty">
          已用 ¥${usedYuan.toFixed(2)} · 未设置预算
        </div>
      `;
    }

    return `
      <div class="budget-item is-clickable" data-budget-key="${key}" data-budget-label="${label}">
        <div class="budget-item-head">
          <div class="budget-item-label">${label}</div>
          <div class="budget-item-amount">${budget != null ? '¥' + budget : '未设置'}</div>
        </div>
        ${progressBar}
      </div>
    `;
  }

  // ============ 单项编辑 ============
  function editSingleBudget(key, label, onSaved) {
    window.Repo.Meta.get(KEYS[key]).then(currentValue => {
      const html = `
        <div style="display:flex;flex-direction:column;gap:16px;padding:8px 0">
          <div class="form-group">
            <label class="form-label">${label}（元）</label>
            <input type="number" class="form-input budget-edit-input" id="budgetVal"
                   inputmode="decimal" min="0" step="10"
                   placeholder="留空表示不限制"
                   value="${currentValue ?? ''}">
          </div>
        </div>
      `;
      const footer = `
        <button class="sheet-btn-cancel" data-action="clear">清除</button>
        <button class="sheet-btn-cancel" data-action="cancel">取消</button>
        <button class="sheet-btn-primary" data-action="save">保存</button>
      `;
      const sheet = window.UISheet.open({
        title: '设置 ' + label,
        content: html,
        footer,
        height: 'auto'
      });

      setTimeout(() => sheet.element.querySelector('#budgetVal')?.focus(), 350);

      sheet.element.querySelector('[data-action="cancel"]').addEventListener('click', () => sheet.close());

      sheet.element.querySelector('[data-action="clear"]').addEventListener('click', async () => {
        await window.Repo.Meta.remove(KEYS[key]);
        window.dispatchEvent(new CustomEvent('budgetchange'));
        sheet.close();
        if (onSaved) onSaved();
      });

      sheet.element.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const v = sheet.element.querySelector('#budgetVal').value.trim();
        if (v === '') {
          await window.Repo.Meta.remove(KEYS[key]);
        } else {
          const num = Number(v);
          if (isNaN(num) || num < 0) {
            alert('请输入有效金额');
            return;
          }
          await window.Repo.Meta.set(KEYS[key], num);
        }
        window.dispatchEvent(new CustomEvent('budgetchange'));
        sheet.close();
        if (onSaved) onSaved();
      });
    });
  }

  // ============ 计算当前使用情况 ============
  async function calcUsage() {
    const now = new Date();
    const todayStr = window.UIUtils.toDateStr(now);

    // 今日（仅日预算）
    const todayList = await window.Repo.Transactions.getByDate(now);
    const todayDaily = window.Repo.Transactions.summarize(todayList, { onlyDailyBudget: true }).expense;

    // 本周（周一开始）
    const weekStart = new Date(now);
    const dow = (weekStart.getDay() + 6) % 7;  // 周一=0
    weekStart.setDate(weekStart.getDate() - dow);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekList = await window.Repo.Transactions.getByDateRange(weekStart, weekEnd);
    const weekDaily = window.Repo.Transactions.summarize(weekList, { onlyDailyBudget: true }).expense;

    // 本月
    const monthList = await window.Repo.Transactions.getByMonth(now.getFullYear(), now.getMonth() + 1);
    const monthSummary = window.Repo.Transactions.summarize(monthList);
    const monthDailyOnly = window.Repo.Transactions.summarize(monthList, { onlyDailyBudget: true });
    const monthLarge = monthSummary.expense - monthDailyOnly.expense;

    return {
      todayDaily,
      weekDaily,
      monthTotal: monthSummary.expense,
      monthLarge
    };
  }

  // ============ 兼容旧接口（让 calendar-view 继续工作） ============
  // calendar-view.js 通过 window.BudgetPanel.getBudgets() 取日/周预算
  if (window.BudgetPanel) {
    const oldGet = window.BudgetPanel.getBudgets;
    window.BudgetPanel.getBudgets = async function() {
      // 兼容老的两键
      const daily = await window.Repo.Meta.get(KEYS.daily);
      const weekly = await window.Repo.Meta.get(KEYS.weekly);
      return { daily: daily ?? null, weekly: weekly ?? null };
    };
    // 用新版面板替换原 open
    window.BudgetPanel.open = open;
  }

  window.PageBudgets = { open };
})();
