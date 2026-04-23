/**
 * 账户管理（模块九的子模块）
 *
 * 列表展示账户树，支持：
 *   - 添加顶级账户、添加子账户
 *   - 编辑账户（名字、图标、颜色、余额、归档）
 *   - 删除（仅自定义、且无关联账单时）
 */
(function () {
  'use strict';

  const { ACCOUNT_TYPE, CURRENCY } = window.DB_SCHEMA;
  const { escapeHtml, formatMoney } = window.UIUtils;

  const PRESET_ICONS = ['💰','💳','💎','🌸','💚','🔵','🟠','🟡','🟢','🟣','📱','💼','🏦','🪙','💵','🧧'];
  const PRESET_COLORS = [
    '#3d6b35','#5a8a3a','#3d8980','#4a78a8','#6e5a9c',
    '#a55a8e','#c14a3e','#d68c3a','#dcb53b','#8b5a2b','#5a4d3a','#8e8775'
  ];

  let pageEl = null;

  async function open() {
    const sheet = window.UISheet.open({
      title: '账户管理',
      content: `
        <div class="acc-manager">
          <div id="accList"></div>
          <button class="cat-add-btn" data-action="add-top">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;margin-right:6px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            添加顶级账户
          </button>
        </div>
      `,
      height: 'full'
    });
    pageEl = sheet.element;

    pageEl.querySelector('[data-action="add-top"]').addEventListener('click', () => {
      openAccountEditor(null, null);
    });

    await renderList();
  }

  async function renderList() {
    const tree = await window.Repo.Accounts.getAll(true);
    const listEl = pageEl.querySelector('#accList');

    listEl.innerHTML = tree.map(parent => `
      <div class="acc-group">
        <div class="acc-item acc-parent ${parent.archived ? 'is-archived' : ''}" data-id="${parent.id}">
          <div class="acc-item-icon" style="background:${parent.color}22;color:${parent.color}">${parent.icon}</div>
          <div class="acc-item-main">
            <div class="acc-item-name">${escapeHtml(parent.name)}${parent.archived ? ' <small>(已归档)</small>' : ''}</div>
            <div class="acc-item-sub">${typeLabel(parent.type)}${parent.balance ? ' · 余额 ' + formatMoney(parent.balance, { withCurrency: true }) : ''}</div>
          </div>
          <button class="cat-item-edit" data-action="edit-parent" data-id="${parent.id}" aria-label="编辑">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
        ${parent.children.length > 0 ? parent.children.map(child => `
          <div class="acc-item acc-child ${child.archived ? 'is-archived' : ''}" data-id="${child.id}">
            <div class="acc-item-icon" style="background:${child.color}22;color:${child.color};font-size:14px">${child.icon}</div>
            <div class="acc-item-main">
              <div class="acc-item-name">${escapeHtml(child.name)}${child.archived ? ' <small>(已归档)</small>' : ''}</div>
              <div class="acc-item-sub">${typeLabel(child.type)}${child.balance ? ' · 余额 ' + formatMoney(child.balance, { withCurrency: true }) : ''}</div>
            </div>
            <button class="cat-item-edit" data-action="edit-child" data-id="${child.id}" aria-label="编辑">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        `).join('') : ''}
        <button class="acc-add-child-btn" data-action="add-child" data-parent-id="${parent.id}">+ 在"${escapeHtml(parent.name)}"下添加子账户</button>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-action="edit-parent"], [data-action="edit-child"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        openAccountEditor(id, null);
      });
    });

    listEl.querySelectorAll('[data-action="add-child"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = parseInt(btn.dataset.parentId, 10);
        openAccountEditor(null, pid);
      });
    });
  }

  function typeLabel(t) {
    return t === ACCOUNT_TYPE.ASSET ? '资产'
         : t === ACCOUNT_TYPE.CREDIT ? '信用'
         : t === ACCOUNT_TYPE.VIRTUAL ? '分组' : '?';
  }

  async function openAccountEditor(id, parentId) {
    let acc = null;
    if (id) acc = await window.Repo.Accounts.getById(id);

    const editing = !!acc;
    const data = acc || {
      name: '', icon: PRESET_ICONS[0], color: PRESET_COLORS[0],
      type: parentId ? ACCOUNT_TYPE.ASSET : ACCOUNT_TYPE.VIRTUAL,
      currency: CURRENCY.CNY,
      balance: 0,
      parentId: parentId,
      archived: false
    };

    let selectedIcon = data.icon;
    let selectedColor = data.color;

    const html = `
      <div class="cat-editor">
        <div class="cat-editor-preview">
          <div class="cat-editor-icon-display" id="accIconDisplay" style="background:${selectedColor}22;color:${selectedColor}">${selectedIcon}</div>
        </div>

        <div class="form-group">
          <label class="form-label">账户名称</label>
          <input type="text" class="form-input" id="accName" placeholder="如：花呗" value="${escapeHtml(data.name)}" maxlength="20">
        </div>

        <div class="form-group">
          <label class="form-label">类型</label>
          <select class="form-input" id="accType">
            <option value="${ACCOUNT_TYPE.ASSET}" ${data.type === ACCOUNT_TYPE.ASSET ? 'selected' : ''}>资产（现金/借记/余额）</option>
            <option value="${ACCOUNT_TYPE.CREDIT}" ${data.type === ACCOUNT_TYPE.CREDIT ? 'selected' : ''}>信用（信用卡/花呗/白条）</option>
            <option value="${ACCOUNT_TYPE.VIRTUAL}" ${data.type === ACCOUNT_TYPE.VIRTUAL ? 'selected' : ''}>分组（仅作分类，不能直接选）</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">余额（元，可选）</label>
          <input type="number" inputmode="decimal" class="form-input" id="accBalance" value="${(data.balance / 100) || ''}" step="0.01" placeholder="0.00">
          <div class="form-hint">资产为正、信用为欠款（负数）。模块四不会自动更新此余额，仅用于参考。</div>
        </div>

        <div class="form-group">
          <label class="form-label">图标</label>
          <div class="icon-picker">
            ${PRESET_ICONS.map(ic => `
              <button class="icon-picker-btn ${ic === selectedIcon ? 'active' : ''}" data-icon="${ic}">${ic}</button>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">颜色</label>
          <div class="color-picker">
            ${PRESET_COLORS.map(c => `
              <button class="color-picker-btn ${c === selectedColor ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>
            `).join('')}
          </div>
        </div>

        ${editing ? `
        <div class="form-group">
          <label class="form-label">归档</label>
          <select class="form-input" id="accArchived">
            <option value="false" ${!data.archived ? 'selected' : ''}>正常使用</option>
            <option value="true" ${data.archived ? 'selected' : ''}>归档（不在记账时显示）</option>
          </select>
        </div>
        ` : ''}
      </div>
    `;

    const footer = `
      ${editing ? '<button class="sheet-btn-cancel" data-action="delete" style="color:var(--color-expense)">删除</button>' : ''}
      <button class="sheet-btn-cancel" data-action="cancel">取消</button>
      <button class="sheet-btn-primary" data-action="save">${editing ? '保存' : '添加'}</button>
    `;

    const sheet = window.UISheet.open({
      title: editing ? '编辑账户' : '新建账户',
      content: html,
      footer,
      height: 'full'
    });
    const el = sheet.element;

    function updatePreview() {
      const display = el.querySelector('#accIconDisplay');
      display.textContent = selectedIcon;
      display.style.background = `${selectedColor}22`;
      display.style.color = selectedColor;
    }

    el.querySelectorAll('[data-icon]').forEach(b => {
      b.addEventListener('click', () => {
        selectedIcon = b.dataset.icon;
        el.querySelectorAll('[data-icon]').forEach(x => x.classList.toggle('active', x === b));
        updatePreview();
      });
    });
    el.querySelectorAll('[data-color]').forEach(b => {
      b.addEventListener('click', () => {
        selectedColor = b.dataset.color;
        el.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('active', x === b));
        updatePreview();
      });
    });

    el.querySelector('[data-action="cancel"]').addEventListener('click', () => sheet.close());

    el.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const name = el.querySelector('#accName').value.trim();
      if (!name) { alert('请输入账户名称'); return; }
      const type = el.querySelector('#accType').value;
      const balance = Math.round((parseFloat(el.querySelector('#accBalance').value) || 0) * 100);
      const archived = el.querySelector('#accArchived')?.value === 'true';

      try {
        if (editing) {
          await window.Repo.Accounts.update(id, { name, icon: selectedIcon, color: selectedColor, type, balance, archived });
        } else {
          await window.Repo.Accounts.add({
            name, icon: selectedIcon, color: selectedColor, type, balance,
            parentId: parentId, currency: CURRENCY.CNY
          });
        }
        sheet.close();
        await renderList();
      } catch (err) { alert('保存失败：' + err.message); }
    });

    el.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      // 检查是否有子账户
      const tree = await window.Repo.Accounts.getAll(true);
      const flat = await window.Repo.Accounts.getFlatList(true);
      const hasChildren = tree.find(a => a.id === id)?.children.length > 0;
      if (hasChildren) { alert('请先删除该账户下的所有子账户'); return; }

      // 检查是否有关联账单
      const txs = await window.Repo.Transactions.getByAccount(id);
      if (txs.length > 0) {
        if (!confirm(`此账户下还有 ${txs.length} 条账单。\n\n建议改为"归档"而不是删除。\n\n确定彻底删除？历史账单将变成"未指定账户"。`)) return;
      }

      await window.Repo.Accounts.hardDelete(id);
      sheet.close();
      await renderList();
    });
  }

  window.PageAccounts = { open };
})();
