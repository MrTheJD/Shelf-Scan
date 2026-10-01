// Speech worker: turns a recording into words (Whisper) off the main thread so the camera and the list stay
// smooth. The model downloads once (only when the person taps Download in More) and is kept in the browser's
// cache; after that it runs on the phone, offline. (Smart reading uses a separate worker: llm-worker.js.)
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm";

env.allowLocalModels = false;
env.useBrowserCache = true;
// Keep memory low on phones: one thread, and no big pre-reserved memory pool.
try { env.backends.onnx.wasm.numThreads = 1; } catch (e) {}

const ASR = { id: "Xenova/whisper-base.en", dtype: "q8" };
let asr = null, loading = null;

const post = (type, data = {}) => self.postMessage({ type, ...data });

function load() {
  if (asr) return Promise.resolve(asr);
  return loading || (loading = (async () => {
    const track = {};
    const progress_callback = p => {
      if (p.status === "progress" && p.file) {
        track[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
        let l = 0, t = 0; for (const f in track) { l += track[f].loaded; t += track[f].total; }
        post("progress", { key: "asr", loaded: l, total: t });
      }
    };
    asr = await pipeline("automatic-speech-recognition", ASR.id, { device: "wasm", dtype: ASR.dtype, progress_callback, session_options: { enableCpuMemArena: false, enableMemPattern: false, graphOptimizationLevel: "basic" } });
    return asr;
  })().finally(() => { loading = null; }));
}

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === "probe") {
      post("probe", { threads: self.crossOriginIsolated ? "multi" : "single" });
    } else if (m.type === "load") {
      await load(); post("ready", { key: "asr", device: "wasm" });
    } else if (m.type === "transcribe") {
      const t0 = Date.now();
      const pipe = await load();
      const r = await pipe(m.pcm, { return_timestamps: false });
      post("text", { id: m.id, text: String(r.text || "").trim(), ms: Date.now() - t0 });
    }
  } catch (err) {
    post("error", { id: m.id, key: m.key, message: String((err && err.message) || err) });
  }
};
post("boot");
