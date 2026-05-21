class CalendarView {
  constructor(store) {
    this.store = store;
    this.container = document.getElementById('calendar-container');
    this._focusedDate = null;
    this._focusedTaskId = null;
  }

  render() {
    const { calYear: year, calMonth: month } = this.store.state;
    this.container.innerHTML = '';

    this.container.appendChild(this._renderHeader(year, month));
    this.container.appendChild(this._renderDayLabels());
    this.container.appendChild(this._renderGrid(year, month));
    this.container.appendChild(this._renderNodue());
  }

  _renderHeader(year, month) {
    const el = document.createElement('div');
    el.className = 'cal-header';
    el.innerHTML = `
      <button class="cal-nav-btn" id="cal-prev" title="前月 (←)">◀</button>
      <h2 class="cal-title">${year}年 ${month}月</h2>
      <button class="cal-nav-btn" id="cal-next" title="翌月 (→)">▶</button>
    `;
    el.querySelector('#cal-prev').addEventListener('click', () => this._navigate(-1));
    el.querySelector('#cal-next').addEventListener('click', () => this._navigate(1));
    return el;
  }

  _renderDayLabels() {
    const el = document.createElement('div');
    el.className = 'cal-day-labels';
    ['月', '火', '水', '木', '金', '土', '日'].forEach((d, i) => {
      const span = document.createElement('div');
      span.className = 'cal-day-label';
      if (i === 5) span.classList.add('sat');
      if (i === 6) span.classList.add('sun');
      span.textContent = d;
      el.appendChild(span);
    });
    return el;
  }

  _renderGrid(year, month) {
    const grid = document.createElement('div');
    grid.className = 'cal-grid';

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Mon=0

    for (let i = 0; i < startDow; i++) {
      const blank = document.createElement('div');
      blank.className = 'cal-cell cal-blank';
      grid.appendChild(blank);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allTasks = this.store.getAllTasks();

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month - 1, d);
      date.setHours(0, 0, 0, 0);
      const dayTasks = allTasks.filter(t => {
        if (!t.dueDate) return false;
        const dd = new Date(t.dueDate);
        return dd.getFullYear() === year && dd.getMonth() === month - 1 && dd.getDate() === d;
      });
      const isToday = date.getTime() === today.getTime();
      const dow = (date.getDay() + 6) % 7; // Mon=0
      grid.appendChild(this._renderDayCell(d, date, dayTasks, isToday, dow));
    }

    return grid;
  }

  _renderDayCell(day, date, tasks, isToday, dow) {
    const el = document.createElement('div');
    el.className = 'cal-cell';
    if (isToday) el.classList.add('cal-today');
    if (dow === 4) el.classList.add('cal-fri');
    if (dow === 5) el.classList.add('cal-sat');
    if (dow === 6) el.classList.add('cal-sun');
    el.dataset.date = date.toISOString().slice(0, 10);
    el.tabIndex = 0;

    const numEl = document.createElement('div');
    numEl.className = 'cal-date-num';
    numEl.textContent = day;
    el.appendChild(numEl);

    const addBtn = document.createElement('button');
    addBtn.className = 'cal-add-btn';
    addBtn.title = 'この日にタスクを追加 (N)';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      this._focusedDate = date;
      const colId = this.store.columns[0]?.id;
      if (colId) window.modal.openCreate(colId, date.getTime() + 43200000);
    });
    el.appendChild(addBtn);

    const maxShow = 3;
    tasks.slice(0, maxShow).forEach(task => el.appendChild(this._renderMiniCard(task)));
    if (tasks.length > maxShow) {
      const more = document.createElement('div');
      more.className = 'cal-more';
      more.textContent = `+${tasks.length - maxShow}件`;
      el.appendChild(more);
    }

    // Keyboard navigation
    el.addEventListener('keydown', e => this._handleCellKeydown(e, date, tasks));

    // Drop target
    el.addEventListener('dragover', e => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', e => {
      if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
    });
    el.addEventListener('drop', async e => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      if (taskId) {
        await this.store.updateTask(taskId, { dueDate: date.getTime() + 43200000 });
      }
    });

    return el;
  }

  _renderMiniCard(task) {
    const el = document.createElement('div');
    el.className = 'cal-task-card';
    el.dataset.taskId = task.id;
    el.draggable = true;
    el.tabIndex = 0;

    const col = this.store.state.columns.find(c => c.id === task.columnId);
    if (col) el.style.borderLeftColor = col.color;

    const PRIORITY_DOTS = { low: '🔵', medium: '🟡', high: '🟠', urgent: '🔴' };
    const dot = PRIORITY_DOTS[task.priority] || '';
    el.innerHTML = `<span class="cal-card-title">${this._esc(task.title)}</span>${dot ? `<span class="cal-card-priority">${dot}</span>` : ''}`;

    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', task.id);
      e.dataTransfer.effectAllowed = 'move';
    });

    el.addEventListener('click', e => {
      e.stopPropagation();
      window.modal.openEdit(task.id);
    });

    return el;
  }

  _renderNodue() {
    const tasks = this.store.getAllTasks().filter(t => !t.dueDate);
    const el = document.createElement('div');
    el.className = 'cal-nodue';

    const titleEl = document.createElement('div');
    titleEl.className = 'cal-nodue-title';
    titleEl.textContent = `期限なし (${tasks.length}件)`;
    el.appendChild(titleEl);

    const list = document.createElement('div');
    list.className = 'cal-nodue-list';
    tasks.forEach(task => list.appendChild(this._renderMiniCard(task)));

    // Drop to remove due date
    list.addEventListener('dragover', e => { e.preventDefault(); list.classList.add('drag-over'); });
    list.addEventListener('dragleave', () => list.classList.remove('drag-over'));
    list.addEventListener('drop', async e => {
      e.preventDefault();
      list.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      if (taskId) await this.store.updateTask(taskId, { dueDate: null });
    });

    el.appendChild(list);
    return el;
  }

  _handleCellKeydown(e, date, tasks) {
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      const colId = this.store.columns[0]?.id;
      if (colId) window.modal.openCreate(colId, date.getTime() + 43200000);
    }
  }

  _navigate(delta) {
    let { calYear: year, calMonth: month } = this.store.state;
    month += delta;
    if (month < 1) { month = 12; year--; }
    if (month > 12) { month = 1; year++; }
    this.store.setCalendarNav(year, month);
  }

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
