/**
 * 分类管理（模块五）
 *
 * 入口：设置页 → 分类管理
 * 功能：增删改、Tab 切支出/收入、归档/取消归档
 * 系统预置分类：不能删除，但可以改名字/图标/颜色/排序
 */
(function () {
  'use strict';

  const { CATEGORY_KIND } = window.DB_SCHEMA;
  const { escapeHtml } = window.UIUtils;

  // ============ 预设图标（emoji）============
  const PRESET_ICONS = [
    '🍜','🍔','🍰','☕','🍺','🍎',
    '🚗','🚕','🚌','✈️','🚄','⛽',
    '🛍️','👕','👟','💄','💍','🎁',
    '🎮','🎬','🎵','📚','🏋️','⚽',
    '🏠','💡','💧','🔧','🪑','🌿',
    '💊','🏥','💉','🦷','👶','🐶',
    '📱','💻','🖨️','📷','🎧','⌚',
    '💰','💼','💵','💳','📈','🧧',
    '🎓','✏️','📝','🖋️','🎨','🎭',
    '✂️','🌍','⛰️','🏖️','🎪','🎢',
    '🎂','🌹','💐','🎀','🌟','⭐'
  ];

  // ============ 预设颜色（搭配浅木风）============
  const PRESET_COLORS = [
    '#c14a3e', // 陶土红
    '#d68c3a', // 琥珀橙
    '#dcb53b', // 麦黄
    '#5a8a3a', // 苹果绿
    '#3d6b35', // 森林绿
    '#3d8980', // 青松绿
    '#4a78a8', // 牛仔蓝
    '#6e5a9c', // 紫罗兰
    '#a55a8e', // 粉莲
    '#8b5a2b', // 木褐
    '#5a4d3a', // 深咖
    '#8e8775'  // 灰岩
  ];

  let pageEl = null;
  let currentTab = 'expense';

  /**
   * 渲染分类管理页（在底部抽屉里）
   */
  async function open() {
    const html = `
      <div class="cat-manager">
        <div class="cat-tabs">
          <button class="cat-tab ${currentTab === 'expense' ? 'active' : ''}" data-kind="expense">支出分类</button>
          <button class="cat-tab ${currentTab === 'income' ? 'active' : ''}" data-kind="income">收入分类</button>
        </div>
        <div class="cat-list" id="catList"></div>
        <button class="cat-add-btn" data-action="add">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;margin-right:6px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          添加新分类
        </button>
      </div>
    `;

    const sheet = window.UISheet.open({
      title: '分类管理',
      content: html,
      height: 'full'
    });
    pageEl = sheet.element;

    bindTabEvents();
    await renderList();
  }

  function bindTabEvents() {
    pageEl.querySelectorAll('.cat-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        currentTab = btn.dataset.kind;
        pageEl.querySelectorAll('.cat-tab').forEach(b => b.classList.toggle('active', b === btn));
        await renderList();
      });
    });

    pageEl.querySelector('[data-action="add"]')?.addEventListener('click', () => {
      openCategoryEditor(null);
    });
  }

  async function renderList() {
    const cats = await window.Repo.Categories.getByKind(currentTab);
    const listEl = pageEl.querySelector('#catList');

    if (cats.length === 0) {
      listEl.innerHTML = '<div class="cat-empty">暂无分类，点下方添加</div>';
      return;
    }

    listEl.innerHTML = cats.map(c => `
      <div class="cat-item" data-id="${c.id}">
        <div class="cat-item-icon" style="background:${c.color}22;color:${c.color}">${c.icon}</div>
        <div class="cat-item-name">${escapeHtml(c.name)}</div>
        ${c.isDefault ? '<span class="cat-item-badge">系统</span>' : ''}
        <button class="cat-item-edit" data-id="${c.id}" aria-label="编辑">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.id, 10);
        openCategoryEditor(id);
      });
    });
  }

  // ============ 编辑/新建分类 ============
  async function openCategoryEditor(id) {
    let cat = null;
    if (id) cat = await window.Repo.Categories.getById(id);

    const editing = !!cat;
    const data = cat || {
      name: '',
      icon: PRESET_ICONS[0],
      color: PRESET_COLORS[3],
      kind: currentTab,
      isDefault: false
    };

    let selectedIcon = data.icon;
    let selectedColor = data.color;

    const html = `
      <div class="cat-editor">
        <div class="cat-editor-preview" id="catPreview">
          <div class="cat-editor-icon-display" id="catIconDisplay" style="background:${selectedColor}22;color:${selectedColor}">${selectedIcon}</div>
        </div>

        <div class="form-group">
          <label class="form-label">名称</label>
          <input type="text" class="form-input" id="catName" placeholder="如：餐饮" value="${escapeHtml(data.name)}" maxlength="20">
        </div>

        <div class="form-group">
          <label class="form-label">图标</label>
          <div class="icon-picker" id="iconPicker">
            ${PRESET_ICONS.map(ic => `
              <button class="icon-picker-btn ${ic === selectedIcon ? 'active' : ''}" data-icon="${ic}">${ic}</button>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">颜色</label>
          <div class="color-picker" id="colorPicker">
            ${PRESET_COLORS.map(c => `
              <button class="color-picker-btn ${c === selectedColor ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    const footer = `
      ${editing && !data.isDefault ? '<button class="sheet-btn-cancel" data-action="delete" style="color:var(--color-expense)">删除</button>' : ''}
      <button class="sheet-btn-cancel" data-action="cancel">取消</button>
      <button class="sheet-btn-primary" data-action="save">${editing ? '保存' : '添加'}</button>
    `;

    const sheet = window.UISheet.open({
      title: editing ? '编辑分类' : '新建分类',
      content: html,
      footer,
      height: 'auto'
    });
    const el = sheet.element;

    function updatePreview() {
      const display = el.querySelector('#catIconDisplay');
      display.textContent = selectedIcon;
      display.style.background = `${selectedColor}22`;
      display.style.color = selectedColor;
    }

    el.querySelectorAll('[data-icon]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedIcon = btn.dataset.icon;
        el.querySelectorAll('[data-icon]').forEach(b => b.classList.toggle('active', b === btn));
        updatePreview();
      });
    });

    el.querySelectorAll('[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedColor = btn.dataset.color;
        el.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('active', b === btn));
        updatePreview();
      });
    });

    el.querySelector('[data-action="cancel"]').addEventListener('click', () => sheet.close());

    el.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const name = el.querySelector('#catName').value.trim();
      if (!name) {
        alert('请输入分类名称');
        return;
      }
      try {
        if (editing) {
          await window.Repo.Categories.update(id, {
            name, icon: selectedIcon, color: selectedColor
          });
        } else {
          await window.Repo.Categories.add({
            name, icon: selectedIcon, color: selectedColor,
            kind: currentTab, isDefault: false
          });
        }
        sheet.close();
        await renderList();
      } catch (err) {
        alert('保存失败：' + err.message);
      }
    });

    el.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      if (!confirm(`确定删除"${data.name}"？\n\n注意：使用此分类的历史账单不会被删除，但分类会显示为"未分类"。`)) return;
      try {
        await window.Repo.Categories.hardDelete(id);
        sheet.close();
        await renderList();
      } catch (err) {
        alert('删除失败：' + err.message);
      }
    });
  }

  window.PageCategories = { open };
})();
