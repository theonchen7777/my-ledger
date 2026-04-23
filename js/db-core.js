/**
 * 数据库连接和初始化
 *
 * 职责：
 *  - 打开 IndexedDB
 *  - 在 onupgradeneeded 时创建表和索引
 *  - 提供事务工具函数
 *
 * 使用：
 *  await DB.init();
 *  const tx = DB.tx('transactions', 'readwrite');
 */

(function () {
  'use strict';

  const { DB_NAME, DB_VERSION, STORES } = window.DB_SCHEMA;

  let dbInstance = null;

  // ============ 工具：把 IDBRequest 转成 Promise ============
  // IndexedDB 全是回调，包装一下后续模块就能用 await 了
  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function txToPromise(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  // ============ 表结构定义（onupgradeneeded 时建表） ============
  function createSchema(db, oldVersion) {
    console.log(`[DB] 升级数据库 from v${oldVersion} to v${DB_VERSION}`);

    // ----- v1：初始建表 -----
    if (oldVersion < 1) {
      // accounts 表
      // 主键 id 自增
      const accountStore = db.createObjectStore(STORES.ACCOUNTS, {
        keyPath: 'id',
        autoIncrement: true
      });
      // 索引：parentId 用来查子账户，archived 用来过滤归档
      accountStore.createIndex('parentId', 'parentId', { unique: false });
      accountStore.createIndex('archived', 'archived', { unique: false });
      accountStore.createIndex('sortOrder', 'sortOrder', { unique: false });

      // categories 表
      const categoryStore = db.createObjectStore(STORES.CATEGORIES, {
        keyPath: 'id',
        autoIncrement: true
      });
      // 按 kind 查分类（支出分类 / 收入分类分开列）
      categoryStore.createIndex('kind', 'kind', { unique: false });
      categoryStore.createIndex('archived', 'archived', { unique: false });
      categoryStore.createIndex('sortOrder', 'sortOrder', { unique: false });

      // transactions 表 ⭐核心
      const txStore = db.createObjectStore(STORES.TRANSACTIONS, {
        keyPath: 'id',
        autoIncrement: true
      });
      // 按日期查询（日历视图、月度报表）
      txStore.createIndex('date', 'date', { unique: false });
      // 按时间戳排序（同一天内的账单按录入时间倒序）
      txStore.createIndex('dateTime', 'dateTime', { unique: false });
      // 按账户查询
      txStore.createIndex('accountId', 'accountId', { unique: false });
      // 按分类查询（统计饼图用）
      txStore.createIndex('categoryId', 'categoryId', { unique: false });
      // 按类型筛选（只看支出/只看收入）
      txStore.createIndex('type', 'type', { unique: false });
      // 复合索引：[type, date] 用于"某月所有支出"这种查询
      txStore.createIndex('type_date', ['type', 'date'], { unique: false });

      // budgets 表
      const budgetStore = db.createObjectStore(STORES.BUDGETS, {
        keyPath: 'id',
        autoIncrement: true
      });
      budgetStore.createIndex('scope', 'scope', { unique: false });
      budgetStore.createIndex('targetType', 'targetType', { unique: false });

      // exchangeRates 表
      // 主键用复合 key：base_target_date（如 'USD_CNY_2026-04-21'）
      const rateStore = db.createObjectStore(STORES.EXCHANGE_RATES, {
        keyPath: 'id'
      });
      rateStore.createIndex('fetchedAt', 'fetchedAt', { unique: false });

      // meta 表（key-value 配置）
      db.createObjectStore(STORES.META, { keyPath: 'key' });
    }

    // 后续版本升级写在这里：
    // if (oldVersion < 2) { ... }
  }

  // ============ 初始化 ============
  function init() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        createSchema(req.result, e.oldVersion);
      };

      req.onsuccess = () => {
        dbInstance = req.result;

        // 监听版本变化（其他标签页升级了数据库）
        dbInstance.onversionchange = () => {
          dbInstance.close();
          dbInstance = null;
          console.warn('[DB] 数据库版本变化，连接已关闭');
        };

        console.log('[DB] 初始化成功 v' + DB_VERSION);
        resolve(dbInstance);
      };

      req.onerror = () => {
        console.error('[DB] 打开失败：', req.error);
        reject(req.error);
      };

      req.onblocked = () => {
        console.warn('[DB] 打开被阻塞（其他标签页占用旧版本）');
      };
    });
  }

  // ============ 事务封装 ============
  /**
   * 创建事务
   * @param {string|string[]} storeNames - 表名（支持多表事务）
   * @param {string} mode - 'readonly' | 'readwrite'
   * @returns {{ tx, store, stores, done }}
   */
  function tx(storeNames, mode = 'readonly') {
    if (!dbInstance) {
      throw new Error('DB 未初始化，请先调用 DB.init()');
    }
    const transaction = dbInstance.transaction(storeNames, mode);
    const isMulti = Array.isArray(storeNames);

    return {
      tx: transaction,
      // 单表时直接给 store
      store: isMulti ? null : transaction.objectStore(storeNames),
      // 多表时给一个对象
      stores: isMulti
        ? Object.fromEntries(storeNames.map(n => [n, transaction.objectStore(n)]))
        : null,
      // 等待事务完成的 Promise
      done: txToPromise(transaction)
    };
  }

  // ============ 暴露 ============
  window.DB = {
    init,
    tx,
    reqToPromise,
    txToPromise,
    // 调试用：直接拿原始连接
    getInstance: () => dbInstance,
    // 调试用：删掉整个数据库（重置）
    deleteDatabase: () => {
      if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
      }
      return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => {
          console.log('[DB] 数据库已删除');
          resolve();
        };
        req.onerror = () => reject(req.error);
      });
    }
  };
})();
