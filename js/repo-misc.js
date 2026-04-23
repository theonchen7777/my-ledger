/**
 * 预算 / 汇率 / 元数据 CRUD（合并到一个文件，三者都比较小）
 */

(function () {
  'use strict';

  const { STORES, BUDGET_SCOPE, BUDGET_TARGET, DEFAULT_CURRENCY } = window.DB_SCHEMA;
  const { reqToPromise } = window.DB;

  // ===========================================================
  // 预算 Repo
  // ===========================================================
  /**
   * 字段：
   *   id          自增
   *   scope       daily / weekly / monthly
   *   targetType  daily（计入日预算的） / large（大额）
   *   amount      金额（分）
   *   currency    CNY
   *   startDate   生效开始日期 'YYYY-MM-DD'
   *   endDate     失效日期，null 表示一直生效
   *   note
   *   createdAt, updatedAt
   *
   * 设计说明：
   *   - 用 startDate / endDate 模式而非"按月单独存预算"，
   *     因为大多数人预算长期不变，无需每月新建。
   *   - 改预算时：endDate 旧记录 + 新建一条，保留历史
   */
  const Budgets = {
    async add(data) {
      const budget = {
        scope: data.scope ?? BUDGET_SCOPE.MONTHLY,
        targetType: data.targetType ?? BUDGET_TARGET.DAILY,
        amount: Math.round((data.amount ?? 0) * 100),
        currency: data.currency ?? DEFAULT_CURRENCY,
        startDate: data.startDate ?? new Date().toISOString().slice(0, 10),
        endDate: data.endDate ?? null,
        note: data.note ?? '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const { store, done } = window.DB.tx(STORES.BUDGETS, 'readwrite');
      const id = await reqToPromise(store.add(budget));
      await done;
      return id;
    },

    async getAll() {
      const { store } = window.DB.tx(STORES.BUDGETS, 'readonly');
      return await reqToPromise(store.getAll());
    },

    /**
     * 查询某日期适用的预算（startDate <= date <= endDate）
     * @param {string} dateStr 'YYYY-MM-DD'
     * @param {Object} filter { scope, targetType }
     */
    async getActiveAt(dateStr, filter = {}) {
      const all = await Budgets.getAll();
      return all.filter(b => {
        if (b.startDate > dateStr) return false;
        if (b.endDate && b.endDate < dateStr) return false;
        if (filter.scope && b.scope !== filter.scope) return false;
        if (filter.targetType && b.targetType !== filter.targetType) return false;
        return true;
      });
    },

    async update(id, patch) {
      const { store, done } = window.DB.tx(STORES.BUDGETS, 'readwrite');
      const existing = await reqToPromise(store.get(id));
      if (!existing) throw new Error(`预算 ${id} 不存在`);
      const updated = { ...existing, ...patch, id: existing.id, updatedAt: Date.now() };
      if (patch.amount != null) updated.amount = Math.round(patch.amount * 100);
      await reqToPromise(store.put(updated));
      await done;
      return updated;
    },

    async remove(id) {
      const { store, done } = window.DB.tx(STORES.BUDGETS, 'readwrite');
      await reqToPromise(store.delete(id));
      await done;
    }
  };

  // ===========================================================
  // 汇率 Repo（X+ 方案）
  // ===========================================================
  /**
   * 字段：
   *   id          复合主键 'USD_CNY_2026-04-21'
   *   base        基准币 'USD'
   *   target      目标币 'CNY'
   *   rate        1 base = ? target
   *   date        'YYYY-MM-DD'
   *   fetchedAt   抓取时间戳
   *   source      数据源 URL，便于排查问题
   */
  const ExchangeRates = {
    /**
     * 保存一条汇率
     */
    async save({ base, target, rate, date, source }) {
      const dateStr = date ?? new Date().toISOString().slice(0, 10);
      const record = {
        id: `${base}_${target}_${dateStr}`,
        base,
        target,
        rate,
        date: dateStr,
        fetchedAt: Date.now(),
        source: source ?? ''
      };
      const { store, done } = window.DB.tx(STORES.EXCHANGE_RATES, 'readwrite');
      await reqToPromise(store.put(record));  // put 会覆盖，避免重复
      await done;
      return record;
    },

    /**
     * 查指定日期的汇率
     */
    async get(base, target, date) {
      const dateStr = date ?? new Date().toISOString().slice(0, 10);
      const { store } = window.DB.tx(STORES.EXCHANGE_RATES, 'readonly');
      return await reqToPromise(store.get(`${base}_${target}_${dateStr}`));
    },

    /**
     * 取最近一次的汇率（不限定日期）
     * 用途：离线时拿最近一次缓存值
     */
    async getLatest(base, target) {
      const { store } = window.DB.tx(STORES.EXCHANGE_RATES, 'readonly');
      const all = await reqToPromise(store.getAll());
      const filtered = all.filter(r => r.base === base && r.target === target);
      if (filtered.length === 0) return null;
      // 按 fetchedAt 取最新
      filtered.sort((a, b) => b.fetchedAt - a.fetchedAt);
      return filtered[0];
    },

    async getAll() {
      const { store } = window.DB.tx(STORES.EXCHANGE_RATES, 'readonly');
      return await reqToPromise(store.getAll());
    },

    /**
     * 抓取最新汇率（在线）并存到本地
     * 数据源：frankfurter.app（欧洲央行，免费无限制）
     * 注意：Frankfurter 周末/节假日不更新
     */
    async fetchOnline(base = 'USD', target = 'CNY') {
      const url = `https://api.frankfurter.app/latest?from=${base}&to=${target}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`汇率 API 返回 ${resp.status}`);
      const data = await resp.json();
      const rate = data.rates?.[target];
      if (typeof rate !== 'number') throw new Error('汇率数据格式错误');

      return await ExchangeRates.save({
        base,
        target,
        rate,
        date: data.date,  // API 返回的实际数据日期
        source: url
      });
    },

    /**
     * 智能获取汇率：优先在线、失败则用本地最近的缓存
     * @returns {{ rate, fromCache, fetchedAt }}
     */
    async getSmartRate(base, target) {
      try {
        const online = await ExchangeRates.fetchOnline(base, target);
        return { rate: online.rate, fromCache: false, fetchedAt: online.fetchedAt };
      } catch (err) {
        console.warn('[ExchangeRates] 在线获取失败，使用本地缓存:', err.message);
        const cached = await ExchangeRates.getLatest(base, target);
        if (cached) {
          return { rate: cached.rate, fromCache: true, fetchedAt: cached.fetchedAt };
        }
        throw new Error(`无法获取 ${base}->${target} 汇率（无网络且无缓存）`);
      }
    }
  };

  // ===========================================================
  // 元数据 Repo（key-value 配置）
  // ===========================================================
  /**
   * 用途：存储应用配置
   *   defaultCurrency: 'CNY'
   *   appVersion: '1.0.0'
   *   lastDataResetAt: 时间戳
   *   ...
   */
  const Meta = {
    async get(key) {
      const { store } = window.DB.tx(STORES.META, 'readonly');
      const result = await reqToPromise(store.get(key));
      return result?.value;
    },

    async set(key, value) {
      const { store, done } = window.DB.tx(STORES.META, 'readwrite');
      await reqToPromise(store.put({ key, value, updatedAt: Date.now() }));
      await done;
    },

    async getAll() {
      const { store } = window.DB.tx(STORES.META, 'readonly');
      const all = await reqToPromise(store.getAll());
      return Object.fromEntries(all.map(item => [item.key, item.value]));
    },

    async remove(key) {
      const { store, done } = window.DB.tx(STORES.META, 'readwrite');
      await reqToPromise(store.delete(key));
      await done;
    }
  };

  // ============ 暴露 ============
  if (!window.Repo) window.Repo = {};
  window.Repo.Budgets = Budgets;
  window.Repo.ExchangeRates = ExchangeRates;
  window.Repo.Meta = Meta;
})();
