chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const AI_SERVICES = {
  chatgpt:    { name: 'ChatGPT',    urlPatterns: ['chatgpt.com', 'chat.openai.com'], url: 'https://chatgpt.com' },
  claude:     { name: 'Claude',     urlPatterns: ['claude.ai'], url: 'https://claude.ai' },
  gemini:     { name: 'Gemini',     urlPatterns: ['gemini.google.com'], url: 'https://gemini.google.com/app' },
  perplexity: { name: 'Perplexity', urlPatterns: ['perplexity.ai'], url: 'https://www.perplexity.ai' }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Send to multiple AIs
  if (message.type === 'SEND_TO_AI') {
    handleSend(message.question, message.targets);
    sendResponse({ ok: true });
  }

  // Send to single AI
  if (message.type === 'SEND_TO_SINGLE') {
    handleSend(message.question, [message.target]);
    sendResponse({ ok: true });
  }

  // Switch to AI tab
  if (message.type === 'SWITCH_TAB') {
    switchToTab(message.target);
    sendResponse({ ok: true });
  }

  // Check which tabs are open
  if (message.type === 'CHECK_TABS') {
    checkTabs().then(r => sendResponse(r));
    return true;
  }

  // Perplexity: execute in MAIN world (page context) so execCommand works on Lexical
  if (message.type === 'PERPLEXITY_INJECT') {
    injectPerplexity(message.question);
    sendResponse({ ok: true });
  }

  // Copy last response from AI tab
  if (message.type === 'COPY_RESPONSE') {
    copyResponse(message.target).then(r => sendResponse(r));
    return true;
  }

  return true;
});

async function injectPerplexity(question) {
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find(t => t.url && t.url.includes('perplexity.ai'));
  if (!tab) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: (q) => {
      // Try multiple selectors: chat page + home page
      const el = document.querySelector('#ask-input')
        || document.querySelector('[data-lexical-editor="true"]')
        || document.querySelector('textarea[placeholder]')
        || document.querySelector('textarea');
      if (!el) return;
      el.focus();

      if (el.tagName === 'TEXTAREA') {
        // Home page: regular textarea
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        nativeSetter.call(el, q);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // Chat page: Lexical editor
        document.execCommand('insertText', false, q);
      }

      setTimeout(() => {
        const btn = document.querySelector('button[aria-label="제출"]')
          || document.querySelector('button[aria-label="Submit"]')
          || document.querySelector('button[type="submit"]');
        if (btn && !btn.disabled) { btn.click(); return; }
        // Retry after short delay
        setTimeout(() => {
          const r = document.querySelector('button[aria-label="제출"]')
            || document.querySelector('button[aria-label="Submit"]')
            || document.querySelector('button[type="submit"]');
          if (r && !r.disabled) r.click();
          else {
            // Try Enter key
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          }
        }, 800);
      }, 500);
    },
    args: [question]
  });

  chrome.runtime.sendMessage({
    type: 'SEND_STATUS', service: 'perplexity', status: 'sent',
    message: 'Perplexity에 전송 완료'
  }).catch(() => {});
}

async function copyResponse(target) {
  const svc = AI_SERVICES[target];
  if (!svc) return { ok: false, text: '' };
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find(t => t.url && svc.urlPatterns.some(p => t.url.includes(p)));
  if (!tab) return { ok: false, text: '' };

  // Switch to tab first so DOM is fresh
  await chrome.tabs.update(tab.id, { active: true });
  await delay(500);

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'COPY_RESPONSE' });
    return { ok: true, text: response.text || '' };
  } catch (e) {
    return { ok: false, text: '' };
  }
}

async function checkTabs() {
  const tabs = await chrome.tabs.query({});
  const found = {};
  for (const [key, svc] of Object.entries(AI_SERVICES)) {
    found[key] = tabs.some(t => t.url && svc.urlPatterns.some(p => t.url.includes(p)));
  }
  return found;
}

async function switchToTab(target) {
  const svc = AI_SERVICES[target];
  if (!svc) return;
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find(t => t.url && svc.urlPatterns.some(p => t.url.includes(p)));
  if (tab) {
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  }
}

async function handleSend(question, targets) {
  const allTabs = await chrome.tabs.query({});

  for (const target of targets) {
    const svc = AI_SERVICES[target];
    if (!svc) continue;

    let tab = allTabs.find(t => t.url && svc.urlPatterns.some(p => t.url.includes(p)));

    // Auto-open tab if not found
    if (!tab) {
      chrome.runtime.sendMessage({
        type: 'SEND_STATUS', service: target, status: 'error',
        message: `${svc.name} 탭을 여는 중...`
      }).catch(() => {});

      tab = await chrome.tabs.create({ url: svc.url, active: false });
      await waitForTabLoad(tab.id);
      await delay(2500);
    }

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'INPUT_AND_SEND', question, service: target
      });
      chrome.runtime.sendMessage({
        type: 'SEND_STATUS', service: target, status: 'sent',
        message: `${svc.name}에 전송 완료`
      }).catch(() => {});
    } catch (err) {
      // Auto-reload and retry
      chrome.runtime.sendMessage({
        type: 'SEND_STATUS', service: target, status: 'error',
        message: `${svc.name} 새로고침 후 재전송 중...`
      }).catch(() => {});

      chrome.tabs.reload(tab.id);
      await waitForTabLoad(tab.id);
      await delay(2000);

      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'INPUT_AND_SEND', question, service: target
        });
        chrome.runtime.sendMessage({
          type: 'SEND_STATUS', service: target, status: 'sent',
          message: `${svc.name}에 재전송 완료`
        }).catch(() => {});
      } catch (err2) {
        chrome.runtime.sendMessage({
          type: 'SEND_STATUS', service: target, status: 'error',
          message: `${svc.name} 재전송 실패 — 탭을 직접 새로고침 해주세요.`
        }).catch(() => {});
      }
    }
  }
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Timeout safety — don't wait forever
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
