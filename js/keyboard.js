class KeyboardManager {
  constructor(store) {
    this.store = store;
    this._init();
  }

  _init() {
    document.addEventListener('keydown', e => this._handle(e));
  }

  _handle(e) {
    // Never intercept while typing in inputs or modal is open
    if (this._isTyping(e.target)) return;

    const shortcutsOpen = !document.getElementById('shortcuts-modal').classList.contains('hidden');
    if (shortcutsOpen) {
      if (e.key === 'Escape') document.getElementById('shortcuts-modal').classList.add('hidden');
      return;
    }

    const modalOpen = !document.getElementById('task-modal').classList.contains('hidden');
    if (modalOpen) return;

    const ctrl = e.ctrlKey || e.metaKey;

    switch (e.key) {
      case 'n': case 'N':
        if (!ctrl) { e.preventDefault(); this._newTask(); }
        break;
      case 'c': case 'C':
        if (!ctrl) { e.preventDefault(); this._newColumn(); }
        break;
      case 'v': case 'V':
        if (!ctrl) { e.preventDefault(); this._toggleView(); }
        break;
      case 'e': case 'E':
        if (!ctrl) { e.preventDefault(); this._editSelected(); }
        break;
      case 'd': case 'D':
        if (!ctrl) { e.preventDefault(); this._deleteSelected(); }
        break;
      case 'Enter':
        e.preventDefault();
        this._openSelected();
        break;
      case 'Escape':
        this.store.selectTask(null);
        break;

      // Navigation
      case 'ArrowLeft':
        e.preventDefault();
        if (e.shiftKey) this._moveTaskToCol(-1);
        else this._focusCol(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (e.shiftKey) this._moveTaskToCol(1);
        else this._focusCol(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (e.shiftKey) this._moveTaskInCol(-1);
        else this._selectTask(-1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (e.shiftKey) this._moveTaskInCol(1);
        else this._selectTask(1);
        break;

      // Calendar navigation
      case 'h': case 'H':
        if (!ctrl && this.store.state.view === 'calendar') { e.preventDefault(); this.store.setCalendarNav(...this._monthDelta(-1)); }
        break;
      case 'l': case 'L':
        if (!ctrl && this.store.state.view === 'calendar') { e.preventDefault(); this.store.setCalendarNav(...this._monthDelta(1)); }
        break;

      // Global
      case '?':
        e.preventDefault();
        document.getElementById('shortcuts-modal').classList.remove('hidden');
        break;
      case 'z': case 'Z':
        if (ctrl) { e.preventDefault(); this.store.undo(); }
        break;
      case 'f': case 'F':
        if (ctrl) { e.preventDefault(); document.getElementById('search-input')?.focus(); }
        break;
    }
  }

  _isTyping(el) {
    return el.tagName === 'INPUT'
      || el.tagName === 'TEXTAREA'
      || el.tagName === 'SELECT'
      || el.isContentEditable;
  }

  _newTask() {
    const colId = this.store.state.focusedColumnId || this.store.columns[0]?.id;
    if (colId) window.modal.openCreate(colId);
  }

  _newColumn() {
    this.store.createColumn();
  }

  _toggleView() {
    this.store.setView(this.store.state.view === 'kanban' ? 'calendar' : 'kanban');
  }

  _editSelected() {
    const id = this.store.state.selectedTaskId;
    if (id) window.modal.openEdit(id);
  }

  async _deleteSelected() {
    const id = this.store.state.selectedTaskId;
    if (!id) return;
    const task = this.store.state.tasks.find(t => t.id === id);
    if (task && confirm(`「${task.title}」を削除しますか？\n(Ctrl+Z で元に戻せます)`)) {
      await this.store.deleteTask(id);
    }
  }

  _openSelected() {
    const id = this.store.state.selectedTaskId;
    if (id) window.modal.openEdit(id);
  }

  _focusCol(delta) {
    const cols = this.store.columns;
    if (!cols.length) return;
    const cur = this.store.state.focusedColumnId;
    const idx = Math.max(0, cols.findIndex(c => c.id === cur));
    const newIdx = Math.max(0, Math.min(cols.length - 1, idx + delta));
    this.store.focusColumn(cols[newIdx].id);
  }

  _selectTask(delta) {
    const colId = this.store.state.focusedColumnId || this.store.columns[0]?.id;
    if (!colId) return;
    this.store.focusColumn(colId);
    const tasks = this.store.getColumnTasks(colId);
    if (!tasks.length) return;
    const cur = this.store.state.selectedTaskId;
    const idx = tasks.findIndex(t => t.id === cur);
    const newIdx = idx < 0 ? 0 : Math.max(0, Math.min(tasks.length - 1, idx + delta));
    this.store.selectTask(tasks[newIdx].id);
  }

  async _moveTaskToCol(delta) {
    const id = this.store.state.selectedTaskId;
    if (!id) return;
    const task = this.store.state.tasks.find(t => t.id === id);
    if (!task) return;
    const cols = this.store.columns;
    const idx = cols.findIndex(c => c.id === task.columnId);
    const newIdx = Math.max(0, Math.min(cols.length - 1, idx + delta));
    if (newIdx === idx) return;
    await this.store.moveTask(id, cols[newIdx].id);
    this.store.focusColumn(cols[newIdx].id);
  }

  async _moveTaskInCol(delta) {
    const id = this.store.state.selectedTaskId;
    if (!id) return;
    const task = this.store.state.tasks.find(t => t.id === id);
    if (!task) return;
    const col = this.store.state.columns.find(c => c.id === task.columnId);
    const idx = col.taskOrder.indexOf(id);
    const newIdx = Math.max(0, Math.min(col.taskOrder.length - 1, idx + delta));
    if (newIdx === idx) return;
    await this.store.moveTask(id, task.columnId, newIdx);
  }

  _monthDelta(delta) {
    let { calYear: year, calMonth: month } = this.store.state;
    month += delta;
    if (month < 1) { month = 12; year--; }
    if (month > 12) { month = 1; year++; }
    return [year, month];
  }
}
