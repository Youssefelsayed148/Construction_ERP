# L8 PDF renderer spike

Date: 2026-10-14. Samples use the existing shared `procurementPdf.renderDocument` layout for PDFKit and a local Playwright Chromium print candidate. Each sample has English and Arabic PDFs; the table-heavy register has 46 rows and crosses page boundaries. The HTML candidate embeds the installed IBM Plex Sans and IBM Plex Sans Arabic WOFF2 files as data URLs, so this spike makes no runtime font requests.

## Decision

Use **HTML to PDF with headless Chromium** behind one shared renderer. PDFKit's standard-font layout produced corrupted Arabic text and labels in all three samples. Chromium rendered connected Arabic glyphs, right-to-left headings and columns, Latin document numbers, mixed Arabic/English cells, units, and readable page breaks. The register repeats its table header and carries page numbers in the footer.

| Sample | PDFKit Arabic | Chromium Arabic |
|---|---|---|
| Invoice | [PNG](pdf-spike/invoice-ar-pdfkit-page-1.png), [PDF](pdf-spike/invoice-ar-pdfkit.pdf) | [PNG](pdf-spike/invoice-ar-chromium-pdf-page-1.png), [PDF](pdf-spike/invoice-ar-chromium.pdf) |
| Payment certificate | [PNG](pdf-spike/certificate-ar-pdfkit-page-1.png), [PDF](pdf-spike/certificate-ar-pdfkit.pdf) | [PNG](pdf-spike/certificate-ar-chromium-pdf-page-1.png), [PDF](pdf-spike/certificate-ar-chromium.pdf) |
| Table-heavy WIR register, page 1 | [PNG](pdf-spike/register-ar-pdfkit-page-1.png) | [PNG](pdf-spike/register-ar-chromium-pdf-page-1.png) |
| Table-heavy WIR register, page 2 | [PNG](pdf-spike/register-ar-pdfkit-page-2.png) | [PNG](pdf-spike/register-ar-chromium-pdf-page-2.png) |

The English PDFs are also retained for comparison: [invoice](pdf-spike/invoice-en-chromium.pdf), [certificate](pdf-spike/certificate-en-chromium.pdf), and [register](pdf-spike/register-en-chromium.pdf). All generated PDFs and rendered page images are in [`docs/i18n/pdf-spike/`](pdf-spike/). The repeatable command is `cd frontend; npm run i18n:pdf-spike`.

## Observations and remaining checks

- Arabic was visually inspected in the PNGs produced by rasterizing the PDFs with PDF.js. The invoice and certificate fit on one page; the register paginates and repeats its heading row.
- Arabic numbers are localized in the examples. Document IDs, units, and English source text remain legible as mixed-direction values.
- PDF.js exposes Arabic runs as presentation glyphs in visual order. The spike checks expected Arabic terms after normalizing those runs; exact logical-order extraction of arbitrary multiword Arabic fields, mixed user text, and all production document kinds remains an integration requirement.
- This is a renderer decision and representative spike, not a migration of production exporters. Backend Chromium packaging, locale propagation, production templates, all PDFKit call-site migrations, CSV localization/BOM, and production offline verification remain open.
- IBM Plex fonts are installed and licensed in [THIRD_PARTY_FONTS.md](../THIRD_PARTY_FONTS.md). The frontend CSP already allows only same-origin fonts. Backend PDF generation must bundle the same font files into its runtime image.
