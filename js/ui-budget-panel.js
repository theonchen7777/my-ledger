/**
 * 临时预算设置面板
 *
 * 入口：日历页头部齿轮按钮
 * 存储：Repo.Meta 的 tempDailyBudget / tempWeeklyBudget
 * 模块七做完整预算管理时，会替换或迁移这个面板
 */
(function () {
  'use strict';

  const KEY_DAILY = 'tempDailyBudget';
  const KEY_WEEKLY = 'tempWeeklyBudget';

  /**
   * 读取当前预算（元）
   * @returns {{ daily: number|null, weekly: number|null }}
   */
  async function getBudgets() {
    const daily = await window.Repo.Meta.get(KEY_DAILY);
    const weekly = await window.Repo.Meta.get(KEY_WEEKLY);
    return {
      daily: daily ?? null,
      weekly: weekly ?? null
    };
  }

  /**
   * 保存预算
   */
  async function setBudgets({ daily, weekly }) {
    if (daily === null) await window.Repo.Meta.remove(KEY_DAILY);
    else if (daily != null) await window.Repo.Meta.set(KEY_DAILY, Number(daily));

    if (weekly === null) await window.Repo.Meta.remove(KEY_WEEKLY);
    else if (weekly != null) await window.Repo.Meta.set(KEY_WEEKLY, Number(weekly));

    // 通知日历刷新
    window.dispatchEvent(new CustomEvent('budgetchange'));
  }

  /**
   * 打开设置面板
   */
  async function open() {
    const current = await getBudgets();

    const html = `
      <div class="budget-panel">
        <p class="budget-panel-hint">
          设置预算后，日历格子会根据消费情况显示颜色：
          <br>· 绿色 = 正常（&lt; 80%）
          <br>· 橙色 = 接近超支（80%–100%）
          <br>· 红色 = 已超支（&gt; 100%）
          <br>留空则不染色
        </p>

        <div class="budget-field">
          <label class="budget-label">
            <span>每日预算</span>
            <span class="budget-unit">元</span>
          </label>
          <input
            type="number"
            inputmode="decimal"
            class="budget-input"
            id="dailyBudgetInput"
            placeholder="不限制"
            value="${current.daily ?? ''}"
            min="0"
            step="10">
        </div>

        <div class="budget-field">
          <label class="budget-label">
            <span>每周预算</span>
            <span class="budget-unit">元</span>
          </label>
          <input
            type="number"
            inputmode="decimal"
            class="budget-input"
            id="weeklyBudgetInput"
            placeholder="不限制"
            value="${current.weekly ?? ''}"
            min="0"
            step="50">
        </div>

        <p class="budget-panel-foot">
          完整的预算管理（按月、按分类、历史记录）将在后续版本提供。
        </p>
      </div>
    `;

    const footer = `
      <button class="sheet-btn-cancel" data-action="cancel">取消</button>
      <button class="sheet-btn-primary" data-action="save">保存</button>
    `;

    const sheet = window.UISheet.open({
      title: '预算设置',
      content: html,
      footer,
      height: 'auto'
    });

    sheet.element.querySelector('.sheet-footer').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      if (btn.dataset.action === 'cancel') {
        sheet.close();
      } else if (btn.dataset.action === 'save') {
        const dailyVal = sheet.element.querySelector('#dailyBudgetInput').value.trim();
        const weeklyVal = sheet.element.querySelector('#weeklyBudgetInput').value.trim();

        await setBudgets({
          daily: dailyVal === '' ? null : Number(dailyVal),
          weekly: weeklyVal === '' ? null : Number(weeklyVal)
        });

        sheet.close();
      }
    });

    // 自动聚焦第一个输入框（让键盘弹出）
    setTimeout(() => {
      sheet.element.querySelector('#dailyBudgetInput')?.focus();
    }, 350);
  }

  window.BudgetPanel = { open, getBudgets, setBudgets };
})();
