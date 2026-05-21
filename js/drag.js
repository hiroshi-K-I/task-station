class DragManager {
  constructor(store) {
    this.store = store;
    this._dragTaskId = null;
    this._init();
  }

  _init() {
    document.addEventListener('dragstart', e => {
      const card = e.target.closest('.task-card');
      if (!card) return;
      this._dragTaskId = card.dataset.taskId;
      e.dataTransfer.setData('text/plain', this._dragTaskId);
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => card.classList.add('dragging'));
    });

    document.addEventListener('dragend', e => {
      const card = e.target.closest('.task-card');
      if (card) card.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      document.querySelector('.drop-placeholder')?.remove();
      this._dragTaskId = null;
    });

    document.addEventListener('dragover', e => {
      const taskList = e.target.closest('.task-list');
      if (!taskList) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      taskList.classList.add('drag-over');

      const afterEl = this._getAfterElement(taskList, e.clientY);
      let ph = document.querySelector('.drop-placeholder');
      if (!ph) {
        ph = document.createElement('div');
        ph.className = 'drop-placeholder';
      }
      if (!afterEl) taskList.appendChild(ph);
      else taskList.insertBefore(ph, afterEl);
    });

    document.addEventListener('dragleave', e => {
      const taskList = e.target.closest('.task-list');
      if (taskList && !taskList.contains(e.relatedTarget)) {
        taskList.classList.remove('drag-over');
      }
    });

    document.addEventListener('drop', async e => {
      const taskList = e.target.closest('.task-list');
      if (!taskList || !this._dragTaskId) return;
      e.preventDefault();

      const colId = taskList.dataset.colId;
      const ph = document.querySelector('.drop-placeholder');
      let toIndex = -1;

      if (ph) {
        const siblings = [...taskList.querySelectorAll('.task-card:not(.dragging)')];
        toIndex = siblings.indexOf(ph);
        if (toIndex < 0) toIndex = siblings.length;
        ph.remove();
      }

      taskList.classList.remove('drag-over');
      await this.store.moveTask(this._dragTaskId, colId, toIndex >= 0 ? toIndex : undefined);
    });
  }

  _getAfterElement(container, y) {
    const draggables = [...container.querySelectorAll('.task-card:not(.dragging)')];
    return draggables.reduce((closest, el) => {
      const box = el.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: el };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
}
