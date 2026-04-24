let pendingReplacement = null;
let popup = null;

// ---------------------------------------------------------------------------
// Popup UI
// ---------------------------------------------------------------------------

function showPopup(options, anchorRect) {
  removePopup(false);

  popup = document.createElement('div');
  popup.id = 'khmer-loeun-popup';
  Object.assign(popup.style, {
    position: 'fixed',
    zIndex: '2147483647',
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    padding: '4px 0',
    fontSize: '18px',
    fontFamily: 'sans-serif',
    top: (anchorRect.bottom + 6) + 'px',
    left: anchorRect.left + 'px',
    minWidth: '120px',
  });

  options.forEach((option, i) => {
    const item = document.createElement('div');
    Object.assign(item.style, {
      padding: '6px 14px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      color: '#111',
    });

    const badge = document.createElement('span');
    badge.textContent = i + 1;
    Object.assign(badge.style, {
      fontSize: '11px',
      background: '#e5e7eb',
      borderRadius: '4px',
      padding: '1px 5px',
      color: '#555',
      fontFamily: 'monospace',
      minWidth: '16px',
      textAlign: 'center',
    });

    const label = document.createElement('span');
    label.textContent = option;

    item.appendChild(badge);
    item.appendChild(label);
    item.addEventListener('mouseenter', () => { item.style.background = '#f3f4f6'; });
    item.addEventListener('mouseleave', () => { item.style.background = ''; });
    item.addEventListener('mousedown', (e) => { e.preventDefault(); commitOption(i); });
    popup.appendChild(item);
  });

  document.body.appendChild(popup);
}

function removePopup(clearPending = true) {
  if (popup) { popup.remove(); popup = null; }
  if (clearPending) pendingReplacement = null;
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
    element.setRangeText(word, startOfWord, endOfWord, 'end');
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
  const match = beforeCursor.match(/([a-zA-Z]+)\s$/);
  const lastWord = match?.[1]?.toLowerCase();

  if (!lastWord || !khmerMap[lastWord]) return;

  const khmerWord = khmerMap[lastWord];
  const endOfWord = pos - 1;           // position of the space
  const startOfWord = endOfWord - lastWord.length;

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
  const match = beforeCursor.match(/([a-zA-Z]+)\s$/);
  const lastWord = match?.[1]?.toLowerCase();

  if (!lastWord || !khmerMap[lastWord]) return;

  const khmerWord = khmerMap[lastWord];
  const startOfWord = range.startOffset - lastWord.length - 1;
  const endOfWord = range.startOffset - 1;

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
    replaceRange.insertNode(document.createTextNode(khmerWord));
    selection.collapseToEnd();
  }
}

// ---------------------------------------------------------------------------
// Main keyup listener
// ---------------------------------------------------------------------------

document.addEventListener('keyup', function (e) {
  if (e.code !== 'Space') return;

  const el = e.target;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    handleInputSpace(el);
  } else {
    handleContentEditableSpace();
  }
});
