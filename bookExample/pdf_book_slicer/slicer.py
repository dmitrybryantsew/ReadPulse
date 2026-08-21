from __future__ import annotations

import re
import textwrap
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader, PdfWriter


@dataclass(frozen=True)
class SliceResult:
    source_path: Path
    output_path: Path
    start_page: int
    end_page: int
    page_count: int
    output_format: str


@dataclass(frozen=True)
class OutlineEntry:
    title: str
    level: int
    page_number: int


@dataclass(frozen=True)
class OutlineSliceTarget:
    title: str
    level: int
    start_page: int
    end_page: int


@dataclass(frozen=True)
class OutlineTreeNode:
    node_id: str
    title: str
    level: int
    page_number: int
    end_page: int
    children: tuple["OutlineTreeNode", ...]


@dataclass(frozen=True)
class OutlineCollectionResult:
    output_path: Path
    item_count: int
    start_page: int
    end_page: int
    first_title: str
    last_title: str
    output_format: str


@dataclass(frozen=True)
class OutlineExportResult:
    source_path: Path
    output_path: Path
    entry_count: int
    output_format: str


@dataclass(frozen=True)
class ParagraphEntry:
    index: int
    page_number: int
    text: str


@dataclass(frozen=True)
class ParagraphExportResult:
    source_path: Path
    output_dir: Path
    manifest_path: Path
    paragraph_count: int
    output_format: str
    mode: str = "outline"


def default_output_root() -> Path:
    return Path(__file__).resolve().parents[3] / "output"


def get_page_count(pdf_path: Path) -> int:
    resolved_pdf_path = pdf_path.expanduser().resolve()
    if not resolved_pdf_path.exists():
        raise FileNotFoundError(f"PDF file does not exist: {resolved_pdf_path}")
    if resolved_pdf_path.suffix.lower() != ".pdf":
        raise ValueError(f"Source file is not a PDF: {resolved_pdf_path}")

    reader = PdfReader(str(resolved_pdf_path))
    page_count = len(reader.pages)
    if page_count == 0:
        raise ValueError(f"Selected PDF has no pages: {resolved_pdf_path}")
    return page_count


def slice_pdf_book(
    pdf_path: Path,
    *,
    start_page: int,
    end_page: int,
    output_root: Path | None = None,
    output_path: Path | None = None,
    output_format: str = "pdf",
) -> SliceResult:
    resolved_pdf_path = pdf_path.expanduser().resolve()
    page_count = get_page_count(resolved_pdf_path)

    if start_page < 1:
        raise ValueError("Start page must be >= 1.")
    if end_page < 1:
        raise ValueError("End page must be >= 1.")
    if start_page > end_page:
        raise ValueError("Start page must be <= end page.")
    if end_page > page_count:
        raise ValueError(f"End page exceeds page count ({page_count}).")

    range_dir = f"{start_page}-{end_page}"
    book_name = safe_name(resolved_pdf_path.stem)
    resolved_output_path = _build_single_output_path(
        output_root=output_root,
        output_path=output_path,
        book_name=book_name,
        range_dir=range_dir,
        output_format=output_format,
    )

    _write_page_range(
        resolved_pdf_path,
        start_page=start_page,
        end_page=end_page,
        output_path=resolved_output_path,
        output_format=output_format,
    )

    return SliceResult(
        source_path=resolved_pdf_path,
        output_path=resolved_output_path,
        start_page=start_page,
        end_page=end_page,
        page_count=page_count,
        output_format=output_format,
    )


def list_outline_entries(
    pdf_path: Path,
    *,
    level: int | None = None,
    title_pattern: str | None = None,
) -> tuple[OutlineEntry, ...]:
    resolved_pdf_path = pdf_path.expanduser().resolve()
    reader = PdfReader(str(resolved_pdf_path))
    matcher = re.compile(title_pattern) if title_pattern else None

    entries = tuple(_walk_outline_entries(reader, reader.outline))
    filtered: list[OutlineEntry] = []
    for entry in entries:
        if level is not None and entry.level != level:
            continue
        if matcher is not None and matcher.search(entry.title) is None:
            continue
        filtered.append(entry)
    return tuple(filtered)


