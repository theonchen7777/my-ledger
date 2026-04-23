/**
 * 数据库 Schema 定义
 *
 * 集中管理所有"魔法字符串"，避免写错字段名/枚举值
 * 后续模块直接 import 这里的常量
 */

// ============ 数据库元信息 ============
const DB_NAME = 'LedgerDB';
const DB_VERSION = 1;

// ============ 表名 ============
const STORES = {
  ACCOUNTS: 'accounts',
  CATEGORIES: 'categories',
  TRANSACTIONS: 'transactions',
  BUDGETS: 'budgets',
  EXCHANGE_RATES: 'exchangeRates',
  META: 'meta'   // 存配置：默认币种、版本号、最后汇率刷新时间等
};

// ============ 账单类型 ============
const TX_TYPE = {
  EXPENSE: 'expense',     // 支出
  INCOME: 'income',       // 收入
  TRANSFER: 'transfer'    // 转账（预留，模块二暂不实现 UI）
};

// ============ 分类适用类型 ============
const CATEGORY_KIND = {
  EXPENSE: 'expense',
  INCOME: 'income'
};

// ============ 账户类型 ============
// 决定了余额怎么算：资产 = 进 - 出，信用 = 出 - 进（欠款）
const ACCOUNT_TYPE = {
  ASSET: 'asset',         // 资产账户：现金、余额宝、银行卡借记
  CREDIT: 'credit',       // 信用账户：信用卡、花呗、白条
  VIRTUAL: 'virtual'      // 虚拟账户：仅作分组用（如"支付宝"父节点）
};

// ============ 货币 ============
const CURRENCY = {
  CNY: 'CNY',
  USD: 'USD'
};

// 默认币种（可在设置中改）
const DEFAULT_CURRENCY = CURRENCY.CNY;

// ============ 预算 ============
const BUDGET_SCOPE = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly'
};

const BUDGET_TARGET = {
  DAILY: 'daily',         // 计入日预算的账单（默认）
  LARGE: 'large'          // 大额账单
};

// 暴露到全局命名空间，方便其他模块使用
window.DB_SCHEMA = {
  DB_NAME,
  DB_VERSION,
  STORES,
  TX_TYPE,
  CATEGORY_KIND,
  ACCOUNT_TYPE,
  CURRENCY,
  DEFAULT_CURRENCY,
  BUDGET_SCOPE,
  BUDGET_TARGET
};
