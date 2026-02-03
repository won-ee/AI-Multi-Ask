(() => {
  const host = window.location.hostname;
  let svc = null;
  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) svc = 'chatgpt';
  else if (host.includes('claude.ai')) svc = 'claude';
  else if (host.includes('gemini.google.com')) svc = 'gemini';
  else if (host.includes('perplexity.ai')) svc = 'perplexity';
  if (!svc) return;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'INPUT_AND_SEND') {
      inject(msg.question, msg.service);
      sendResponse({ ok: true });
    }
    if (msg.type === 'COPY_RESPONSE') {
      const text = getLastResponse();
      sendResponse({ ok: true, text: text || '' });
    }
    return true;
  });

  function getLastResponse() {
    if (svc === 'chatgpt') return getLastChatGPT();
    if (svc === 'claude') return getLastClaude();
    if (svc === 'gemini') return getLastGemini();
    if (svc === 'perplexity') return getLastPerplexity();
    return '';
  }

  function getLastChatGPT() {
    // ChatGPT: assistant messages in .markdown or [data-message-author-role="assistant"]
    const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (msgs.length) return msgs[msgs.length - 1].innerText.trim();
    const md = document.querySelectorAll('.markdown');
    if (md.length) return md[md.length - 1].innerText.trim();
    return '';
  }

  function getLastClaude() {
    // Claude: .font-claude-message or [data-is-streaming] parent
    const msgs = document.querySelectorAll('.font-claude-message');
    if (msgs.length) return msgs[msgs.length - 1].innerText.trim();
    const alt = document.querySelectorAll('[class*="response"], [class*="message-content"]');
    if (alt.length) return alt[alt.length - 1].innerText.trim();
    return '';
  }

  function getLastGemini() {
    // Gemini: .model-response-text or message-content
    const msgs = document.querySelectorAll('.model-response-text');
    if (msgs.length) return msgs[msgs.length - 1].innerText.trim();
    const alt = document.querySelectorAll('message-content');
    if (alt.length) return alt[alt.length - 1].innerText.trim();
    return '';
  }

  function getLastPerplexity() {
    // Perplexity: .prose or answer area
    const msgs = document.querySelectorAll('.prose');
    if (msgs.length) return msgs[msgs.length - 1].innerText.trim();
    const alt = document.querySelectorAll('[class*="answer"], [class*="response"]');
    if (alt.length) return alt[alt.length - 1].innerText.trim();
    return '';
  }

  function inject(q, service) {
    if (service === 'chatgpt') doChatGPT(q);
    else if (service === 'claude') doClaude(q);
    else if (service === 'gemini') doGemini(q);
    else if (service === 'perplexity') doPerplexity(q);
  }

  function doChatGPT(q) {
    const el = document.querySelector('#prompt-textarea') || document.querySelector('div[contenteditable="true"]');
    if (!el) return;
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, q);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.innerHTML = `<p>${esc(q)}</p>`;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setTimeout(() => {
      const btn = document.querySelector('[data-testid="send-button"]')
        || document.querySelector('button[aria-label="Send prompt"]')
        || document.querySelector('button[aria-label="메시지 보내기"]')
        || document.querySelector('form button[type="submit"]');
      if (btn && !btn.disabled) btn.click(); else enter(el);
    }, 600);
  }

  function doClaude(q) {
    const el = document.querySelector('div.ProseMirror[contenteditable="true"]') || document.querySelector('[contenteditable="true"]');
    if (!el) return;
    el.focus();
    el.innerHTML = `<p>${esc(q)}</p>`;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => {
      const btn = document.querySelector('button[aria-label="Send Message"]')
        || document.querySelector('button[aria-label="메시지 보내기"]')
        || document.querySelector('button[aria-label="Send message"]');
      if (btn) { btn.click(); return; }
      const fb = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg') && b.closest('fieldset,form,[role="presentation"]'));
      if (fb) fb.click(); else enter(el);
    }, 600);
  }

  function doGemini(q) {
    const el = document.querySelector('.ql-editor[contenteditable="true"]') || document.querySelector('div[contenteditable="true"]') || document.querySelector('textarea');
    if (!el) return;
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, q);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.innerHTML = `<p>${esc(q)}</p>`;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setTimeout(() => {
      const btn = document.querySelector('button[aria-label="Send message"]') || document.querySelector('button[aria-label="메시지 보내기"]') || document.querySelector('.send-button');
      if (btn && !btn.disabled) { btn.click(); return; }
      const fb = Array.from(document.querySelectorAll('button')).find(b => { const l = (b.getAttribute('aria-label') || '').toLowerCase(); return l.includes('send') || l.includes('보내기'); });
      if (fb) fb.click(); else enter(el);
    }, 600);
  }

  function doPerplexity(q) {
    // Content script's isolated world can't use execCommand on Lexical editor.
    // Send message to background to use chrome.scripting.executeScript with MAIN world.
    chrome.runtime.sendMessage({
      type: 'PERPLEXITY_INJECT',
      question: q
    });
  }

  function enter(el) { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
})();