def list_outline_leaf_entries(pdf_path: Path) -> tuple[OutlineEntry, ...]:
    resolved_pdf_path = pdf_path.expanduser().resolve()
    reader = PdfReader(str(resolved_pdf_path))
    return tuple(_walk_outline_leaf_entries(reader, reader.outline))


def build_outline_tree(pdf_path: Path) -> tuple[OutlineTreeNode, ...]:
    resolved_pdf_path = pdf_path.expanduser().resolve()
    reader = PdfReader(str(resolved_pdf_path))
    page_count = len(reader.pages)
    raw_nodes = _build_raw_outline_nodes(reader, reader.outline, level=0, prefix=())
    if not raw_nodes:
        return ()

    flat: list[dict] = []

    def collect(nodes: list[dict]) -> None:
        for node in nodes:
            flat.append(node)
            collect(node["children"])

    collect(raw_nodes)
    start_index_by_id = {node["node_id"]: index for index, node in enumerate(flat)}

    def convert(node: dict) -> OutlineTreeNode:
        children = tuple(convert(child) for child in node["children"])
        subtree_ids = {node["node_id"]}

        def collect_ids(items: tuple[OutlineTreeNode, ...]) -> None:
            for item in items:
                subtree_ids.add(item.node_id)
                collect_ids(item.children)

        collect_ids(children)
        own_index = start_index_by_id[node["node_id"]]
        next_page = page_count + 1
        for candidate in flat[own_index + 1:]:
            if candidate["node_id"] not in subtree_ids:
                next_page = candidate["page_number"]
                break
        end_page = max(node["page_number"], min(page_count, next_page - 1))
        return OutlineTreeNode(
            node_id=node["node_id"],
            title=node["title"],
            level=node["level"],
            page_number=node["page_number"],
            end_page=end_page,
            children=children,
        )

    return tuple(convert(node) for node in raw_nodes)


def build_outline_slice_targets(
    pdf_path: Path,
    *,
    level: int = 0,
    title_pattern: str | None = None,
) -> tuple[OutlineSliceTarget, ...]:
    resolved_pdf_path = pdf_path.expanduser().resolve()
    page_count = get_page_count(resolved_pdf_path)
    entries = list_outline_entries(
        resolved_pdf_path,
        level=level,
        title_pattern=title_pattern,
    )
    if not entries:
        raise ValueError("No outline entries matched the requested filters.")

    targets: list[OutlineSliceTarget] = []
    for index, entry in enumerate(entries):
        next_start_page = entries[index + 1].page_number if index + 1 < len(entries) else page_count + 1
        end_page = max(entry.page_number, next_start_page - 1)
        targets.append(
            OutlineSliceTarget(
                title=entry.title,
                level=entry.level,
                start_page=entry.page_number,
                end_page=end_page,
            )
        )
    return tuple(targets)


def slice_outline_collections(
    pdf_path: Path,
    *,
    group_count: int,
    level: int = 0,
    title_pattern: str | None = None,
    output_root: Path | None = None,
    output_format: str = "pdf",
) -> tuple[OutlineCollectionResult, ...]:
    if group_count < 1:
        raise ValueError("Group count must be >= 1.")

    resolved_pdf_path = pdf_path.expanduser().resolve()
    targets = build_outline_slice_targets(
        resolved_pdf_path,
        level=level,
        title_pattern=title_pattern,
    )
    if group_count > len(targets):
        raise ValueError(
            f"Group count ({group_count}) exceeds matching outline item count ({len(targets)})."
        )

    resolved_output_root = (output_root or default_output_root()).expanduser().resolve()
    book_name = safe_name(resolved_pdf_path.stem)
    collection_root = resolved_output_root / book_name / f"outline_groups_{group_count}"
    collection_root.mkdir(parents=True, exist_ok=True)

    results: list[OutlineCollectionResult] = []
    start_index = 0
    for group_index, size in enumerate(_distribute_evenly(len(targets), group_count), start=1):
        group_targets = targets[start_index:start_index + size]
        start_index += size

        group_start_page = group_targets[0].start_page
        group_end_page = group_targets[-1].end_page
        chapter_range = f"{group_targets[0].title}__to__{group_targets[-1].title}"
        safe_range = safe_name(chapter_range)
        output_path = collection_root / (
            f"{group_index:02d}_of_{group_count}_{safe_range}_{group_start_page}-{group_end_page}.{output_format}"
        )
        _write_page_range(
            resolved_pdf_path,
            start_page=group_start_page,
            end_page=group_end_page,
            output_path=output_path,
            output_format=output_format,
        )
        results.append(
            OutlineCollectionResult(
                output_path=output_path,
                item_count=len(group_targets),
                start_page=group_start_page,
                end_page=group_end_page,
                first_title=group_targets[0].title,
                last_title=group_targets[-1].title,
                output_format=output_format,
            )
        )
    return tuple(results)


