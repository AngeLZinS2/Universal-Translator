// background.js - Service Worker
// Gerencia a inicialização da captura de áudio usando Offscreen Documents (Padrão MV3)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_CAPTURE") {
    startCapture(message.tabId, message.esportsMode);
  } else if (message.action === "STOP_CAPTURE") {
    stopCapture();
  } else if (message.action === "UPDATE_CAPTURE_SETTINGS") {
    // Repassa as novas configurações para o Offscreen Document sem reiniciar o áudio
    chrome.runtime.sendMessage({ action: "UPDATE_CAPTURE_SETTINGS", settings: message.settings })
      .catch(() => {}); // Offscreen pode não estar ativo
  }
});

async function startCapture(tabId, esportsMode) {
  // No MV3, capturamos a streamId e passamos para um Offscreen Document processar
  chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, async (streamId) => {
    if (!streamId) {
      console.error("Falha ao obter streamId da aba. Verifique as permissões de aba ativa.");
      return;
    }

    // Salva no storage para sobreviver ao reinício do Service Worker (MV3)
    await chrome.storage.session.set({ capturingTabId: tabId });

    // Cria o documento invisível (offscreen) que tem acesso às APIs do DOM/Áudio
    await setupOffscreenDocument('offscreen.html');

    // Recupera configurações e envia para o documento offscreen iniciar a API de IA
    chrome.storage.local.get(['apiKey', 'sourceLang', 'targetLang', 'esportsGame'], (settings) => {
      chrome.runtime.sendMessage({
        action: "PROCESS_AUDIO_STREAM",
        streamId: streamId,
        settings: { ...settings, esportsMode: !!esportsMode },
        tabId: tabId
      });
    });
  });
}

async function stopCapture() {
  await chrome.storage.session.remove('capturingTabId');
  chrome.storage.local.set({ isActive: false });
  // Avisa o offscreen para parar e desconectar
  chrome.runtime.sendMessage({ action: "STOP_AUDIO_PROCESS" });
  closeOffscreenDocument();
}

// Configuração do Offscreen Document
async function setupOffscreenDocument(path) {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(path)]
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: path,
    reasons: ['USER_MEDIA'],
    justification: 'Capturar e processar o áudio da live para gerar legendas.'
  });
}

async function closeOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (existingContexts.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}

// Intercepta as legendas vindas do Offscreen Document e repassa para a aba ativa (Content Script)
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "UPDATE_SUBTITLE") {
    chrome.storage.session.get(['capturingTabId'], (result) => {
      if (result.capturingTabId) {
        chrome.tabs.sendMessage(result.capturingTabId, message).catch(() => {
          // Ignora erro caso a página seja recarregada ou fechada repentinamente
        });
      }
    });
  }
});
