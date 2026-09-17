# Clearpage — PDF metadata viewer

[Open the live app](https://dev1niscool.github.io/pdf-metadata/)

Drop a PDF into the browser to inspect its document properties, XMP, attachment details, object-level fields and detected C2PA/JUMBF payloads. Download a fresh, image-only PDF with source metadata removed. No PDF uploads, accounts, analytics, or external runtime CDNs.

## Removal behavior

The cleaner renders each visible page using PDF.js (annotations disabled), embeds freshly encoded PNG pixels in a new pdf-lib document, and saves without an Info dictionary or document IDs. It never copies source PDF objects or original embedded image bytes. This removes embedded metadata, XMP, C2PA records, attachments, scripts, hidden text, annotations, forms, links, accessibility tags and original digital signatures. Output is re-parsed and checked before download.

**This is flattening, not redaction.** Visible identifying content and visible watermarks remain. Text is no longer searchable or selectable, and files may become larger. Default quality is 180 DPI; 240 and 300 DPI are available, with a per-page cap of 16 megapixels and 8192 pixels per side to bound canvas memory. Large documents can still exhaust browser memory; process smaller documents if that happens. Input limit: 100 MB.

The viewer is a best-effort inspector, not an exhaustive forensic scanner or C2PA signature validator. It decodes supported CBOR/JSON/XML JUMBF payloads without validating claims. Some encrypted or unusual documents may not support extended object inspection; rendering remains available if PDF.js can open them. Passwords are used only locally.

The OS assigns filenames, permissions and file timestamps. These cannot be erased by a webpage. Exports use `cleaned.pdf`. PDF version, MIME type, page dimensions/count and file size remain necessary structural information.

## Development

Requires Node.js 22+ and pnpm 10.17.1.

```sh
pnpm install
pnpm dev
pnpm test
pnpm build
```

The production build serves all dependencies, font assets, CMaps and WASM locally. The Vite development server does not copy those optional assets until build; use `pnpm build && pnpm preview` for complete production-like testing.

Tests generate a synthetic PDF containing author/title/date metadata, compressed XMP, a compressed C2PA-style payload, an attachment, JavaScript, annotations and a rotated page. They check extraction, removal, output structure, cancellation and rendered pixel similarity.

GitHub Actions tests and builds each push to `main`, then publishes `dist` to GitHub Pages. Repository Settings → Pages must use **GitHub Actions** as the source.

Built using [PDF.js](https://mozilla.github.io/pdf.js/), [pdf-lib](https://pdf-lib.js.org/) and [cbor-x](https://github.com/kriszyp/cbor-x).
