/**
 * 日历页主控
 *
 * 职责：
 *   - 创建并持有 CalendarView 和 YearView 实例
 *   - 协调月视图 ↔ 年视图切换
 *   - 监听日格点击 → 打开当日抽屉
 *   - 监听预算变更 → 刷新日历
 */
(function () {
  'use strict';

  let calendarView = null;
  let yearView = null;
  let pageEl = null;
  let monthContainer = null;
  let yearContainer = null;

  /**
   * 初始化（在 app 启动后调用一次）
   */
  async function init() {
    pageEl = document.querySelector('[data-page="calendar"]');
    if (!pageEl) return;

    // 重写日历页内容（替换原占位）
    pageEl.innerHTML = `
      <div class="page-calendar">
        <div class="cal-month-container" id="calMonthContainer"></div>
        <div class="cal-year-container" id="calYearContainer" style="display:none"></div>
        <button class="cal-fab" id="calFab" aria-label="添加账单">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
    `;

    monthContainer = pageEl.querySelector('#calMonthContainer');
    yearContainer = pageEl.querySelector('#calYearContainer');

    // 创建月视图
    calendarView = new window.CalendarView(monthContainer);
    calendarView.onDayClick = (dateStr) => {
      window.DayDetail.open(dateStr, () => {
        // 当抽屉里改了数据（如删除账单），刷新日历
        calendarView.reload();
      });
    };
    calendarView.onYearViewRequest = () => {
      showYearView();
    };

    // 创建年视图
    yearView = new window.YearView(yearContainer);
    yearView.onMonthClick = async (year, month) => {
      await calendarView.loadMonth(year, month);
      showMonthView();
    };

    // 加载当前月
    const now = new Date();
    await calendarView.loadMonth(now.getFullYear(), now.getMonth() + 1);

    // 防抖：短时间内多次触发只重渲一次（解决连续加账单时的卡顿）
    let reloadTimer = null;
    let pendingReload = false;
    function scheduleReload() {
      if (reloadTimer) {
        pendingReload = true;
        return;
      }
      reloadTimer = setTimeout(async () => {
        if (monthContainer.style.display !== 'none') {
          await calendarView.reload();
        } else {
          await yearView.loadYear(yearView.year);
        }
        reloadTimer = null;
        if (pendingReload) {
          pendingReload = false;
          scheduleReload();
        }
      }, 150);
    }

    window.addEventListener('budgetchange', scheduleReload);
    window.addEventListener('transactionchange', scheduleReload);

    // 模块四：FAB 悬浮按钮
    pageEl.querySelector('#calFab')?.addEventListener('click', () => {
      window.UIUtils.vibrate(8);
      window.TxForm.open();   // 默认日期=今天
    });
  }

  function showYearView() {
    yearContainer.style.display = 'block';
    monthContainer.style.display = 'none';
    yearView.loadYear(calendarView.year);
  }

  function showMonthView() {
    monthContainer.style.display = 'block';
    yearContainer.style.display = 'none';
  }

  window.PageCalendar = { init };
})();
