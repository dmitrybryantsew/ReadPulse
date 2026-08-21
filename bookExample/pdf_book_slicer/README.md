# PDF Book Slicer

Extracts selected page ranges from PDF books. The GUI handles simple page
slicing, bookmark metadata splitting, and the CLI also supports text export, embedded
outline/bookmark listing, outline export, and grouped chapter collections.

This tool is useful for:

- Cutting a chapter or page range from a larger PDF.
- Exporting a PDF page range as `.pdf` or `.txt`.
- Splitting PDFs by embedded outline/bookmark metadata.
- Saving metadata split PDFs into an Obsidian vault under `SplitPDFs/<bookName>/`.
- Listing embedded PDF bookmarks without scanning the whole book body.
- Building multiple chapter collections from outline/bookmark metadata.

## Location

Plugin folder:

```text
app/plugins/pdf_book_slicer
```

CLI module:

```text
app.plugins.pdf_book_slicer.cli
```

Default output root:

```text
output
```

Default sliced PDF output shape:

```text
output/<bookName>/<start-end>/<bookName>_<start-end>.pdf
```

## GUI Usage

From the GeneralTools app:

1. Run `.\run.ps1` from the repository root.
2. Open `PDF Book Slicer`.
3. Click `Select PDF`.
4. Choose `Start Page` and `End Page`.
5. Click `Slice PDF`.

The GUI writes a PDF range using the default output shape above.

To split a book into selected bookmark/metadata PDFs:

1. Select the PDF.
2. Click `Preprocess Bookmarks`.
3. Check items in the bookmark tree.
4. Optionally click `Check Top Level` to export one PDF per top-level entry.
5. Optionally choose an Obsidian vault root.
6. Keep `Save metadata split PDFs under SplitPDFs/<BookName>` checked to write into the vault.
7. Click `Export Checked Bookmark Ranges`.

Metadata split output includes an `index.md` manifest next to the generated files.
If a checked item has children, the exported file covers the whole subtree.
Checked descendants under a checked parent are ignored to avoid duplicate output.

## CLI Usage

Run commands from the repository root:

```powershell
cd H:\Common\Python\GeneralTools
```

Slice explicit pages:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --start 10 --end 35
```

Save to a specific file path:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --start 10 --end 35 --output-path "D:\Exports\chapter-1.pdf"
```

Extract the selected page range as text:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --start 10 --end 35 --output-format txt --output-path "D:\Exports\chapter-1.txt"
```

Use a different output root while keeping the normal folder structure:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --start 10 --end 35 --output-root "D:\Exports"
```

Split by PDF outline/bookmark metadata:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --split-paragraphs
```

Save bookmark split PDFs into an Obsidian vault:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --split-paragraphs --obsidian-root "D:\ObsidianVault"
```

That writes files under:

```text
D:\ObsidianVault\SplitPDFs\<bookName>\
```

For LLM ingestion without PDFs, use text output:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --split-paragraphs --paragraph-output-format txt
```

The raw extracted-text paragraph heuristic is still available, but it can create
thousands of files if the PDF layout inserts many blank lines:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --raw-text-paragraphs
```

## Outline And Bookmark Commands

Many PDFs expose chapter navigation through embedded bookmarks, also called a
PDF outline. This tool can use that metadata directly; it does not need a
printed table of contents page.

List embedded outline entries:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --list-outline
```

List only top-level numbered chapters:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --list-outline --outline-level 0 --title-pattern "^\d+\."
```

Save outline entries to a text file:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --export-outline --output-path "D:\Exports\book-outline.txt"
```

Save outline entries to a PDF file:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --export-outline --output-format pdf --output-path "D:\Exports\book-outline.pdf"
```

## Grouped Collections

Grouped collections split matching outline entries into `N` even groups, then
write one output file per group. This is useful for turning many chapters into
a smaller number of reading bundles.

Preview grouped collections without writing files:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --group-count 7 --outline-level 0 --title-pattern "^\d+\." --dry-run
```

Generate grouped collections:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --group-count 7 --outline-level 0 --title-pattern "^\d+\."
```

Generate grouped text collections:

```powershell
.\.venv\Scripts\python.exe -m app.plugins.pdf_book_slicer.cli "C:\path\book.pdf" --group-count 7 --outline-level 0 --title-pattern "^\d+\." --output-format txt --output-root "D:\Exports"
```

Grouped output is written under:

```text
output/<bookName>/outline_groups_<group-count>
```

## Recommended Workflow

1. Run `--list-outline` to see whether the PDF has usable bookmarks.
2. Add `--outline-level` and `--title-pattern` filters if the outline is noisy.
3. Run `--group-count N --dry-run` before writing grouped collections.
4. Rerun without `--dry-run` once the preview looks correct.
5. Use `--output-path` for one explicit page range.
6. Use `--output-root` for grouped exports or normal folder output elsewhere.

## Notes

- CLI page numbers are 1-based real PDF page indexes.
- PDF viewer page labels may differ from the actual page indexes used here.
- Some PDFs have no embedded outline, so grouped outline slicing will not work.
- Text export depends on extractable PDF text. Scanned PDFs may require OCR.
- Automatic metadata splitting requires embedded PDF outline/bookmarks.
- Raw text paragraph splitting depends on blank-line paragraph boundaries preserved by PDF text extraction.
- `--output-format` supports `pdf` and `txt`.
