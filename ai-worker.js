// Shelf Scan voice worker: runs the speech-to-text and language models off the main thread so the camera and
// the list stay smooth while a note is being read. Models are downloaded once (only when the person taps
// Download in More) and kept in the browser's cache; after that everything here runs on the phone, offline.
import { pipeline, env, TextStreamer, InterruptableStoppingCriteria } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODELS = {
  asr: { id: "Xenova/whisper-base.en", dtype: "q8", label: "Speech" },
  fast: { id: "onnx-community/Qwen2.5-0.5B-Instruct", dtype: "q4", label: "Language" },
};
const loaded = {};   // "asr" | "fast" -> { pipe, device }

const post = (type, data = {}) => self.postMessage({ type, ...data });

async function webgpuOK() {
  try { return !!(self.navigator && navigator.gpu && (await navigator.gpu.requestAdapter())); } catch (e) { return false; }
}

async function load(key, { gpu = true } = {}) {
  if (loaded[key]) return loaded[key];
  const m = MODELS[key];
  const track = {};
  const progress_callback = p => {
    if (p.status === "progress" && p.file) {
      track[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
      let l = 0, t = 0; for (const f in track) { l += track[f].loaded; t += track[f].total; }
      post("progress", { key, loaded: l, total: t });
    }
  };
  // Language models use the phone's graphics chip when it has WebGPU (about 50x faster than the processor), but
  // only after it passes a quick accuracy check: some GPUs quietly give wrong answers with small models.
  const useGpu = key !== "asr" && gpu && (await webgpuOK());
  const attempts = useGpu ? [{ device: "webgpu" }, { device: "wasm" }] : [{ device: "wasm" }];
  let lastErr;
  for (const a of attempts) {
    try {
      const pipe = await pipeline(key === "asr" ? "automatic-speech-recognition" : "text-generation", m.id, { device: a.device, dtype: m.dtype, progress_callback });
      if (key !== "asr" && a.device === "webgpu") {
        const r = await runExtract(pipe, "webgpu", "Four of the Sprite two liters please.");
        const it = r.items && r.items[0];
        if (!(r.items && r.items.length === 1 && it && /sprite/i.test(String(it.product)) && Number(it.qty) === 4)) throw new Error("graphics chip gave a wrong answer");
      }
      loaded[key] = { pipe, device: a.device };
      return loaded[key];
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
const SYSTEM = `A store merchandiser left a short voice note about one empty or low shelf spot. List each product they need restocked, and how many.
Reply with JSON only: {"items":[{"product":"","qty":null}]}
- product: the brand, flavor, size and pack the speaker said, in their own words (for example "diet coke 12 pack" or "sprite 2 liter").
- qty: how many they need, as a number. A pack size like "twelve pack" is NOT the quantity. Use null if they give no amount. If they change their mind, use the last number. A couple is 2.
- If no product is named, reply {"items":[]}.`;
const SHOTS = [
  ["Need like three Barq's root beer twelve packs, shelf is bare.", { items: [{ product: "barq's root beer 12 pack", qty: 3 }] }],
  ["Sprite Zero twenty ounce, four, and Powerade orange twenty ounce, six of those.", { items: [{ product: "sprite zero 20 ounce", qty: 4 }, { product: "powerade orange 20 ounce", qty: 6 }] }],
  ["Um, the Fanta pineapple two liter, I'd say maybe five, no, six.", { items: [{ product: "fanta pineapple 2 liter", qty: 6 }] }],
  ["We're out of the Fresca grapefruit cans.", { items: [{ product: "fresca grapefruit cans", qty: null }] }],
  ["Nothing here but dust, honestly.", { items: [] }],
];
// On the processor, time grows with prompt length, so it gets a shorter prompt (fewer examples).
const SYSTEM_SHORT = `List each product the speaker needs restocked and how many. Reply with JSON only: {"items":[{"product":"","qty":null}]}. A pack size like "twelve pack" is not the quantity. qty is null if no amount is given. No product: {"items":[]}.`;
const messagesFor = (note, device) => {
  const shots = device === "webgpu" ? SHOTS : [SHOTS[0], SHOTS[1], SHOTS[4]];
  return [
    { role: "system", content: device === "webgpu" ? SYSTEM : SYSTEM_SHORT },
    ...shots.flatMap(([u, a]) => [{ role: "user", content: u }, { role: "assistant", content: JSON.stringify(a) }]),
    { role: "user", content: note },
  ];
};

// The first complete {...} in the text, or null. Small models sometimes keep rambling after a correct answer.
function firstJSON(s) {
  const a = s.indexOf("{"); if (a < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = a; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { try { return JSON.parse(s.slice(a, i + 1)); } catch (e) { return null; } }
  }
  return null;
}

async function runExtract(pipe, device, text) {
  let acc = "";
  const stop = new InterruptableStoppingCriteria();
  const streamer = new TextStreamer(pipe.tokenizer, {
    skip_prompt: true, skip_special_tokens: true,
    callback_function: t => { acc += t; if (firstJSON(acc)) stop.interrupt(); },   // the answer is complete: stop generating
  });
  const out = await pipe(messagesFor(text, device), { max_new_tokens: 140, do_sample: false, return_full_text: false, streamer, stopping_criteria: stop });
  let full = out[0].generated_text; if (Array.isArray(full)) full = full.at(-1).content;
  const j = firstJSON(acc) || firstJSON(full || "");
  return { items: j && Array.isArray(j.items) ? j.items : null, raw: (acc || full || "").slice(0, 300) };
}
async function extract(llmKey, text) {
  const r = loaded[llmKey] || await load(llmKey);
  return runExtract(r.pipe, r.device, text);
}
self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === "probe") {
      post("probe", { webgpu: await webgpuOK(), threads: self.crossOriginIsolated ? "multi" : "single" });
    } else if (m.type === "load") {
      const r = await load(m.key, { gpu: m.gpu !== false });
      post("ready", { key: m.key, device: r.device });
    } else if (m.type === "unload") {
      delete loaded[m.key]; post("unloaded", { key: m.key });
    } else if (m.type === "transcribe") {
      const t0 = Date.now();
      const { pipe } = await load("asr");
      const r = await pipe(m.pcm, { return_timestamps: false });
      post("text", { id: m.id, text: String(r.text || "").trim(), ms: Date.now() - t0 });
    } else if (m.type === "extract") {
      const t0 = Date.now();
      const r = await extract(m.key, m.text);
      post("items", { id: m.id, ...r, ms: Date.now() - t0 });
    }
  } catch (err) {
    post("error", { id: m.id, key: m.key, message: String((err && err.message) || err) });
  }
};
post("boot");