def export_outline(
    pdf_path: Path,
    *,
    output_root: Path | None = None,
    output_path: Path | None = None,
    level: int | None = None,
    title_pattern: str | None = None,
    output_format: str = "txt",
) -> OutlineExportResult:
    resolved_pdf_path = pdf_path.expanduser().resolve()
    entries = list_outline_entries(
        resolved_pdf_path,
        level=level,
        title_pattern=title_pattern,
    )
    book_name = safe_name(resolved_pdf_path.stem)
    resolved_output_path = _build_outline_output_path(
        output_root=output_root,
        output_path=output_path,
        book_name=book_name,
        output_format=output_format,
    )
    lines = [
        f"Source: {resolved_pdf_path}",
        f"Outline Entries: {len(entries)}",
    ]
    if level is not None:
        lines.append(f"Level Filter: {level}")
    if title_pattern:
        lines.append(f"Title Filter: {title_pattern}")
    lines.append("")

    for entry in entries:
        indent = "  " * entry.level
        lines.append(f"{indent}L{entry.level} P{entry.page_number}: {entry.title}")

    outline_text = "\n".join(lines).rstrip() + "\n"
    _write_outline_export(
        outline_text,
        output_path=resolved_output_path,
        output_format=output_format,
    )

    return OutlineExportResult(
        source_path=resolved_pdf_path,
        output_path=resolved_output_path,
        entry_count=len(entries),
        output_format=output_format,
    )


def split_pdf_to_paragraphs(
    pdf_path: Path,
    *,
    output_root: Path | None = None,
    output_dir: Path | None = None,
    outline_level: int | None = None,
    min_chars: int = 20,
    output_format: str = "pdf",
) -> ParagraphExportResult:
    return split_pdf_to_outline_paragraphs(
        pdf_path,
        output_root=output_root,
        output_dir=output_dir,
        outline_level=outline_level,
        output_format=output_format,
    )


def split_pdf_to_outline_paragraphs(
    pdf_path: Path,
    *,
    output_root: Path | None = None,
    output_dir: Path | None = None,
    outline_level: int | None = None,
    output_format: str = "pdf",
) -> ParagraphExportResult:
    if output_format not in {"pdf", "txt"}:
        raise ValueError(f"Unsupported paragraph output format: {output_format}")

    resolved_pdf_path = pdf_path.expanduser().resolve()
    page_count = get_page_count(resolved_pdf_path)
    book_name = safe_name(resolved_pdf_path.stem)
    resolved_output_dir = _build_paragraph_output_dir(
        output_root=output_root,
        output_dir=output_dir,
        book_name=book_name,
    )
    resolved_output_dir.mkdir(parents=True, exist_ok=True)

    targets = build_outline_paragraph_targets(
        resolved_pdf_path,
        outline_level=outline_level,
    )
    if not targets:
        raise ValueError(
            "Auto paragraph split is unavailable: this PDF has no usable outline/bookmark metadata. "
            "Manual page slicing is required for now."
        )

    _clean_generated_paragraph_outputs(resolved_output_dir)
    manifest_lines = [
        f"# {resolved_pdf_path.stem} Metadata Split",
        "",
        f"Source: `{resolved_pdf_path}`",
        f"Mode: PDF outline/bookmark metadata",
        f"Outline Selection: {'leaf bookmarks' if outline_level is None else f'level {outline_level}'}",
        f"Items: {len(targets)}",
        "",
    ]
    for index, target in enumerate(targets, start=1):
        safe_title = safe_name(target.title)[:80]
        filename = (
            f"{index:05d}_pages_{target.start_page}-{target.end_page}_{safe_title}.{output_format}"
        )
        output_path = resolved_output_dir / filename
        _write_page_range(
            resolved_pdf_path,
            start_page=target.start_page,
            end_page=min(target.end_page, page_count),
            output_path=output_path,
            output_format=output_format,
        )
        manifest_lines.append(
            f"- [[{filename}]] pages {target.start_page}-{target.end_page}: {target.title}"
        )

    manifest_path = resolved_output_dir / "index.md"
    manifest_path.write_text("\n".join(manifest_lines).rstrip() + "\n", encoding="utf-8")
    return ParagraphExportResult(
        source_path=resolved_pdf_path,
        output_dir=resolved_output_dir,
        manifest_path=manifest_path,
        paragraph_count=len(targets),
        output_format=output_format,
        mode="outline",
    )


