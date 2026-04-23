/**
 * 账单 CRUD —— 整个项目最核心的数据层
 *
 * 字段：
 *   id              自增主键
 *   type            expense / income / transfer
 *
 *   amount          原币种金额（分），如 $50 = 5000
 *   currency        原币种 USD / CNY
 *   amountCNY       折算成 CNY 的金额（分）—— X+ 方案的快照
 *   exchangeRate    折算时使用的汇率（1 原币 = ? CNY），手动覆盖时也存
 *   isManualRate    是否手动覆盖了 CNY 金额（true 表示用户改过）
 *
 *   accountId       账户 id
 *   categoryId      分类 id
 *
 *   date            ISO 日期字符串 'YYYY-MM-DD'（按天查询）
 *   dateTime        毫秒时间戳（精确排序）
 *
 *   note            备注
 *
 *   countInDailyBudget  是否计入"日预算"（你的核心设计）
 *                       true: 算到日历每日总额
 *                       false: 大额账单，只在月度大额预算里看
 *
 *   ── 转账专用（type === 'transfer' 时）──
 *   fromAccountId   转出账户
 *   toAccountId     转入账户
 *   （此时 accountId 字段不使用）
 *
 *   createdAt, updatedAt
 */

(function () {
  'use strict';

  const { STORES, TX_TYPE, DEFAULT_CURRENCY } = window.DB_SCHEMA;
  const { reqToPromise } = window.DB;

  // ============ 工具：日期处理 ============
  /**
   * 把任意 Date / 时间戳 / ISO 字符串规范化成 'YYYY-MM-DD'
   * 使用本地时区，不要用 toISOString()（那是 UTC 时间，会差时区）
   */
  function toDateStr(input) {
    const d = input instanceof Date ? input : new Date(input);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ============ 增 ============
  /**
   * 添加账单
   * @param {Object} data
   *   - type: 'expense' | 'income' | 'transfer'
   *   - amount: 数字（元，会自动 *100 存成分；如果传整数且 >= 100 会被识别为已经是分）
   *   - currency: 'CNY' | 'USD'
   *   - amountCNY: （可选）CNY 金额，不传则按汇率算
   *   - exchangeRate: （可选）汇率
   *   - accountId, categoryId
   *   - date: Date / 时间戳 / 'YYYY-MM-DD'
   *   - note, countInDailyBudget
   *   - fromAccountId, toAccountId（转账时）
   */
  async function add(data) {
    // 金额转换：传入元，存成分（用 Math.round 避免浮点误差）
    const amountCents = Math.round(data.amount * 100);
    const currency = data.currency ?? DEFAULT_CURRENCY;

    // CNY 金额：如果是 CNY 直接相等；如果是外币，按 exchangeRate 算
    let amountCNYCents;
    let exchangeRate = data.exchangeRate ?? 1;

    if (currency === 'CNY') {
      amountCNYCents = amountCents;
      exchangeRate = 1;
    } else {
      if (data.amountCNY != null) {
        // 手动覆盖
        amountCNYCents = Math.round(data.amountCNY * 100);
      } else {
        amountCNYCents = Math.round(amountCents * exchangeRate);
      }
    }

    const dateInput = data.date ?? new Date();
    const dateStr = toDateStr(dateInput);
    const dateTime = (dateInput instanceof Date ? dateInput : new Date(dateInput)).getTime();

    const tx = {
      type: data.type,
      amount: amountCents,
      currency,
      amountCNY: amountCNYCents,
      exchangeRate,
      isManualRate: !!data.isManualRate,

      accountId: data.accountId ?? null,
      categoryId: data.categoryId ?? null,

      date: dateStr,
      dateTime,

      note: data.note ?? '',

      countInDailyBudget: data.countInDailyBudget ?? true,

      // 转账字段
      fromAccountId: data.fromAccountId ?? null,
      toAccountId: data.toAccountId ?? null,

      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const { store, done } = window.DB.tx(STORES.TRANSACTIONS, 'readwrite');
    const id = await reqToPromise(store.add(tx));
    await done;
    return id;
  }

  // ============ 查询单个 ============
  async function getById(id) {
    const { store } = window.DB.tx(STORES.TRANSACTIONS, 'readonly');
    return await reqToPromise(store.get(id));
  }

  // ============ 按日期查询 ============
  /**
   * 查询某一天的所有账单
   * @param {string|Date} date
   * @returns {Promise<Array>}
   */
  async function getByDate(date) {
    const dateStr = toDateStr(date);
    const { store } = window.DB.tx(STORES.TRANSACTIONS, 'readonly');
    const idx = store.index('date');
    const result = await reqToPromise(idx.getAll(dateStr));
    // 同一天内按时间倒序（最新的在最上）
    return result.sort((a, b) => b.dateTime - a.dateTime);
  }

  /**
   * 查询日期范围内的账单
   * @param {string|Date} startDate
   * @param {string|Date} endDate
   * @returns {Promise<Array>}
   */
  async function getByDateRange(startDate, endDate) {
    const start = toDateStr(startDate);
    const end = toDateStr(endDate);
    const { store } = window.DB.tx(STORES.TRANSACTIONS, 'readonly');
    const idx = store.index('date');
    // IDBKeyRange.bound(下界, 上界)
    const range = IDBKeyRange.bound(start, end);
    const result = await reqToPromise(idx.getAll(range));
    return result.sort((a, b) => b.dateTime - a.dateTime);
  }

  /**
   * 查询某月所有账单
   * @param {number} year
   * @param {number} month - 1-12
   */
  async function getByMonth(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);  // 月末
    return getByDateRange(startDate, endDate);
  }

  // ============ 按账户查询 ============
  async function getByAccount(accountId) {
    const { store } = window.DB.tx(STORES.TRANSACTIONS, 'readonly');
    const idx = store.index('accountId');
    const result = await reqToPromise(idx.getAll(accountId));
    return result.sort((a, b) => b.dateTime - a.dateTime);
  }

  // ============ 按分类查询 ============
  async function getByCategory(categoryId) {
    const { store } = window.DB.tx(STORES.TRANSACTIONS, 'readonly');
    const idx = store.index('categoryId');
    const result = await reqToPromise(idx.getAll(categoryId));
    return result.sort((a, b) => b.dateTime - a.dateTime);
  }

  // ============ 全部 ============
  async function getAll() {
    const { store } = window.DB.tx(STORES.TRANSACTIONS, 'readonly');
    const result = await reqToPromise(store.getAll());
    return result.sort((a, b) => b.dateTime - a.dateTime);
  }

  // ============ 改 ============
  async function update(id, patch) {
    const { store, done } = window.DB.tx(STORES.TRANSACTIONS, 'readwrite');
    const existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error(`账单 ${id} 不存在`);

    // 如果改了金额或日期，需要重新计算衍生字段
    const updated = { ...existing, ...patch, id: existing.id };

    if (patch.amount != null) {
      updated.amount = Math.round(patch.amount * 100);
    }
    if (patch.amountCNY != null) {
      updated.amountCNY = Math.round(patch.amountCNY * 100);
    }
    if (patch.date != null) {
      updated.date = toDateStr(patch.date);
      updated.dateTime = (patch.date instanceof Date ? patch.date : new Date(patch.date)).getTime();
    }

    updated.updatedAt = Date.now();

    await reqToPromise(store.put(updated));
    await done;
    return updated;
  }

  // ============ 删 ============
  async function remove(id) {
    const { store, done } = window.DB.tx(STORES.TRANSACTIONS, 'readwrite');
    await reqToPromise(store.delete(id));
    await done;
  }

  // ============ 统计辅助 ============
  /**
   * 计算账单数组的汇总（用 amountCNY 字段）
   * @param {Array} transactions
   * @param {Object} options
   *   - onlyDailyBudget: 仅统计 countInDailyBudget=true 的
   * @returns {{ expense, income, balance, count }}
   *   金额单位是分
   */
  function summarize(transactions, options = {}) {
    let expense = 0, income = 0, count = 0;

    transactions.forEach(t => {
      if (options.onlyDailyBudget && !t.countInDailyBudget) return;

      if (t.type === TX_TYPE.EXPENSE) {
        expense += t.amountCNY;
        count++;
      } else if (t.type === TX_TYPE.INCOME) {
        income += t.amountCNY;
        count++;
      }
      // 转账不计入收支
    });

    return {
      expense,
      income,
      balance: income - expense,
      count
    };
  }

  // ============ 暴露 ============
  if (!window.Repo) window.Repo = {};
  window.Repo.Transactions = {
    add,
    getById,
    getByDate,
    getByDateRange,
    getByMonth,
    getByAccount,
    getByCategory,
    getAll,
    update,
    remove,
    summarize,
    // 工具暴露
    toDateStr
  };
})();
