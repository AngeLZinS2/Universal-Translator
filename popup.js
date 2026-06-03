// popup.js

const PRESETS = {
  padrao: { fontSize:22, textColor:'#ffffff', bgColor:'#000000', bgOpacity:75, borderRadius:6, textShadow:true, fontFamily:'Helvetica, Arial, sans-serif', showSpeakerIcon:true, position:'bottom' },
  cinema: { fontSize:26, textColor:'#FFE066', bgColor:'#000000', bgOpacity:95, borderRadius:0, textShadow:false, fontFamily:'Georgia, serif', showSpeakerIcon:false, position:'bottom' },
  minimal:{ fontSize:24, textColor:'#ffffff', bgColor:'#000000', bgOpacity:0,  borderRadius:4, textShadow:true, fontFamily:'Helvetica, Arial, sans-serif', showSpeakerIcon:true, position:'bottom' },
  neon:   { fontSize:22, textColor:'#00e5b0', bgColor:'#0a0a1e', bgOpacity:90, borderRadius:8, textShadow:true, fontFamily:'Trebuchet MS, sans-serif', showSpeakerIcon:true, position:'bottom' }
};

document.addEventListener('DOMContentLoaded', () => {

  // ── TABS ──
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // ── REFS Geral ──
  const apiKeyInput    = document.getElementById('apiKey');
  const sourceLangSel  = document.getElementById('sourceLang');
  const targetLangSel  = document.getElementById('targetLang');
  const toggleBtn      = document.getElementById('toggleBtn');
  const statusText     = document.getElementById('statusText');
  const statusIcon     = document.getElementById('statusIcon');
  const togglePassword = document.getElementById('togglePassword');
  const esportsModeChk = document.getElementById('esportsMode');
  const esportsModeBox = document.getElementById('esportsModeBox');
  const esportsGameSel = document.getElementById('esportsGame');
  const esportsGameFld = document.getElementById('esportsGameField');
  const swapLangs      = document.getElementById('swapLangs');

  // ── REFS Aparência ──
  const fontSizeInput      = document.getElementById('fontSize');
  const fontSizeVal        = document.getElementById('fontSizeVal');
  const textColorInput     = document.getElementById('textColor');
  const bgColorInput       = document.getElementById('bgColor');
  const bgOpacityInput     = document.getElementById('bgOpacity');
  const bgOpacityVal       = document.getElementById('bgOpacityVal');
  const borderRadiusInput  = document.getElementById('borderRadius');
  const borderRadiusVal    = document.getElementById('borderRadiusVal');
  const textShadowChk      = document.getElementById('textShadow');
  const showSpeakerIconChk = document.getElementById('showSpeakerIcon');
  const fontFamilySel      = document.getElementById('fontFamily');
  const previewEl          = document.getElementById('previewSubtitle');

  // ── LOAD SETTINGS ──
  chrome.storage.local.get(
    ['apiKey','sourceLang','targetLang','isActive','subtitleStyle','esportsMode','esportsGame'],
    (result) => {
      if (result.apiKey)     apiKeyInput.value   = result.apiKey;
      if (result.sourceLang) sourceLangSel.value = result.sourceLang;
      if (result.targetLang) targetLangSel.value = result.targetLang;
      if (result.esportsGame) esportsGameSel.value = result.esportsGame;
      updateButtonState(result.isActive);
      applyStyleToControls(result.subtitleStyle || PRESETS.padrao);
      updatePreview();
      esportsModeChk.checked = !!result.esportsMode;
      esportsModeBox.classList.toggle('on', !!result.esportsMode);
      esportsGameFld.style.display = result.esportsMode ? 'block' : 'none';
    }
  );

  // ── PASSWORD TOGGLE ──
  togglePassword.addEventListener('click', () => {
    apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
  });

  // ── SWAP LANGS ──
  swapLangs.addEventListener('click', () => {
    const src = sourceLangSel.value;
    // try to find source lang in target
    const targetOpts = Array.from(targetLangSel.options).map(o => o.value);
    if (targetOpts.includes(src)) targetLangSel.value = src;
    // try to find old target in source
    const oldTarget = targetLangSel.dataset.prev || 'en';
    const sourceOpts = Array.from(sourceLangSel.options).map(o => o.value);
    if (sourceOpts.includes(oldTarget)) sourceLangSel.value = oldTarget;
    targetLangSel.dataset.prev = src;
    saveGeneral();
  });
  targetLangSel.addEventListener('change', () => { targetLangSel.dataset.prev = targetLangSel.value; });

  // ── SAVE GENERAL + atualiza ao vivo se ativo ──
  const saveGeneral = () => chrome.storage.local.set({
    apiKey: apiKeyInput.value,
    sourceLang: sourceLangSel.value,
    targetLang: targetLangSel.value,
    esportsMode: esportsModeChk.checked,
    esportsGame: esportsGameSel.value
  });

  function pushSettingsIfActive() {
    if (!toggleBtn.classList.contains('active')) return;
    // Envia os novos idiomas para o offscreen sem parar o áudio
    chrome.runtime.sendMessage({
      action: 'UPDATE_CAPTURE_SETTINGS',
      settings: {
        apiKey:      apiKeyInput.value,
        sourceLang:  sourceLangSel.value,
        targetLang:  targetLangSel.value,
        esportsMode: esportsModeChk.checked,
        esportsGame: esportsGameSel.value
      }
    });
  }

  apiKeyInput.addEventListener('change', saveGeneral);
  sourceLangSel.addEventListener('change', () => { saveGeneral(); pushSettingsIfActive(); });
  targetLangSel.addEventListener('change', () => { saveGeneral(); pushSettingsIfActive(); });

  // ── ESPORTS TOGGLE E GAME SELECTOR ──
  const esportsSwitchLabel = document.getElementById('esportsSwitchLabel');
  // Prevent the card's click handler from double-firing when clicking the label/checkbox
  esportsSwitchLabel.addEventListener('click', (e) => { e.stopPropagation(); });

  esportsModeChk.addEventListener('change', () => {
    esportsModeBox.classList.toggle('on', esportsModeChk.checked);
    esportsGameFld.style.display = esportsModeChk.checked ? 'block' : 'none';
    saveGeneral();
    pushSettingsIfActive();
  });
  esportsModeBox.addEventListener('click', () => {
    esportsModeChk.checked = !esportsModeChk.checked;
    esportsModeChk.dispatchEvent(new Event('change'));
  });

  esportsGameSel.addEventListener('change', () => { saveGeneral(); pushSettingsIfActive(); });

  // ── TOGGLE CAPTURE ──
  toggleBtn.addEventListener('click', async () => {
    const isActive = toggleBtn.classList.contains('active');
    if (!isActive) {
      if (!apiKeyInput.value) { alert("Por favor, insira sua API Key do Deepgram."); return; }
      saveGeneral();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || (!tab.url.startsWith("http://") && !tab.url.startsWith("https://"))) {
        alert("Por favor, abra uma página de vídeo para ligar as legendas.");
        return;
      }
      chrome.runtime.sendMessage({ action: "START_CAPTURE", tabId: tab.id, esportsMode: esportsModeChk.checked });
      updateButtonState(true);
    } else {
      chrome.runtime.sendMessage({ action: "STOP_CAPTURE" });
      updateButtonState(false);
    }
  });

  function updateButtonState(isActive) {
    if (isActive) {
      toggleBtn.classList.add('active');
      statusText.textContent = 'Processando áudio em tempo real...';
      statusIcon.innerHTML = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-7.5c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
      chrome.storage.local.set({ isActive: true });
    } else {
      toggleBtn.classList.remove('active');
      statusText.textContent = 'Sistema inativo — clique para ligar';
      statusIcon.innerHTML = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>';
      chrome.storage.local.set({ isActive: false });
    }
  }

  // ── PRESETS ──
  document.querySelectorAll('.preset-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const preset = PRESETS[card.dataset.preset];
      if (preset) { applyStyleToControls(preset); saveStyle(); updatePreview(); }
    });
  });

  // ── APPLY CONTROLS FROM STYLE OBJECT ──
  function applyStyleToControls(s) {
    fontSizeInput.value     = s.fontSize ?? 22;
    fontSizeVal.textContent = `${s.fontSize ?? 22}px`;
    textColorInput.value    = s.textColor ?? '#ffffff';
    document.getElementById('textColorBg').style.background = s.textColor ?? '#ffffff';
    bgColorInput.value      = s.bgColor ?? '#000000';
    document.getElementById('bgColorBg').style.background   = s.bgColor ?? '#000000';
    bgOpacityInput.value    = s.bgOpacity ?? 75;
    bgOpacityVal.textContent = `${s.bgOpacity ?? 75}%`;
    borderRadiusInput.value = s.borderRadius ?? 6;
    borderRadiusVal.textContent = `${s.borderRadius ?? 6}px`;
    textShadowChk.checked   = s.textShadow ?? true;
    showSpeakerIconChk.checked = s.showSpeakerIcon ?? true;
    if (s.fontFamily) fontFamilySel.value = s.fontFamily;
    document.querySelectorAll('.pos-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.pos === (s.position ?? 'bottom'));
    });
    updateRangeGradients();
  }

  // ── COLLECT CURRENT STYLE ──
  function collectStyle() {
    const pos = document.querySelector('.pos-btn.selected')?.dataset.pos ?? 'bottom';
    return {
      fontSize:      parseInt(fontSizeInput.value),
      textColor:     textColorInput.value,
      bgColor:       bgColorInput.value,
      bgOpacity:     parseInt(bgOpacityInput.value),
      borderRadius:  parseInt(borderRadiusInput.value),
      textShadow:    textShadowChk.checked,
      showSpeakerIcon: showSpeakerIconChk.checked,
      fontFamily:    fontFamilySel.value,
      position:      pos
    };
  }

  // ── SAVE & PUSH STYLE ──
  function saveStyle() {
    const style = collectStyle();
    chrome.storage.local.set({ subtitleStyle: style });
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) chrome.tabs.sendMessage(tab.id, { action: 'UPDATE_STYLE', style }).catch(() => {});
    });
  }

  // ── UPDATE PREVIEW ──
  function updatePreview() {
    const s = collectStyle();
    const hex2rgba = (hex, a) => {
      const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${a/100})`;
    };
    previewEl.style.fontSize        = `${s.fontSize}px`;
    previewEl.style.color           = s.textColor;
    previewEl.style.backgroundColor = hex2rgba(s.bgColor, s.bgOpacity);
    previewEl.style.borderRadius    = `${s.borderRadius}px`;
    previewEl.style.fontFamily      = s.fontFamily;
    previewEl.style.textShadow      = s.textShadow
      ? '1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000' : 'none';
    previewEl.style.padding = `${Math.round(s.fontSize * 0.24)}px ${Math.round(s.fontSize * 0.5)}px`;
  }

  // ── RANGE GRADIENT TRACK ──
  function updateRangeGradients() {
    [
      [fontSizeInput,     14, 48],
      [bgOpacityInput,    0, 100],
      [borderRadiusInput, 0, 24]
    ].forEach(([el, min, max]) => {
      const pct = ((el.value - min) / (max - min)) * 100;
      el.style.setProperty('--pct', `${pct}%`);
    });
  }

  // ── RANGE LISTENERS ──
  fontSizeInput.addEventListener('input', () => {
    fontSizeVal.textContent = `${fontSizeInput.value}px`;
    updateRangeGradients(); updatePreview(); saveStyle();
  });
  bgOpacityInput.addEventListener('input', () => {
    bgOpacityVal.textContent = `${bgOpacityInput.value}%`;
    updateRangeGradients(); updatePreview(); saveStyle();
  });
  borderRadiusInput.addEventListener('input', () => {
    borderRadiusVal.textContent = `${borderRadiusInput.value}px`;
    updateRangeGradients(); updatePreview(); saveStyle();
  });

  // ── COLOR LISTENERS ──
  textColorInput.addEventListener('input', () => {
    document.getElementById('textColorBg').style.background = textColorInput.value;
    updatePreview(); saveStyle();
  });
  bgColorInput.addEventListener('input', () => {
    document.getElementById('bgColorBg').style.background = bgColorInput.value;
    updatePreview(); saveStyle();
  });

  // ── OTHER CONTROLS ──
  textShadowChk.addEventListener('change', () => { updatePreview(); saveStyle(); });
  showSpeakerIconChk.addEventListener('change', () => { saveStyle(); });
  fontFamilySel.addEventListener('change', () => { updatePreview(); saveStyle(); });

  document.querySelectorAll('.pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      saveStyle();
    });
  });

  // initial gradient
  updateRangeGradients();
});
