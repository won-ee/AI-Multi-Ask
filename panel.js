document.addEventListener('DOMContentLoaded', () => {
  const uniQ = document.getElementById('uniQ');
  const uniSend = document.getElementById('uniSend');
  const cardsEl = document.getElementById('cards');
  const toastsEl = document.getElementById('toasts');
  const chips = document.querySelectorAll('.chip');
  const filterBtn = document.getElementById('filterBtn');
  const filterDropdown = document.getElementById('filterDropdown');
  const filterItems = document.querySelectorAll('.filter-item');
  const favList = document.getElementById('favList');
  const favInput = document.getElementById('favInput');
  const favAddBtn = document.getElementById('favAddBtn');
  const histList = document.getElementById('histList');
  const histClear = document.getElementById('histClear');
  const autoSwitchToggle = document.getElementById('autoSwitchToggle');
  const themeBtn = document.getElementById('themeBtn');
  const themeIcon = document.getElementById('themeIcon');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsDropdown = document.getElementById('settingsDropdown');
  const sysPromptGlobal = document.getElementById('sysPromptGlobal');
  const sysPromptClear = document.getElementById('sysPromptClear');
  const sysPromptSave = document.getElementById('sysPromptSave');
  const sdPresets = document.querySelectorAll('.sd-preset');
  const sdTabs = document.querySelectorAll('.sd-tab');
  const sdGlobalPanel = document.getElementById('sdGlobal');
  const sdEachPanel = document.getElementById('sdEach');

  const ALL_SERVICES = [
    { id: 'chatgpt',    name: 'ChatGPT',    color: 'var(--chatgpt)' },
    { id: 'claude',     name: 'Claude',      color: 'var(--claude)' },
    { id: 'gemini',     name: 'Gemini',      color: 'var(--gemini)' },
    { id: 'perplexity', name: 'Perplexity',  color: 'var(--perplexity)' }
  ];

  const COLOR_MAP = {
    chatgpt: 'var(--chatgpt)', claude: 'var(--claude)',
    gemini: 'var(--gemini)', perplexity: 'var(--perplexity)'
  };

  const DEFAULT_FAVS = ['이전 답변을 더 자세히 설명해줘'];

  let favorites = [];
  let history = [];
  let lastFocusedInput = null;
  let autoSwitch = false;
  let cardOrder = ['chatgpt', 'claude', 'gemini', 'perplexity'];
  let visibleCards = ['chatgpt', 'claude', 'gemini', 'perplexity'];
  let systemPrompt = '';
  let sysPromptMode = 'global'; // 'global' or 'each'
  let sysPromptsEach = { chatgpt: '', claude: '', gemini: '', perplexity: '' };
  let theme = '';
  let dragSrcId = null;

  // ══════════════════════════════════════
  //  Storage
  // ══════════════════════════════════════
  function loadData() {
    chrome.storage.local.get(['favorites', 'history', 'autoSwitch', 'cardOrder', 'visibleCards', 'systemPrompt', 'sysPromptMode', 'sysPromptsEach', 'theme'], (data) => {
      favorites = data.favorites || [...DEFAULT_FAVS];
      history = data.history || [];
      autoSwitch = data.autoSwitch !== undefined ? data.autoSwitch : true;
      cardOrder = data.cardOrder || ['chatgpt', 'claude', 'gemini', 'perplexity'];
      visibleCards = data.visibleCards || ['chatgpt', 'claude', 'gemini', 'perplexity'];
      systemPrompt = data.systemPrompt || '';
      sysPromptMode = data.sysPromptMode || 'global';
      sysPromptsEach = data.sysPromptsEach || { chatgpt: '', claude: '', gemini: '', perplexity: '' };
      theme = data.theme || (window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
      applyTheme();
      renderFavorites();
      renderHistory();
      updateToggleUI();
      updateSysPromptUI();
      applyFilter();
      buildCards();
      checkTabs();
    });
  }

  function saveFavorites() { chrome.storage.local.set({ favorites }); }
  function saveHistory() { chrome.storage.local.set({ history }); }
  function saveCardOrder() { chrome.storage.local.set({ cardOrder }); }
  function saveVisibleCards() { chrome.storage.local.set({ visibleCards }); }

  // ══════════════════════════════════════
  //  Filter Dropdown
  // ══════════════════════════════════════
  filterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    filterDropdown.classList.toggle('open');
  });

  filterItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = item.dataset.t;
      item.classList.toggle('on');

      if (item.classList.contains('on')) {
        if (!visibleCards.includes(t)) visibleCards.push(t);
      } else {
        visibleCards = visibleCards.filter(v => v !== t);
      }

      saveVisibleCards();
      applyFilter();
    });
  });

  function applyFilter() {
    // Update filter dropdown checkmarks
    filterItems.forEach(item => {
      item.classList.toggle('on', visibleCards.includes(item.dataset.t));
    });

    // Filter button indicator
    const allOn = visibleCards.length === ALL_SERVICES.length;
    filterBtn.classList.toggle('has-filter', !allOn);

    // Show/hide chips
    chips.forEach(c => {
      const t = c.dataset.t;
      const visible = visibleCards.includes(t);
      c.classList.toggle('filtered', !visible);
      // Keep active state synced
      if (visible) {
        c.classList.add('active');
      }
    });

    // Show/hide cards
    document.querySelectorAll('.ai-card').forEach(card => {
      card.classList.toggle('hidden', !visibleCards.includes(card.dataset.service));
    });
  }

  // ══════════════════════════════════════
  //  Settings Dropdown (System Prompt)
  // ══════════════════════════════════════
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsDropdown.classList.toggle('open');
    filterDropdown.classList.remove('open');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-wrap')) filterDropdown.classList.remove('open');
    if (!e.target.closest('.settings-wrap')) settingsDropdown.classList.remove('open');
  });

  // Mode tabs
  sdTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sdTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      sdGlobalPanel.style.display = mode === 'global' ? 'block' : 'none';
      sdEachPanel.style.display = mode === 'each' ? 'block' : 'none';
      sysPromptMode = mode;
    });
  });

  // Presets fill global input
  sdPresets.forEach(p => {
    p.addEventListener('click', () => {
      sysPromptGlobal.value = p.dataset.v;
    });
  });

  sysPromptSave.addEventListener('click', () => {
    sysPromptMode = document.querySelector('.sd-tab.active').dataset.mode;
    systemPrompt = sysPromptGlobal.value.trim();
    sysPromptsEach = {
      chatgpt: document.getElementById('sysPrompt-chatgpt').value.trim(),
      claude: document.getElementById('sysPrompt-claude').value.trim(),
      gemini: document.getElementById('sysPrompt-gemini').value.trim(),
      perplexity: document.getElementById('sysPrompt-perplexity').value.trim()
    };
    chrome.storage.local.set({ systemPrompt, sysPromptMode, sysPromptsEach });
    updateSysPromptUI();
    settingsDropdown.classList.remove('open');
    addToast('시스템 프롬프트가 저장되었습니다.', 'ok');
  });

  sysPromptClear.addEventListener('click', () => {
    sysPromptGlobal.value = '';
    document.getElementById('sysPrompt-chatgpt').value = '';
    document.getElementById('sysPrompt-claude').value = '';
    document.getElementById('sysPrompt-gemini').value = '';
    document.getElementById('sysPrompt-perplexity').value = '';
    systemPrompt = '';
    sysPromptsEach = { chatgpt: '', claude: '', gemini: '', perplexity: '' };
    chrome.storage.local.set({ systemPrompt, sysPromptsEach });
    updateSysPromptUI();
    addToast('시스템 프롬프트가 초기화되었습니다.', 'ok');
  });

  function updateSysPromptUI() {
    sysPromptGlobal.value = systemPrompt;
    document.getElementById('sysPrompt-chatgpt').value = sysPromptsEach.chatgpt || '';
    document.getElementById('sysPrompt-claude').value = sysPromptsEach.claude || '';
    document.getElementById('sysPrompt-gemini').value = sysPromptsEach.gemini || '';
    document.getElementById('sysPrompt-perplexity').value = sysPromptsEach.perplexity || '';

    // Activate correct tab
    sdTabs.forEach(t => t.classList.toggle('active', t.dataset.mode === sysPromptMode));
    sdGlobalPanel.style.display = sysPromptMode === 'global' ? 'block' : 'none';
    sdEachPanel.style.display = sysPromptMode === 'each' ? 'block' : 'none';

    // Highlight button if any prompt is set
    const hasAny = systemPrompt || Object.values(sysPromptsEach).some(v => v);
    settingsBtn.classList.toggle('has-sys', hasAny);
  }

  function applySystemPrompt(question, target) {
    let prompt = '';
    if (sysPromptMode === 'each' && target) {
      prompt = sysPromptsEach[target] || '';
    } else {
      prompt = systemPrompt;
    }
    if (!prompt) return question;
    return prompt + '\n\n' + question;
  }

  // ══════════════════════════════════════
  //  Theme Toggle
  // ══════════════════════════════════════
  themeBtn.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    chrome.storage.local.set({ theme });
    applyTheme();
  });

  function applyTheme() {
    document.body.classList.remove('dark', 'light');
    document.body.classList.add(theme);
    // Sun icon for dark mode (click to go light), Moon icon for light mode (click to go dark)
    if (theme === 'dark') {
      themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
    } else {
      themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    }
  }

  autoSwitchToggle.addEventListener('click', () => {
    autoSwitch = !autoSwitch;
    chrome.storage.local.set({ autoSwitch });
    updateToggleUI();
  });

  function updateToggleUI() {
    autoSwitchToggle.classList.toggle('on', autoSwitch);
  }

  // ══════════════════════════════════════
  //  Fill Input
  // ══════════════════════════════════════
  function fillInput(text) {
    if (lastFocusedInput) {
      const ta = document.getElementById(`q-${lastFocusedInput}`);
      if (ta) {
        ta.value = text;
        ta.focus();
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 80) + 'px';
        return;
      }
    }
    uniQ.value = text;
    uniQ.focus();
    uniQ.style.height = 'auto';
    uniQ.style.height = Math.min(uniQ.scrollHeight, 100) + 'px';
  }

  // ══════════════════════════════════════
  //  Favorites
  // ══════════════════════════════════════
  function renderFavorites() {
    favList.innerHTML = '';
    favorites.forEach((text, idx) => {
      const chip = document.createElement('div');
      chip.className = 'fav-chip';
      chip.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span class="fav-text">${escHTML(text)}</span>
        <span class="fav-del" data-idx="${idx}">✕</span>
      `;
      chip.querySelector('.fav-text').addEventListener('click', () => fillInput(text));
      chip.querySelector('.fav-del').addEventListener('click', (e) => {
        e.stopPropagation();
        favorites.splice(idx, 1);
        saveFavorites();
        renderFavorites();
      });
      favList.appendChild(chip);
    });
  }

  favAddBtn.addEventListener('click', addFavorite);
  favInput.addEventListener('keydown', e => { if (e.key === 'Enter') addFavorite(); });

  function addFavorite() {
    const text = favInput.value.trim();
    if (!text) return;
    if (favorites.includes(text)) { addToast('이미 등록된 프롬프트입니다.', 'er'); return; }
    favorites.push(text);
    saveFavorites();
    renderFavorites();
    favInput.value = '';
    addToast('즐겨찾기에 추가되었습니다.', 'ok');
  }

  // ══════════════════════════════════════
  //  History
  // ══════════════════════════════════════
  function renderHistory() {
    histList.innerHTML = '';
    if (history.length === 0) {
      histList.innerHTML = '<div class="hist-empty">아직 전송한 질문이 없습니다.</div>';
      return;
    }
    const items = history.slice(-20).reverse();
    items.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'hist-item';
      const dots = entry.targets.map(t =>
        `<div class="hist-dot" style="background:${COLOR_MAP[t] || 'var(--tx3)'}"></div>`
      ).join('');
      item.innerHTML = `
        <div class="hist-targets">${dots}</div>
        <div class="hist-text">${escHTML(entry.question)}</div>
        <div class="hist-time">${entry.time}</div>
      `;
      item.addEventListener('click', () => fillInput(entry.question));
      histList.appendChild(item);
    });
  }

  function addToHistory(question, targets) {
    const now = new Date();
    const time = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    history.push({ question, targets, time });
    if (history.length > 50) history = history.slice(-50);
    saveHistory();
    renderHistory();
  }

  histClear.addEventListener('click', () => {
    history = [];
    saveHistory();
    renderHistory();
    addToast('히스토리가 삭제되었습니다.', 'ok');
  });

  // ══════════════════════════════════════
  //  AI Cards (drag & drop)
  // ══════════════════════════════════════
  function buildCards() {
    cardsEl.innerHTML = '';
    const ordered = cardOrder.map(id => ALL_SERVICES.find(s => s.id === id)).filter(Boolean);

    ordered.forEach(svc => {
      const card = document.createElement('div');
      card.className = 'ai-card';
      card.dataset.service = svc.id;
      card.draggable = true;
      if (!visibleCards.includes(svc.id)) card.classList.add('hidden');

      card.innerHTML = `
        <div class="card-top" data-t="${svc.id}" title="${svc.name} 탭으로 이동">
          <div class="card-drag" title="드래그하여 순서 변경">
            <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
          </div>
          <div class="card-dot" style="background:${svc.color}"></div>
          <div class="card-name">${svc.name}</div>
          <div class="tab-status-dot" id="status-${svc.id}" style="background:${svc.color}"></div>
          <button class="card-copy" data-t="${svc.id}" title="마지막 응답 복사">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M12.5 3C13.3284 3 14 3.67157 14 4.5V6H15.5C16.3284 6 17 6.67157 17 7.5V15.5C17 16.3284 16.3284 17 15.5 17H7.5C6.67157 17 6 16.3284 6 15.5V14H4.5C3.67157 14 3 13.3284 3 12.5V4.5C3 3.67157 3.67157 3 4.5 3H12.5ZM14 12.5C14 13.3284 13.3284 14 12.5 14H7V15.5C7 15.7761 7.22386 16 7.5 16H15.5C15.7761 16 16 15.7761 16 15.5V7.5C16 7.22386 15.7761 7 15.5 7H14V12.5ZM4.5 4C4.22386 4 4 4.22386 4 4.5V12.5C4 12.7761 4.22386 13 4.5 13H12.5C12.7761 13 13 12.7761 13 12.5V4.5C13 4.22386 12.7761 4 12.5 4H4.5Z"/></svg>
            복사
          </button>
        </div>
        <div class="card-input">
          <textarea id="q-${svc.id}" placeholder="${svc.name}에게 개별 질문... (Enter 전송)" rows="1"></textarea>
          <button class="card-send" data-t="${svc.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      `;
      cardsEl.appendChild(card);

      // Drag events
      card.addEventListener('dragstart', (e) => {
        dragSrcId = svc.id;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.ai-card').forEach(c => c.classList.remove('drag-over'));
        dragSrcId = null;
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (card.dataset.service !== dragSrcId) card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (!dragSrcId || dragSrcId === svc.id) return;
        const fromIdx = cardOrder.indexOf(dragSrcId);
        const toIdx = cardOrder.indexOf(svc.id);
        if (fromIdx < 0 || toIdx < 0) return;
        cardOrder.splice(fromIdx, 1);
        cardOrder.splice(toIdx, 0, dragSrcId);
        saveCardOrder();
        buildCards();
        checkTabs();
      });
    });

    // Tab switch
    document.querySelectorAll('.card-top').forEach(top => {
      top.addEventListener('click', (e) => {
        if (e.target.closest('.card-copy') || e.target.closest('.card-drag')) return;
        chrome.runtime.sendMessage({ type: 'SWITCH_TAB', target: top.dataset.t });
      });
    });

    // Copy response
    document.querySelectorAll('.card-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = btn.dataset.t;
        const svcName = ALL_SERVICES.find(s => s.id === t)?.name || t;
        addToast(`${svcName} 응답 복사 중...`, 'in');
        chrome.runtime.sendMessage({ type: 'COPY_RESPONSE', target: t }, (res) => {
          if (res && res.text) {
            navigator.clipboard.writeText(res.text).then(() => {
              btn.classList.add('copied');
              btn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M15.19 5.11C15.37 4.96 15.63 4.96 15.82 5.12C16.01 5.27 16.05 5.53 15.94 5.74L15.88 5.82L8.38 14.82C8.29 14.93 8.16 14.99 8.02 15C7.88 15.01 7.75 14.95 7.65 14.85L4.15 11.35L4.08 11.28C3.95 11.08 3.98 10.82 4.15 10.65C4.32 10.48 4.58 10.45 4.78 10.58L4.85 10.65L7.97 13.76L15.12 5.18L15.19 5.11Z"/></svg> 복사됨`;
              addToast(`${svcName} 응답이 클립보드에 복사되었습니다.`, 'ok');
              setTimeout(() => {
                btn.classList.remove('copied');
                btn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M12.5 3C13.3284 3 14 3.67157 14 4.5V6H15.5C16.3284 6 17 6.67157 17 7.5V15.5C17 16.3284 16.3284 17 15.5 17H7.5C6.67157 17 6 16.3284 6 15.5V14H4.5C3.67157 14 3 13.3284 3 12.5V4.5C3 3.67157 3.67157 3 4.5 3H12.5ZM14 12.5C14 13.3284 13.3284 14 12.5 14H7V15.5C7 15.7761 7.22386 16 7.5 16H15.5C15.7761 16 16 15.7761 16 15.5V7.5C16 7.22386 15.7761 7 15.5 7H14V12.5ZM4.5 4C4.22386 4 4 4.22386 4 4.5V12.5C4 12.7761 4.22386 13 4.5 13H12.5C12.7761 13 13 12.7761 13 12.5V4.5C13 4.22386 12.7761 4 12.5 4H4.5Z"/></svg> 복사`;
              }, 2000);
            });
          } else {
            addToast(`${svcName} 응답을 가져올 수 없습니다. 탭을 확인해주세요.`, 'er');
          }
        });
      });
    });

    // Individual send
    document.querySelectorAll('.card-send').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.t;
        const ta = document.getElementById(`q-${t}`);
        const question = ta.value.trim();
        if (!question) { addToast('질문을 입력해주세요.', 'er'); return; }
        sendSingle(t, question);
        addToHistory(question, [t]);
        ta.value = '';
        ta.style.height = 'auto';
      });
    });

    // Enter + resize + focus
    ALL_SERVICES.forEach(svc => {
      const ta = document.getElementById(`q-${svc.id}`);
      if (!ta) return;
      ta.addEventListener('focus', () => { lastFocusedInput = svc.id; });
      ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const question = ta.value.trim();
          if (question) {
            sendSingle(svc.id, question);
            addToHistory(question, [svc.id]);
            ta.value = '';
            ta.style.height = 'auto';
          }
        }
      });
      ta.addEventListener('input', () => {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 80) + 'px';
      });
    });
  }

  // ══════════════════════════════════════
  //  Unified Input
  // ══════════════════════════════════════
  chips.forEach(c => c.addEventListener('click', () => c.classList.toggle('active')));

  uniQ.addEventListener('focus', () => { lastFocusedInput = null; });
  uniQ.addEventListener('input', () => {
    uniQ.style.height = 'auto';
    uniQ.style.height = Math.min(uniQ.scrollHeight, 100) + 'px';
  });
  uniQ.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); uniSend.click(); }
  });

  uniSend.addEventListener('click', () => {
    const question = uniQ.value.trim();
    if (!question) { addToast('질문을 입력해주세요.', 'er'); return; }
    // Only send to visible + active chips
    const targets = Array.from(chips)
      .filter(c => c.classList.contains('active') && !c.classList.contains('filtered'))
      .map(c => c.dataset.t);
    if (!targets.length) { addToast('전송할 AI를 선택해주세요.', 'er'); return; }

    uniSend.disabled = true;
    toastsEl.innerHTML = '';
    addToast(`${targets.length}개 AI에 전송 중...`, 'in');
    // For each target, apply per-AI system prompt
    if (sysPromptMode === 'each') {
      targets.forEach(t => {
        const finalQ = applySystemPrompt(question, t);
        chrome.runtime.sendMessage({ type: 'SEND_TO_SINGLE', question: finalQ, target: t });
      });
    } else {
      const finalQ = applySystemPrompt(question);
      chrome.runtime.sendMessage({ type: 'SEND_TO_AI', question: finalQ, targets });
    }
    addToHistory(question, targets);
    uniQ.value = '';
    uniQ.style.height = 'auto';

    setTimeout(() => { uniSend.disabled = false; }, 1500);
  });

  // ══════════════════════════════════════
  //  Single Send
  // ══════════════════════════════════════
  function sendSingle(target, question) {
    const svc = ALL_SERVICES.find(s => s.id === target);
    addToast(`${svc.name}에 전송 중...`, 'in');
    const finalQ = applySystemPrompt(question, target);
    chrome.runtime.sendMessage({ type: 'SEND_TO_SINGLE', question: finalQ, target });
    if (autoSwitch) {
      setTimeout(() => { chrome.runtime.sendMessage({ type: 'SWITCH_TAB', target }); }, 800);
    }
  }

  // ══════════════════════════════════════
  //  Toast
  // ══════════════════════════════════════
  function addToast(msg, type = 'in') {
    const icons = { ok: '✓', er: '✗', in: 'ℹ' };
    const d = document.createElement('div');
    d.className = `toast-item ${type}`;
    d.textContent = `${icons[type]} ${msg}`;
    toastsEl.appendChild(d);
    toastsEl.scrollTop = toastsEl.scrollHeight;
    setTimeout(() => { if (d.parentNode) d.remove(); }, 6000);
  }

  // ══════════════════════════════════════
  //  Tab Status
  // ══════════════════════════════════════
  function checkTabs() {
    chrome.runtime.sendMessage({ type: 'CHECK_TABS' }, (result) => {
      if (!result) return;
      ALL_SERVICES.forEach(svc => {
        const dot = document.getElementById(`status-${svc.id}`);
        if (dot) {
          dot.classList.toggle('open', !!result[svc.id]);
          dot.title = result[svc.id] ? `${svc.name} 탭 열림` : `${svc.name} 탭 없음`;
        }
      });
    });
  }
  setInterval(checkTabs, 4000);

  // ══════════════════════════════════════
  //  Message Listener
  // ══════════════════════════════════════
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SEND_STATUS') {
      if (msg.status === 'sent') addToast(msg.message, 'ok');
      else if (msg.status === 'error') addToast(msg.message, 'er');
    }
  });

  // ══════════════════════════════════════
  //  Utility
  // ══════════════════════════════════════
  function escHTML(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ══════════════════════════════════════
  //  Init
  // ══════════════════════════════════════
  loadData();
  uniQ.focus();
});
