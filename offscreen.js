// offscreen.js - Roda no Offscreen Document
// Lida com captura de áudio via Web Audio API e envio por WebSocket

let audioContext;
let workletNode;
let mediaStream;
let websocket;
let sourceNode;

// ── Configurações ativas no módulo (atualizáveis sem reiniciar o áudio) ──
let activeSettings = null;
let workletReady   = false;

const STREAM_KEYWORDS = [
  "sub","prime","sub prime","resub","donate","bits","cheer","raid","host",
  "chat","mod","vip","ban","timeout","emote","pog","pogchamp","kappa","pepega","monkas",
  "follow","follower","stream","live","streamer","inscrito","escorregou o prime",
  // Reações e Exclamações comuns
  "nooo","noooo","yesss","yessss","woohoo","omg","wow","lets go","let's go","gg","ggs","wtf","lol","lmao","haha","lmfao"
].map(w => encodeURIComponent(w + ":2")).join("&keywords=");

// ── Palavras-chave para boost no Modo Esports ──
const ESPORTS_KEYWORDS = [
  "clutch","ace","pentakill","quadrakill","triple kill","double kill",
  "flashpoint","overtime","round","comeback","flank","push","rotate",
  "economy","buy round","eco round","half time","pistol round",
  "gank","baron","dragon","rift herald","inhibitor","nexus","turret",
  "jungler","support","mid lane","bot lane","top lane","smite",
  "defuse","spike","ct side","t side","plant","retake","boost","peek",
  "awp","rifle","pistol","flash","molotov","grenade",
  "orb","operator","phantom","vandal",
  "headshot","spray","one tap","crossfire","angle","entry","lurk",
  "tower","carry","feed","leash","invade","ward","vision","buff",
  "incredible","unbelievable","massive","huge play","insane",
  // Gírias e termos estrangeiros comuns no Brasil (Misto de PT/EN)
  "rushar","upar","gankar","farmar","caitar","ultar","trollar","pinar","stunar",
  "spell","skill","ultimate","smurfar","dar call","fazer a play","x1","varado",
  "pixel","bang","bangou","smokou","flick","botar a cara","pescar","pinou","clipar"
].map(w => encodeURIComponent(w + ":2")).join("&keywords=");

const GAME_KEYWORDS = {
  valorant: [
    "jett","phoenix","reyna","raze","yoru","neon","fade","breach","kay/o","skye","sova",
    "killjoy","cypher","sage","chamber","omen","brimstone","viper","astra","harbor","deadlock","iso","clove",
    "bind","haven","split","ascent","icebox","breeze","fracture","pearl","lotus","sunset","abyss"
  ],
  lol: [
    "aatrox","ahri","akali","akshan","alistar","amumu","anivia","annie","aphelios","ashe","aurelion sol","azir","bard","bel'veth","blitzcrank","brand","braum","briar",
    "caitlyn","camille","cassiopeia","cho'gath","corki","darius","diana","dr. mundo","draven","ekko","elise","evelynn","ezreal","fiddlesticks","fiora","fizz",
    "galio","gangplank","garen","gnar","gragas","graves","gwen","hecarim","heimerdinger","hwei","illaoi","irelia","ivern","janna","jarvan iv","jax","jayce","jhin","jinx",
    "k'sante","kai'sa","kalista","karma","karthus","kassadin","katarina","kayle","kayn","kennen","kha'zix","kindred","kled","kog'maw","leblanc","lee sin","leona","lillia","lissandra","lucian","lulu","lux",
    "malphite","malzahar","maokai","master yi","milio","miss fortune","mordekaiser","morgana","naafiri","nami","nasus","nautilus","neeko","nidalee","nilah","nocturne","nunu","olaf","orianna","ornn",
    "pantheon","poppy","pyke","qiyana","quinn","rakan","rammus","rek'sai","rell","renata glasc","renekton","rengar","riven","rumble","ryze",
    "samira","sejuani","senna","seraphine","sett","shaco","shen","shyvana","singed","sion","sivir","skarner","smolder","sona","soraka","swain","sylas","syndra",
    "tahm kench","taliyah","talon","taric","teemo","thresh","tristana","trundle","tryndamere","twisted fate","twitch","udyr","urgot","varus","vayne","veigar","vel'koz","vex","vi","viego","viktor","vladimir","volibear",
    "warwick","wukong","xayah","xerath","xin zhao","yasuo","yone","yorick","yuumi","zac","zed","zeri","ziggs","zilean","zoe","zyra",
    "summoner's rift","aram","baron nashor","elder dragon","hextech","chemtech","faker"
  ],
  cs: [
    "dust2","mirage","inferno","nuke","overpass","vertigo","ancient","anubis",
    "ak-47","m4a4","m4a1-s","awp","deagle","glock","usp-s","famas","galil",
    "drop","ct","tr","bomb","defuse kit","kevlar"
  ],
  marvel: [
    "adam warlock","black panther","bruce banner","captain america","cloak and dagger","doctor strange","groot","hawkeye","hela","hulk","iron man",
    "jeff the land shark","loki","luna snow","magik","magneto","mantis","moon knight","namor","peni parker","psylocke","punisher","rocket raccoon",
    "scarlet witch","spider-man","star-lord","storm","thor","venom","winter soldier","wolverine","galacta"
  ]
};

