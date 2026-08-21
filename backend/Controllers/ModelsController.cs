using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/models")]
public class ModelsController : ControllerBase
{
    private static readonly HttpClient _http = new();
    private static List<ChutesModelDto>? _cache;
    private static DateTime _cacheAt;
    private static readonly SemaphoreSlim _lock = new(1, 1);

    private readonly IConfiguration _configuration;
    private readonly ILogger<ModelsController> _logger;

    public ModelsController(IConfiguration configuration, ILogger<ModelsController> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    // GET /api/models — proxy Chutes /v1/models with in-memory cache (10 min TTL)
    [HttpGet]
    public async Task<ActionResult<List<ChutesModelDto>>> GetModels()
    {
        // Return cached if fresh
        if (_cache is not null && DateTime.UtcNow - _cacheAt < TimeSpan.FromMinutes(10))
            return Ok(_cache);

        await _lock.WaitAsync();
        try
        {
            // Double-check after acquiring lock
            if (_cache is not null && DateTime.UtcNow - _cacheAt < TimeSpan.FromMinutes(10))
                return Ok(_cache);

            var apiKey = _configuration["CHUTES_API_KEY"];
            if (string.IsNullOrWhiteSpace(apiKey))
                return StatusCode(500, new { error = "CHUTES_API_KEY not configured" });

            var request = new HttpRequestMessage(HttpMethod.Get, "https://llm.chutes.ai/v1/models");
            request.Headers.Add("Authorization", $"Bearer {apiKey}");

            _logger.LogInformation("[ModelsController] Fetching models from Chutes");

            var response = await _http.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("[ModelsController] Chutes returned {Status}: {Body}",
                    (int)response.StatusCode, body[..Math.Min(300, body.Length)]);
                // Return stale cache if available, else error
                if (_cache is not null) return Ok(_cache);
                return StatusCode(502, new { error = $"Chutes API error: {(int)response.StatusCode}" });
            }

            // Parse { "data": [ { "id": "...", ... } ] }
            using var doc = JsonDocument.Parse(body);
            var models = new List<ChutesModelDto>();
            if (doc.RootElement.TryGetProperty("data", out var dataEl))
            {
                foreach (var m in dataEl.EnumerateArray())
                {
                    var id = m.GetProperty("id").GetString() ?? "";
                    if (string.IsNullOrEmpty(id)) continue;
                    models.Add(new ChutesModelDto(id));
                }
            }

            models.Sort((a, b) => string.Compare(a.Id, b.Id, StringComparison.OrdinalIgnoreCase));

            _cache = models;
            _cacheAt = DateTime.UtcNow;

            _logger.LogInformation("[ModelsController] Cached {Count} models", models.Count);
            return Ok(models);
        }
        finally
        {
            _lock.Release();
        }
    }
}

public record ChutesModelDto(string Id);
