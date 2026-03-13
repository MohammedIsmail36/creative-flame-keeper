

## Plan: Migrate PDF Engine from pdfmake-rtl to @react-pdf/renderer

### Why
`@react-pdf/renderer` uses familiar React/CSS-like syntax (JSX + StyleSheet), making layout adjustments intuitive and debuggable. It has proper RTL and custom font support via `Font.register()`.

### Scope
- **1 new dependency**: `@react-pdf/renderer`
- **1 file rewrite**: `src/lib/pdf-arabic.ts` — rebuild using React PDF components
- **0 caller changes**: Keep the same `exportInvoicePdf()` and `exportReportPdf()` function signatures

### Architecture

The exported functions will internally render React components to PDF blobs, then trigger download:

```text
exportInvoicePdf(options)
  → pdf(<InvoiceDocument {...options} />).toBlob()
  → saveAs(blob, filename)

exportReportPdf(options)  
  → pdf(<ReportDocument {...options} />).toBlob()
  → saveAs(blob, filename)
```

### Key Implementation Details

1. **Font Registration** — Register Tajawal (Regular/Bold/Medium) from `/public/fonts/` via `Font.register({ family: 'Tajawal', src: '/fonts/Tajawal-Regular.ttf' })`

2. **Invoice Template** (`<InvoiceDocument />`)
   - Gold top stripe + dark header with company info (right) and document badge (left)
   - Gray subheader bar with client details and metadata
   - Items table with zebra rows and light-colored header
   - Totals section with grand total highlight
   - Footer with company legal info and page numbers

3. **Report Template** (`<ReportDocument />`)
   - Same header style as invoices
   - Summary KPI cards row
   - Data table with zebra striping
   - Record count footer

4. **Styling** — Use `StyleSheet.create()` with the existing color palette (C object). All numbers/dates remain `en-US` format, all labels in Arabic.

5. **RTL** — Apply `direction: 'rtl'` and `textAlign: 'right'` at the page level.

### Tasks
1. Install `@react-pdf/renderer`, remove `pdfmake-rtl`
2. Rewrite `src/lib/pdf-arabic.ts` with React PDF components (same exports)
3. Test invoice and report PDF generation

