using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ReadPulse.Services;
using backend.Data;
using backend.Models;
using backend.Services;

namespace backend.Controllers;

[ApiController]
[Route("api/books")]
public class BooksController : ControllerBase
{
    private static readonly string UploadsFolder = Path.Combine(Path.GetTempPath(), "readpulse_uploads");
    private readonly CardGeneratorService _cardGen;
    private readonly AppDbContext _db;
    private readonly ILogger<BooksController> _logger;

    static BooksController()
    {
        Directory.CreateDirectory(UploadsFolder);
    }

    public BooksController(CardGeneratorService cardGen, AppDbContext db, ILogger<BooksController> logger)
    {
        _cardGen = cardGen;
        _db = db;
        _logger = logger;
    }

    [Authorize]
    [HttpPost("upload-url")]
    public async Task<ActionResult<BookUploadResult>> UploadFromUrl([FromBody] UploadUrlRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Url))
            return BadRequest("URL is required.");
        if (!Uri.TryCreate(request.Url, UriKind.Absolute, out var uri))
            return BadRequest("Invalid URL.");
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            return BadRequest("Only http/https URLs are supported.");

        var fileName = Path.GetFileName(uri.LocalPath);
        if (string.IsNullOrEmpty(fileName)) fileName = uri.Host.Replace('.', '_') + ".pdf";
        if (!fileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)) fileName += ".pdf";

        var tempName = $"{Guid.NewGuid():N}_{fileName}";
        var tempPath = Path.Combine(UploadsFolder, tempName);

        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(2) };
            await using var dl = await http.GetStreamAsync(uri);
            await using var fs = new FileStream(tempPath, FileMode.Create);
            await dl.CopyToAsync(fs);
        }
        catch (Exception ex)
        {
            if (System.IO.File.Exists(tempPath)) System.IO.File.Delete(tempPath);
            return BadRequest($"Failed to download: {ex.Message}");
        }

        using var stream = new FileStream(tempPath, FileMode.Open, FileAccess.Read);
        var pageCount = BookSlicerService.GetPageCount(stream);
        stream.Position = 0;
        var outline = BookSlicerService.GetOutline(stream);

        int? ownerId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : null;

        var book = new Book
        {
            OwnerUserId = ownerId,
            Title = Path.GetFileNameWithoutExtension(fileName),
            FilePath = tempPath,
            TotalPages = pageCount,
        };
        _db.Books.Add(book);
        await _db.SaveChangesAsync();

        return Ok(new BookUploadResult(book.Id, fileName, tempPath, pageCount, outline));
    }

    [Authorize]
    [HttpPost("upload")]
    public async Task<ActionResult<BookUploadResult>> Upload(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("No file uploaded.");

        var isText = file.FileName.EndsWith(".txt", StringComparison.OrdinalIgnoreCase)
                  || file.FileName.EndsWith(".md", StringComparison.OrdinalIgnoreCase);

        if (!isText && !file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            return BadRequest("Only .pdf, .txt, and .md files are supported.");

        // Save uploaded file to temp so we can reference it later
        var tempName = $"{Guid.NewGuid():N}{Path.GetExtension(file.FileName)}";
        var tempPath = Path.Combine(UploadsFolder, tempName);
        await using (var fileStream = new FileStream(tempPath, FileMode.Create))
        {
            await file.CopyToAsync(fileStream);
        }

        using var stream = new FileStream(tempPath, FileMode.Open, FileAccess.Read);
        int pageCount;
        OutlineNodeDto[] outline;
        if (isText)
        {
            // For .txt / .md, pageCount = character count (UI hid outline extraction)
            pageCount = (int)stream.Length;
            outline = Array.Empty<OutlineNodeDto>();
        }
        else
        {
            pageCount = BookSlicerService.GetPageCount(stream);
            stream.Position = 0;
            outline = BookSlicerService.GetOutline(stream);
        }

        int? ownerId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : null;

        // Persist to library
        var book = new Book
        {
            OwnerUserId = ownerId,
            Title = Path.GetFileNameWithoutExtension(file.FileName),
            FilePath = tempPath,
            TotalPages = pageCount,
        };
        _db.Books.Add(book);
        await _db.SaveChangesAsync();

        return Ok(new BookUploadResult(book.Id, file.FileName, tempPath, pageCount, outline));
    }

    // GET /api/books  — uploaded library; per-user scoped (admins see all)
    [HttpGet]
    public async Task<ActionResult<List<BookListItem>>> GetBooks()
    {
        var query = _db.Books.AsQueryable();
        var requesterIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var isAdmin = User.IsInRole("admin");

        if (!isAdmin)
        {
            if (int.TryParse(requesterIdStr, out var requesterId))
                query = query.Where(b => b.OwnerUserId == null || b.OwnerUserId == requesterId);
            else
                query = query.Where(b => b.OwnerUserId == null);
        }

        var books = await query
            .OrderByDescending(b => b.UploadedAt)
            .Select(b => new BookListItem(b.Id, b.Title, b.Author, b.TotalPages, b.UploadedAt, b.FilePath))
            .ToListAsync();
        return Ok(books);
    }

    // DELETE /api/books/{id}  — remove from library + delete temp file
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteBook(int id)
    {
        var book = await _db.Books.FindAsync(id);
        if (book is null) return NotFound();

        if (!string.IsNullOrEmpty(book.FilePath) && System.IO.File.Exists(book.FilePath))
        {
            try { System.IO.File.Delete(book.FilePath); } catch { /* tolerate */ }
        }
        _db.Books.Remove(book);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // GET /api/books/{id}/chapters  — outline-derived chapter list
    [HttpGet("{id:int}/chapters")]
    public async Task<IActionResult> GetChapters(int id)
    {
        var book = await _db.Books.FindAsync(id);
        if (book is null) return NotFound();

        if (!System.IO.File.Exists(book.FilePath ?? ""))
            return BadRequest("Book file no longer available.");

        using var stream = System.IO.File.OpenRead(book.FilePath!);
        var outline = BookSlicerService.GetOutline(stream);
        var chapters = outline
            .Select((n, i) => new
            {
                index = i,
                title = n.Title,
                pageStart = n.PageNumber,
                pageEnd = i + 1 < outline.Length ? outline[i + 1].PageNumber : book.TotalPages,
            })
            .ToList();
        return Ok(chapters);
    }

    [HttpPost("extract-text-raw")]
    public async Task<ActionResult<TextExtractResult>> ExtractTextRaw([FromBody] TextExtractRequest request)
    {
        if (!System.IO.File.Exists(request.FilePath))
            return BadRequest($"File not found: {request.FilePath}");

        // For .txt / .md files: just read the whole file (ignore page range)
        using var reader = new StreamReader(request.FilePath);
        var text = await reader.ReadToEndAsync();
        return Ok(new TextExtractResult(text));
    }

    [HttpPost("extract-text")]
    public ActionResult<TextExtractResult> ExtractText([FromBody] TextExtractRequest request)
    {
        if (!System.IO.File.Exists(request.FilePath))
            return BadRequest($"File not found: {request.FilePath}");

        using var stream = System.IO.File.OpenRead(request.FilePath);
        var text = BookSlicerService.ExtractPageRangeText(stream, request.StartPage, request.EndPage);

        return Ok(new TextExtractResult(text));
    }

    [HttpPost("extract-paragraphs")]
    public ActionResult<ParagraphExtractResult> ExtractParagraphs([FromBody] ParagraphExtractRequest request)
    {
        if (!System.IO.File.Exists(request.FilePath))
            return BadRequest($"File not found: {request.FilePath}");

        using var stream = System.IO.File.OpenRead(request.FilePath);
        var paragraphs = BookSlicerService.ExtractParagraphs(stream, request.StartPage, request.EndPage, request.MinChars);

        return Ok(new ParagraphExtractResult(paragraphs.Length, paragraphs));
    }

    [Authorize]
    [HttpPost("generate-cards")]
    public async Task<ActionResult<GenerateCardsResult>> GenerateCards([FromBody] GenerateCardsRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
            return BadRequest("No text provided.");

        _logger.LogInformation("[BooksController] POST generate-cards: lang={Lang}, textLen={TextLen}",
            request.Language, request.Text.Length);

        try
        {
            // Per-user API key (from Settings) takes priority over global config
            string? userKey = null;
            string? userPromptOverride = null;
            string? userModel = null;
            if (int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
            {
                var dbUser = await _db.Users.FindAsync(uid);
                userKey = dbUser?.ApiKey;
                userPromptOverride = dbUser?.PromptOverride;
                userModel = dbUser?.Model;
            }

            var cards = await _cardGen.ProcessChunkAsync(request.Text, request.Language, userKey, userPromptOverride, userModel);
            return Ok(new GenerateCardsResult(cards.Count, cards.ToArray()));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[BooksController] Card generation failed");
            return StatusCode(500, new { error = ex.Message });
        }
    }
}

public record BookUploadResult(int BookId, string FileName, string FilePath, int PageCount, OutlineNodeDto[] Outline);
public record BookListItem(int Id, string Title, string? Author, int TotalPages, DateTime UploadedAt, string? FilePath);
public record UploadUrlRequest(string Url);

public record TextExtractRequest(string FilePath, int StartPage, int EndPage);
public record TextExtractResult(string Text);

public record ParagraphExtractRequest(string FilePath, int StartPage, int EndPage, int MinChars = 20);
public record ParagraphExtractResult(int Count, ParagraphDto[] Paragraphs);

public record GenerateCardsRequest(string FilePath, string Text, string Language);
public record GenerateCardsResult(int Count, ReadPulse.Services.GeneratedCard[] Cards);
