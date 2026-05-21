class Store {
  constructor(db) {
    this.db = db;
    this.state = {
      boards: [],
      columns: [],
      tasks: [],
      currentBoardId: null,
      selectedTaskId: null,
      focusedColumnId: null,
      view: localStorage.getItem('lastView') || 'kanban',
      calYear: parseInt(localStorage.getItem('calYear')) || new Date().getFullYear(),
      calMonth: parseInt(localStorage.getItem('calMonth')) || (new Date().getMonth() + 1),
    };
    this._listeners = {};
    this._history = [];
  }

  on(event, cb) {
    (this._listeners[event] = this._listeners[event] || []).push(cb);
    return () => { this._listeners[event] = this._listeners[event].filter(x => x !== cb); };
  }

  emit(event, data) {
    (this._listeners[event] || []).forEach(cb => cb(data));
  }

  get board() {
    return this.state.boards.find(b => b.id === this.state.currentBoardId);
  }

  get columns() {
    if (!this.board) return [];
    return this.board.columnOrder
      .map(id => this.state.columns.find(c => c.id === id))
      .filter(Boolean);
  }

  getColumnTasks(columnId) {
    const col = this.state.columns.find(c => c.id === columnId);
    if (!col) return [];
    return col.taskOrder
      .map(id => this.state.tasks.find(t => t.id === id))
      .filter(Boolean);
  }

  getAllTasks() {
    const colIds = new Set(this.columns.map(c => c.id));
    return this.state.tasks.filter(t => colIds.has(t.columnId));
  }

  async loadAll() {
    [this.state.boards, this.state.columns, this.state.tasks] = await Promise.all([
      this.db.getAll('boards'),
      this.db.getAll('columns'),
      this.db.getAll('tasks'),
    ]);
    if (this.state.boards.length === 0) {
      await this._createDefaultBoard();
    }
    this.state.currentBoardId = this.state.boards[0].id;
    this.emit('loaded');
  }

  async _createDefaultBoard() {
    const boardId = crypto.randomUUID();
    const now = Date.now();
    const colDefs = [
      { name: 'ToDo',    color: '#6366f1' },
      { name: 'Doing',   color: '#f59e0b' },
      { name: 'Review',  color: '#8b5cf6' },
      { name: 'Done',    color: '#10b981' },
    ];
    const columns = colDefs.map(def => ({
      id: crypto.randomUUID(),
      boardId,
      name: def.name,
      color: def.color,
      wipLimit: null,
      taskOrder: [],
    }));
    const board = {
      id: boardId,
      name: 'My Board',
      columnOrder: columns.map(c => c.id),
      createdAt: now,
      updatedAt: now,
    };

    const nextFri = this._nextFriday();
    const sampleDefs = [
      { title: 'UIモックアップ作成',    columnId: columns[1].id, priority: 'high',   dueDate: nextFri },
      { title: 'コードレビュー依頼',     columnId: columns[2].id, priority: 'medium', dueDate: nextFri },
      { title: 'DB設計書を書く',        columnId: columns[0].id, priority: 'low',    dueDate: null },
      { title: 'テスト計画を立てる',     columnId: columns[0].id, priority: 'none',   dueDate: null },
    ];
    for (const def of sampleDefs) {
      const task = {
        id: crypto.randomUUID(),
        columnId: def.columnId,
        title: def.title,
        description: '',
        priority: def.priority,
        tags: [],
        links: [],
        attachments: [],
        dueDate: def.dueDate,
        createdAt: now,
        updatedAt: now,
      };
      columns.find(c => c.id === def.columnId).taskOrder.push(task.id);
      this.state.tasks.push(task);
      await this.db.put('tasks', task);
    }

    this.state.boards.push(board);
    this.state.columns.push(...columns);
    await this.db.put('boards', board);
    await this.db.putMany('columns', columns);
  }

  _nextFriday() {
    const today = new Date();
    const dow = today.getDay();
    const daysUntil = dow === 5 ? 7 : (5 - dow + 7) % 7 || 7;
    const fri = new Date(today);
    fri.setDate(today.getDate() + daysUntil);
    fri.setHours(12, 0, 0, 0);
    return fri.getTime();
  }

  _pushHistory(action) {
    this._history.push(action);
    if (this._history.length > 20) this._history.shift();
  }

  async undo() {
    const action = this._history.pop();
    if (!action) return;
    await action.undo();
    this.emit('changed');
  }

  // --- Task CRUD ---

  async createTask(columnId, data) {
    const now = Date.now();
    const task = {
      id: crypto.randomUUID(),
      columnId,
      title: data.title || 'New Task',
      description: data.description || '',
      priority: data.priority || 'none',
      tags: data.tags || [],
      links: data.links || [],
      attachments: data.attachments || [],
      dueDate: data.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.state.tasks.push(task);
    const col = this.state.columns.find(c => c.id === columnId);
    col.taskOrder.push(task.id);
    await Promise.all([this.db.put('tasks', task), this.db.put('columns', col)]);
    this._pushHistory({
      undo: async () => {
        this.state.tasks = this.state.tasks.filter(t => t.id !== task.id);
        col.taskOrder = col.taskOrder.filter(id => id !== task.id);
        await Promise.all([this.db.delete('tasks', task.id), this.db.put('columns', col)]);
      }
    });
    this.emit('changed');
    return task;
  }

  async updateTask(taskId, updates) {
    const task = this.state.tasks.find(t => t.id === taskId);
    if (!task) return;
    const prev = { ...task };
    Object.assign(task, updates, { updatedAt: Date.now() });
    await this.db.put('tasks', task);
    this._pushHistory({
      undo: async () => {
        Object.assign(task, prev);
        await this.db.put('tasks', task);
      }
    });
    this.emit('changed');
    return task;
  }

  async deleteTask(taskId) {
    const task = this.state.tasks.find(t => t.id === taskId);
    if (!task) return;
    const col = this.state.columns.find(c => c.id === task.columnId);
    const prevOrder = [...col.taskOrder];
    this.state.tasks = this.state.tasks.filter(t => t.id !== taskId);
    col.taskOrder = col.taskOrder.filter(id => id !== taskId);
    await Promise.all([this.db.delete('tasks', taskId), this.db.put('columns', col)]);
    this._pushHistory({
      undo: async () => {
        this.state.tasks.push(task);
        col.taskOrder = prevOrder;
        await Promise.all([this.db.put('tasks', task), this.db.put('columns', col)]);
      }
    });
    if (this.state.selectedTaskId === taskId) this.state.selectedTaskId = null;
    this.emit('changed');
  }

  async moveTask(taskId, toColumnId, toIndex) {
    const task = this.state.tasks.find(t => t.id === taskId);
    if (!task) return;
    const fromCol = this.state.columns.find(c => c.id === task.columnId);
    const toCol = this.state.columns.find(c => c.id === toColumnId);
    if (!fromCol || !toCol) return;
    const prevFromOrder = [...fromCol.taskOrder];
    const prevToOrder = [...toCol.taskOrder];
    const prevColumnId = task.columnId;

    fromCol.taskOrder = fromCol.taskOrder.filter(id => id !== taskId);
    if (toIndex === undefined || toIndex < 0) {
      toCol.taskOrder.push(taskId);
    } else {
      toCol.taskOrder.splice(toIndex, 0, taskId);
    }
    task.columnId = toColumnId;
    task.updatedAt = Date.now();

    const saves = [this.db.put('tasks', task), this.db.put('columns', toCol)];
    if (fromCol.id !== toCol.id) saves.push(this.db.put('columns', fromCol));
    await Promise.all(saves);

    this._pushHistory({
      undo: async () => {
        task.columnId = prevColumnId;
        fromCol.taskOrder = prevFromOrder;
        toCol.taskOrder = prevToOrder;
        await Promise.all([
          this.db.put('tasks', task),
          this.db.put('columns', fromCol),
          this.db.put('columns', toCol),
        ]);
      }
    });
    this.emit('changed');
  }

  // --- Column CRUD ---

  async createColumn(name = '新しいカラム') {
    const col = {
      id: crypto.randomUUID(),
      boardId: this.state.currentBoardId,
      name,
      color: '#6366f1',
      wipLimit: null,
      taskOrder: [],
    };
    this.state.columns.push(col);
    this.board.columnOrder.push(col.id);
    await Promise.all([this.db.put('columns', col), this.db.put('boards', this.board)]);
    this.emit('changed');
    return col;
  }

  async updateColumn(colId, updates) {
    const col = this.state.columns.find(c => c.id === colId);
    if (!col) return;
    Object.assign(col, updates);
    await this.db.put('columns', col);
    this.emit('changed');
  }

  async deleteColumn(colId) {
    const col = this.state.columns.find(c => c.id === colId);
    if (!col) return;
    for (const taskId of [...col.taskOrder]) {
      this.state.tasks = this.state.tasks.filter(t => t.id !== taskId);
      await this.db.delete('tasks', taskId);
    }
    this.state.columns = this.state.columns.filter(c => c.id !== colId);
    this.board.columnOrder = this.board.columnOrder.filter(id => id !== colId);
    await Promise.all([this.db.delete('columns', colId), this.db.put('boards', this.board)]);
    this.emit('changed');
  }

  // --- View ---

  setView(view) {
    this.state.view = view;
    localStorage.setItem('lastView', view);
    this.emit('viewChanged', view);
  }

  setCalendarNav(year, month) {
    this.state.calYear = year;
    this.state.calMonth = month;
    localStorage.setItem('calYear', String(year));
    localStorage.setItem('calMonth', String(month));
    this.emit('calNavChanged');
  }

  selectTask(taskId) {
    this.state.selectedTaskId = taskId;
    this.emit('selectionChanged', taskId);
  }

  focusColumn(colId) {
    this.state.focusedColumnId = colId;
    this.emit('focusChanged', colId);
  }
}
