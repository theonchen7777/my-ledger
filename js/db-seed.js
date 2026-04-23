/**
 * Seed 数据：首次启动时写入预置数据
 *   - 账户结构（按用户配置：微信 + 支付宝/银行卡/信用卡/花呗）
 *   - 默认分类（餐饮、交通等）
 *
 * 通过 Meta.seedDone 标记，避免重复写入
 */

(function () {
  'use strict';

  const { ACCOUNT_TYPE, CATEGORY_KIND, CURRENCY } = window.DB_SCHEMA;

  // ============ 默认账户结构 ============
  const DEFAULT_ACCOUNTS = [
    // 微信（顶级、单层、资产账户）
    {
      key: 'wechat',
      name: '微信',
      type: ACCOUNT_TYPE.ASSET,
      icon: '💚',
      color: '#07c160',
      sortOrder: 10
    },
    // 支付宝（顶级、virtual、仅作分组）
    {
      key: 'alipay',
      name: '支付宝',
      type: ACCOUNT_TYPE.VIRTUAL,
      icon: '🔵',
      color: '#1677ff',
      sortOrder: 20,
      children: [
        {
          name: '银行卡',
          type: ACCOUNT_TYPE.ASSET,
          icon: '💳',
          color: '#1677ff',
          sortOrder: 21
        },
        {
          name: '信用卡',
          type: ACCOUNT_TYPE.CREDIT,
          icon: '💎',
          color: '#722ed1',
          sortOrder: 22
        },
        {
          name: '花呗',
          type: ACCOUNT_TYPE.CREDIT,
          icon: '🌸',
          color: '#ff7875',
          sortOrder: 23
        }
      ]
    }
  ];

  // ============ 默认分类 ============
  // 支出分类
  const DEFAULT_EXPENSE_CATEGORIES = [
    { name: '餐饮',   icon: '🍜', color: '#ff9500' },
    { name: '交通',   icon: '🚗', color: '#5ac8fa' },
    { name: '购物',   icon: '🛍️', color: '#ff2d55' },
    { name: '娱乐',   icon: '🎮', color: '#af52de' },
    { name: '居家',   icon: '🏠', color: '#34c759' },
    { name: '医疗',   icon: '💊', color: '#ff3b30' },
    { name: '学习',   icon: '📚', color: '#5856d6' },
    { name: '通讯',   icon: '📱', color: '#007aff' },
    { name: '旅行',   icon: '✈️', color: '#00c7be' },
    { name: '人情',   icon: '🎁', color: '#ff9500' },
    { name: '订阅',   icon: '🔔', color: '#8e8e93' },
    { name: '其他',   icon: '📝', color: '#8e8e93' }
  ];

  // 收入分类
  const DEFAULT_INCOME_CATEGORIES = [
    { name: '工资',   icon: '💼', color: '#34c759' },
    { name: '奖金',   icon: '🎉', color: '#ff9500' },
    { name: '理财',   icon: '📈', color: '#5856d6' },
    { name: '退款',   icon: '↩️', color: '#5ac8fa' },
    { name: '红包',   icon: '🧧', color: '#ff3b30' },
    { name: '其他',   icon: '💰', color: '#8e8e93' }
  ];

  // ============ 执行 Seed ============
  async function runIfNeeded() {
    const seeded = await window.Repo.Meta.get('seedDone');
    if (seeded) {
      console.log('[Seed] 已完成过初始化，跳过');
      return false;
    }

    console.log('[Seed] 首次启动，写入默认数据...');

    // ----- 账户 -----
    for (const acc of DEFAULT_ACCOUNTS) {
      const parentId = await window.Repo.Accounts.add({
        name: acc.name,
        parentId: null,
        type: acc.type,
        currency: CURRENCY.CNY,
        icon: acc.icon,
        color: acc.color,
        sortOrder: acc.sortOrder
      });

      if (acc.children) {
        for (const child of acc.children) {
          await window.Repo.Accounts.add({
            name: child.name,
            parentId,
            type: child.type,
            currency: CURRENCY.CNY,
            icon: child.icon,
            color: child.color,
            sortOrder: child.sortOrder
          });
        }
      }
    }

    // ----- 支出分类 -----
    let order = 0;
    for (const cat of DEFAULT_EXPENSE_CATEGORIES) {
      await window.Repo.Categories.add({
        ...cat,
        kind: CATEGORY_KIND.EXPENSE,
        sortOrder: order++,
        isDefault: true
      });
    }

    // ----- 收入分类 -----
    order = 0;
    for (const cat of DEFAULT_INCOME_CATEGORIES) {
      await window.Repo.Categories.add({
        ...cat,
        kind: CATEGORY_KIND.INCOME,
        sortOrder: order++,
        isDefault: true
      });
    }

    // ----- 默认配置 -----
    await window.Repo.Meta.set('defaultCurrency', CURRENCY.CNY);

    // 标记 seed 完成
    await window.Repo.Meta.set('seedDone', true);
    await window.Repo.Meta.set('seedAt', Date.now());

    console.log('[Seed] 完成');
    return true;
  }

  window.DBSeed = {
    runIfNeeded,
    DEFAULT_ACCOUNTS,
    DEFAULT_EXPENSE_CATEGORIES,
    DEFAULT_INCOME_CATEGORIES
  };
})();
