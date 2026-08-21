using System.Security.Claims;
using BCrypt.Net;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using backend.Data;
using backend.Models;

namespace backend.Controllers;

[ApiController]
[Route("api/auth")]
public partial class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<AuthController> _logger;

    public AuthController(AppDbContext db, ILogger<AuthController> logger)
    {
        _db = db;
        _logger = logger;
    }

    public record RegisterRequest(string Email, string Name, string Password);
    public record LoginRequest(string Email, string Password);
    public record AuthUserDto(int Id, string Email, string Name, string Role, string DefaultLanguage, int PageSize, bool HasApiKey, string? Model);

    [HttpPost("register")]
    public async Task<ActionResult<AuthUserDto>> Register([FromBody] RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest("Email and password are required.");
        if (req.Password.Length < 6)
            return BadRequest("Password must be at least 6 characters.");

        var email = req.Email.Trim().ToLowerInvariant();
        var existing = await _db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (existing != null)
            return Conflict("Email already registered.");

        var isFirstUser = !await _db.Users.AnyAsync();

        var user = new User
        {
            Email = email,
            Name = string.IsNullOrWhiteSpace(req.Name) ? email.Split('@')[0] : req.Name.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = isFirstUser ? "admin" : "user",
            CreatedAt = DateTime.UtcNow,
            LastActiveAt = DateTime.UtcNow,
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        await SignIn(user);
        _logger.LogInformation("[Auth] Registered user {Id} ({Email}), role={Role}", user.Id, user.Email, user.Role);
        return Ok(ToDto(user));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthUserDto>> Login([FromBody] LoginRequest req)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Unauthorized("Invalid email or password.");

        if (!user.IsActive)
            return StatusCode(403, "Account deactivated.");

        user.LastActiveAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await SignIn(user);
        return Ok(ToDto(user));
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<AuthUserDto>> Me()
    {
        var user = await GetCurrentUser();
        if (user == null) return Unauthorized();
        return Ok(ToDto(user));
    }

    public record ForgotPasswordRequest(string Email);
    public record ResetPasswordRequest(string Email, string Token, string NewPassword);

    // In prod → send email; in dev → return token in response for testing
    [HttpPost("forgot")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email.Trim().ToLowerInvariant());
        // Always return OK to prevent user enumeration; only surface token in dev
        if (user is null) return Ok(new { ok = true });

        var token = Guid.NewGuid().ToString("N");
        user.PasswordResetToken = token;
        user.PasswordResetExpiresAt = DateTime.UtcNow.AddHours(1);
        await _db.SaveChangesAsync();

        _logger.LogInformation("[Auth] Password reset token for {Email}: {Token}", user.Email, token);
        // TODO: send email via configured SMTP provider
        return Ok(new { ok = true, devToken = token });
    }

    [HttpPost("reset")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest req)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email.Trim().ToLowerInvariant());
        if (user is null || user.PasswordResetToken != req.Token)
            return BadRequest("Invalid reset token.");
        if (user.PasswordResetExpiresAt < DateTime.UtcNow)
            return BadRequest("Reset token expired.");
        if (req.NewPassword.Length < 6)
            return BadRequest("Password must be at least 6 characters.");

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        user.PasswordResetToken = null;
        user.PasswordResetExpiresAt = null;
        await _db.SaveChangesAsync();

        _logger.LogInformation("[Auth] Password reset for {Email}", user.Email);
        return Ok(new { ok = true });
    }

    private async Task SignIn(User user)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Role, user.Role),
        };
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true, ExpiresUtc = DateTimeOffset.UtcNow.AddDays(30) });
    }

    private async Task<User?> GetCurrentUser()
    {
        var idClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(idClaim, out var userId)) return null;
        return await _db.Users.FindAsync(userId);
    }

    private static AuthUserDto ToDto(User u) => new(
        u.Id, u.Email, u.Name, u.Role, u.DefaultLanguage, u.PageSize, !string.IsNullOrEmpty(u.ApiKey), u.Model);
}
