from __future__ import annotations

from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QCheckBox,
    QFileDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)
from app.plugin_base import ScriptPlugin
from app.plugins.pdf_book_slicer.slicer import (
    OutlineTreeNode,
    build_outline_tree,
    get_page_count,
    safe_name,
    slice_pdf_book,
    split_pdf_to_selected_outline_nodes,
)
from app.settings import SettingsStore


class PdfBookSlicerWidget(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self._pdf_path: Path | None = None
        self._page_count = 0
        self._outline_tree: tuple[OutlineTreeNode, ...] = ()
        self._settings_store = SettingsStore(self._settings_path())
        self._settings = self._settings_store.load()

        main_layout = QVBoxLayout(self)
        form = QFormLayout()

        path_layout = QHBoxLayout()
        self.path_input = QLineEdit()
        self.path_input.setReadOnly(True)
        browse_btn = QPushButton("Select PDF")
        browse_btn.clicked.connect(self.select_pdf)
        path_layout.addWidget(self.path_input, stretch=1)
        path_layout.addWidget(browse_btn)
        form.addRow("Book File:", path_layout)

        self.start_page = QSpinBox()
        self.start_page.setMinimum(1)
        self.start_page.setMaximum(1)
        form.addRow("Start Page:", self.start_page)

        self.end_page = QSpinBox()
        self.end_page.setMinimum(1)
        self.end_page.setMaximum(1)
        form.addRow("End Page:", self.end_page)

        self.page_info = QLabel("No PDF selected")
        form.addRow("Info:", self.page_info)

        obsidian_layout = QHBoxLayout()
        self.obsidian_root_input = QLineEdit()
        self.obsidian_root_input.setText(self._settings.obsidian_database_root)
        self.obsidian_root_input.setPlaceholderText("Optional Obsidian vault root")
        obsidian_browse = QPushButton("Browse")
        obsidian_browse.clicked.connect(self.select_obsidian_root)
        obsidian_layout.addWidget(self.obsidian_root_input, stretch=1)
        obsidian_layout.addWidget(obsidian_browse)
        form.addRow("Obsidian Root:", obsidian_layout)

        self.save_to_obsidian = QCheckBox("Save metadata split PDFs under SplitPDFs/<BookName>")
        self.save_to_obsidian.setChecked(bool(self._settings.obsidian_database_root))
        form.addRow("", self.save_to_obsidian)

        main_layout.addLayout(form)

        run_button = QPushButton("Slice PDF")
        run_button.clicked.connect(self.slice_pdf)
        main_layout.addWidget(run_button)

        bookmark_actions = QHBoxLayout()
        preprocess_button = QPushButton("Preprocess Bookmarks")
        preprocess_button.clicked.connect(self.preprocess_bookmarks)
        bookmark_actions.addWidget(preprocess_button)

        check_top_button = QPushButton("Check Top Level")
        check_top_button.clicked.connect(self.check_top_level)
        bookmark_actions.addWidget(check_top_button)

        clear_button = QPushButton("Clear Checks")
        clear_button.clicked.connect(self.clear_bookmark_checks)
        bookmark_actions.addWidget(clear_button)
        main_layout.addLayout(bookmark_actions)

        self.bookmark_tree = QTreeWidget()
        self.bookmark_tree.setHeaderLabels(["Bookmark", "Pages"])
        self.bookmark_tree.itemChanged.connect(self.update_bookmark_status)
        main_layout.addWidget(self.bookmark_tree, stretch=1)

        paragraph_button = QPushButton("Export Checked Bookmark Ranges")
        paragraph_button.clicked.connect(self.slice_paragraphs)
        main_layout.addWidget(paragraph_button)

        self.status_label = QLabel("")
        main_layout.addWidget(self.status_label)

    def select_pdf(self) -> None:
        selected_file, _ = QFileDialog.getOpenFileName(
            self,
            "Select PDF Book",
            str(Path.cwd()),
            "PDF files (*.pdf)",
        )
        if not selected_file:
            return

        pdf_path = Path(selected_file)
        try:
            page_count = get_page_count(pdf_path)
        except Exception as exc:
            QMessageBox.critical(self, "Error", f"Cannot read PDF:\n{exc}")
            return

        self._pdf_path = pdf_path
        self._page_count = page_count
        self.path_input.setText(str(pdf_path))
        self.start_page.setMaximum(page_count)
        self.end_page.setMaximum(page_count)
        self.start_page.setValue(1)
        self.end_page.setValue(page_count)
        self.page_info.setText(f"Pages: {page_count}")
        self._outline_tree = ()
        self.bookmark_tree.clear()
        self.status_label.setText("")

    def select_obsidian_root(self) -> None:
        selected_dir = QFileDialog.getExistingDirectory(
            self,
            "Select Obsidian Vault Root",
            self.obsidian_root_input.text().strip() or str(Path.cwd()),
        )
        if not selected_dir:
            return

        self.obsidian_root_input.setText(selected_dir)
        self.save_to_obsidian.setChecked(True)
        self._settings.obsidian_database_root = selected_dir
        self._settings_store.save(self._settings)

    def slice_pdf(self) -> None:
        if self._pdf_path is None:
            QMessageBox.warning(self, "No PDF", "Select a PDF first.")
            return

        start = self.start_page.value()
        end = self.end_page.value()
        if start > end:
            QMessageBox.warning(self, "Invalid Range", "Start page must be <= end page.")
            return
        if end > self._page_count:
            QMessageBox.warning(self, "Invalid Range", "Range exceeds page count.")
            return

        try:
            result = slice_pdf_book(
                self._pdf_path,
                start_page=start,
                end_page=end,
            )
        except Exception as exc:
            QMessageBox.critical(self, "Slice Failed", f"Failed to generate output PDF:\n{exc}")
            return

        self.status_label.setText(f"Saved: {result.output_path}")
        QMessageBox.information(self, "Done", f"Created:\n{result.output_path}")

    def preprocess_bookmarks(self) -> None:
        if self._pdf_path is None:
            QMessageBox.warning(self, "No PDF", "Select a PDF first.")
            return

        try:
            self._outline_tree = build_outline_tree(self._pdf_path)
        except Exception as exc:
            QMessageBox.critical(self, "Bookmark Preprocess Failed", f"Failed to read PDF bookmarks:\n{exc}")
            return

        self.bookmark_tree.clear()
        if not self._outline_tree:
            self.status_label.setText("No usable PDF bookmarks found.")
            QMessageBox.warning(
                self,
                "No Bookmarks",
                "This PDF has no usable outline/bookmark metadata. Use manual page slicing for now.",
            )
            return

        for node in self._outline_tree:
            self.bookmark_tree.addTopLevelItem(self._make_tree_item(node))
        self.bookmark_tree.expandToDepth(0)
        self.update_bookmark_status()

    def check_top_level(self) -> None:
        for index in range(self.bookmark_tree.topLevelItemCount()):
            item = self.bookmark_tree.topLevelItem(index)
            item.setCheckState(0, Qt.CheckState.Checked)
        self.update_bookmark_status()

    def clear_bookmark_checks(self) -> None:
        def clear_item(item: QTreeWidgetItem) -> None:
            item.setCheckState(0, Qt.CheckState.Unchecked)
            for child_index in range(item.childCount()):
                clear_item(item.child(child_index))

        for index in range(self.bookmark_tree.topLevelItemCount()):
            clear_item(self.bookmark_tree.topLevelItem(index))
        self.update_bookmark_status()

    def slice_paragraphs(self) -> None:
        if self._pdf_path is None:
            QMessageBox.warning(self, "No PDF", "Select a PDF first.")
            return

        obsidian_root = self.obsidian_root_input.text().strip()
        output_dir = None
        if self.save_to_obsidian.isChecked():
            if not obsidian_root:
                QMessageBox.warning(
                    self,
                    "No Obsidian Root",
                    "Choose an Obsidian vault root or disable Obsidian output.",
                )
                return
            self._settings.obsidian_database_root = obsidian_root
            self._settings_store.save(self._settings)
            output_dir = Path(obsidian_root).expanduser().resolve() / "SplitPDFs" / safe_name(self._pdf_path.stem)

        try:
            if not self._outline_tree:
                self.preprocess_bookmarks()
            if not self._outline_tree:
                return
            selected_ids = self._checked_node_ids()
            if not selected_ids:
                QMessageBox.warning(
                    self,
                    "No Bookmark Selection",
                    "Preprocess bookmarks, then check one or more items in the tree.",
                )
                return

            result = split_pdf_to_selected_outline_nodes(
                self._pdf_path,
                selected_node_ids=selected_ids,
                output_dir=output_dir,
                output_format="pdf",
            )
        except Exception as exc:
            QMessageBox.critical(self, "Paragraph Split Failed", f"Failed to split paragraphs:\n{exc}")
            return

        self.status_label.setText(
            f"Saved {result.paragraph_count} metadata split PDFs: {result.output_dir}"
        )
        QMessageBox.information(
            self,
            "Done",
            f"Created {result.paragraph_count} metadata split PDFs:\n{result.output_dir}\n\nManifest:\n{result.manifest_path}",
        )

    def update_bookmark_status(self, *_args) -> None:
        selected_count = len(self._checked_node_ids())
        visible_count = self._tree_item_count()
        if self._outline_tree:
            self.status_label.setText(
                f"Bookmarks loaded: {visible_count}. Checked exports: {selected_count}."
            )

    def _make_tree_item(self, node: OutlineTreeNode) -> QTreeWidgetItem:
        item = QTreeWidgetItem([node.title, f"{node.page_number}-{node.end_page}"])
        item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
        item.setCheckState(0, Qt.CheckState.Unchecked)
        item.setData(0, Qt.ItemDataRole.UserRole, node.node_id)
        item.setToolTip(0, f"{node.title}\nPages {node.page_number}-{node.end_page}")
        for child in node.children:
            item.addChild(self._make_tree_item(child))
        return item

    def _checked_node_ids(self) -> set[str]:
        checked: set[str] = set()

        def collect(item: QTreeWidgetItem, ancestor_checked: bool) -> None:
            is_checked = item.checkState(0) == Qt.CheckState.Checked
            node_id = item.data(0, Qt.ItemDataRole.UserRole)
            if is_checked and not ancestor_checked and node_id:
                checked.add(str(node_id))
                ancestor_checked = True
            for child_index in range(item.childCount()):
                collect(item.child(child_index), ancestor_checked)

        for index in range(self.bookmark_tree.topLevelItemCount()):
            collect(self.bookmark_tree.topLevelItem(index), ancestor_checked=False)
        return checked

    def _tree_item_count(self) -> int:
        def count_item(item: QTreeWidgetItem) -> int:
            return 1 + sum(count_item(item.child(index)) for index in range(item.childCount()))

        return sum(
            count_item(self.bookmark_tree.topLevelItem(index))
            for index in range(self.bookmark_tree.topLevelItemCount())
        )

    @staticmethod
    def _settings_path() -> Path:
        return Path(__file__).resolve().parents[3] / "app_data" / "ui_settings.json"


def get_plugin() -> ScriptPlugin:
    return ScriptPlugin(
        plugin_id="pdf_book_slicer",
        name="PDF Book Slicer",
        description="Select a PDF and extract page ranges, outlines, or one PDF per bookmark metadata item. CLI: python -m app.plugins.pdf_book_slicer.cli <pdf> --start N --end M",
        create_widget=PdfBookSlicerWidget,
    )
