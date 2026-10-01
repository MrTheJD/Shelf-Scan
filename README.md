# Shelf Scan

iPhone web app for Coca-Cola merchandisers at Walmart. Snap a photo of a shelf, say what you need, and small
speech and language models that run on the phone turn the recordings into a short pull list for the back room.

- `index.html` is the whole app (HTML, CSS and JS in one file).
- `ai-worker.js` runs the speech-to-text and language models off the main thread.
- `sw.js` and `manifest.webmanifest` let it be added to the home screen and work offline.
- `data/shared.json` is the product list shared by everyone; `data/key.json` is the encrypted upload key.
- Notes, photos and recordings stay on the phone. The models download once from Hugging Face when you tap Download in More, then run offline.

The camera and microphone need an **https://** address, so the app is hosted on GitHub Pages.

Local testing: `node .claude/serve.js`, then open http://localhost:5173 (localhost counts as secure for the camera and mic).
