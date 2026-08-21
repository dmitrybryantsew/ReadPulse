namespace backend.Models;

public class Post
{
    public int Id { get; set; }
    public string Type { get; set; } = "insight";
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;

    public string? BookTitle { get; set; }
    public string? BookAuthor { get; set; }
    public string? Chapter { get; set; }

    public string? QuizOptionsJson { get; set; }

    public string? CodeSnippet { get; set; }
    public string? CodeLanguage { get; set; }

    public string Language { get; set; } = "en"; // "en" | "ru"
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public int? OwnerUserId { get; set; }

    // Tags (comma-separated values stored in DB)
    public string? TagsCsv { get; set; }

    public List<SavedPost> SavedBy { get; set; } = new();
}

public class SavedPost
{
    public int UserId { get; set; }
    public int PostId { get; set; }
    public DateTime SavedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
    public Post? Post { get; set; }
}
