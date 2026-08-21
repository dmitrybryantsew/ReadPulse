using System.ComponentModel.DataAnnotations.Schema;

namespace backend.Models;

public class Book
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Author { get; set; }
    public string? FilePath { get; set; }
    public string? FileHash { get; set; }
    public int TotalPages { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    public int? OwnerUserId { get; set; }

    public List<Chapter> Chapters { get; set; } = new();
    public List<QuizPath> QuizPaths { get; set; } = new();
}

public class Chapter
{
    public int Id { get; set; }
    public int BookId { get; set; }
    public string Title { get; set; } = string.Empty;
    public int PageStart { get; set; }
    public int PageEnd { get; set; }
    public int ChapterOrder { get; set; }

    public Book? Book { get; set; }
}

public class QuizPath
{
    public int Id { get; set; }
    public int ChapterId { get; set; }
    public int PostId { get; set; }
    public int OrderIndex { get; set; }
    public string Difficulty { get; set; } = "easy"; // easy | medium | hard

    public Chapter? Chapter { get; set; }

    [ForeignKey(nameof(PostId))]
    public Post? Post { get; set; }
}
