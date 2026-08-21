using UglyToad.PdfPig;
using UglyToad.PdfPig.Outline;
using System.Text.RegularExpressions;

namespace backend.Services;

public record OutlineNodeDto(string Id, string Title, int Level, long PageNumber, long EndPage, IReadOnlyList<OutlineNodeDto> Children);
public record ParagraphDto(int Index, int PageNumber, string Text);

public class BookSlicerService
{
    private static readonly Regex WhitespaceRegex = new(@"\s+", RegexOptions.Compiled);

    public static OutlineNodeDto[] GetOutline(Stream pdfStream)
    {
        using var doc = PdfDocument.Open(pdfStream);
        if (!doc.TryGetBookmarks(out var bookmarks, allowContainerNode: true))
            return [];

        var pageCount = doc.NumberOfPages;

        // First pass: build mutable tree with stable ids + starting page
        var counter = new Counter();
        var nodes = bookmarks.Roots.Select(r => BuildNode(r, counter)).ToList();

        // Second pass: infer EndPage per node:
        //   parent end = first child's start (parent text lives between own start and first child)
        //   leaf end   = next sibling's start, else parent's own bound, else pageCount
        FixEndPages(nodes, pageCount);

        // Third: materialize DTOs
        return nodes.Select(n => n.ToDto()).ToArray();

        static MutableNode BuildNode(BookmarkNode node, Counter counter)
        {
            counter.Value++;
            var id = counter.Value.ToString();
            var pageNum = node is DocumentBookmarkNode docNode ? docNode.PageNumber : 1;
            var children = node.Children is { Count: > 0 } kids
                ? kids.Select(c => BuildNode(c, counter)).ToList()
                : new List<MutableNode>();
            return new MutableNode(id, node.Title ?? "Untitled", node.Level, pageNum, children);
        }

        static void FixEndPages(List<MutableNode> siblings, long parentBound)
        {
            for (var i = 0; i < siblings.Count; i++)
            {
                var node = siblings[i];
                var myBound = i + 1 < siblings.Count ? siblings[i + 1].PageNumber : parentBound;

                if (node.Children.Count > 0)
                {
                    // children's range must not exceed this node's own bound
                    FixEndPages(node.Children, myBound);
                    // parent chapter ends where the next same-level chapter begins.
                    // myBound is that next chapter's pageNumber, so myBound - 1 is the
                    // last page actually belonging to this chapter (extract-text/paragraphs
                    // use INCLUSIVE endPage).
                    node.EndPage = Math.Max(node.PageNumber, myBound - 1);
                }
                else
                {
                    // leaf ends one page before the next sibling starts (or parent's bound)
                    node.EndPage = Math.Max(node.PageNumber, myBound - 1);
                }
            }
        }
    }

    private sealed class MutableNode
    {
        public string Id;
        public string Title;
        public int Level;
        public long PageNumber;
        public long EndPage;
        public List<MutableNode> Children;

        public MutableNode(string id, string title, int level, long pageNumber, List<MutableNode> children)
        {
            Id = id;
            Title = title;
            Level = level;
            PageNumber = pageNumber;
            Children = children;
            EndPage = pageNumber; // overwritten by FixEndPages
        }

        public OutlineNodeDto ToDto() => new(
            Id,
            Title,
            Level,
            PageNumber,
            EndPage,
            Children.Select(c => c.ToDto()).ToList().AsReadOnly());
    }

    public static int GetPageCount(Stream pdfStream)
    {
        using var doc = PdfDocument.Open(pdfStream);
        return doc.NumberOfPages;
    }

    public static string ExtractPageRangeText(Stream pdfStream, int startPage, int endPage)
    {
        using var doc = PdfDocument.Open(pdfStream);
        startPage = Math.Clamp(startPage, 1, doc.NumberOfPages);
        endPage = Math.Clamp(endPage, startPage, doc.NumberOfPages);

        var sb = new System.Text.StringBuilder();
        for (var i = startPage; i <= endPage; i++)
        {
            var pageText = doc.GetPage(i).Text;
            sb.AppendLine(pageText);
        }
        return sb.ToString();
    }

    public static ParagraphDto[] ExtractParagraphs(Stream pdfStream, int startPage = 1, int endPage = int.MaxValue, int minChars = 20)
    {
        var text = ExtractPageRangeText(pdfStream, startPage, endPage);
        var paragraphs = text.Split(["\n\n", "\r\n\r\n"], StringSplitOptions.RemoveEmptyEntries)
            .Select((p, i) => new ParagraphDto(i, startPage, WhitespaceRegex.Replace(p.Trim(), " ")))
            .Where(p => p.Text.Length >= minChars)
            .ToArray();
        return paragraphs;
    }

    private sealed class Counter { public int Value; }
}
