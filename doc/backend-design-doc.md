# Backend Design Doc: ReadPulse API (C# / ASP.NET Core)

## 1. What This Is

This is the backend Web API for **ReadPulse** — serving paginated micro-learning cards extracted from books to the frontend infinite feed.

This doc covers:
- SQLite database storing book cards (`Insight`, `Quiz`, `ActionCode`)
- Pre-seeded library from software engineering classics (*Clean Code*, *Pragmatic Programmer*, *Designing Data-Intensive Applications*, *Refactoring*)
- `GET /api/posts` endpoint with pagination, category filtering, and card type filtering
- `POST /api/posts/{id}/like` endpoint for user engagement

**Deferred / Future Extensions** (Documented upgrade path):
- On-demand LLM parsing pipeline via Semantic Kernel / OpenAI API
- PostgreSQL + `pgvector` for semantic concept search
- Firebase / Google Auth JWT validation middleware
- Card rating & LLM regeneration feedback endpoints

---

## 2. Tech Stack & Tools

| Tool / Package | Role & Purpose |
|---|---|
| **.NET 10 SDK** | Modern cross-platform LTS runtime for ASP.NET Core Web API. |
| **ASP.NET Core Controllers** | Structured routing (`Controllers/`, `Models/`, `Data/`, `Dtos/`). |
| **EF Core + SQLite Provider** | Single-file embedded DB (`readpulse.db`) with `EnsureCreated()` for rapid MVP prototyping. |
| **Swashbuckle (Swagger)** | OpenAPI explorer for testing API endpoints at `/swagger`. |
| **System.Text.Json** | Serializes typed quiz option schemas into JSON storage columns. |
| **CORS Middleware** | Enables local cross-origin requests from `http://localhost:5173`. |

---

## 3. High-Level Architecture & Pipeline

```
Program.cs
  ├─ Registers AppDbContext (EF Core + SQLite)
  ├─ Registers CORS Policy ("AllowFrontend")
  ├─ Registers Controllers & Swagger
  ├─ On startup: EnsureCreated() + SeedData.EnsureSeeded()
  └─ Maps controllers

Controllers/PostsController.cs
  ├─ GET /api/posts?page=&pageSize=&category=&type=
  │    -> Queries AppDbContext.Posts with Skip/Take and Optional Filters
  │    -> Returns PagedResult<PostDto>
  │
  └─ POST /api/posts/{id}/like
       -> Increments card like counter in DB

Data/SeedData.cs
  └─ Populates 50+ rich book bytes (insights, quizzes, code exercises)
```

---

## 4. Data Model & DTOs

### Database Entity (`Models/Post.cs`)

```csharp
namespace ReadPulseApi.Models;

public class Post
{
    public int Id { get; set; }
    public string Type { get; set; } = "insight"; // "insight", "quiz", "action_code"
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;

    // Book origin metadata
    public string? BookTitle { get; set; }
    public string? BookAuthor { get; set; }
    public string? Chapter { get; set; }

    // Quiz options stored as JSON string in SQLite
    public string? QuizOptionsJson { get; set; }

    // Code exercise fields
    public string? CodeSnippet { get; set; }
    public string? CodeLanguage { get; set; }

    public int LikesCount { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```

### DTO Contract (`Dtos/PostDto.cs`)

```csharp
namespace ReadPulseApi.Dtos;

public class QuizOptionDto
{
    public string Id { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public bool IsCorrect { get; set; }
    public string? Explanation { get; set; }
}

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

    public int LikesCount { get; set; }
    public DateTime CreatedAt { get; set; }
}
```

---

## 5. Folder Structure

```
backend/
├── ReadPulseApi.csproj
├── Program.cs
├── Controllers/
│   └── PostsController.cs
├── Models/
│   └── Post.cs
├── Data/
│   ├── AppDbContext.cs
│   └── SeedData.cs
└── Dtos/
    ├── PostDto.cs
    ├── QuizOptionDto.cs
    └── PagedResult.cs
```

---

## 6. Implementation Steps

1. **Confirm .NET 10 SDK & Scaffold Project:** `dotnet new webapi -n ReadPulseApi`.
2. **Install Packages:** `Microsoft.EntityFrameworkCore.Sqlite`, `Microsoft.EntityFrameworkCore.Design`.
3. **Data Model & DbContext Setup:** Configure SQLite connection string `Data Source=readpulse.db`.
4. **Rich Seed Data:** Populate cards with authentic book insights, quizzes, and code exercises.
5. **Controller Implementation:** Build `GET /api/posts` with filtering and pagination, plus `POST /api/posts/{id}/like`.
6. **Program Wiring:** Configure Swagger, CORS, DbContext, and seed execution.

---

## 7. Manual Testing Checklist

- [ ] API starts with `dotnet run` on `http://localhost:5000`.
- [ ] `readpulse.db` is auto-created with seeded book bytes.
- [ ] Swagger `/swagger` displays `/api/posts` and returns valid `PostDto` JSON with quiz options and code snippets.
- [ ] Filtering by `category` or `type` returns only matching items.
- [ ] `POST /api/posts/{id}/like` successfully increments `likesCount`.