// ── Mensagens recebidas ──
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "PROCESS_AUDIO_STREAM") {
    startAudioProcessing(message.streamId, message.settings);
  } else if (message.action === "STOP_AUDIO_PROCESS") {
    stopAudioProcessing();
  } else if (message.action === "UPDATE_CAPTURE_SETTINGS") {
    handleSettingsUpdate(message.settings);
  }
});

// ── Decisão inteligente: reinicia WS só se necessário ──
function handleSettingsUpdate(newSettings) {
  if (!audioContext || !sourceNode) return;

  const prevSourceLang = activeSettings?.sourceLang;
  const prevEsports    = activeSettings?.esportsMode;

  // Atualiza as configurações imediatamente
  activeSettings = { ...activeSettings, ...newSettings };

  const sourceLangChanged = newSettings.sourceLang && newSettings.sourceLang !== prevSourceLang;
  const esportsModeChanged = newSettings.esportsMode !== undefined && newSettings.esportsMode !== prevEsports;
  const esportsGameChanged = newSettings.esportsGame !== undefined && newSettings.esportsGame !== activeSettings.esportsGame;

  if (sourceLangChanged || esportsModeChanged || esportsGameChanged) {
    // Idioma da ORIGEM, modo Esports ou Jogo mudou → precisa reconectar o Deepgram
    console.log(`[LiveTranslator] Reconectando WebSocket: origem ${activeSettings.sourceLang}, esports ${activeSettings.esportsMode}, game ${activeSettings.esportsGame}`);
    reconnectWebSocket();
  } else {
    // Apenas idioma de DESTINO (tradução) ou outra configuração secundária mudou
    // → Sem reiniciar NADA! A próxima chamada ao Google Translate já usará o novo idioma.
    console.log(`[LiveTranslator] Idioma de destino atualizado para "${activeSettings.targetLang}" — sem interrupção.`);
  }
}

// ── Constrói a URL do WebSocket Deepgram ──
function buildWebSocketUrl(settings) {
  const isEsports    = settings.esportsMode === true;
  const endpointing  = isEsports ? 150  : 300;
  const utteranceEnd = isEsports ? 1000 : 2000;
  const params = [
    `language=${settings.sourceLang}`,
    `model=nova-2`,
    `encoding=linear16`,
    `sample_rate=${audioContext.sampleRate}`,
    `endpointing=${endpointing}`,
    `utterance_end_ms=${utteranceEnd}`,
    `smart_format=true`,
    `interim_results=true`,
    `diarize=true`,
    `punctuate=true`,
    `filler_words=false`,
    `keywords=${STREAM_KEYWORDS}`
  ];
  if (isEsports) {
    let kw = ESPORTS_KEYWORDS;
    if (settings.esportsGame && GAME_KEYWORDS[settings.esportsGame]) {
      kw += "&keywords=" + GAME_KEYWORDS[settings.esportsGame].map(w => encodeURIComponent(w + ":2")).join("&keywords=");
    }
    params.push(`keywords=${kw}`);
  }
  return `wss://api.deepgram.com/v1/listen?${params.join('&')}`;
}

