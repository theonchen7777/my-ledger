/**
 * 底部抽屉 (Bottom Sheet) 组件
 *
 * 设计目标：
 *   - iOS 原生抽屉风格（顶部圆角 + drag handle）
 *   - 点遮罩 / 下滑 / ESC 关闭
 *   - 支持多个抽屉叠加（z-index 自动管理）
 *   - 简单的 API：UISheet.open({ title, content, footer })
 *
 * 模块四的"加账单"也会用这个组件
 */
(function () {
  'use strict';

  let zIndexCounter = 1000;
  const openSheets = [];

  /**
   * 打开一个抽屉
   * @param {Object} options
   *   - title: 标题
   *   - content: HTML 字符串 或 DOM 元素
   *   - footer: HTML 字符串 或 DOM 元素（可选）
   *   - height: 'auto' | 数字（百分比，如 70 表示 70vh） | 'full'
   *   - onClose: 关闭回调
   *   - dismissible: 是否允许遮罩/下滑关闭，默认 true
   * @returns {{ close, update }}
   */
  function open(options = {}) {
    const {
      title = '',
      content = '',
      footer = null,
      height = 'auto',
      onClose,
      dismissible = true
    } = options;

    const z = zIndexCounter++;

    // 创建 DOM
    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';
    overlay.style.zIndex = z;
    overlay.innerHTML = `
      <div class="sheet-backdrop"></div>
      <div class="sheet-container" data-height="${typeof height === 'number' ? 'percent' : height}">
        <div class="sheet-handle-area">
          <div class="sheet-handle"></div>
        </div>
        ${title ? `<div class="sheet-header"><div class="sheet-title">${title}</div></div>` : ''}
        <div class="sheet-body"></div>
        ${footer ? '<div class="sheet-footer"></div>' : ''}
      </div>
    `;

    // 应用自定义高度
    const container = overlay.querySelector('.sheet-container');
    if (typeof height === 'number') {
      container.style.maxHeight = height + 'vh';
      container.style.height = height + 'vh';
    } else if (height === 'full') {
      container.style.maxHeight = '92vh';
      container.style.height = '92vh';
    }

    // 注入内容
    const body = overlay.querySelector('.sheet-body');
    if (typeof content === 'string') body.innerHTML = content;
    else if (content) body.appendChild(content);

    if (footer) {
      const footerEl = overlay.querySelector('.sheet-footer');
      if (typeof footer === 'string') footerEl.innerHTML = footer;
      else footerEl.appendChild(footer);
    }

    document.body.appendChild(overlay);

    // 触发动画（下一帧加 active 类）
    requestAnimationFrame(() => {
      overlay.classList.add('active');
    });

    // 锁定 body 滚动
    if (openSheets.length === 0) {
      document.body.style.overflow = 'hidden';
    }

    // ============ 关闭方法 ============
    let isClosing = false;
    function close() {
      if (isClosing) return;
      isClosing = true;
      overlay.classList.remove('active');
      overlay.classList.add('closing');
      setTimeout(() => {
        overlay.remove();
        const idx = openSheets.indexOf(handle);
        if (idx >= 0) openSheets.splice(idx, 1);
        if (openSheets.length === 0) {
          document.body.style.overflow = '';
        }
        if (onClose) onClose();
      }, 280);
    }

    // ============ 事件绑定 ============
    if (dismissible) {
      overlay.querySelector('.sheet-backdrop').addEventListener('click', close);
    }

    // 触摸下滑关闭：包含 handle 和 header（扩大可拖拽区域，iOS 标准行为）
    let touchStartY = 0;
    let touchCurrentY = 0;
    let touching = false;

    const dragArea = document.createElement('div');
    // 合并 handle + header 的事件区域
    const handleArea = overlay.querySelector('.sheet-handle-area');
    const headerArea = overlay.querySelector('.sheet-header');

    function onTouchStart(e) {
      if (!dismissible) return;
      touching = true;
      touchStartY = e.touches[0].clientY;
      touchCurrentY = touchStartY;
      container.style.transition = 'none';
    }
    function onTouchMove(e) {
      if (!touching) return;
      touchCurrentY = e.touches[0].clientY;
      const delta = Math.max(0, touchCurrentY - touchStartY);
      container.style.transform = `translateY(${delta}px)`;
    }
    function onTouchEnd() {
      if (!touching) return;
      touching = false;
      container.style.transition = '';
      const delta = touchCurrentY - touchStartY;
      if (delta > 80) {   // 阈值从 100 降到 80，更灵敏
        close();
      } else {
        container.style.transform = '';
      }
    }

    [handleArea, headerArea].filter(Boolean).forEach(el => {
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: true });
      el.addEventListener('touchend', onTouchEnd);
    });

    // ESC 关闭（桌面调试用）
    function handleKeyDown(e) {
      if (e.key === 'Escape' && dismissible) {
        close();
        document.removeEventListener('keydown', handleKeyDown);
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    // 更新内容的方法（用于刷新当日账单列表）
    function update(newContent) {
      if (typeof newContent === 'string') body.innerHTML = newContent;
      else if (newContent) {
        body.innerHTML = '';
        body.appendChild(newContent);
      }
    }

    const handle = { close, update, element: overlay };
    openSheets.push(handle);
    return handle;
  }

  function closeAll() {
    [...openSheets].forEach(h => h.close());
  }

  window.UISheet = { open, closeAll };
})();
