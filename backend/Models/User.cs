namespace backend.Models;

public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? GoogleId { get; set; }
    public string Role { get; set; } = "user"; // user | admin
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastActiveAt { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;

    // Settings
    public string? ApiKey { get; set; }
    public string? PromptOverride { get; set; } // custom LLM system prompt — null = use default
    public string? Model { get; set; } // Chutes model override — null = use global Chutes:Model config
    public string DefaultLanguage { get; set; } = "en";
    public int PageSize { get; set; } = 10;

    // Password reset
    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetExpiresAt { get; set; }

    public List<Session> Sessions { get; set; } = new();
    public List<SavedPost> SavedPosts { get; set; } = new();
}

public class Session
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}