// ── Conecta (ou reconecta) o WebSocket sem interromper o áudio ──
// Estratégia: abre a nova conexão PRIMEIRO, só fecha a antiga quando a nova está pronta.
// Isso elimina qualquer lacuna de envio de áudio.
function connectWebSocket(settings) {
  const isEsports  = settings.esportsMode === true;
  const throttleMs = isEsports ? 200 : 400;

  const url   = buildWebSocketUrl(settings);
  const newWs = new WebSocket(url, ['token', settings.apiKey]);

  let lastTranslateTime       = 0;
  let lastProcessedFinalStart = -1;
  let translateSeqs           = {};
  let pendingInterimText      = null;

  async function translateAndSend(text, isFinal, speaker, start) {
    // Sempre lê do activeSettings — pode ter sido atualizado enquanto traduzia
    const tl = activeSettings?.targetLang || settings.targetLang;
    const sl = activeSettings?.sourceLang || settings.sourceLang;
    
    if (!translateSeqs[start]) translateSeqs[start] = 0;
    const currentSeq = ++translateSeqs[start];

    try {
      const url  = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
      const res  = await fetch(url);
      const data = await res.json();
      let translated = "";
      data[0].forEach(t => { translated += t[0]; });

      if (currentSeq < translateSeqs[start]) return;

      if (start <= lastProcessedFinalStart && !isFinal) return;
      if (isFinal) lastProcessedFinalStart = Math.max(lastProcessedFinalStart, start);

      if (translated) {
        chrome.runtime.sendMessage({
          action: "UPDATE_SUBTITLE", text: translated, isFinal, speaker, startId: start
        });
      }
    } catch {
      if (currentSeq < translateSeqs[start]) return;
      if (start <= lastProcessedFinalStart && !isFinal) return;
      if (isFinal) lastProcessedFinalStart = Math.max(lastProcessedFinalStart, start);
      chrome.runtime.sendMessage({ action: "UPDATE_SUBTITLE", text, isFinal, speaker, startId: start });
    }
  }

  newWs.onopen = async () => {
    console.log(`[LiveTranslator] WS aberto | ${settings.sourceLang}→${activeSettings?.targetLang} | ${isEsports ? '🎮 Esports' : '📺 Padrão'}`);

    // Fecha a conexão ANTIGA silenciosamente agora que a nova está pronta
    if (websocket && websocket !== newWs) {
      websocket.onclose   = null;
      websocket.onmessage = null;
      websocket.onerror   = null;
      websocket.close();
    }
    websocket = newWs;

    // Registra o AudioWorklet apenas na primeira vez
    if (!workletReady) {
      await audioContext.audioWorklet.addModule(chrome.runtime.getURL('audio-processor.js'));
      workletReady = true;
    }

    // Cria o WorkletNode na primeira vez; nas reconexões ele já existe
    if (!workletNode) {
      workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
      sourceNode.connect(workletNode);
      workletNode.connect(audioContext.destination);
    }

    // Redireciona o áudio do worklet para o novo WebSocket
    workletNode.port.onmessage = (e) => {
      if (websocket?.readyState === WebSocket.OPEN) {
        websocket.send(e.data);
      }
    };
  };

  newWs.onmessage = async (event) => {
    const response    = JSON.parse(event.data);
    const currentThrottle = activeSettings?.esportsMode ? 200 : throttleMs;

    if (response.type === "UtteranceEnd") {
      if (pendingInterimText) {
        translateAndSend(pendingInterimText.text, true, pendingInterimText.speaker, pendingInterimText.start);
        pendingInterimText = null;
      }
      return;
    }

    if (response.channel?.alternatives?.[0]) {
      const alt        = response.channel.alternatives[0];
      const transcript = alt.transcript;
      const start      = response.start || 0;
      const speaker    = alt.words?.[0]?.speaker ?? 0;

      if (transcript?.trim()) {
        if (response.is_final) {
          pendingInterimText = null;
          translateAndSend(transcript, true, speaker, start);
        } else {
          pendingInterimText = { text: transcript, speaker, start };
          const now = Date.now();
          if (now - lastTranslateTime > currentThrottle) {
            lastTranslateTime = now;
            translateAndSend(transcript, false, speaker, start);
          }
        }
      }
    }
  };

  newWs.onerror = (e) => console.error("[LiveTranslator] WS error:", e);

  newWs.onclose = () => {
    // Só para tudo se este WS ainda é o ativo (não foi substituído por um reconectar)
    if (websocket === newWs) {
      console.log("[LiveTranslator] WebSocket fechado — parando processamento.");
      stopAudioProcessing();
    }
  };
}

// ── Reconecta apenas o WebSocket (mantém áudio rodando) ──
function reconnectWebSocket() {
  connectWebSocket({ ...activeSettings });
}

// ── Inicia o pipeline completo: áudio + WebSocket ──
async function startAudioProcessing(streamId, settings) {
  try {
    activeSettings = { ...settings };
    workletReady   = false;

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false
    });

    audioContext = new AudioContext(); // Usa a qualidade máxima nativa (44.1kHz ou 48kHz)
    sourceNode   = audioContext.createMediaStreamSource(mediaStream);
    sourceNode.connect(audioContext.destination);

    connectWebSocket(settings);
  } catch (err) {
    console.error("[LiveTranslator] Erro ao iniciar captura:", err);
  }
}

// ── Para todo o pipeline ──
function stopAudioProcessing() {
  if (workletNode) { workletNode.port.close(); workletNode.disconnect(); workletNode = null; }
  if (sourceNode)  { sourceNode.disconnect();  sourceNode = null; }
  if (audioContext){ audioContext.close();      audioContext = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  if (websocket)   { websocket.onclose = null; websocket.close(); websocket = null; }
  activeSettings = null;
  workletReady   = false;
}
