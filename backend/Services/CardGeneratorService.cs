using System.Text;
using System.Text.Json;

namespace ReadPulse.Services;

/// <summary>
/// Simple LLM service — adapted from ChemCalculationAndManagementApp's ChutesQuickTest.cs.
/// Calls https://llm.chutes.ai/v1/chat/completions (OpenAI-compatible).
/// </summary>
public class CardGeneratorService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<CardGeneratorService> _logger;
    private static readonly HttpClient _http = new();

    // Model from ChemCalculationAndManagementApp's Chutes integration
    private const string DefaultModel = "moonshotai/Kimi-K2.6-TEE";
    private const string ChutesApiUrl = "https://llm.chutes.ai/v1/chat/completions";

    public CardGeneratorService(IConfiguration configuration, ILogger<CardGeneratorService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>Generate cards (insight/quiz/action_code) from a text chunk.</summary>
    public async Task<List<GeneratedCard>> GenerateCardsAsync(
        string text, string targetLanguage = "en", string? userApiKey = null,
        string? userPromptOverride = null, string? userModel = null, CancellationToken ct = default)
    {
        // User's personal key from Settings takes priority; fall back to global config
        var apiKey = !string.IsNullOrWhiteSpace(userApiKey)
            ? userApiKey
            : _configuration["CHUTES_API_KEY"];
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("CHUTES_API_KEY environment variable not set and no user API key provided");

        // Model precedence: user's per-user Model > Chutes:Model config > hardcoded default
        var model = !string.IsNullOrWhiteSpace(userModel)
            ? userModel
            : (_configuration["Chutes:Model"] ?? DefaultModel);

        // User's prompt override takes priority; falls back to default EN/RU prompts
        var prompt = !string.IsNullOrWhiteSpace(userPromptOverride)
            ? userPromptOverride.Replace("{text}", text)
            : (targetLanguage == "ru" ? BuildRussianPrompt(text) : BuildEnglishPrompt(text));

        var request = new
        {
            model,
            messages = new[] { new { role = "user", content = prompt } },
            max_tokens = 4096,
            temperature = 0.3, // lower = more consistent, better for structured output
        };

        var json = JsonSerializer.Serialize(request, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            // Encoder that keeps Cyrillic intact
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        });

        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        var httpRequest = new HttpRequestMessage(HttpMethod.Post, ChutesApiUrl);
        httpRequest.Headers.Add("Authorization", $"Bearer {apiKey}");
        httpRequest.Content = content;

        _logger.LogInformation("[CardGenerator] POST {Url} model={Model} lang={Lang}",
            ChutesApiUrl, model, targetLanguage);

        var response = await _http.SendAsync(httpRequest, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("[CardGenerator] HTTP {Status}: {Body}",
                (int)response.StatusCode, responseBody[..Math.Min(500, responseBody.Length)]);
            throw new HttpRequestException($"LLM API error: {(int)response.StatusCode}: {responseBody}");
        }

        // Parse: {"choices":[{"message":{"content":"..."}}]}
        using var doc = JsonDocument.Parse(responseBody);
        var message = doc.RootElement.GetProperty("choices")[0].GetProperty("message");
        var contentText = message.GetProperty("content").GetString() ?? "";

        _logger.LogInformation("[CardGenerator] Raw response ({Len} chars): {Content}",
            contentText.Length, contentText[..Math.Min(400, contentText.Length)]);

        // Strip markdown code fences if present
        contentText = StripCodeFences(contentText);

        // Parse generated cards from JSON
        var cards = JsonSerializer.Deserialize<List<GeneratedCard>>(contentText,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new();

        // Post-process: trust caller's requested language, null out irrelevant extra fields
        foreach (var card in cards)
        {
            card.Language = targetLanguage;
            if (card.Type != "quiz") card.QuizOptions = null;
            if (card.Type != "action_code") { card.CodeSnippet = null; card.CodeLanguage = null; }
        }

        return cards;
    }

    /// <summary>Full pipeline: text -> LLM -> cards.</summary>
    public async Task<List<GeneratedCard>> ProcessChunkAsync(
        string text, string targetLanguage = "en", string? userApiKey = null,
        string? userPromptOverride = null, string? userModel = null, CancellationToken ct = default)
    {
        // Skip if text too short
        if (string.IsNullOrWhiteSpace(text) || text.Length < 50)
            return new();

        try
        {
            return await GenerateCardsAsync(text, targetLanguage, userApiKey, userPromptOverride, userModel, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[CardGenerator] Failed to generate cards for {Lang} text ({Len} chars)",
                targetLanguage, text.Length);
            return new();
        }
    }

    private static string BuildEnglishPrompt(string text) => $$"""
        You are a knowledge extraction assistant. You will be given a chunk of text from
        a book. Extract the most important learning points and produce between 1 to 3
        cards in English.

        Respond with ONLY a raw JSON array (no markdown, no explanation, no code fences),
        where each element has ALWAYS these fields:
          "type"  — one of  "insight" | "quiz" | "action_code"
          "title" — a concise, specific title (3-8 words, no clickbait)
          "content" — the key point. For insight: 1-2 sentences. For quiz: the full question text.
                       For action_code: 1-2 sentences explaining what the code demonstrates.
          "language" — "en"

        Additional fields depending on "type":
        * "quiz" (only if the text contains a clear checkable fact or concept):
            "quizOptions" — array of EXACTLY 4 objects:
              { "id": "a"|"b"|"c"|"d", "text": "answer option", "isCorrect": true|false, "explanation": "why correct or not" }
              Mark exactly ONE option as isCorrect=true.
        * "action_code" (only if the text demonstrates a code pattern worth copying):
            "codeSnippet" — a SHORT complete working code example in C# (3-15 lines).
            "codeLanguage" — usually "csharp".

        Cards of type "insight" should NOT have quizOptions/codeSnippet fields at all.
        Prefer a mix: if the text supports it, produce 1 insight + 1 quiz + 1 action_code.

        Text from the book:
        ---
        {{text}}
        ---
    """;

    private static string BuildRussianPrompt(string text) => $$"""
        Ты — помощник по извлечению знаний. Тебе дан фрагмент текста из книги.
        Извлеки ключевые обучающие моменты и создай от 1 до 3 карточек на русском языке.

        Ответь ТОЛЬКО сырым JSON-массивом (без markdown, без пояснений, без ограждений),
        где каждый элемент имеет ВСЕГДА эти поля:
          "type"  — один из "insight" | "quiz" | "action_code"
          "title" — ёмкий заголовок (3-8 слов, без кликбейта)
          "content" — ключевой момент. Для insight: 1-2 предложения. Для quiz: текст вопроса.
                       Для action_code: 1-2 предложения о том, что демонстрирует код.
          "language" — "ru"

        Дополнительные поля в зависимости от "type":
        * "quiz" (только если в тексте есть проверяемый факт или понятие):
            "quizOptions" — массив РОВНО из 4 объектов:
              { "id": "a"|"b"|"c"|"d", "text": "вариант ответа", "isCorrect": true|false, "explanation": "почему верно/неверно" }
              Отметь ровно ОДИН вариант как isCorrect=true.
        * "action_code" (только если текст демонстрирует пример кода, который стоит копировать):
            "codeSnippet" — КОРОТКИЙ полный рабочий пример кода на C# (3-15 строк).
            "codeLanguage" — обычно "csharp".

        Карточки типа "insight" НЕ должны иметь полей quizOptions/codeSnippet.
        Предпочтительно разнообразие: если текст позволяет, создай 1 insight + 1 quiz + 1 action_code.

        Текст из книги:
        ---
        {{text}}
        ---
    """;

    private static string StripCodeFences(string raw)
    {
        var s = raw.Trim();
        // Strip markdown code fences: ```json ... ``` or ``` ... ```
        if (s.StartsWith("```"))
        {
            var firstNewline = s.IndexOf('\n');
            if (firstNewline > 0)
                s = s[(firstNewline + 1)..];
            if (s.EndsWith("```"))
                s = s[..^3].TrimEnd();
        }
        return s;
    }
}

public class GeneratedCard
{
    public string Type { get; set; } = "insight";
    public string Title { get; set; } = "";
    public string Content { get; set; } = "";
    public string Language { get; set; } = "en";
    public List<GeneratedQuizOption>? QuizOptions { get; set; }
    public string? CodeSnippet { get; set; }
    public string? CodeLanguage { get; set; }
}

public class GeneratedQuizOption
{
    public string Id { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public bool IsCorrect { get; set; }
    public string? Explanation { get; set; }
}
