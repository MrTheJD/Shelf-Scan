# Shelf Scan (alpha)

iPhone web app for Coca-Cola merchandisers at Walmart. Scan shelf-tag QR codes or product barcodes to build a back-stock pull list.

- `index.html` is the whole app (HTML, CSS and JS in one file).
- `sw.js` and `manifest.webmanifest` let it be added to the home screen and work offline.
- Data is stored on the phone only, in localStorage. Use More → Export backup.
- Product lookups and images come from Open Food Facts (CC-BY-SA).

The camera needs an **https://** address, so the app must be hosted somewhere like GitHub Pages to run on a phone.

Local testing: `node .claude/serve.js`, then open http://localhost:5173. Use "Type a code instead" to simulate scans.
