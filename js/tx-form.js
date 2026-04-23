/**
 * 账单录入表单 (TxForm)
 *
 * 核心流程：
 *   1. 打开表单抽屉，可指定预填日期和类型
 *   2. 加载账户和分类数据，恢复上次选择
 *   3. 多币种 X+ 方案：选 USD 时拉汇率、显示 CNY 折算
 *   4. 保存：写入数据库 + 记忆选择 + 触发刷新事件
 *
 * 暂不支持：转账（按你的决定，留到后续模块）
 *           编辑已有账单（模块四原计划只做新增；之后可加）
 */
(function () {
  'use strict';

  const { CATEGORY_KIND, TX_TYPE, CURRENCY, DEFAULT_CURRENCY } = window.DB_SCHEMA;
  const { toDateStr, escapeHtml } = window.UIUtils;

  // ============ Meta key 常量 ============
  const META_LAST_ACCOUNT = 'lastAccountId';
  const META_LAST_EXPENSE_CAT = 'lastCategoryId_expense';
  const META_LAST_INCOME_CAT = 'lastCategoryId_income';

  // ============ 状态（每次打开重置） ============
  let state = null;

  /**
   * 打开表单
   * @param {Object} options
   *   - date: 预填日期（Date 或 'YYYY-MM-DD'），默认今天
   *   - type: 'expense' | 'income'，默认 'expense'
   *   - onSaved: 保存成功后回调
   */
  async function open(options = {}) {
    const initialDate = options.date
      ? (options.date instanceof Date ? options.date : window.UIUtils.parseDate(options.date))
      : new Date();

    // 加载基础数据
    const [accountsFlat, expCats, incCats, lastAccountId, lastExpCatId, lastIncCatId] = await Promise.all([
      window.Repo.Accounts.getFlatList(),
      window.Repo.Categories.getByKind(CATEGORY_KIND.EXPENSE),
      window.Repo.Categories.getByKind(CATEGORY_KIND.INCOME),
      window.Repo.Meta.get(META_LAST_ACCOUNT),
      window.Repo.Meta.get(META_LAST_EXPENSE_CAT),
      window.Repo.Meta.get(META_LAST_INCOME_CAT)
    ]);

    if (accountsFlat.length === 0) {
      alert('请先添加账户');
      return;
    }
    if (expCats.length === 0 && incCats.length === 0) {
      alert('请先添加分类');
      return;
    }

    // 初始化状态
    state = {
      type: options.type || TX_TYPE.EXPENSE,
      amount: '',
      currency: DEFAULT_CURRENCY,
      amountCNY: '',           // 仅外币时使用
      exchangeRate: 1,
      isManualRate: false,     // 用户是否手改了 CNY 金额
      rateLoading: false,
      rateError: null,
      rateInfo: null,          // { rate, fromCache, fetchedAt }

      accountId: lastAccountId && accountsFlat.find(a => a.id === lastAccountId)
        ? lastAccountId
        : accountsFlat[0].id,
      categoryId: null,        // 在 setType 里初始化
      date: initialDate,
      note: '',
      countInDailyBudget: true,

      accountsFlat,
      expCats,
      incCats,
      onSaved: options.onSaved
    };

    // 根据 type 初始化分类
    setInitialCategory(lastExpCatId, lastIncCatId);

    // 打开抽屉
    const sheet = window.UISheet.open({
      title: '记一笔',
      content: renderForm(),
      footer: renderFooter(),
      height: 'full',
      onClose: () => { state = null; }
    });
    state.sheet = sheet;

    bindEvents();
  }

  function setInitialCategory(lastExpCatId, lastIncCatId) {
    if (state.type === TX_TYPE.EXPENSE) {
      state.categoryId = (lastExpCatId && state.expCats.find(c => c.id === lastExpCatId))
        ? lastExpCatId
        : state.expCats[0]?.id;
    } else {
      state.categoryId = (lastIncCatId && state.incCats.find(c => c.id === lastIncCatId))
        ? lastIncCatId
        : state.incCats[0]?.id;
    }
  }

  // ============ 渲染：主表单 ============
  function renderForm() {
    const isExpense = state.type === TX_TYPE.EXPENSE;
    const isForeign = state.currency !== CURRENCY.CNY;

    return `
      <div class="txform">
        <!-- 类型切换：分段控件 -->
        <div class="txform-segment">
          <button class="txform-seg-btn ${isExpense ? 'active expense' : ''}"
                  data-action="set-type" data-type="${TX_TYPE.EXPENSE}">支出</button>
          <button class="txform-seg-btn ${!isExpense ? 'active income' : ''}"
                  data-action="set-type" data-type="${TX_TYPE.INCOME}">收入</button>
        </div>

        <!-- 金额 -->
        <div class="txform-field txform-field-amount">
          <div class="txform-amount-row">
            <select class="txform-currency" id="txCurrency">
              <option value="${CURRENCY.CNY}" ${state.currency === CURRENCY.CNY ? 'selected' : ''}>¥ CNY</option>
              <option value="${CURRENCY.USD}" ${state.currency === CURRENCY.USD ? 'selected' : ''}>$ USD</option>
            </select>
            <input
              type="text"
              inputmode="decimal"
              class="txform-amount-input ${isExpense ? 'expense' : 'income'}"
              id="txAmount"
              placeholder="0.00"
              value="${state.amount}"
              autocomplete="off">
          </div>

          ${isForeign ? renderRateRow() : ''}
        </div>

        <!-- 分类 -->
        <div class="txform-field">
          <label class="txform-label">分类</label>
          <select class="txform-select" id="txCategory">
            ${renderCategoryOptions()}
          </select>
        </div>

        <!-- 账户 -->
        <div class="txform-field">
          <label class="txform-label">账户</label>
          <select class="txform-select" id="txAccount">
            ${renderAccountOptions()}
          </select>
        </div>

        <!-- 日期 -->
        <div class="txform-field">
          <label class="txform-label">日期时间</label>
          <input
            type="datetime-local"
            class="txform-select"
            id="txDate"
            value="${formatDateTimeLocal(state.date)}">
        </div>

        <!-- 备注 -->
        <div class="txform-field">
          <label class="txform-label">备注（可选）</label>
          <input
            type="text"
            class="txform-input"
            id="txNote"
            placeholder="例：午饭、地铁、网购"
            value="${escapeHtml(state.note)}"
            maxlength="100"
            autocomplete="off">
        </div>

        <!-- 计入日预算开关（仅支出显示） -->
        ${isExpense ? `
        <div class="txform-field txform-toggle-row">
          <div class="txform-toggle-text">
            <div class="txform-toggle-label">计入日预算</div>
            <div class="txform-toggle-hint">关闭后，这笔将作为大额支出，不影响日历每日颜色</div>
          </div>
          <label class="txform-switch">
            <input type="checkbox" id="txCountInDaily" ${state.countInDailyBudget ? 'checked' : ''}>
            <span class="txform-switch-slider"></span>
          </label>
        </div>
        ` : ''}
      </div>
    `;
  }

  function renderRateRow() {
    let middle;
    if (state.rateLoading) {
      middle = '<span class="txform-rate-status">汇率获取中...</span>';
    } else if (state.rateError && !state.rateInfo) {
      middle = `<span class="txform-rate-error">${escapeHtml(state.rateError)}</span>`;
    } else if (state.rateInfo) {
      const src = state.rateInfo.fromCache ? '本地缓存' : '实时';
      middle = `<span class="txform-rate-status">汇率 ${state.rateInfo.rate} (${src})</span>`;
    } else {
      middle = '';
    }

    return `
      <div class="txform-rate-row">
        <span class="txform-rate-label">≈ ¥</span>
        <input
          type="text"
          inputmode="decimal"
          class="txform-rate-cny"
          id="txAmountCNY"
          placeholder="自动折算"
          value="${state.amountCNY}"
          autocomplete="off">
        ${middle}
        <button class="txform-rate-refresh" data-action="refresh-rate" aria-label="刷新汇率">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
      </div>
    `;
  }

  function renderCategoryOptions() {
    const cats = state.type === TX_TYPE.EXPENSE ? state.expCats : state.incCats;
    return cats.map(c => `
      <option value="${c.id}" ${c.id === state.categoryId ? 'selected' : ''}>${c.icon} ${escapeHtml(c.name)}</option>
    `).join('');
  }

  function renderAccountOptions() {
    return state.accountsFlat.map(a => `
      <option value="${a.id}" ${a.id === state.accountId ? 'selected' : ''}>${a.icon} ${escapeHtml(a.displayName)}</option>
    `).join('');
  }

  function renderFooter() {
    return `
      <button class="sheet-btn-cancel" data-action="cancel">取消</button>
      <button class="sheet-btn-primary" data-action="save">保存</button>
    `;
  }

  // ============ 事件 ============
  function bindEvents() {
    const root = state.sheet.element;

    // 类型切换
    root.querySelectorAll('[data-action="set-type"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const newType = btn.dataset.type;
        if (newType === state.type) return;
        state.type = newType;

        // 切换类型时分类要重新初始化（用上次记忆的）
        Promise.all([
          window.Repo.Meta.get(META_LAST_EXPENSE_CAT),
          window.Repo.Meta.get(META_LAST_INCOME_CAT)
        ]).then(([le, li]) => {
          setInitialCategory(le, li);
          rerender();
        });
      });
    });

    // 金额输入
    root.querySelector('#txAmount')?.addEventListener('input', (e) => {
      state.amount = sanitizeAmountInput(e.target.value);
      e.target.value = state.amount;
      // 如果是外币，自动重算 CNY（除非用户手动改过）
      if (state.currency !== CURRENCY.CNY && !state.isManualRate && state.exchangeRate) {
        recalculateCNY();
      }
    });

    // 币种切换
    root.querySelector('#txCurrency')?.addEventListener('change', async (e) => {
      state.currency = e.target.value;
      state.isManualRate = false;
      if (state.currency !== CURRENCY.CNY) {
        // 切到外币：拉汇率
        await fetchRate();
      } else {
        // 切回 CNY：清掉汇率信息
        state.exchangeRate = 1;
        state.amountCNY = '';
        state.rateInfo = null;
        state.rateError = null;
      }
      rerender();
    });

    // 手动改 CNY 金额
    root.querySelector('#txAmountCNY')?.addEventListener('input', (e) => {
      state.amountCNY = sanitizeAmountInput(e.target.value);
      e.target.value = state.amountCNY;
      state.isManualRate = true;
      // 同步更新汇率（让数据保持自洽）
      const orig = parseFloat(state.amount);
      const cny = parseFloat(state.amountCNY);
      if (orig > 0 && cny > 0) {
        state.exchangeRate = cny / orig;
      }
    });

    // 刷新汇率按钮
    root.querySelector('[data-action="refresh-rate"]')?.addEventListener('click', async () => {
      state.isManualRate = false;
      await fetchRate();
      rerender();
    });

    // 分类
    root.querySelector('#txCategory')?.addEventListener('change', (e) => {
      state.categoryId = parseInt(e.target.value, 10);
    });

    // 账户
    root.querySelector('#txAccount')?.addEventListener('change', (e) => {
      state.accountId = parseInt(e.target.value, 10);
    });

    // 日期
    root.querySelector('#txDate')?.addEventListener('change', (e) => {
      const v = e.target.value;
      if (v) state.date = new Date(v);
    });

    // 备注
    root.querySelector('#txNote')?.addEventListener('input', (e) => {
      state.note = e.target.value;
    });

    // 日预算开关
    root.querySelector('#txCountInDaily')?.addEventListener('change', (e) => {
      state.countInDailyBudget = e.target.checked;
    });

    // 取消 / 保存
    root.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      state.sheet.close();
    });
    root.querySelector('[data-action="save"]')?.addEventListener('click', save);
  }

  // ============ 工具函数 ============
  /**
   * 限制输入：只允许数字和一个小数点，最多 2 位小数
   */
  function sanitizeAmountInput(raw) {
    let s = String(raw).replace(/[^\d.]/g, '');
    // 只保留第一个小数点
    const firstDot = s.indexOf('.');
    if (firstDot >= 0) {
      s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
      // 限制小数位数
      const [intPart, decPart = ''] = s.split('.');
      s = intPart + '.' + decPart.slice(0, 2);
    }
    // 去除前导 0（保留 "0.xx" 格式）
    if (s.length > 1 && s.startsWith('0') && s[1] !== '.') {
      s = s.replace(/^0+/, '');
    }
    return s;
  }

  /**
   * Date → datetime-local 输入框需要的格式 'YYYY-MM-DDTHH:mm'
   */
  function formatDateTimeLocal(date) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${M}-${D}T${h}:${m}`;
  }

  function recalculateCNY() {
    const orig = parseFloat(state.amount);
    if (isNaN(orig) || orig <= 0) {
      state.amountCNY = '';
      return;
    }
    const cny = orig * state.exchangeRate;
    state.amountCNY = cny.toFixed(2);
    // 更新输入框（不重渲染，避免抖动）
    const input = state.sheet?.element.querySelector('#txAmountCNY');
    if (input) input.value = state.amountCNY;
  }

  async function fetchRate() {
    state.rateLoading = true;
    state.rateError = null;
    rerender();

    try {
      const result = await window.Repo.ExchangeRates.getSmartRate(state.currency, CURRENCY.CNY);
      state.exchangeRate = result.rate;
      state.rateInfo = result;
      state.rateLoading = false;
      // 重算
      recalculateCNY();
    } catch (err) {
      state.rateError = '获取失败：' + err.message;
      state.rateLoading = false;
    }
  }

  /**
   * 重新渲染整个表单（用于切类型、切币种）
   * 保留焦点和滚动位置太麻烦，简单粗暴重渲
   */
  function rerender() {
    if (!state || !state.sheet) return;
    state.sheet.update(renderForm());
    bindEvents();
  }

  // ============ 保存 ============
  async function save() {
    // 校验
    const amountNum = parseFloat(state.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('请输入金额');
      state.sheet.element.querySelector('#txAmount')?.focus();
      return;
    }
    if (!state.categoryId) {
      alert('请选择分类');
      return;
    }
    if (!state.accountId) {
      alert('请选择账户');
      return;
    }
    // 外币需要 CNY 金额
    let amountCNYNum = amountNum;
    if (state.currency !== CURRENCY.CNY) {
      amountCNYNum = parseFloat(state.amountCNY);
      if (isNaN(amountCNYNum) || amountCNYNum <= 0) {
        alert('请等待汇率获取，或手动输入折算后的 ¥ 金额');
        return;
      }
    }

    try {
      // 写入数据库
      await window.Repo.Transactions.add({
        type: state.type,
        amount: amountNum,
        currency: state.currency,
        amountCNY: state.currency === CURRENCY.CNY ? null : amountCNYNum,
        exchangeRate: state.exchangeRate,
        isManualRate: state.isManualRate,
        accountId: state.accountId,
        categoryId: state.categoryId,
        date: state.date,
        note: state.note.trim(),
        countInDailyBudget: state.type === TX_TYPE.EXPENSE ? state.countInDailyBudget : true
      });

      // 记忆选择
      await window.Repo.Meta.set(META_LAST_ACCOUNT, state.accountId);
      if (state.type === TX_TYPE.EXPENSE) {
        await window.Repo.Meta.set(META_LAST_EXPENSE_CAT, state.categoryId);
      } else {
        await window.Repo.Meta.set(META_LAST_INCOME_CAT, state.categoryId);
      }

      // 触发数据变更事件
      window.dispatchEvent(new CustomEvent('transactionchange'));

      // 回调 + 关闭
      const cb = state.onSaved;
      state.sheet.close();
      if (cb) cb();
    } catch (err) {
      console.error('保存失败:', err);
      alert('保存失败：' + err.message);
    }
  }

  // ============ 暴露 ============
  window.TxForm = { open };
})();
