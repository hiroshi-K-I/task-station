class Modal {
  constructor(store) {
    this.store = store;
    this._isEdit = false;
    this._currentTaskId = null;
    this._currentColumnId = null;
    this._presetDueDate = null;
    this._links = [];
    this._attachments = [];
    this._exactDueTs = null;
    this.el = document.getElementById('task-modal');
    this._init();
  }

  _init() {
    // Backdrop close
    this.el.addEventListener('click', e => {
      if (e.target === this.el) this.close();
    });

    // Ctrl+Enter submits from anywhere
    this.el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this._submit(); }
    });

    // Due date: 4-digit input
    const dueInput = this._q('#task-due-input');
    dueInput.addEventListener('input', () => {
      dueInput.value = dueInput.value.replace(/\D/g, '').slice(0, 4);
      dueInput.classList.remove('auto-set');
      this._exactDueTs = null;
      if (dueInput.value.length === 4) {
        const d = this._parseMmdd(dueInput.value);
        if (d) {
          this._showDueDisplay(d.getTime(), false);
        } else {
          const disp = this._q('#task-due-display');
          disp.textContent = '無効な日付';
          disp.className = 'due-display due-error';
        }
      } else {
        this._q('#task-due-display').textContent = '';
        this._q('#task-due-display').className = 'due-display';
      }
    });

    // TAB out of due date with empty value → set next Friday
    dueInput.addEventListener('blur', () => {
      if (!dueInput.value) {
        const fri = this._nextFriday();
        this._exactDueTs = fri.getTime();
        dueInput.classList.add('auto-set');
        this._showDueDisplay(fri.getTime(), true);
      }
    });

    // Calendar picker toggle
    this._q('#cal-pick-btn').addEventListener('click', () => this._togglePicker());

    // Priority keyboard nav
    const priorityGroup = this._q('.priority-group');
    priorityGroup.addEventListener('keydown', e => {
      const items = [...priorityGroup.querySelectorAll('.priority-opt')];
      const cur = priorityGroup.querySelector('.priority-opt.active');
      let idx = cur ? items.indexOf(cur) : 0;
      if (e.key === 'ArrowRight') { e.preventDefault(); items[Math.min(idx + 1, items.length - 1)]?.click(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); items[Math.max(idx - 1, 0)]?.click(); }
      if (e.key >= '1' && e.key <= '5') { e.preventDefault(); items[parseInt(e.key) - 1]?.click(); }
    });
    priorityGroup.querySelectorAll('.priority-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        priorityGroup.querySelectorAll('.priority-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
      });
    });

    // Add link
    this._q('#add-link-btn').addEventListener('click', () => this._addLink());
    this._q('#link-url-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this._addLink(); }
    });

    // Paste image
    this.el.addEventListener('paste', e => this._handlePaste(e));

    // Drop image on attachment area
    const dropArea = this._q('#task-attachments');
    dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('drag-over'); });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
    dropArea.addEventListener('drop', async e => {
      e.preventDefault();
      dropArea.classList.remove('drag-over');
      const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'));
      for (const f of files) await this._addAttachmentFile(f);
    });

    // File picker
    this._q('#attach-file-btn').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.multiple = true;
      inp.onchange = async e => {
        for (const f of [...e.target.files]) await this._addAttachmentFile(f);
      };
      inp.click();
    });

    // Submit / cancel
    this._q('#task-submit-btn').addEventListener('click', () => this._submit());
    this._q('#task-cancel-btn').addEventListener('click', () => this.close());
    this._q('#task-cancel-btn-footer').addEventListener('click', () => this.close());
  }

  openCreate(columnId, presetDueDate = null) {
    this._isEdit = false;
    this._currentTaskId = null;
    this._currentColumnId = columnId;
    this._presetDueDate = presetDueDate;
    this._reset();
    if (presetDueDate) {
      const d = new Date(presetDueDate);
      const mmdd = String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      this._q('#task-due-input').value = mmdd;
      this._exactDueTs = presetDueDate;
      this._showDueDisplay(presetDueDate, false);
    }
    this._q('#modal-title').textContent = 'タスク作成';
    this._q('#task-submit-btn').textContent = '登録';
    this.el.classList.remove('hidden');
    this.el.classList.add('visible');
    this._q('#task-title-input').focus();
  }

  openEdit(taskId) {
    const task = this.store.state.tasks.find(t => t.id === taskId);
    if (!task) return;
    this._isEdit = true;
    this._currentTaskId = taskId;
    this._currentColumnId = task.columnId;
    this._presetDueDate = null;
    this._reset();
    this._populate(task);
    this._q('#modal-title').textContent = 'タスク編集';
    this._q('#task-submit-btn').textContent = '更新';
    this.el.classList.remove('hidden');
    this.el.classList.add('visible');
    this._q('#task-title-input').focus();
  }

  close() {
    this.el.classList.remove('visible');
    this.el.classList.add('hidden');
    this._currentTaskId = null;
    this._currentColumnId = null;
    this._hidePicker();
  }

  async _submit() {
    const title = this._q('#task-title-input').value.trim();
    if (!title) {
      this._q('#task-title-input').focus();
      this._q('#task-title-input').classList.add('field-error');
      setTimeout(() => this._q('#task-title-input').classList.remove('field-error'), 800);
      return;
    }

    const description = this._q('#task-desc-input').value;
    const priority = this._q('.priority-opt.active')?.dataset.priority || 'none';
    const dueDate = this._resolveDueDate();

    if (this._isEdit && this._currentTaskId) {
      await this.store.updateTask(this._currentTaskId, {
        title, description, priority, dueDate,
        links: [...this._links],
        attachments: [...this._attachments],
      });
    } else {
      await this.store.createTask(this._currentColumnId, {
        title, description, priority, dueDate,
        links: [...this._links],
        attachments: [...this._attachments],
      });
    }
    this.close();
  }

  _reset() {
    this._exactDueTs = null;
    this._q('#task-title-input').value = '';
    this._q('#task-desc-input').value = '';
    this._q('#task-due-input').value = '';
    this._q('#task-due-input').className = 'due-input';
    this._q('#task-due-display').textContent = '';
    this._q('#task-due-display').className = 'due-display';
    this._q('.priority-group').querySelectorAll('.priority-opt').forEach(o => o.classList.remove('active'));
    this._q('.priority-opt[data-priority="none"]').classList.add('active');
    this._links = [];
    this._attachments = [];
    this._q('#links-list').innerHTML = '';
    this._q('#attachments-list').innerHTML = '';
    this._hidePicker();
  }

  _populate(task) {
    this._q('#task-title-input').value = task.title;
    this._q('#task-desc-input').value = task.description || '';
    if (task.dueDate) {
      const d = new Date(task.dueDate);
      this._q('#task-due-input').value =
        String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      this._showDueDisplay(task.dueDate, false);
    }
    const pOpt = this._q(`.priority-opt[data-priority="${task.priority}"]`);
    if (pOpt) {
      this._q('.priority-group').querySelectorAll('.priority-opt').forEach(o => o.classList.remove('active'));
      pOpt.classList.add('active');
    }
    this._links = task.links ? [...task.links] : [];
    this._attachments = task.attachments ? [...task.attachments] : [];
    this._renderLinks();
    this._renderAttachments();
  }

  _showDueDisplay(ts, isAuto) {
    const d = new Date(ts);
    const disp = this._q('#task-due-display');
    disp.textContent = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    disp.className = 'due-display' + (isAuto ? ' due-auto' : '');
    if (isAuto) disp.title = '次の金曜日を自動設定しました (変更可)';
    else disp.title = '';
  }

  _resolveDueDate() {
    // Exact timestamp takes priority (set by calendar picker, preset, or auto-Friday)
    if (this._exactDueTs !== null) return this._exactDueTs;
    const val = this._q('#task-due-input').value;
    if (val.length === 4) {
      const d = this._parseMmdd(val);
      if (d) return d.getTime();
    }
    return null;
  }

  _parseMmdd(val) {
    const mm = parseInt(val.slice(0, 2), 10);
    const dd = parseInt(val.slice(2, 4), 10);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const now = new Date();
    const candidate = new Date(now.getFullYear(), mm - 1, dd);
    if (candidate.getMonth() !== mm - 1) return null; // e.g. Feb 30
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (candidate < today) candidate.setFullYear(now.getFullYear() + 1);
    return candidate;
  }

  _nextFriday() {
    const today = new Date();
    const dow = today.getDay();
    const daysUntil = dow === 5 ? 7 : (5 - dow + 7) % 7 || 7;
    const fri = new Date(today);
    fri.setDate(today.getDate() + daysUntil);
    fri.setHours(12, 0, 0, 0);
    return fri;
  }

  // --- Links ---

  _addLink() {
    const urlInput = this._q('#link-url-input');
    const titleInput = this._q('#link-title-input');
    const url = urlInput.value.trim();
    if (!url) return;
    this._links.push({ id: crypto.randomUUID(), url, title: titleInput.value.trim() || url });
    urlInput.value = '';
    titleInput.value = '';
    this._renderLinks();
    urlInput.focus();
  }

  _renderLinks() {
    const list = this._q('#links-list');
    list.innerHTML = '';
    this._links.forEach((link, i) => {
      const item = document.createElement('div');
      item.className = 'link-item';
      item.innerHTML = `
        <a href="${this._esc(link.url)}" target="_blank" rel="noopener">${this._esc(link.title)}</a>
        <button class="remove-btn" title="削除">×</button>
      `;
      item.querySelector('.remove-btn').addEventListener('click', () => {
        this._links.splice(i, 1);
        this._renderLinks();
      });
      list.appendChild(item);
    });
  }

  // --- Attachments ---

  async _handlePaste(e) {
    const items = [...(e.clipboardData?.items || [])];
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) await this._addAttachmentFile(file);
    }
  }

  async _addAttachmentFile(file) {
    if (file.size > 5 * 1024 * 1024) {
      alert(`「${file.name}」は5MBを超えています。`);
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    this._attachments.push({ id: crypto.randomUUID(), name: file.name, dataUrl, size: file.size });
    this._renderAttachments();
  }

  _renderAttachments() {
    const list = this._q('#attachments-list');
    list.innerHTML = '';
    this._attachments.forEach((att, i) => {
      const item = document.createElement('div');
      item.className = 'attachment-item';
      item.innerHTML = `
        <img src="${att.dataUrl}" alt="${this._esc(att.name)}" class="att-thumb">
        <div class="att-name">${this._esc(att.name)}</div>
        <button class="remove-btn" title="削除">×</button>
      `;
      item.querySelector('.remove-btn').addEventListener('click', () => {
        this._attachments.splice(i, 1);
        this._renderAttachments();
      });
      item.querySelector('.att-thumb').addEventListener('click', () => {
        window.open(att.dataUrl, '_blank');
      });
      list.appendChild(item);
    });
  }

  // --- Calendar picker ---

  _togglePicker() {
    const picker = this._q('#cal-picker');
    if (picker.classList.contains('hidden')) {
      this._renderPicker();
      picker.classList.remove('hidden');
    } else {
      this._hidePicker();
    }
  }

  _hidePicker() {
    this._q('#cal-picker')?.classList.add('hidden');
  }

  _renderPicker() {
    const picker = this._q('#cal-picker');
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;

    const draw = () => {
      picker.innerHTML = '';
      const header = document.createElement('div');
      header.className = 'picker-header';
      header.innerHTML = `
        <button class="picker-nav" id="pp">◀</button>
        <span>${year}年${month}月</span>
        <button class="picker-nav" id="pn">▶</button>
      `;
      header.querySelector('#pp').addEventListener('click', () => { month--; if (month < 1) { month = 12; year--; } draw(); });
      header.querySelector('#pn').addEventListener('click', () => { month++; if (month > 12) { month = 1; year++; } draw(); });
      picker.appendChild(header);

      const labels = document.createElement('div');
      labels.className = 'picker-labels';
      '月火水木金土日'.split('').forEach((d, i) => {
        const span = document.createElement('span');
        span.textContent = d;
        if (i === 5) span.style.color = 'var(--cal-sat)';
        if (i === 6) span.style.color = 'var(--cal-sun)';
        labels.appendChild(span);
      });
      picker.appendChild(labels);

      const grid = document.createElement('div');
      grid.className = 'picker-grid';
      const first = new Date(year, month - 1, 1);
      const last = new Date(year, month, 0);
      const startDow = (first.getDay() + 6) % 7;

      for (let i = 0; i < startDow; i++) {
        grid.appendChild(document.createElement('span'));
      }
      for (let d = 1; d <= last.getDate(); d++) {
        const btn = document.createElement('button');
        btn.textContent = d;
        btn.className = 'picker-day';
        const dow = (new Date(year, month - 1, d).getDay() + 6) % 7;
        if (dow === 5) btn.classList.add('sat');
        if (dow === 6) btn.classList.add('sun');
        btn.addEventListener('click', () => {
          const selected = new Date(year, month - 1, d, 12, 0, 0);
          const mmdd = String(month).padStart(2, '0') + String(d).padStart(2, '0');
          const dueInput = this._q('#task-due-input');
          dueInput.value = mmdd;
          dueInput.classList.remove('auto-set');
          this._exactDueTs = selected.getTime();
          this._showDueDisplay(selected.getTime(), false);
          this._hidePicker();
        });
        grid.appendChild(btn);
      }
      picker.appendChild(grid);
    };
    draw();
  }

  _q(sel) { return this.el.querySelector(sel); }

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