def split_pdf_to_selected_outline_nodes(
    pdf_path: Path,
    *,
    selected_node_ids: set[str],
    output_root: Path | None = None,
    output_dir: Path | None = None,
    output_format: str = "pdf",
) -> ParagraphExportResult:
    if output_format not in {"pdf", "txt"}:
        raise ValueError(f"Unsupported paragraph output format: {output_format}")
    if not selected_node_ids:
        raise ValueError("Select at least one outline item.")

    resolved_pdf_path = pdf_path.expanduser().resolve()
    page_count = get_page_count(resolved_pdf_path)
    book_name = safe_name(resolved_pdf_path.stem)
    resolved_output_dir = _build_paragraph_output_dir(
        output_root=output_root,
        output_dir=output_dir,
        book_name=book_name,
    )
    resolved_output_dir.mkdir(parents=True, exist_ok=True)

    tree = build_outline_tree(resolved_pdf_path)
    if not tree:
        raise ValueError(
            "Auto paragraph split is unavailable: this PDF has no usable outline/bookmark metadata. "
            "Manual page slicing is required for now."
        )

    selected_nodes = _selected_outline_nodes(tree, selected_node_ids)
    if not selected_nodes:
        raise ValueError("Selected outline items were not found in this PDF.")

    _clean_generated_paragraph_outputs(resolved_output_dir)
    manifest_lines = [
        f"# {resolved_pdf_path.stem} Selected Metadata Split",
        "",
        f"Source: `{resolved_pdf_path}`",
        "Mode: selected PDF outline/bookmark subtrees",
        f"Items: {len(selected_nodes)}",
        "",
    ]
    for index, node in enumerate(selected_nodes, start=1):
        safe_title = safe_name(node.title)[:80]
        filename = (
            f"{index:05d}_pages_{node.page_number}-{node.end_page}_{safe_title}.{output_format}"
        )
        output_path = resolved_output_dir / filename
        _write_page_range(
            resolved_pdf_path,
            start_page=node.page_number,
            end_page=min(node.end_page, page_count),
            output_path=output_path,
            output_format=output_format,
        )
        manifest_lines.append(
            f"- [[{filename}]] pages {node.page_number}-{node.end_page}: {node.title}"
        )

    manifest_path = resolved_output_dir / "index.md"
    manifest_path.write_text("\n".join(manifest_lines).rstrip() + "\n", encoding="utf-8")
    return ParagraphExportResult(
        source_path=resolved_pdf_path,
        output_dir=resolved_output_dir,
        manifest_path=manifest_path,
        paragraph_count=len(selected_nodes),
        output_format=output_format,
        mode="selected-outline",
    )


