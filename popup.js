const browserApi = (typeof browser !== 'undefined' && browser) || chrome;

const toggle = document.getElementById('toggle');
const stateLabel = document.getElementById('stateLabel');
const descLabel = document.getElementById('descLabel');

function applyState(enabled) {
  toggle.setAttribute('aria-checked', enabled ? 'true' : 'false');

  stateLabel.textContent = enabled ? 'Active' : 'Paused';
  stateLabel.className = enabled ? 'state-label' : 'state-label off';

  descLabel.textContent = enabled ? 'Converting as you type' : 'Extension disabled';
  descLabel.className = enabled ? 'desc-label on' : 'desc-label';
}

browserApi.storage.local.get('enabled', (result) => {
  applyState(result.enabled !== false);
});

toggle.addEventListener('click', () => {
  const next = toggle.getAttribute('aria-checked') !== 'true';
  browserApi.storage.local.set({ enabled: next });
  applyState(next);
});
