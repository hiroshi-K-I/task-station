class BoardView {
  constructor(store) {
    this.store = store;
    this.container = document.getElementById('columns-container');
  }

  render() {
    this.container.innerHTML = '';
    this.store.columns.forEach(col => this.container.appendChild(this._renderColumn(col)));
    // Restore focused column highlight
    if (this.store.state.focusedColumnId) {
      const el = this.container.querySelector(`[data-col-id="${this.store.state.focusedColumnId}"]`);
      if (el) el.classList.add('focused');
    }
  }

  _renderColumn(col) {
    const tasks = this.store.getColumnTasks(col.id);
    const el = document.createElement('div');
    el.className = 'column';
    el.dataset.colId = col.id;
    if (col.id === this.store.state.focusedColumnId) el.classList.add('focused');

    const wipLabel = col.wipLimit ? `<span class="wip-badge ${tasks.length >= col.wipLimit ? 'wip-over' : ''}">${tasks.length}/${col.wipLimit}</span>` : `<span class="task-count">${tasks.length}</span>`;

    el.innerHTML = `
      <div class="col-header" style="border-top: 3px solid ${col.color}">
        <span class="col-name" contenteditable spellcheck="false">${this._esc(col.name)}</span>
        <div class="col-header-right">
          ${wipLabel}
          <button class="icon-btn col-menu-btn" title="カラムメニュー" aria-label="カラムメニュー">⋯</button>
        </div>
      </div>
      <div class="task-list" data-col-id="${col.id}"></div>
      <button class="add-task-btn" data-col-id="${col.id}">＋ タスク追加</button>
    `;

    const taskList = el.querySelector('.task-list');
    tasks.forEach(task => taskList.appendChild(this._renderTask(task)));

    const nameEl = el.querySelector('.col-name');
    nameEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    });
    nameEl.addEventListener('blur', () => {
      const newName = nameEl.textContent.trim();
      if (newName && newName !== col.name) this.store.updateColumn(col.id, { name: newName });
    });

    el.querySelector('.add-task-btn').addEventListener('click', () => {
      this.store.focusColumn(col.id);
      window.modal.openCreate(col.id);
    });

    el.querySelector('.col-menu-btn').addEventListener('click', e => {
      e.stopPropagation();
      this._showColMenu(e, col);
    });

    el.addEventListener('click', () => this.store.focusColumn(col.id));

    return el;
  }

  _renderTask(task) {
    const el = document.createElement('div');
    el.className = 'task-card';
    if (task.id === this.store.state.selectedTaskId) el.classList.add('selected');
    el.dataset.taskId = task.id;
    el.draggable = true;
    el.tabIndex = 0;

    const PRIORITY_COLORS = {
      none: 'var(--priority-none)',
      low: 'var(--priority-low)',
      medium: 'var(--priority-medium)',
      high: 'var(--priority-high)',
      urgent: 'var(--priority-urgent)',
    };
    const pColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.none;
    const dueStr = task.dueDate ? this._formatDue(task.dueDate) : '';
    const isOverdue = task.dueDate && task.dueDate < Date.now() - 86400000;
    const descPreview = task.description
      ? `<div class="task-desc">${this._esc(task.description.slice(0, 72))}${task.description.length > 72 ? '…' : ''}</div>`
      : '';
    const icons = [
      task.links?.length ? `<span class="task-badge">🔗 ${task.links.length}</span>` : '',
      task.attachments?.length ? `<span class="task-badge">📎 ${task.attachments.length}</span>` : '',
    ].join('');

    el.innerHTML = `
      <div class="task-priority-bar" style="background:${pColor}"></div>
      <div class="task-body">
        <div class="task-title">${this._esc(task.title)}</div>
        ${descPreview}
        <div class="task-footer">
          ${dueStr ? `<span class="task-due${isOverdue ? ' overdue' : ''}">${dueStr}</span>` : ''}
          <span class="task-icons">${icons}</span>
        </div>
      </div>
    `;

    el.addEventListener('click', e => {
      e.stopPropagation();
      this.store.selectTask(task.id);
      window.modal.openEdit(task.id);
    });

    el.addEventListener('focus', () => this.store.selectTask(task.id));

    return el;
  }

  _formatDue(ts) {
    const d = new Date(ts);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return '今日';
    if (diff === 1) return '明日';
    if (diff === -1) return '昨日';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _showColMenu(e, col) {
    document.querySelector('.col-context-menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'col-context-menu';
    menu.innerHTML = `
      <div class="menu-item" data-action="rename">名前を変更</div>
      <div class="menu-item" data-action="color">カラー変更</div>
      <div class="menu-sep"></div>
      <div class="menu-item danger" data-action="delete">カラムを削除</div>
    `;
    const rect = e.target.getBoundingClientRect();
    menu.style.top = rect.bottom + 4 + 'px';
    menu.style.left = rect.left + 'px';
    document.body.appendChild(menu);

    menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
      menu.remove();
      const colEl = this.container.querySelector(`[data-col-id="${col.id}"] .col-name`);
      if (colEl) { colEl.focus(); document.execCommand('selectAll'); }
    });

    menu.querySelector('[data-action="color"]').addEventListener('click', () => {
      menu.remove();
      const input = document.createElement('input');
      input.type = 'color';
      input.value = col.color;
      input.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(input);
      input.click();
      input.addEventListener('change', () => {
        this.store.updateColumn(col.id, { color: input.value });
        input.remove();
      });
      input.addEventListener('blur', () => setTimeout(() => input.remove(), 300));
    });

    menu.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      menu.remove();
      const tasks = this.store.getColumnTasks(col.id);
      const msg = tasks.length
        ? `「${col.name}」を削除しますか？\nタスク ${tasks.length} 件も削除されます。`
        : `「${col.name}」を削除しますか？`;
      if (confirm(msg)) await this.store.deleteColumn(col.id);
    });

    const dismiss = ev => {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', dismiss); }
    };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  }
}
