  let selected = [];
  let selectedFolders = [];

  // Clipboard management
  const getClipboard = () => {
    const clipboard = localStorage.getItem('videoClipboard');
    return clipboard ? JSON.parse(clipboard) : { mode: null, items: [] };
  };

  const saveClipboard = (clipboard) => {
    localStorage.setItem('videoClipboard', JSON.stringify(clipboard));
  };

  const clearClipboard = () => {
    localStorage.removeItem('videoClipboard');
    document.getElementById('clipboardStatus').textContent = '';
  };

  // Update UI
  function updateUI() {
    const clipboard = getClipboard();
    document.getElementById('selectionInfo').textContent = `Selected: ${selected.length} files, ${selectedFolders.length} folders`;
    document.getElementById('btnPaste').disabled = clipboard.items.length === 0;
    document.getElementById('selectAllCheckbox').checked = 
      (selected.length === document.querySelectorAll('.vid').length && selected.length > 0) ||
      (selectedFolders.length === document.querySelectorAll('.folder-cb').length && selectedFolders.length > 0);
  }

  // Send AJAX request
  async function sendAjax(data) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        value.forEach(v => formData.append(`${key}[]`, v));
      } else {
        formData.append(key, value);
      }
    }
    formData.append('ajax', '1');

    try {
      const response = await fetch('', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        console.error('HTTP Error:', response.status, response.statusText);
        throw new Error(`HTTP error: ${response.status}`);
      }
      const result = await response.json();
      console.log('AJAX Response:', result);
      return result;
    } catch (error) {
      console.error('AJAX Error:', error.message);
      return { success: false, message: error.message };
    }
  }

  // Modal management
  function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
    document.getElementById('modalOverlay').style.display = 'block';
  }

  function hideModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'none';
  }

  // Cut
  async function cut() {
    if (!selected.length) return console.log('No files selected for cut');
    const clipboard = { mode: 'cut', items: [...selected] };
    saveClipboard(clipboard);
    document.getElementById('clipboardStatus').textContent = `${selected.length} file(s) selected for cut`;
    console.log('Cut:', clipboard);
    selected = [];
    updateUI();
    window.location.reload();
  }

  // Copy
  async function copyItems() {
    if (!selected.length) return console.log('No files selected for copy');
    const clipboard = { mode: 'copy', items: [...selected] };
    saveClipboard(clipboard);
    document.getElementById('clipboardStatus').textContent = `${selected.length} file(s) selected for copy`;
    console.log('Copy:', clipboard);
    selected = [];
    updateUI();
    window.location.reload();
  }

  // Paste
  async function paste() {
    const clipboard = getClipboard();
    if (!clipboard.items.length) return console.log('Clipboard is empty');
    console.log('Paste:', { mode: clipboard.mode, items: clipboard.items, dest: CURRENT_FOLDER });

    const result = await sendAjax({
      action: clipboard.mode === 'copy' ? 'paste_copy' : 'paste_cut',
      file_ids: clipboard.items,
      folder_select: CURRENT_FOLDER,
      redirect_to: window.location.pathname + window.location.search
    });

    if (result.success) {
      clearClipboard();
      selected = [];
      console.log(`Pasted ${clipboard.items.length} file(s) to ${CURRENT_FOLDER || 'Root'} successfully`);
      window.location.reload();
    } else {
      console.log(`Paste failed: ${result.message}`);
    }
    updateUI();
  }

  // Rename
  function showRenameModal() {
    if (!selected.length) return console.log('No files selected for rename');
    document.getElementById('renameInput').value = '';
    showModal('renameModal');
  }

  async function rename() {
    const newName = document.getElementById('renameInput').value.trim();
    if (!newName) return console.log('No name entered for rename');
    const result = await sendAjax({
      action: 'rename',
      file_ids: selected,
      new_name: newName,
      redirect_to: window.location.pathname + window.location.search
    });

    if (result.success) {
      selected = [];
      console.log(`Renamed ${result.data.affectedFiles.length} file(s) successfully`);
      hideModal('renameModal');
      window.location.reload();
    } else {
      console.log(`Rename failed: ${result.message}`);
    }
    updateUI();
  }

  // Create Folder
  function showCreateFolderModal() {
    document.getElementById('folderNameInput').value = '';
    document.getElementById('parentFolderSelect').value = CURRENT_FOLDER;
    showModal('createFolderModal');
  }

  async function createFolder() {
    const name = document.getElementById('folderNameInput').value.trim();
    const parent = document.getElementById('parentFolderSelect').value;
    if (!name) return console.log('No folder name entered');
    if (/[\/\\]/.test(name)) return console.log('Invalid folder name');

    const result = await sendAjax({
      action: 'add_folder',
      folder_name: name,
      parent_folder: parent,
      redirect_to: window.location.pathname + window.location.search
    });

    if (result.success) {
      console.log(`Folder "${name}" created successfully`);
      hideModal('createFolderModal');
      window.location.reload();
    } else {
      console.log(`Folder creation failed: ${result.message}`);
    }
  }

  // Batch actions
  async function batch(action) {
    if (!selected.length && !selectedFolders.length) return console.log('No files or folders selected');
    const result = await sendAjax({
      action,
      file_ids: selected,
      folder_ids: selectedFolders,
      redirect_to: window.location.pathname + window.location.search
    });

    if (result.success) {
      selected = [];
      selectedFolders = [];
      console.log(`${action === 'delete' ? 'Deleted' : 'Restored'} ${result.data.affectedFiles.length} file(s) and ${result.data.affectedFolders.length} folder(s) successfully`);
      window.location.reload();
    } else {
      console.log(`${action === 'delete' ? 'Deletion' : 'Restoration'} failed: ${result.message}`);
    }
    updateUI();
  }

  // Select all
  function selectAll(src) {
    selected = [];
    selectedFolders = [];
    document.querySelectorAll('.vid').forEach(cb => {
      cb.checked = src.checked;
      if (cb.checked) selected.push(cb.value);
    });
    document.querySelectorAll('.folder-cb').forEach(cb => {
      cb.checked = src.checked;
      if (cb.checked) selectedFolders.push(cb.value);
    });
    updateUI();
  }

  // Toggle multi-select
  function toggleMultiSelect() {
    const cont = document.getElementById('cont');
    cont.classList.toggle('ms');
    document.getElementById('msToggle').style.background = cont.classList.contains('ms') ? 'var(--accent)' : '';
  }

  // Refresh page
  function refreshPage() {
    window.location.reload();
  }

  // Track checkbox changes
  document.getElementById('cont').addEventListener('change', e => {
    if (e.target.classList.contains('vid')) {
      const id = e.target.value;
      if (e.target.checked) {
        if (!selected.includes(id)) selected.push(id);
      } else {
        selected = selected.filter(x => x !== id);
      }
    } else if (e.target.classList.contains('folder-cb')) {
      const path = e.target.value;
      if (e.target.checked) {
        if (!selectedFolders.includes(path)) selectedFolders.push(path);
      } else {
        selectedFolders = selectedFolders.filter(x => x !== path);
      }
    }
    updateUI();
  });

  // Instant Bin toggle
  document.getElementById('btnBinToggle').addEventListener('click', e => {
    e.preventDefault();
    window.location = e.currentTarget.href;
  });

  // Live search filter
  document.getElementById('search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('tbody tr[data-type="video"], tbody tr[data-type="folder"]').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
    const visibleRows = document.querySelectorAll('tbody tr[data-type="video"]:not([style*="display: none"])').length;
    document.getElementById('totalCount').textContent = visibleRows;
  });

  // Show full ID
  document.addEventListener('click', e => {
    if (e.target.classList.contains('toggle')) {
      e.preventDefault();
      const td = e.target.closest('td');
      td.querySelector('.short').style.display = 'none';
      td.querySelector('.full').style.display = 'inline';
      e.target.style.display = 'none';
    }
  });

  // Row click: folder or video
  document.querySelectorAll('tr[data-type]').forEach(tr => {
    tr.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT' || e.target.classList.contains('toggle'))
        return;
      if (tr.dataset.type === 'folder') {
        window.location = `?folder=${encodeURIComponent(tr.dataset.path)}&view=<?= $viewBin ? 'bin' : 'all' ?>`;
      } else {
        window.location = `watch.php?file_id=${encodeURIComponent(tr.dataset.fid)}`;
      }
    });
  });

  // Custom per-page
  document.getElementById('perPageSelect').addEventListener('change', e => {
    document.getElementById('customInput').style.display =
      e.target.value === 'custom' ? 'inline-block' : 'none';
  });

  // Initialize UI
  updateUI();