(async () => {
  // Init
  const db = new TaskDB();
  await db.init();
  const store = new Store(db);
  const boardView = new BoardView(store);
  const calView = new CalendarView(store);
  window.modal = new Modal(store);
  new KeyboardManager(store);
  new DragManager(store);

  const boardSection = document.getElementById('board-view');
  const calSection = document.getElementById('calendar-view');

  function applyView(view) {
    document.querySelectorAll('.view-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.view === view)
    );
    boardSection.classList.toggle('hidden', view !== 'kanban');
    calSection.classList.toggle('hidden', view !== 'calendar');
    if (view === 'kanban') boardView.render();
    else calView.render();
  }

  // Store events
  store.on('loaded', () => applyView(store.state.view));
  store.on('changed', () => {
    if (store.state.view === 'kanban') boardView.render();
    else calView.render();
  });
  store.on('viewChanged', view => applyView(view));
  store.on('calNavChanged', () => calView.render());
  store.on('selectionChanged', () => {
    // Update selected highlight without full re-render
    document.querySelectorAll('.task-card').forEach(el => {
      el.classList.toggle('selected', el.dataset.taskId === store.state.selectedTaskId);
    });
  });
  store.on('focusChanged', colId => {
    document.querySelectorAll('.column').forEach(el => {
      el.classList.toggle('focused', el.dataset.colId === colId);
    });
  });

  // Toolbar buttons
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => store.setView(btn.dataset.view));
  });

  document.getElementById('add-col-btn').addEventListener('click', () => store.createColumn());

  // Export
  document.getElementById('export-btn').addEventListener('click', () => {
    const data = {
      boards: store.state.boards,
      columns: store.state.columns,
      tasks: store.state.tasks,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-station-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  document.getElementById('import-btn').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.boards) await db.putMany('boards', data.boards);
        if (data.columns) await db.putMany('columns', data.columns);
        if (data.tasks) await db.putMany('tasks', data.tasks);
        await store.loadAll();
      } catch {
        alert('インポートに失敗しました。ファイル形式を確認してください。');
      }
    };
    inp.click();
  });

  // Help modal
  document.getElementById('help-btn').addEventListener('click', () => {
    document.getElementById('shortcuts-modal').classList.remove('hidden');
  });
  document.getElementById('shortcuts-modal').addEventListener('click', e => {
    if (e.target.id === 'shortcuts-modal' || e.target.id === 'close-shortcuts-btn') {
      document.getElementById('shortcuts-modal').classList.add('hidden');
    }
  });

  // Board title edit
  const boardTitle = document.getElementById('board-title');
  boardTitle.addEventListener('blur', () => {
    const newName = boardTitle.textContent.trim();
    if (store.board && newName && newName !== store.board.name) {
      store.board.name = newName;
      db.put('boards', store.board);
    }
  });
  boardTitle.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); boardTitle.blur(); }
  });
  store.on('loaded', () => {
    boardTitle.textContent = store.board?.name || 'Task Station';
  });

  // Click outside deselects
  document.addEventListener('click', e => {
    if (!e.target.closest('.task-card') && !e.target.closest('#task-modal')) {
      store.selectTask(null);
    }
  });

  await store.loadAll();
})();
