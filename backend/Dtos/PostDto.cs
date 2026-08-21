namespace backend.Dtos;

public class PostDto
{
    public int Id { get; set; }
    public string Type { get; set; } = "insight";
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;

    public string? BookTitle { get; set; }
    public string? BookAuthor { get; set; }
    public string? Chapter { get; set; }

    public List<QuizOptionDto>? QuizOptions { get; set; }

    public string? CodeSnippet { get; set; }
    public string? CodeLanguage { get; set; }

    public string Language { get; set; } = "en";
    public DateTime CreatedAt { get; set; }
    public List<string> Tags { get; set; } = new();
    public bool IsSaved { get; set; }
}
