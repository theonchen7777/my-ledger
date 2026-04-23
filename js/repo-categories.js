/**
 * 分类 CRUD
 *
 * 字段：
 *   id          自增主键
 *   name        分类名（"餐饮"）
 *   kind        expense / income （支出分类、收入分类）
 *   icon        emoji
 *   color       hex 颜色
 *   sortOrder   排序权重
 *   archived    软删除
 *   createdAt, updatedAt
 *   isDefault   是否系统预置（预置分类不能删，只能改）
 */

(function () {
  'use strict';

  const { STORES, CATEGORY_KIND } = window.DB_SCHEMA;
  const { reqToPromise } = window.DB;

  // ============ 增 ============
  async function add(data) {
    const category = {
      name: data.name,
      kind: data.kind ?? CATEGORY_KIND.EXPENSE,
      icon: data.icon ?? '📝',
      color: data.color ?? '#8e8e93',
      sortOrder: data.sortOrder ?? Date.now(),
      archived: false,
      isDefault: data.isDefault ?? false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const { store, done } = window.DB.tx(STORES.CATEGORIES, 'readwrite');
    const id = await reqToPromise(store.add(category));
    await done;
    return id;
  }

  // ============ 查 ============
  async function getById(id) {
    const { store } = window.DB.tx(STORES.CATEGORIES, 'readonly');
    return await reqToPromise(store.get(id));
  }

  /**
   * 按类型查（支出分类列表 / 收入分类列表）
   */
  async function getByKind(kind, includeArchived = false) {
    const { store } = window.DB.tx(STORES.CATEGORIES, 'readonly');
    const idx = store.index('kind');
    const all = await reqToPromise(idx.getAll(kind));
    const filtered = includeArchived ? all : all.filter(c => !c.archived);
    return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async function getAll(includeArchived = false) {
    const { store } = window.DB.tx(STORES.CATEGORIES, 'readonly');
    const all = await reqToPromise(store.getAll());
    const filtered = includeArchived ? all : all.filter(c => !c.archived);
    return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // ============ 改 ============
  async function update(id, patch) {
    const { store, done } = window.DB.tx(STORES.CATEGORIES, 'readwrite');
    const existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error(`分类 ${id} 不存在`);

    const updated = {
      ...existing,
      ...patch,
      id: existing.id,
      // 系统预置的 kind 不能改（避免数据混乱）
      kind: existing.isDefault ? existing.kind : (patch.kind ?? existing.kind),
      updatedAt: Date.now()
    };

    await reqToPromise(store.put(updated));
    await done;
    return updated;
  }

  // ============ 删（软删） ============
  async function archive(id) {
    return update(id, { archived: true });
  }

  async function unarchive(id) {
    return update(id, { archived: false });
  }

  async function hardDelete(id) {
    const cat = await getById(id);
    if (cat?.isDefault) throw new Error('系统预置分类不可删除');
    const { store, done } = window.DB.tx(STORES.CATEGORIES, 'readwrite');
    await reqToPromise(store.delete(id));
    await done;
  }

  // ============ 暴露 ============
  if (!window.Repo) window.Repo = {};
  window.Repo.Categories = {
    add,
    getById,
    getAll,
    getByKind,
    update,
    archive,
    unarchive,
    hardDelete
  };
})();
