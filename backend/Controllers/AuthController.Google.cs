using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using backend.Data;
using backend.Models;

namespace backend.Controllers;

public partial class AuthController : ControllerBase
{
    public record GoogleLoginRequest(string IdToken);

    /// <summary>
    /// Accepts a Google Identity id_token (JWT) from frontend Google sign-in button,
    /// verifies signature + audience + expiry against Google's public keys,
    /// finds or creates the user, and issues the app cookie.
    /// </summary>
    [HttpPost("google")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthUserDto>> GoogleLogin(
        [FromBody] GoogleLoginRequest req,
        [FromServices] IConfiguration config)
    {
        if (string.IsNullOrWhiteSpace(req.IdToken))
            return BadRequest("Missing id_token.");

        var clientId = config["Google:ClientId"];
        if (string.IsNullOrWhiteSpace(clientId))
            return StatusCode(500, "Google:ClientId not configured in appsettings.");

        // Fetch Google's OIDC discovery document for public keys
        using var http = new HttpClient();
        var discoveryJson = await http.GetStringAsync("https://accounts.google.com/.well-known/openid-configuration");
        using var doc = System.Text.Json.JsonDocument.Parse(discoveryJson);
        var jwksUri = doc.RootElement.GetProperty("jwks_uri").GetString()!;

        var keysJson = await http.GetStringAsync(jwksUri);
        var jwks = new JsonWebKeySet(keysJson);

        var handler = new JwtSecurityTokenHandler();
        var validationParams = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuers = new[] { "https://accounts.google.com", "accounts.google.com" },
            ValidateAudience = true,
            ValidAudience = clientId,
            ValidateLifetime = true,
            IssuerSigningKeys = jwks.Keys,
            RequireSignedTokens = true,
            ValidateIssuerSigningKey = true,
        };

        ClaimsPrincipal principal;
        try
        {
            principal = handler.ValidateToken(req.IdToken, validationParams, out var _);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("[Auth.Google] Invalid id_token: {Msg}", ex.Message);
            return Unauthorized("Invalid Google ID token.");
        }

        var email = principal.FindFirstValue(ClaimTypes.Email)?.ToLowerInvariant()
                    ?? principal.FindFirstValue("email")?.ToLowerInvariant();
        var googleId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                       ?? principal.FindFirstValue("sub");
        var name = principal.FindFirstValue(ClaimTypes.Name)
                   ?? principal.FindFirstValue("name")
                   ?? email;
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(googleId))
            return BadRequest("Token missing email or sub claim.");

        // Find by GoogleId first, then by email (linking), else create
        var user = await _db.Users.FirstOrDefaultAsync(u => u.GoogleId == googleId)
                   ?? await _db.Users.FirstOrDefaultAsync(u => u.Email == email);

        if (user == null)
        {
            var isFirstUser = !await _db.Users.AnyAsync();
            user = new User
            {
                Email = email,
                Name = name ?? email.Split('@')[0],
                GoogleId = googleId,
                PasswordHash = string.Empty, // no local password — Google only
                Role = isFirstUser ? "admin" : "user",
                CreatedAt = DateTime.UtcNow,
                LastActiveAt = DateTime.UtcNow,
            };
            _db.Users.Add(user);
        }
        else if (string.IsNullOrWhiteSpace(user.GoogleId))
        {
            // Link Google to existing local account
            user.GoogleId = googleId;
        }

        if (!user.IsActive)
            return StatusCode(403, "Account deactivated.");

        user.LastActiveAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await SignIn(user);

        _logger.LogInformation("[Auth.Google] User {Id} ({Email}) signed in via Google", user.Id, user.Email);
        return Ok(ToDto(user));
    }
}
