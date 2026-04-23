/**
 * 账户 CRUD
 *
 * 账户结构：两层
 *   微信（顶级）
 *   支付宝（顶级，virtual 类型，仅作分组）
 *     ├─ 银行卡（子，asset）
 *     ├─ 信用卡（子，credit）
 *     └─ 花呗（子，credit）
 *
 * 字段说明：
 *   id          自增主键
 *   name        显示名（"花呗"）
 *   parentId    父账户 id，null 表示顶级
 *   type        asset / credit / virtual
 *   currency    主币种（多币种账单会折算后存）
 *   balance     余额（分）—— 资产是正数，信用是欠款（负数表示欠多少）
 *   icon        emoji 或图标 key
 *   color       主题色（hex）
 *   sortOrder   排序权重，越小越靠前
 *   archived    软删除标记
 *   createdAt   创建时间戳
 *   updatedAt   更新时间戳
 */

(function () {
  'use strict';

  const { STORES, ACCOUNT_TYPE, DEFAULT_CURRENCY } = window.DB_SCHEMA;
  const { reqToPromise } = window.DB;

  // ============ 创建 ============
  /**
   * 添加账户
   * @param {Object} data - 账户数据
   * @returns {Promise<number>} 新账户 id
   */
  async function add(data) {
    const account = {
      name: data.name,
      parentId: data.parentId ?? null,
      type: data.type ?? ACCOUNT_TYPE.ASSET,
      currency: data.currency ?? DEFAULT_CURRENCY,
      balance: data.balance ?? 0,
      icon: data.icon ?? '💰',
      color: data.color ?? '#007aff',
      sortOrder: data.sortOrder ?? Date.now(),
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const { store, done } = window.DB.tx(STORES.ACCOUNTS, 'readwrite');
    const id = await reqToPromise(store.add(account));
    await done;
    return id;
  }

  // ============ 查询单个 ============
  async function getById(id) {
    const { store } = window.DB.tx(STORES.ACCOUNTS, 'readonly');
    return await reqToPromise(store.get(id));
  }

  // ============ 查询全部（含层级） ============
  /**
   * 获取所有账户，并按层级组织
   * @param {boolean} includeArchived - 是否包含归档账户
   * @returns {Promise<Array>} [{...account, children: [...]}]
   */
  async function getAll(includeArchived = false) {
    const { store } = window.DB.tx(STORES.ACCOUNTS, 'readonly');
    const all = await reqToPromise(store.getAll());

    const filtered = includeArchived ? all : all.filter(a => !a.archived);

    // 排序
    filtered.sort((a, b) => a.sortOrder - b.sortOrder);

    // 组织成两层结构
    const topLevel = filtered.filter(a => a.parentId == null);
    const childrenMap = {};
    filtered.filter(a => a.parentId != null).forEach(a => {
      if (!childrenMap[a.parentId]) childrenMap[a.parentId] = [];
      childrenMap[a.parentId].push(a);
    });

    return topLevel.map(parent => ({
      ...parent,
      children: childrenMap[parent.id] || []
    }));
  }

  // ============ 查询扁平列表（下拉选择用） ============
  /**
   * 拍平后的账户列表，附带 displayName（"支付宝 / 花呗"）
   * 适合在记账表单的账户下拉里使用
   */
  async function getFlatList(includeArchived = false) {
    const tree = await getAll(includeArchived);
    const result = [];

    tree.forEach(parent => {
      // virtual 类型的父节点不能直接选（它只是分组）
      if (parent.type !== ACCOUNT_TYPE.VIRTUAL) {
        result.push({
          ...parent,
          displayName: parent.name,
          isChild: false
        });
      }

      parent.children.forEach(child => {
        result.push({
          ...child,
          displayName: `${parent.name} / ${child.name}`,
          parentName: parent.name,
          isChild: true
        });
      });
    });

    return result;
  }

  // ============ 更新 ============
  async function update(id, patch) {
    const { store, done } = window.DB.tx(STORES.ACCOUNTS, 'readwrite');
    const existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error(`账户 ${id} 不存在`);

    const updated = {
      ...existing,
      ...patch,
      id: existing.id,        // 防止 id 被覆盖
      updatedAt: Date.now()
    };

    await reqToPromise(store.put(updated));
    await done;
    return updated;
  }

  // ============ 调整余额（增量） ============
  /**
   * 在原余额基础上增减
   * @param {number} id - 账户 id
   * @param {number} delta - 变动金额（分），正为增，负为减
   * 注意：因为账户字段对历史模块预留，本模块不会自动调用此方法
   * 后续记账模块录入账单时会调用
   */
  async function adjustBalance(id, delta) {
    return update(id, {
      balance: ((await getById(id))?.balance ?? 0) + delta
    });
  }

  // ============ 软删除（归档） ============
  async function archive(id) {
    return update(id, { archived: true });
  }

  async function unarchive(id) {
    return update(id, { archived: false });
  }

  // ============ 硬删除（仅调试用） ============
  async function hardDelete(id) {
    const { store, done } = window.DB.tx(STORES.ACCOUNTS, 'readwrite');
    await reqToPromise(store.delete(id));
    await done;
  }

  // ============ 暴露 ============
  if (!window.Repo) window.Repo = {};
  window.Repo.Accounts = {
    add,
    getById,
    getAll,
    getFlatList,
    update,
    adjustBalance,
    archive,
    unarchive,
    hardDelete
  };
})();
