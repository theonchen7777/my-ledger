/**
 * 通用 UI 工具函数
 * 后续所有 UI 模块都会用到，避免重复实现
 */
(function () {
  'use strict';

  // ============ 金额格式化 ============
  /**
   * 分 → 元字符串（带千分位）
   * @param {number} cents - 分
   * @param {Object} options
   *   - withSign: 加正负号
   *   - withCurrency: 加币种符号
   *   - currency: 'CNY' | 'USD'
   *   - hideZero: 0 时返回空字符串
   */
  function formatMoney(cents, options = {}) {
    if (cents == null || isNaN(cents)) return '';
    if (options.hideZero && cents === 0) return '';

    const yuan = cents / 100;
    const abs = Math.abs(yuan);

    // 千分位 + 两位小数
    const formatted = abs.toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    let sign = '';
    if (options.withSign) sign = yuan >= 0 ? '+' : '-';
    else if (yuan < 0) sign = '-';

    let symbol = '';
    if (options.withCurrency) {
      symbol = options.currency === 'USD' ? '$' : '¥';
    }

    return `${sign}${symbol}${formatted}`;
  }

  /**
   * 紧凑金额（日历格子用，超过 1 万用 "1.2k"）
   */
  function formatMoneyCompact(cents) {
    if (cents == null || cents === 0) return '';
    const yuan = Math.round(cents / 100);
    if (yuan < 1000) return String(yuan);
    if (yuan < 10000) return (yuan / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return (yuan / 10000).toFixed(1).replace(/\.0$/, '') + 'w';
  }

  // ============ 日期工具 ============
  /**
   * Date → 'YYYY-MM-DD'（本地时区）
   */
  function toDateStr(date) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * 'YYYY-MM-DD' → Date
   */
  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /**
   * 格式化日期显示，如 "4月21日 周二"
   */
  function formatDateLabel(date) {
    const d = date instanceof Date ? date : parseDate(date);
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
  }

  /**
   * 格式化时间显示，如 "14:32"
   */
  function formatTime(timestamp) {
    const d = new Date(timestamp);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * 判断两个日期是否同一天
   */
  function isSameDay(a, b) {
    return toDateStr(a) === toDateStr(b);
  }

  /**
   * 获取日期所在的"周"标识（YYYY-Www，按周一起算 ISO 8601）
   * 例：2026-04-21 → '2026-W17'
   */
  function getWeekKey(date) {
    const d = date instanceof Date ? new Date(date) : parseDate(date);
    // 调到当周周四（ISO 周以周四所在年份为准）
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  /**
   * 给定 year 和 month(1-12)，返回该月的 6 行 × 7 列的日期矩阵
   * 包含上月末尾和下月开头，填满 42 格
   * 周一为首日
   */
  function buildMonthMatrix(year, month) {
    // 本月 1 号
    const firstDay = new Date(year, month - 1, 1);
    // 周一=0, 周日=6（移位让周一为首）
    const firstWeekday = (firstDay.getDay() + 6) % 7;

    // 起始日期 = 本月 1 号 - firstWeekday 天
    const startDate = new Date(year, month - 1, 1 - firstWeekday);

    const matrix = [];
    for (let row = 0; row < 6; row++) {
      const week = [];
      for (let col = 0; col < 7; col++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + row * 7 + col);
        week.push({
          date: cellDate,
          dateStr: toDateStr(cellDate),
          day: cellDate.getDate(),
          isCurrentMonth: cellDate.getMonth() === month - 1,
          isToday: isSameDay(cellDate, new Date()),
          weekKey: getWeekKey(cellDate)
        });
      }
      matrix.push(week);
    }
    return matrix;
  }

  // ============ 触觉反馈（iOS Safari 不支持，但 Android Chrome 支持） ============
  function vibrate(pattern = 10) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

  // ============ HTML 转义（防 XSS，备注里可能有特殊字符） ============
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ============ 暴露 ============
  window.UIUtils = {
    formatMoney,
    formatMoneyCompact,
    toDateStr,
    parseDate,
    formatDateLabel,
    formatTime,
    isSameDay,
    getWeekKey,
    buildMonthMatrix,
    vibrate,
    escapeHtml
  };
})();
