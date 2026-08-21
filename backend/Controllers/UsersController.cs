using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using backend.Data;
using backend.Models;

namespace backend.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;

    public UsersController(AppDbContext db) => _db = db;

    public record UpdateSettingsRequest(string? ApiKey, string? DefaultLanguage, int? PageSize, string? PromptOverride, string? Model);

    private async Task<User?> GetCurrentUser()
    {
        var idClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(idClaim, out var id)) return null;
        return await _db.Users.FindAsync(id);
    }

    // PUT /api/users/me/settings
    [HttpPut("me/settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateSettingsRequest req)
    {
        var user = await GetCurrentUser();
        if (user == null) return Unauthorized();

        if (req.ApiKey != null) user.ApiKey = req.ApiKey.Trim();
        if (req.PromptOverride != null) user.PromptOverride = req.PromptOverride.Trim();
        // Model: empty string clears (fall back to global), non-empty sets override
        if (req.Model != null) user.Model = string.IsNullOrWhiteSpace(req.Model) ? null : req.Model.Trim();
        if (!string.IsNullOrWhiteSpace(req.DefaultLanguage) &&
            (req.DefaultLanguage == "en" || req.DefaultLanguage == "ru"))
        {
            user.DefaultLanguage = req.DefaultLanguage;
        }
        if (req.PageSize.HasValue && req.PageSize.Value is >= 5 and <= 50)
        {
            user.PageSize = req.PageSize.Value;
        }

        await _db.SaveChangesAsync();
        return Ok(new {
            user.Id, user.Email, user.Name, user.Role,
            user.DefaultLanguage, user.PageSize,
            user.Model,
            hasApiKey = !string.IsNullOrEmpty(user.ApiKey),
            hasPromptOverride = !string.IsNullOrEmpty(user.PromptOverride)
        });
    }
}

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;

    public AdminController(AppDbContext db) => _db = db;

    public record AdminUserDto(
        int Id, string Email, string Name, string Role,
        DateTime CreatedAt, DateTime LastActiveAt, bool IsActive,
        int PostCount, bool HasApiKey);

    public record UpdateUserRequest(string? Role, bool? IsActive);

    // GET /api/admin/users
    [HttpGet("users")]
    public async Task<ActionResult<List<AdminUserDto>>> GetUsers()
    {
        var users = await _db.Users
            .OrderByDescending(u => u.CreatedAt)
            .Select(u => new AdminUserDto(
                u.Id, u.Email, u.Name, u.Role,
                u.CreatedAt, u.LastActiveAt, u.IsActive,
                _db.Posts.Count(p => p.OwnerUserId == u.Id),
                !string.IsNullOrEmpty(u.ApiKey)))
            .ToListAsync();
        return Ok(users);
    }

    // PATCH /api/admin/users/{id}
    [HttpPatch("users/{id:int}")]
    public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserRequest req)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(req.Role) && (req.Role == "admin" || req.Role == "user"))
            user.Role = req.Role;
        if (req.IsActive.HasValue)
        {
            user.IsActive = req.IsActive.Value;
            if (!user.IsActive)
            {
                // Revoke all sessions for deactivated user
                var sessions = await _db.Sessions.Where(s => s.UserId == user.Id).ToListAsync();
                _db.Sessions.RemoveRange(sessions);
            }
        }
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // DELETE /api/admin/users/{id}
    [HttpDelete("users/{id:int}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound();

        // Cascade delete user's posts (optional) — leave them for now
        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // GET /api/admin/stats
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var stats = new
        {
            totalUsers = await _db.Users.CountAsync(),
            activeUsers = await _db.Users.CountAsync(u => u.IsActive),
            totalPosts = await _db.Posts.CountAsync(),
            totalBooks = await _db.Books.CountAsync(),
            postsByLanguage = await _db.Posts
                .GroupBy(p => p.Language)
                .Select(g => new { language = g.Key, count = g.Count() })
                .ToListAsync(),
            postsByType = await _db.Posts
                .GroupBy(p => p.Type)
                .Select(g => new { type = g.Key, count = g.Count() })
                .ToListAsync(),
        };
        return Ok(stats);
    }
}
