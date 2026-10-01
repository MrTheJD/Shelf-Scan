// Speech worker: turns a recording into words (Whisper) off the main thread so the camera and the list stay
// smooth. The model downloads once (only when the person taps Download in More) and is kept in the browser's
// cache; after that it runs on the phone, offline. (Smart reading uses a separate worker: llm-worker.js.)
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm";

env.allowLocalModels = false;
env.useBrowserCache = true;
// Keep memory low on phones: one thread, and no big pre-reserved memory pool.
try { env.backends.onnx.wasm.numThreads = 1; } catch (e) {}

const MODELS = { tiny: "Xenova/whisper-tiny.en", base: "Xenova/whisper-base.en" };
const DTYPE = "q8";
let asr = null, asrFor = "", loading = null, loadingFor = "";

const post = (type, data = {}) => self.postMessage({ type, ...data });

function load(model) {
  model = MODELS[model] ? model : "tiny";
  if (asr && asrFor === model) return Promise.resolve(asr);
  if (loading && loadingFor === model) return loading;
  asr = null; asrFor = ""; loadingFor = model;   // a different size was asked for: let go of the old one
  return (loading = (async () => {
    const track = {};
    const progress_callback = p => {
      if (p.status === "progress" && p.file) {
        track[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
        let l = 0, t = 0; for (const f in track) { l += track[f].loaded; t += track[f].total; }
        post("progress", { key: "asr", loaded: l, total: t });
      }
    };
    // Base: skip the graph optimizer too. It makes extra copies of the weights while loading, which is the biggest memory spike.
    const p = await pipeline("automatic-speech-recognition", MODELS[model], { device: "wasm", dtype: DTYPE, progress_callback, session_options: { enableCpuMemArena: false, enableMemPattern: false, graphOptimizationLevel: model === "base" ? "disabled" : "basic" } });
    asr = p; asrFor = model;
    return p;
  })().finally(() => { loading = null; }));
}

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === "probe") {
      post("probe", { threads: self.crossOriginIsolated ? "multi" : "single" });
    } else if (m.type === "load") {
      await load(m.model); post("ready", { key: "asr", device: "wasm" });
    } else if (m.type === "transcribe") {
      const t0 = Date.now();
      const pipe = await load(m.model);
      // Ask for a time on every word (the note player lights them up as they are said); if that fails, plain text still works.
      const dur = m.pcm.length / 16000;
      let r, words = null;
      try {
        r = await pipe(m.pcm, { return_timestamps: "word" });
        const raw = (r.chunks || []).map(c => [String(c.text || "").trim(), c.timestamp && c.timestamp[0], c.timestamp && c.timestamp[1]]).filter(w => w[0] && w[1] != null && w[1] < dur + 0.5);
        words = raw.map((w, i) => [w[0], +w[1].toFixed(2), +Math.min(w[2] == null ? (raw[i + 1] ? raw[i + 1][1] : dur) : w[2], dur).toFixed(2)]);
      } catch (err) { r = await pipe(m.pcm, { return_timestamps: false }); }
      post("text", { id: m.id, text: String(r.text || "").trim(), words, ms: Date.now() - t0 });
    }
  } catch (err) {
    post("error", { id: m.id, key: m.key, message: String((err && err.message) || err) });
  }
};
post("boot");
