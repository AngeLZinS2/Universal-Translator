// audio-processor.js — AudioWorklet Processor
// Roda em uma thread dedicada de áudio (AudioWorkletGlobalScope)
// Coleta chunks de PCM Float32 e os converte para Int16 antes de enviar para o offscreen

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferSize = 2048; // Tamanho do chunk enviado (equivalente ao antigo ScriptProcessor)
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono (canal 0)

    // Acumula amostras no buffer interno
    for (let i = 0; i < channelData.length; i++) {
      this._buffer.push(channelData[i]);
    }

    // Quando tiver amostras suficientes, converte para Int16 e envia via port
    while (this._buffer.length >= this._bufferSize) {
      const chunk = this._buffer.splice(0, this._bufferSize);
      const int16 = new Int16Array(this._bufferSize);
      for (let i = 0; i < this._bufferSize; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      // Transfere o buffer para o offscreen document (zero-copy)
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }

    return true; // Mantém o processador vivo
  }
}

registerProcessor('pcm-processor', PCMProcessor);