def split_pdf_to_text_paragraphs(
    pdf_path: Path,
    *,
    output_root: Path | None = None,
    output_dir: Path | None = None,
    min_chars: int = 20,
    output_format: str = "pdf",
) -> ParagraphExportResult:
    if output_format not in {"pdf", "txt"}:
        raise ValueError(f"Unsupported paragraph output format: {output_format}")
    if min_chars < 1:
        raise ValueError("Minimum paragraph length must be >= 1.")

    resolved_pdf_path = pdf_path.expanduser().resolve()
    get_page_count(resolved_pdf_path)
    book_name = safe_name(resolved_pdf_path.stem)
    resolved_output_dir = _build_paragraph_output_dir(
        output_root=output_root,
        output_dir=output_dir,
        book_name=book_name,
    )
    resolved_output_dir.mkdir(parents=True, exist_ok=True)

    paragraphs = extract_pdf_paragraphs(resolved_pdf_path, min_chars=min_chars)
    if not paragraphs:
        raise ValueError(
            "No paragraphs were found. This PDF may be scanned, encrypted, or may not preserve blank-line paragraphs."
        )

    _clean_generated_paragraph_outputs(resolved_output_dir)
    manifest_lines = [
        f"# {resolved_pdf_path.stem} Text Paragraph Split",
        "",
        f"Source: `{resolved_pdf_path}`",
        f"Mode: raw extracted text",
        f"Paragraphs: {len(paragraphs)}",
        "",
    ]
    for paragraph in paragraphs:
        filename = f"{paragraph.index:05d}_page_{paragraph.page_number}.{output_format}"
        output_path = resolved_output_dir / filename
        if output_format == "pdf":
            _write_text_pdf(
                paragraph.text,
                output_path=output_path,
                title=f"{resolved_pdf_path.stem} paragraph {paragraph.index}",
            )
        else:
            output_path.write_text(paragraph.text.rstrip() + "\n", encoding="utf-8")
        manifest_lines.append(
            f"- [[{filename}]] page {paragraph.page_number}: {paragraph.text[:120].replace(chr(10), ' ')}"
        )

    manifest_path = resolved_output_dir / "index.md"
    manifest_path.write_text("\n".join(manifest_lines).rstrip() + "\n", encoding="utf-8")
    return ParagraphExportResult(
        source_path=resolved_pdf_path,
        output_dir=resolved_output_dir,
        manifest_path=manifest_path,
        paragraph_count=len(paragraphs),
        output_format=output_format,
        mode="text",
    )


def build_outline_paragraph_targets(
    pdf_path: Path,
    *,
    outline_level: int | None = None,
) -> tuple[OutlineSliceTarget, ...]:
    resolved_pdf_path = pdf_path.expanduser().resolve()
    entries = (
        list_outline_leaf_entries(resolved_pdf_path)
        if outline_level is None
        else list_outline_entries(resolved_pdf_path, level=outline_level)
    )
    if not entries:
        return ()

    page_count = get_page_count(resolved_pdf_path)
    targets: list[OutlineSliceTarget] = []
    for index, entry in enumerate(entries):
        next_start_page = entries[index + 1].page_number if index + 1 < len(entries) else page_count + 1
        end_page = max(entry.page_number, next_start_page - 1)
        targets.append(
            OutlineSliceTarget(
                title=entry.title,
                level=entry.level,
                start_page=entry.page_number,
                end_page=end_page,
            )
        )
    return tuple(target for target in targets if target.start_page <= target.end_page)


def extract_pdf_paragraphs(pdf_path: Path, *, min_chars: int = 20) -> tuple[ParagraphEntry, ...]:
    resolved_pdf_path = pdf_path.expanduser().resolve()
    reader = PdfReader(str(resolved_pdf_path))
    paragraphs: list[ParagraphEntry] = []
    for page_index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        for raw_paragraph in _split_paragraph_text(text):
            paragraph = _normalize_paragraph(raw_paragraph)
            if len(paragraph) < min_chars:
                continue
            paragraphs.append(
                ParagraphEntry(
                    index=len(paragraphs) + 1,
                    page_number=page_index,
                    text=paragraph,
                )
            )
    return tuple(paragraphs)


def _walk_outline_entries(reader: PdfReader, items, level: int = 0):
    for item in items:
        if isinstance(item, list):
            yield from _walk_outline_entries(reader, item, level + 1)
            continue

        try:
            page_number = reader.get_destination_page_number(item) + 1
        except Exception:
            continue

        title = _clean_outline_title(getattr(item, "title", str(item)))
        if not title:
            continue

        yield OutlineEntry(title=title, level=level, page_number=page_number)


