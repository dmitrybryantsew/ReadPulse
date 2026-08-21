using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using backend.Data;
using backend.Dtos;

namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PostsController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private readonly AppDbContext _db;

    public PostsController(AppDbContext db)
    {
        _db = db;
    }

    // GET /api/posts?page=1&pageSize=10&category=clean-code&type=insight&lang=en&q=terms
    [HttpGet]
    public async Task<ActionResult<PagedResult<PostDto>>> GetPosts(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? category = null,
        [FromQuery] string? type = null,
        [FromQuery] string? lang = null,
        [FromQuery] string? q = null)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 50) pageSize = 10;

        var query = _db.Posts.AsQueryable();

        var requesterIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var isAdmin = User.IsInRole("admin");
        if (!isAdmin)
        {
            if (int.TryParse(requesterIdStr, out var requesterId))
            {
                query = query.Where(p => p.OwnerUserId == null || p.OwnerUserId == requesterId);
            }
            else
            {
                query = query.Where(p => p.OwnerUserId == null);
            }
        }

        if (!string.IsNullOrWhiteSpace(lang))
            query = query.Where(p => p.Language == lang);

        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(p => p.Category == category);

        if (!string.IsNullOrWhiteSpace(type))
            query = query.Where(p => p.Type == type);

        // Full-text search across title / content / tags
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLower();
            query = query.Where(p =>
                p.Title.ToLower().Contains(term) ||
                p.Content.ToLower().Contains(term) ||
                p.Category.ToLower().Contains(term) ||
                (p.TagsCsv != null && p.TagsCsv.ToLower().Contains(term)));
        }

        var totalCount = await query.CountAsync();

        var rawItems = await query
            .OrderByDescending(p => p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        // Determine which of these are saved by the current user
        var rawIds = rawItems.Select(p => p.Id).ToList();
        var savedIds = new HashSet<int>();
        if (int.TryParse(requesterIdStr, out var uid))
        {
            savedIds = (await _db.SavedPosts
                .Where(sp => sp.UserId == uid && rawIds.Contains(sp.PostId))
                .Select(sp => sp.PostId)
                .ToListAsync()).ToHashSet();
        }

        var items = rawItems.Select(p => ToDto(p, savedIds.Contains(p.Id))).ToList();

        var hasMore = page * pageSize < totalCount;

        return Ok(new PagedResult<PostDto>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            HasMore = hasMore
        });
    }

    // GET /api/posts/search?q=term — secondary entry point, same as ?q=
    [HttpGet("search")]
    public Task<ActionResult<PagedResult<PostDto>>> SearchPosts(
        [FromQuery] string q,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? lang = null)
        => GetPosts(page, pageSize, null, null, lang, q);

    // GET /api/posts/tags
    [HttpGet("tags")]
    public async Task<IActionResult> GetTags()
    {
        var tags = await _db.Posts
            .Where(p => p.TagsCsv != null && p.TagsCsv != "")
            .Select(p => p.TagsCsv!)
            .ToListAsync();
        var all = tags
            .SelectMany(s => s.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Distinct()
            .OrderBy(t => t)
            .ToList();
        return Ok(all);
    }

    // POST /api/posts/{id}/save  — toggle bookmark
    [Authorize]
    [HttpPost("{id}/save")]
    public async Task<IActionResult> ToggleSave(int id)
    {
        var post = await _db.Posts.FindAsync(id);
        if (post is null) return NotFound();

        var requesterId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var existing = await _db.SavedPosts.FindAsync(requesterId, id);
        if (existing is null)
        {
            _db.SavedPosts.Add(new backend.Models.SavedPost { UserId = requesterId, PostId = id });
            await _db.SaveChangesAsync();
            return Ok(new { postId = id, saved = true });
        }
        else
        {
            _db.SavedPosts.Remove(existing);
            await _db.SaveChangesAsync();
            return Ok(new { postId = id, saved = false });
        }
    }

    // GET /api/posts/categories
    [HttpGet("categories")]
    public async Task<IActionResult> GetCategories()
    {
        var cats = await _db.Posts
            .Select(p => p.Category)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();
        return Ok(cats);
    }

    private static PostDto ToDto(backend.Models.Post p, bool isSaved) => new()
    {
        Id = p.Id,
        Type = p.Type,
        Title = p.Title,
        Content = p.Content,
        Category = p.Category,
        BookTitle = p.BookTitle,
        BookAuthor = p.BookAuthor,
        Chapter = p.Chapter,
        CodeSnippet = p.CodeSnippet,
        CodeLanguage = p.CodeLanguage,
        Language = p.Language,
        CreatedAt = p.CreatedAt,
        QuizOptions = string.IsNullOrEmpty(p.QuizOptionsJson)
            ? null
            : JsonSerializer.Deserialize<List<QuizOptionDto>>(p.QuizOptionsJson, JsonOpts),
        Tags = string.IsNullOrEmpty(p.TagsCsv)
            ? new List<string>()
            : p.TagsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(),
        IsSaved = isSaved
    };

    // POST /api/posts/{id}/like — REMOVED (likes feature cut per user request)
    // DELETE /api/posts/{id}
    [Authorize]
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeletePost(int id)
    {
        var post = await _db.Posts.FindAsync(id);
        if (post is null) return NotFound();

        // Only the owner or an admin may delete
        var requesterId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var isAdmin = User.IsInRole("admin");
        if (!isAdmin && post.OwnerUserId.HasValue && post.OwnerUserId.ToString() != requesterId)
            return Forbid();

        _db.Posts.Remove(post);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // PUT /api/posts/{id} — edit an existing post (owner or admin only)
    [Authorize]
    [HttpPut("{id}")]
    public async Task<ActionResult<PostDto>> UpdatePost(int id, [FromBody] UpdatePostRequest request)
    {
        var post = await _db.Posts.FindAsync(id);
        if (post is null) return NotFound();

        var requesterId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var isAdmin = User.IsInRole("admin");
        if (!isAdmin && post.OwnerUserId.HasValue && post.OwnerUserId.ToString() != requesterId)
            return Forbid();

        if (!string.IsNullOrWhiteSpace(request.Title)) post.Title = request.Title;
        if (!string.IsNullOrWhiteSpace(request.Content)) post.Content = request.Content;
        if (!string.IsNullOrWhiteSpace(request.Category)) post.Category = request.Category;
        if (request.BookTitle != null) post.BookTitle = request.BookTitle;
        if (request.BookAuthor != null) post.BookAuthor = request.BookAuthor;
        if (request.Chapter != null) post.Chapter = request.Chapter;
        if (request.Type != null) post.Type = request.Type;
        if (request.CodeSnippet != null) post.CodeSnippet = request.CodeSnippet;
        if (request.CodeLanguage != null) post.CodeLanguage = request.CodeLanguage;
        if (request.QuizOptions != null)
        {
            post.QuizOptionsJson = request.QuizOptions.Count > 0
                ? JsonSerializer.Serialize(request.QuizOptions)
                : null;
        }
        if (request.Tags != null)
        {
            post.TagsCsv = request.Tags.Count > 0
                ? string.Join(",", request.Tags.Select(t => t.Trim().Trim(',')).Where(t => t.Length > 0).Distinct())
                : null;
        }

        await _db.SaveChangesAsync();

        var savedByMe = false;
        if (int.TryParse(requesterId, out var uid))
            savedByMe = await _db.SavedPosts.AnyAsync(sp => sp.UserId == uid && sp.PostId == id);

        return Ok(ToDto(post, savedByMe));
    }

    // POST /api/posts
    [Authorize]
    [HttpPost]
    public async Task<ActionResult<PostDto>> CreatePost([FromBody] CreatePostRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Content))
            return BadRequest("Content is required.");

        // Dedup: exact title+category match → merge (return existing, optionally bump likes)
        var existing = await _db.Posts.FirstOrDefaultAsync(p =>
            p.Title == request.Title && p.Category == (request.Category ?? "other"));
        if (existing != null)
        {
            return Ok(ToDto(existing, false));
        }

        int? ownerId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : null;

        var tagsCsv = request.Tags is { Count: > 0 }
            ? string.Join(",", request.Tags.Select(t => t.Trim().Trim(',')).Where(t => t.Length > 0).Distinct())
            : null;

        var post = new backend.Models.Post
        {
            OwnerUserId = ownerId,
            Type = request.Type ?? "insight",
            Title = request.Title,
            Content = request.Content,
            Category = request.Category ?? "other",
            BookTitle = request.BookTitle,
            BookAuthor = request.BookAuthor,
            Chapter = request.Chapter,
            CodeSnippet = request.CodeSnippet,
            CodeLanguage = request.CodeLanguage,
            Language = request.Language ?? "en",
            TagsCsv = tagsCsv,
            QuizOptionsJson = request.QuizOptions is { Count: > 0 }
                ? JsonSerializer.Serialize(request.QuizOptions)
                : null,
            CreatedAt = DateTime.UtcNow
        };

        _db.Posts.Add(post);
        await _db.SaveChangesAsync();

        var dto = ToDto(post, false);

        return CreatedAtAction(nameof(GetPosts), new { id = post.Id }, dto);
    }
}

public record CreatePostRequest(
    string? Type,
    string Title,
    string Content,
    string? Category,
    string? BookTitle,
    string? BookAuthor,
    string? Chapter,
    string? CodeSnippet,
    string? CodeLanguage,
    string? Language,
    List<QuizOptionDto>? QuizOptions,
    List<string>? Tags);

public record UpdatePostRequest(
    string? Type,
    string? Title,
    string? Content,
    string? Category,
    string? BookTitle,
    string? BookAuthor,
    string? Chapter,
    string? CodeSnippet,
    string? CodeLanguage,
    List<QuizOptionDto>? QuizOptions,
    List<string>? Tags);
