// Smart reading engine: runs the language model (WebLLM) in a worker so the app stays smooth.
// WebLLM streams the model into the graphics chip piece by piece, so it never holds the whole
// model in memory the way the speech library does. It needs WebGPU (iOS 26 and newer).
import { WebWorkerMLCEngineHandler } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = msg => handler.onmessage(msg);
