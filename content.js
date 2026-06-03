// content.js — Overlay de Legenda Universal
// Estratégia: Injetamos o overlay DIRETAMENTE no container do player.
// Assim, quando o player entra em fullscreen, o overlay vai junto naturalmente,
// sem precisarmos usar APIs experimentais ou mover o DOM (o que quebra o fullscreen).

let subtitleContainer  = null;
let currentSubtitleLine = null;
let subtitleClearTimeout = null;
let currentStyle = null;

// ── Carrega estilo salvo ──
chrome.storage.local.get(['subtitleStyle'], (r) => {
  currentStyle = r.subtitleStyle || getDefaultStyle();
});

function getDefaultStyle() {
  return {
    fontSize: 22, textColor: '#ffffff', bgColor: '#000000', bgOpacity: 75,
    borderRadius: 6, textShadow: true, fontFamily: 'Helvetica, Arial, sans-serif',
    showSpeakerIcon: true, position: 'bottom'
  };
}

function hex2rgba(hex, a) {
  return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a/100})`;
}

// ── Aplica estilo visual numa linha de legenda ──
function applyStyleToLine(el, style) {
  if (!el || !style) return;
  const isFs  = !!document.fullscreenElement;
  const scale = isFs ? 1.45 : 1.0;
  const fs    = Math.round(style.fontSize * scale);
  
  el.style.fontSize        = `${fs}px`;
  el.style.color           = style.textColor;
  el.style.backgroundColor = hex2rgba(style.bgColor, style.bgOpacity);
  el.style.borderRadius    = `${style.borderRadius}px`;
  el.style.fontFamily      = style.fontFamily;
  el.style.textShadow      = style.textShadow
    ? '1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000'
    : 'none';
  el.style.padding = `${Math.round(style.fontSize * 0.25 * scale)}px ${Math.round(style.fontSize * 0.55 * scale)}px`;
}

// ── Encontra o container nativo do player ──
function getPlayerContainer() {
  // Twitch
  const twitch = document.querySelector('.video-player__overlay') || document.querySelector('[data-a-target="video-player"]');
  if (twitch) return twitch;
  
  // YouTube
  const yt = document.querySelector('.html5-video-player');
  if (yt) return yt;
  
  // Kick (Video.js)
  const kick = document.querySelector('.video-js');
  if (kick) return kick;
  
  // Genérico (pega o pai do vídeo, que geralmente é quem vai pro fullscreen)
  const video = document.querySelector('video');
  if (video && video.parentElement) {
    return video.parentElement;
  }
  
  return document.body;
}

// ── Cria o overlay injetando no player ──
function createOverlay() {
  if (subtitleContainer && document.body.contains(subtitleContainer)) return;

  const container = getPlayerContainer();
  
  subtitleContainer = document.createElement('div');
  subtitleContainer.id = 'live-translator-overlay';
  
  // Adiciona a classe top se o usuário escolheu no painel
  if (currentStyle && currentStyle.position === 'top') {
    subtitleContainer.classList.add('pos-top');
  }

  container.appendChild(subtitleContainer);
}

// ── FULLSCREEN CHANGE (Apenas para redimensionar a fonte) ──
function handleFullscreenChange() {
  if (!subtitleContainer) return;
  // O CSS e o DOM já resolvem a posição. Só precisamos recalcular o tamanho da fonte.
  Array.from(subtitleContainer.children).forEach(el => applyStyleToLine(el, currentStyle));
}

document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

// ── Legenda ──
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, t => (
    {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t]
  ));
}

function updateSubtitle(text, isFinal, speakerId, startId) {
  createOverlay();
  if (!subtitleContainer) return;

  const style = currentStyle || getDefaultStyle();

  // Atualiza posição CSS (top/bottom)
  if (style.position === 'top') {
    subtitleContainer.classList.add('pos-top');
  } else {
    subtitleContainer.classList.remove('pos-top');
  }

  // Define um ID único e seguro baseado no tempo de início (start)
  const safeId = startId ? startId.toString().replace('.', '-') : Date.now();
  const lineId = `tt-line-${safeId}`;

  let lineEl = document.getElementById(lineId);
  if (!lineEl) {
    lineEl = document.createElement('div');
    lineEl.className = 'tt-subtitle-line';
    lineEl.id = lineId;
    subtitleContainer.appendChild(lineEl);

    const MAX_LINES = 2;
    while (subtitleContainer.children.length > MAX_LINES) {
      subtitleContainer.removeChild(subtitleContainer.firstChild);
    }
  }

  let prefix = '';
  if (style.showSpeakerIcon && speakerId !== undefined && speakerId !== null) {
    if (speakerId === 0) {
      prefix = '<span class="tt-streamer">👑 </span>';
      lineEl.classList.add('speaker-0');
      lineEl.classList.remove('speaker-1');
    } else {
      prefix = '<span class="tt-guest">🎤 </span>';
      lineEl.classList.add('speaker-1');
      lineEl.classList.remove('speaker-0');
    }
  } else {
    lineEl.classList.remove('speaker-0','speaker-1');
  }

  lineEl.innerHTML = prefix + escapeHTML(text);
  applyStyleToLine(lineEl, style);

  clearTimeout(subtitleClearTimeout);
  subtitleClearTimeout = setTimeout(() => {
    if (subtitleContainer) {
      subtitleContainer.innerHTML = '';
      currentSubtitleLine = null;
    }
  }, 4000);
}

// ── Mensagens ──
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'UPDATE_SUBTITLE') {
    updateSubtitle(message.text, message.isFinal, message.speaker, message.startId);
  }
  if (message.action === 'UPDATE_STYLE') {
    currentStyle = message.style;
    if (subtitleContainer) {
      if (currentStyle.position === 'top') subtitleContainer.classList.add('pos-top');
      else subtitleContainer.classList.remove('pos-top');
      
      Array.from(subtitleContainer.children).forEach(el => applyStyleToLine(el, currentStyle));
    }
  }
});
