let khmerMap = {};
let pendingReplacement = null;
let popup = null;
let activeIndex = 0;

const browserApi = (typeof browser !== 'undefined' && browser) || (typeof chrome !== 'undefined' && chrome);
const getURL = (path) => browserApi?.runtime?.getURL(path) || path;

let extensionEnabled = true;
browserApi?.storage?.local?.get?.('enabled', (r) => {
  if (r && r.enabled === false) extensionEnabled = false;
});
browserApi?.storage?.onChanged?.addListener?.((changes) => {
  if ('enabled' in changes) extensionEnabled = changes.enabled.newValue !== false;
});

fetch(getURL('dictionary/index.json'))
  .then(r => r.json())
  .then(letters => Promise.all(
    letters.map(l =>
      fetch(getURL(`dictionary/${l}.json`)).then(r => r.json())
    )
  ))
  .then(maps => { khmerMap = Object.assign({}, ...maps); })
  .catch(err => console.error('[Khmer Loeun] Failed to load dictionary:', err));

// ---------------------------------------------------------------------------
// Fuzzy lookup — tries phonetic variants when exact match fails
// ---------------------------------------------------------------------------

function fuzzyLookup(word) {
  if (khmerMap[word]) return khmerMap[word];

  const tries = new Set();

  // ch <-> j  (both used for ច/ជ sounds)
  if (word.includes('ch')) tries.add(word.replace(/ch/g, 'j'));
  if (word.startsWith('j')) tries.add('ch' + word.slice(1));
  else if (word.includes('j')) tries.add(word.replace(/j/g, 'ch'));

  // collapse doubled vowels: baan -> ban, heuy -> huy
  const collapsed = word.replace(/([aeiou])\1+/g, '$1');
  if (collapsed !== word) tries.add(collapsed);

  // strip trailing h after vowel: nah -> na, nih -> ni
  if (/[aeiou]h$/.test(word)) tries.add(word.slice(0, -1));

  // strip apostrophes: k'dam -> kdam, s'ek -> sek
  if (word.includes("'")) tries.add(word.replace(/'/g, ''));

  for (const candidate of tries) {
    if (candidate && candidate !== word && khmerMap[candidate]) {
      return khmerMap[candidate];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Page theme detection — samples actual background, ignores OS preference
// ---------------------------------------------------------------------------

function isPageDark() {
  for (const el of [document.body, document.documentElement]) {
    const bg = getComputedStyle(el).backgroundColor;
    const m  = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (!m) continue;
    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (alpha < 0.1) continue; // skip transparent — try next element
    const luminance = 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
    return luminance < 128;
  }
  // No opaque background found — fall back to OS preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ---------------------------------------------------------------------------
// Popup UI
// ---------------------------------------------------------------------------

function ensurePopupStyles() {
  if (document.getElementById('khmer-loeun-styles')) return;

  // SVG displacement filter — applied only to the decorative refraction layer,
  // so text stays sharp while the border/caustic overlay appears physically bent.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  svg.innerHTML = `<defs>
    <filter id="kl-refract" x="-30%" y="-30%" width="160%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018 0.022"
                    numOctaves="2" seed="12" result="warp"/>
      <feDisplacementMap in="SourceGraphic" in2="warp"
                         scale="7" xChannelSelector="R" yChannelSelector="G"
                         result="displaced"/>
      <feComposite in="displaced" in2="SourceGraphic" operator="in"/>
    </filter>
  </defs>`;
  document.body.appendChild(svg);

  const style = document.createElement('style');
  style.id = 'khmer-loeun-styles';
  style.textContent = `
    @keyframes kl-in {
      from { opacity: 0; transform: translateY(-8px) scale(0.95); filter: blur(4px); }
      to   { opacity: 1; transform: translateY(0)    scale(1);    filter: blur(0);   }
    }

    #khmer-loeun-popup {
      animation: kl-in 0.22s cubic-bezier(0.2, 0, 0, 1.1) both;
      background: rgba(255,255,255,0.12);
      backdrop-filter: blur(20px) saturate(1.6) brightness(1.04);
      -webkit-backdrop-filter: blur(20px) saturate(1.6) brightness(1.04);
      border-radius: 18px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08),
                  inset 0 1.5px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(0,0,0,0.06);
      padding: 6px;
      font-size: 17px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      overflow: hidden;
    }

    #khmer-loeun-popup .kl-item {
      color: #1c1c1e;
      transition: background 0.15s ease;
    }
    #khmer-loeun-popup .kl-item:hover {
      background: rgba(0,0,0,0.06);
    }

    #khmer-loeun-popup .kl-badge {
      background: rgba(0,0,0,0.08);
      color: rgba(0,0,0,0.4);
    }

    #khmer-loeun-popup .kl-highlight {
      position: absolute;
      left: 6px;
      right: 6px;
      top: 0;
      background: rgba(0,0,0,0.06);
      border-radius: 11px;
      pointer-events: none;
      z-index: 0;
      transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1.1),
                  height   0.2s cubic-bezier(0.2, 0, 0, 1.1);
    }

    #khmer-loeun-popup .kl-refraction {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      filter: url(#kl-refract);
      border: 1.5px solid rgba(255,255,255,0.48);
      background: linear-gradient(
        148deg,
        rgba(255,255,255,0.22) 0%,
        rgba(255,255,255,0.06) 38%,
        rgba(0,0,0,0.03)       70%,
        rgba(0,0,0,0.07)      100%
      );
    }

    #khmer-loeun-popup.kl-dark {
      background: rgba(40,40,40,0.45);
      box-shadow: 0 16px 48px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3),
                  inset 0 1.5px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.3);
    }
    #khmer-loeun-popup.kl-dark .kl-item {
      color: #f5f5f7;
    }
    #khmer-loeun-popup.kl-dark .kl-item:hover {
      background: rgba(255,255,255,0.08);
    }
    #khmer-loeun-popup.kl-dark .kl-badge {
      background: rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.4);
    }
    #khmer-loeun-popup.kl-dark .kl-highlight {
      background: rgba(255,255,255,0.1);
    }
    #khmer-loeun-popup.kl-dark .kl-refraction {
      border-color: rgba(255,255,255,0.12);
      background: linear-gradient(
        148deg,
        rgba(255,255,255,0.08) 0%,
        rgba(255,255,255,0.02) 38%,
        rgba(0,0,0,0.04)       70%,
        rgba(0,0,0,0.08)      100%
      );
    }
  `;
  document.head.appendChild(style);
}

function showPopup(options, anchorRect) {
  removePopup(false);
  ensurePopupStyles();

  popup = document.createElement('div');
  popup.id = 'khmer-loeun-popup';
  if (isPageDark()) popup.classList.add('kl-dark');
  Object.assign(popup.style, {
    position: 'fixed',
    zIndex:   '2147483647',
    top:      (anchorRect.bottom + 8) + 'px',
    left:     anchorRect.left + 'px',
    minWidth: '140px',
  });

  // Decorative refraction layer — gets the displacement filter, text does not
  const refraction = document.createElement('div');
  refraction.className = 'kl-refraction';
  popup.appendChild(refraction);

  // Sliding highlight pill — moves between items via transform
  const highlight = document.createElement('div');
  highlight.className = 'kl-highlight';
  popup.appendChild(highlight);

  options.forEach((option, i) => {
    const item = document.createElement('div');
    item.className = 'kl-item';
    item.style.cssText = 'padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:10px;border-radius:11px;position:relative;z-index:1';

    const badge = document.createElement('span');
    badge.className = 'kl-badge';
    badge.textContent = i + 1;
    badge.style.cssText = 'font-size:11px;border-radius:6px;padding:2px 6px;font-family:-apple-system,BlinkMacSystemFont,system-ui,monospace;min-width:18px;text-align:center;font-weight:500;flex-shrink:0';

    const label = document.createElement('span');
    label.textContent = option;
    label.style.letterSpacing = '0.01em';

    item.appendChild(badge);
    item.appendChild(label);
    item.addEventListener('mousedown', (e) => { e.preventDefault(); commitOption(i); });
    popup.appendChild(item);
  });

  document.body.appendChild(popup);
  activeIndex = 0;
  // Position pill instantly on open (no slide animation for initial placement)
  const pill = popup.querySelector('.kl-highlight');
  if (pill) pill.style.transition = 'none';
  setActiveItem(0);
  requestAnimationFrame(() => {
    if (pill) pill.style.transition = '';
  });
}

function removePopup(clearPending = true) {
  if (popup) { popup.remove(); popup = null; }
  if (clearPending) { pendingReplacement = null; activeIndex = 0; }
}

function setActiveItem(index) {
  if (!popup) return;
  const pill = popup.querySelector('.kl-highlight');
  const item = popup.querySelectorAll('.kl-item')[index];
  if (pill && item) {
    pill.style.transform = `translateY(${item.offsetTop}px)`;
    pill.style.height    = `${item.offsetHeight}px`;
  }
  activeIndex = index;
}

// ---------------------------------------------------------------------------
// Commit a chosen option — handles both input/textarea and contenteditable
// ---------------------------------------------------------------------------

function commitOption(index) {
  if (!pendingReplacement) return;
  const { type, options } = pendingReplacement;
  const word = options[index];

  if (type === 'input') {
    const { element, startOfWord, endOfWord } = pendingReplacement;
    const before = element.value.slice(0, startOfWord);
    const after = element.value.slice(endOfWord);
    element.value = before + word + after;
    const cursorPos = before.length + word.length;
    element.setSelectionRange(cursorPos, cursorPos);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const { container, startOfWord, endOfWord } = pendingReplacement;
    const replaceRange = document.createRange();
    replaceRange.setStart(container, startOfWord);
    replaceRange.setEnd(container, endOfWord);
    replaceRange.deleteContents();

    const node = document.createTextNode(word);
    replaceRange.insertNode(node);

    const sel = window.getSelection();
    const cur = document.createRange();
    cur.setStartAfter(node);
    cur.collapse(true);
    sel.removeAllRanges();
    sel.addRange(cur);
  }

  removePopup();
}

// ---------------------------------------------------------------------------
// Keyboard handling while popup is open
// ---------------------------------------------------------------------------

document.addEventListener('keydown', function (e) {
  if (!pendingReplacement) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    removePopup();
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    commitOption(activeIndex);
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setActiveItem((activeIndex + 1) % pendingReplacement.options.length);
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    setActiveItem((activeIndex - 1 + pendingReplacement.options.length) % pendingReplacement.options.length);
    return;
  }

  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= pendingReplacement.options.length) {
    e.preventDefault();
    commitOption(num - 1);
    return;
  }

  removePopup();
}, true);

document.addEventListener('mousedown', function (e) {
  if (popup && !popup.contains(e.target)) removePopup();
});

// ---------------------------------------------------------------------------
// Helpers to get caret pixel position in an input/textarea
// Uses a hidden mirror div to measure where the text cursor is.
// ---------------------------------------------------------------------------

function getCaretRect(el) {
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(el);

  const props = [
    'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
    'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
    'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'whiteSpace',
  ];
  props.forEach(p => { mirror.style[p] = style[p]; });

  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '0',
    whiteSpace: el.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre',
    wordWrap: 'break-word',
  });

  const elRect = el.getBoundingClientRect();
  const caretPos = el.selectionStart;

  mirror.textContent = el.value.substring(0, caretPos);

  const caret = document.createElement('span');
  caret.textContent = '|';
  mirror.appendChild(caret);

  document.body.appendChild(mirror);
  mirror.scrollTop = el.scrollTop;
  mirror.scrollLeft = el.scrollLeft;

  const mirrorRect = mirror.getBoundingClientRect();
  const caretRect = caret.getBoundingClientRect();
  document.body.removeChild(mirror);

  // Offset relative to the actual element on screen
  return {
    left: elRect.left + (caretRect.left - mirrorRect.left),
    bottom: elRect.top + (caretRect.bottom - mirrorRect.top),
  };
}

// ---------------------------------------------------------------------------
// Space handler — input / textarea path
// ---------------------------------------------------------------------------

function handleInputSpace(el) {
  const pos = el.selectionStart;
  const beforeCursor = el.value.substring(0, pos);
  const match = beforeCursor.match(/([a-zA-Z][a-zA-Z']*)\s$/);
  const lastWord = match?.[1]?.toLowerCase();

  const khmerWord = lastWord ? fuzzyLookup(lastWord) : null;
  if (!khmerWord) return;

  const endOfWord = pos;                // include the triggering space in the replacement range
  const startOfWord = endOfWord - lastWord.length - 1;

  if (Array.isArray(khmerWord)) {
    const { left, bottom } = getCaretRect(el);
    pendingReplacement = { type: 'input', element: el, startOfWord, endOfWord, options: khmerWord };
    showPopup(khmerWord, { left, bottom });
  } else {
    el.setRangeText(khmerWord, startOfWord, endOfWord, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// ---------------------------------------------------------------------------
// Space handler — contenteditable path
// ---------------------------------------------------------------------------

function handleContentEditableSpace() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const container = range.startContainer;
  if (container.nodeType !== Node.TEXT_NODE) return;

  const text = container.textContent;
  const beforeCursor = text.substring(0, range.startOffset);
  const match = beforeCursor.match(/([a-zA-Z][a-zA-Z']*)\s$/);
  const lastWord = match?.[1]?.toLowerCase();

  const khmerWord = lastWord ? fuzzyLookup(lastWord) : null;
  if (!khmerWord) return;

  const endOfWord = range.startOffset;  // include the triggering space
  const startOfWord = endOfWord - lastWord.length - 1;

  if (Array.isArray(khmerWord)) {
    const anchorRange = document.createRange();
    anchorRange.setStart(container, startOfWord);
    anchorRange.setEnd(container, endOfWord);
    const rect = anchorRange.getBoundingClientRect();

    pendingReplacement = { type: 'contenteditable', container, startOfWord, endOfWord, options: khmerWord };
    showPopup(khmerWord, rect);
  } else {
    const replaceRange = document.createRange();
    replaceRange.setStart(container, startOfWord);
    replaceRange.setEnd(container, endOfWord);
    replaceRange.deleteContents();
    const newNode = document.createTextNode(khmerWord);
    replaceRange.insertNode(newNode);
    const cur = document.createRange();
    cur.setStartAfter(newNode);
    cur.collapse(true);
    selection.removeAllRanges();
    selection.addRange(cur);
  }
}

// ---------------------------------------------------------------------------
// Main keyup listener
// ---------------------------------------------------------------------------

document.addEventListener('keyup', function (e) {
  if (!extensionEnabled) return;
  if (e.code !== 'Space') return;

  const el = e.target;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    handleInputSpace(el);
  } else {
    handleContentEditableSpace();
  }
});