def _walk_outline_leaf_entries(reader: PdfReader, items, level: int = 0):
    index = 0
    while index < len(items):
        item = items[index]
        if isinstance(item, list):
            yield from _walk_outline_leaf_entries(reader, item, level + 1)
            index += 1
            continue

        children = items[index + 1] if index + 1 < len(items) and isinstance(items[index + 1], list) else None
        if children is not None:
            yield from _walk_outline_leaf_entries(reader, children, level + 1)
            index += 2
            continue

        try:
            page_number = reader.get_destination_page_number(item) + 1
        except Exception:
            index += 1
            continue

        title = _clean_outline_title(getattr(item, "title", str(item)))
        if title:
            yield OutlineEntry(title=title, level=level, page_number=page_number)
        index += 1


def _build_raw_outline_nodes(
    reader: PdfReader,
    items,
    *,
    level: int,
    prefix: tuple[int, ...],
) -> list[dict]:
    nodes: list[dict] = []
    index = 0
    item_number = 1
    while index < len(items):
        item = items[index]
        if isinstance(item, list):
            nested = _build_raw_outline_nodes(
                reader,
                item,
                level=level + 1,
                prefix=prefix + (item_number,),
            )
            nodes.extend(nested)
            index += 1
            item_number += 1
            continue

        children = items[index + 1] if index + 1 < len(items) and isinstance(items[index + 1], list) else None
        try:
            page_number = reader.get_destination_page_number(item) + 1
        except Exception:
            index += 2 if children is not None else 1
            item_number += 1
            continue

        title = _clean_outline_title(getattr(item, "title", str(item)))
        if not title:
            index += 2 if children is not None else 1
            item_number += 1
            continue

        node_path = prefix + (item_number,)
        child_nodes = (
            _build_raw_outline_nodes(
                reader,
                children,
                level=level + 1,
                prefix=node_path,
            )
            if children is not None
            else []
        )
        nodes.append(
            {
                "node_id": ".".join(str(part) for part in node_path),
                "title": title,
                "level": level,
                "page_number": page_number,
                "children": child_nodes,
            }
        )
        index += 2 if children is not None else 1
        item_number += 1
    return nodes


def _selected_outline_nodes(
    nodes: tuple[OutlineTreeNode, ...],
    selected_node_ids: set[str],
) -> tuple[OutlineTreeNode, ...]:
    selected: list[OutlineTreeNode] = []

    def walk(items: tuple[OutlineTreeNode, ...], ancestor_selected: bool) -> None:
        for item in items:
            item_selected = item.node_id in selected_node_ids
            if item_selected and not ancestor_selected:
                selected.append(item)
                walk(item.children, ancestor_selected=True)
            else:
                walk(item.children, ancestor_selected=ancestor_selected or item_selected)

    walk(nodes, ancestor_selected=False)
    return tuple(selected)


def _distribute_evenly(item_count: int, group_count: int) -> tuple[int, ...]:
    base = item_count // group_count
    remainder = item_count % group_count
    return tuple(base + (1 if index < remainder else 0) for index in range(group_count))


def _build_single_output_path(
    *,
    output_root: Path | None,
    output_path: Path | None,
    book_name: str,
    range_dir: str,
    output_format: str,
) -> Path:
    if output_path is not None:
        resolved_output_path = output_path.expanduser().resolve()
        if resolved_output_path.suffix.lower() != f".{output_format}":
            resolved_output_path = resolved_output_path.with_suffix(f".{output_format}")
        return resolved_output_path

    resolved_output_root = (output_root or default_output_root()).expanduser().resolve()
    output_dir = resolved_output_root / book_name / range_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir / f"{book_name}_{range_dir}.{output_format}"


def _build_outline_output_path(
    *,
    output_root: Path | None,
    output_path: Path | None,
    book_name: str,
    output_format: str,
) -> Path:
    if output_path is not None:
        resolved_output_path = output_path.expanduser().resolve()
        if resolved_output_path.suffix.lower() != f".{output_format}":
            resolved_output_path = resolved_output_path.with_suffix(f".{output_format}")
        return resolved_output_path

    resolved_output_root = (output_root or default_output_root()).expanduser().resolve()
    output_dir = resolved_output_root / book_name
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir / f"{book_name}_outline.{output_format}"


