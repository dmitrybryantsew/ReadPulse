from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.plugins.pdf_book_slicer.slicer import (
    build_outline_slice_targets,
    default_output_root,
    export_outline,
    list_outline_entries,
    split_pdf_to_paragraphs,
    split_pdf_to_text_paragraphs,
    slice_outline_collections,
    slice_pdf_book,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Extract a page range from a PDF into "
            "output/<bookName>/<start-end>/<bookName>_<start-end>.pdf."
        )
    )
    parser.add_argument("pdf_path", help="Path to the source PDF")
    parser.add_argument("--start", type=int, help="First page to include (1-based)")
    parser.add_argument("--end", type=int, help="Last page to include (1-based)")
    parser.add_argument(
        "--output-root",
        default=str(default_output_root()),
        help="Optional output root override",
    )
    parser.add_argument(
        "--output-path",
        help="Optional exact output file path for explicit page slicing",
    )
    parser.add_argument(
        "--output-format",
        choices=("pdf", "txt"),
        default="pdf",
        help="Write sliced output as a PDF or extracted text file",
    )
    parser.add_argument(
        "--list-outline",
        action="store_true",
        help="Print outline entries with level and page number",
    )
    parser.add_argument(
        "--export-outline",
        action="store_true",
        help="Save outline entries to a text file instead of printing them",
    )
    parser.add_argument(
        "--outline-level",
        type=int,
        help="Filter outline entries by exact level; for grouping the default is 0",
    )
    parser.add_argument(
        "--title-pattern",
        help="Optional regex filter for outline titles, for example ^\\d+\\.",
    )
    parser.add_argument(
        "--group-count",
        type=int,
        help="Create N collections from matching outline entries instead of slicing explicit pages",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview matching outline slices or collection layout without writing PDFs",
    )
    parser.add_argument(
        "--split-paragraphs",
        action="store_true",
        help="Auto-split by PDF outline/bookmark metadata and write one file per item",
    )
    parser.add_argument(
        "--raw-text-paragraphs",
        action="store_true",
        help="Use the old extracted-text blank-line heuristic; can create many files",
    )
    parser.add_argument(
        "--paragraph-output-format",
        choices=("pdf", "txt"),
        default="pdf",
        help="Format for --split-paragraphs output files",
    )
    parser.add_argument(
        "--paragraph-min-chars",
        type=int,
        default=20,
        help="Skip extracted paragraphs shorter than this many characters",
    )
    parser.add_argument(
        "--obsidian-root",
        help="Obsidian vault root; paragraph output goes to SplitPDFs/<bookName>",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        pdf_path = Path(args.pdf_path)
        output_root = Path(args.output_root)
        output_path = Path(args.output_path) if args.output_path else None

        if args.split_paragraphs or args.raw_text_paragraphs:
            if output_path is not None:
                parser.error("--output-path is not supported with --split-paragraphs")
            paragraph_output_dir = None
            if args.obsidian_root:
                from app.plugins.pdf_book_slicer.slicer import safe_name

                paragraph_output_dir = (
                    Path(args.obsidian_root).expanduser().resolve()
                    / "SplitPDFs"
                    / safe_name(pdf_path.stem)
                )
            if args.raw_text_paragraphs:
                result = split_pdf_to_text_paragraphs(
                    pdf_path,
                    output_root=output_root,
                    output_dir=paragraph_output_dir,
                    min_chars=args.paragraph_min_chars,
                    output_format=args.paragraph_output_format,
                )
            else:
                result = split_pdf_to_paragraphs(
                    pdf_path,
                    output_root=output_root,
                    output_dir=paragraph_output_dir,
                    outline_level=args.outline_level,
                    output_format=args.paragraph_output_format,
                )
            print(f"Source: {result.source_path}")
            print(f"Mode: {result.mode}")
            print(f"Items: {result.paragraph_count}")
            print(f"Format: {result.output_format}")
            print(f"Output Dir: {result.output_dir}")
            print(f"Manifest: {result.manifest_path}")
            return 0

        if args.list_outline:
            entries = list_outline_entries(
                pdf_path,
                level=args.outline_level,
                title_pattern=args.title_pattern,
            )
            print(f"Outline Entries: {len(entries)}")
            for entry in entries:
                print(f"L{entry.level} P{entry.page_number}: {entry.title}")
            return 0

        if args.export_outline:
            result = export_outline(
                pdf_path,
                output_root=output_root,
                output_path=output_path,
                level=args.outline_level,
                title_pattern=args.title_pattern,
                output_format=args.output_format,
            )
            print(f"Source: {result.source_path}")
            print(f"Outline Entries: {result.entry_count}")
            print(f"Format: {result.output_format}")
            print(f"Output: {result.output_path}")
            return 0

        if args.group_count is not None:
            outline_level = 0 if args.outline_level is None else args.outline_level
            targets = build_outline_slice_targets(
                pdf_path,
                level=outline_level,
                title_pattern=args.title_pattern,
            )
            grouped_targets = _group_targets(targets, args.group_count)
            print(f"Matching Outline Items: {len(targets)}")
            print(f"Collections: {len(grouped_targets)}")
            for index, group in enumerate(grouped_targets, start=1):
                print(
                    f"{index:02d}. pages {group[0].start_page}-{group[-1].end_page} "
                    f"({len(group)} items) {group[0].title} -> {group[-1].title}"
                )

            if args.dry_run:
                return 0

            if output_path is not None:
                parser.error("--output-path is only supported for explicit page slicing")

            results = slice_outline_collections(
                pdf_path,
                group_count=args.group_count,
                level=outline_level,
                title_pattern=args.title_pattern,
                output_root=output_root,
                output_format=args.output_format,
            )
            for result in results:
                print(f"Output: {result.output_path}")
            return 0

        if args.start is None or args.end is None:
            parser.error("explicit page slicing requires both --start and --end")

        result = slice_pdf_book(
            pdf_path,
            start_page=args.start,
            end_page=args.end,
            output_root=output_root,
            output_path=output_path,
            output_format=args.output_format,
        )
    except Exception as exc:
        print(f"Slice failed: {exc}", file=sys.stderr)
        return 1

    print(f"Source: {result.source_path}")
    print(f"Pages: {result.page_count}")
    print(f"Range: {result.start_page}-{result.end_page}")
    print(f"Format: {result.output_format}")
    print(f"Output: {result.output_path}")
    return 0


def _group_targets(targets, group_count: int):
    if group_count < 1:
        raise ValueError("Group count must be >= 1.")
    if group_count > len(targets):
        raise ValueError(
            f"Group count ({group_count}) exceeds matching outline item count ({len(targets)})."
        )

    base = len(targets) // group_count
    remainder = len(targets) % group_count
    groups = []
    start_index = 0
    for index in range(group_count):
        size = base + (1 if index < remainder else 0)
        groups.append(targets[start_index:start_index + size])
        start_index += size
    return groups


if __name__ == "__main__":
    raise SystemExit(main())
