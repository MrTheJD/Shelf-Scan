# Shelfie

iPhone web app for Coca-Cola merchandisers at Walmart. Snap an aisle, shelf or display, tap again for close-ups of what's low, and tag
it with a category (Coke, Dr Pepper, Sprite, Sport drinks, Energy drinks). The Gallery tab is the pull list and the Before/After photos;
the Displays tab keeps each store's displays from visit to visit so none get missed.

- `index.html` is the whole app (HTML, CSS and JS in one file).
- `sw.js` and `manifest.webmanifest` let it be added to the home screen and work offline.
- Everything stays on the phone: photos in IndexedDB, the rest in localStorage. Backups are files saved from More.

The camera needs an **https://** address, so the app is hosted on GitHub Pages.

Local testing: `node .claude/serve.js`, then open http://localhost:5173 (localhost counts as secure for the camera).