def _build_paragraph_output_dir(
    *,
    output_root: Path | None,
    output_dir: Path | None,
    book_name: str,
) -> Path:
    if output_dir is not None:
        return output_dir.expanduser().resolve()

    resolved_output_root = (output_root or default_output_root()).expanduser().resolve()
    return resolved_output_root / book_name / "paragraphs"


def _write_page_range(
    pdf_path: Path,
    *,
    start_page: int,
    end_page: int,
    output_path: Path,
    output_format: str,
) -> None:
    if output_format == "pdf":
        _write_page_range_pdf(
            pdf_path,
            start_page=start_page,
            end_page=end_page,
            output_path=output_path,
        )
        return
    if output_format == "txt":
        _write_page_range_text(
            pdf_path,
            start_page=start_page,
            end_page=end_page,
            output_path=output_path,
        )
        return
    raise ValueError(f"Unsupported output format: {output_format}")


def _write_page_range_pdf(
    pdf_path: Path,
    *,
    start_page: int,
    end_page: int,
    output_path: Path,
) -> None:
    resolved_pdf_path = pdf_path.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    reader = PdfReader(str(resolved_pdf_path))
    writer = PdfWriter()
    for index in range(start_page - 1, end_page):
        writer.add_page(reader.pages[index])

    with output_path.open("wb") as handle:
        writer.write(handle)


def _write_page_range_text(
    pdf_path: Path,
    *,
    start_page: int,
    end_page: int,
    output_path: Path,
) -> None:
    resolved_pdf_path = pdf_path.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    reader = PdfReader(str(resolved_pdf_path))
    parts: list[str] = []
    for index in range(start_page - 1, end_page):
        page_number = index + 1
        text = reader.pages[index].extract_text() or ""
        if parts:
            parts.append("")
        parts.append(f"=== Page {page_number} ===")
        parts.append(text.rstrip())

    output_path.write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")


def _write_outline_export(
    outline_text: str,
    *,
    output_path: Path,
    output_format: str,
) -> None:
    if output_format == "txt":
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(outline_text, encoding="utf-8")
        return
    if output_format == "pdf":
        _write_outline_pdf(
            outline_text,
            output_path=output_path,
        )
        return
    raise ValueError(f"Unsupported outline export format: {output_format}")


def _write_outline_pdf(
    outline_text: str,
    *,
    output_path: Path,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _write_simple_text_pdf(
        outline_text,
        output_path=output_path,
        title=output_path.stem,
    )


def _write_text_pdf(
    text: str,
    *,
    output_path: Path,
    title: str,
) -> None:
    if _write_qt_text_pdf(text, output_path=output_path, title=title):
        return
    _write_simple_text_pdf(text, output_path=output_path, title=title)


def _write_qt_text_pdf(
    text: str,
    *,
    output_path: Path,
    title: str,
) -> bool:
    try:
        from PyQt6.QtCore import QMarginsF
        from PyQt6.QtGui import QGuiApplication, QPageLayout, QPageSize, QPdfWriter, QTextDocument
    except Exception:
        return False

    app = QGuiApplication.instance()
    owned_app = None
    if app is None:
        try:
            owned_app = QGuiApplication(["pdf_book_slicer"])
            app = owned_app
        except Exception:
            return False

    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        writer = QPdfWriter(str(output_path))
        writer.setTitle(title)
        writer.setPageSize(QPageSize(QPageSize.PageSizeId.A4))
        writer.setPageMargins(QMarginsF(16, 16, 16, 16), QPageLayout.Unit.Millimeter)

        document = QTextDocument()
        document.setPlainText(text.rstrip() + "\n")
        document.setDefaultFont(app.font())
        document.print(writer)
        if owned_app is not None:
            owned_app.quit()
        return True
    except Exception:
        if owned_app is not None:
            owned_app.quit()
        return False


def _write_simple_text_pdf(
    text: str,
    *,
    output_path: Path,
    title: str,
) -> None:
    page_width = 595
    page_height = 842
    margin_left = 52
    margin_top = 52
    font_size = 10
    line_height = 12
    lines_per_page = max(1, int((page_height - (margin_top * 2)) // line_height))

    lines = text.rstrip().splitlines()
    if not lines:
        lines = [""]
    pages = [
        lines[index:index + lines_per_page]
        for index in range(0, len(lines), lines_per_page)
    ]

    objects: list[bytes] = []

    def add_object(data: str | bytes) -> int:
        payload = data.encode("latin-1") if isinstance(data, str) else data
        objects.append(payload)
        return len(objects)

    font_object = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>")
    pages_object_index = len(objects) + 1
    content_object_ids: list[int] = []
    page_object_ids: list[int] = []

    for page_lines in pages:
        content_stream = _build_pdf_text_stream(
            page_lines,
            margin_left=margin_left,
            page_height=page_height,
            margin_top=margin_top,
            font_size=font_size,
            line_height=line_height,
        )
        content_object_ids.append(
            add_object(
                (
                    f"<< /Length {len(content_stream)} >>\nstream\n".encode("latin-1")
                    + content_stream
                    + b"\nendstream"
                )
            )
        )
        page_object_ids.append(
            add_object(
                (
                    f"<< /Type /Page /Parent {pages_object_index} 0 R "
                    f"/MediaBox [0 0 {page_width} {page_height}] "
                    f"/Resources << /Font << /F1 {font_object} 0 R >> >> "
                    f"/Contents {content_object_ids[-1]} 0 R >>"
                )
            )
        )

    kids = " ".join(f"{page_id} 0 R" for page_id in page_object_ids)
    add_object(f"<< /Type /Pages /Count {len(page_object_ids)} /Kids [{kids}] >>")
    catalog_object = add_object(f"<< /Type /Catalog /Pages {pages_object_index} 0 R >>")
    info_object = add_object(f"<< /Title ({_escape_pdf_text(title)}) >>")

    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, payload in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("latin-1"))
        pdf.extend(payload)
        pdf.extend(b"\nendobj\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))
    pdf.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_object} 0 R /Info {info_object} 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("latin-1")
    )

    output_path.write_bytes(bytes(pdf))


def _build_pdf_text_stream(
    lines: list[str],
    *,
    margin_left: int,
    page_height: int,
    margin_top: int,
    font_size: int,
    line_height: int,
) -> bytes:
    start_y = page_height - margin_top
    commands = [f"BT /F1 {font_size} Tf {margin_left} {start_y} Td"]
    first = True
    for line in lines:
        if first:
            first = False
        else:
            commands.append(f"0 -{line_height} Td")
        commands.append(f"({_escape_pdf_text(line)}) Tj")
    commands.append("ET")
    return "\n".join(commands).encode("latin-1", errors="replace")


def _escape_pdf_text(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return "".join(char if ord(char) < 256 else "?" for char in escaped)


def _clean_generated_paragraph_outputs(output_dir: Path) -> None:
    for pattern in ("?????_page_*.pdf", "?????_page_*.txt", "?????_pages_*.pdf", "?????_pages_*.txt"):
        for path in output_dir.glob(pattern):
            if path.is_file():
                path.unlink()
    manifest_path = output_dir / "index.md"
    if manifest_path.exists() and manifest_path.is_file():
        manifest_path.unlink()


def _clean_outline_title(value: str) -> str:
    cleaned = value.replace("\x00", "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def safe_name(value: str) -> str:
    cleaned = _clean_outline_title(value)
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"_+", "_", cleaned)
    cleaned = cleaned.strip(" ._")
    if cleaned.upper() in {
        "CON",
        "PRN",
        "AUX",
        "NUL",
        "COM1",
        "COM2",
        "COM3",
        "COM4",
        "COM5",
        "COM6",
        "COM7",
        "COM8",
        "COM9",
        "LPT1",
        "LPT2",
        "LPT3",
        "LPT4",
        "LPT5",
        "LPT6",
        "LPT7",
        "LPT8",
        "LPT9",
    }:
        cleaned = f"{cleaned}_"
    return cleaned or "book"


def _split_paragraph_text(text: str) -> list[str]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    return [part for part in re.split(r"\n\s*\n+", normalized) if part.strip()]


def _normalize_paragraph(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    joined = " ".join(lines)
    joined = re.sub(r"\s+", " ", joined).strip()
    return "\n".join(textwrap.wrap(joined, width=100)) if joined else ""
