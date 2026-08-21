# ReadPulse

Bilingual (EN/RU) micro-learning infinite-scroll feed of LLM-parsed book content: insights, quizzes, and code snippets from software-engineering books.

Upload a PDF/TXT/MD book, let the LLM extract key learning points into bite-sized cards, and scroll through them in a clean, distraction-free feed.

## Features

- **Book upload** — PDF (with outline/chapter tree), plain TXT, or Markdown
- **AI card generation** — extracts 1-3 cards per text chunk: insights, quizzes (4 options), and code snippets
- **Bilingual** — English and Russian UI + card content; built-in EN/RU LLM prompts
- **Infinite scroll feed** — filter by category, type, search; group by book
- **Per-user settings** — bring your own Chutes API key, custom LLM prompt override, model chooser (live from Chutes `/v1/models`), language, page size
- **Auth** — email/password (BCrypt) + Google OAuth (OIDC id_token verification); cookie-based sessions (HttpOnly, 30-day sliding)
- **Admin panel** — user management, stats dashboard
- **Search** — Ctrl+K palette with debounced full-text search across titles, content, categories, and tags
- **Tags & bookmarks** — tag cards, filter by tag; save/unsave cards
- **Edit cards** — inline edit mode on any card you own (or admin)
- **URL upload** — download a PDF from a URL directly into the pipeline

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | .NET 10, C# 14, EF Core 10 (SQLite), Swashbuckle |
| Frontend | React 19, Vite 8, Tailwind CSS v4, TanStack Query |
| Auth | Cookie auth + Google OAuth (OIDC), BCrypt password hashing |
| LLM | Chutes.ai (`llm.chutes.ai/v1/chat/completions`), OpenAI-compatible |
| PDF parsing | PdfPig (UglyToad) |

## Project Structure

```
backend/          .NET 10 Web API
  Controllers/     Auth, Users, Admin, Posts, Books, Models
  Models/          Post, User, Book, Chapter, QuizPath, SavedPost
  Services/        CardGeneratorService (LLM), BookSlicerService (PdfPig)
  Data/            AppDbContext, SeedData
frontend/         React 19 + Vite 8
  src/
    api/          posts, books, auth, models
    components/    PostCard
    i18n/         LanguageContext (EN/RU)
```

## Quick Start (Development)

See [RUNBOOK.md](RUNBOOK.md) for full VPS deployment instructions.

### Prerequisites

- .NET 10 SDK
- Node.js 20+
- A [Chutes.ai](https://chutes.ai) API key
- (Optional) Google OAuth Client ID

### Backend

```bash
cd backend
cp appsettings.Template.json appsettings.Development.json
# Edit appsettings.Development.json: add your CHUTES_API_KEY and Google ClientId
dotnet restore
dotnet build
dotnet run    # http://localhost:5159
```

### Frontend

```bash
cd frontend
cp .env.example .env
# Edit .env: set VITE_API_BASE_URL and VITE_GOOGLE_CLIENT_ID
npm install
npm run dev   # http://localhost:5173
```

The first registered user automatically becomes admin.

## Configuration

### Backend (`appsettings.Development.json` / `appsettings.Production.json`)

| Key | Description |
|---|---|
| `CHUTES_API_KEY` | Chutes.ai API key (required for AI card generation) |
| `Chutes:Model` | Default LLM model (e.g. `moonshotai/Kimi-K2.6-TEE`) |
| `Google:ClientId` | Google OAuth Client ID (for Google Sign-In) |

### Frontend (`.env`)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend URL (e.g. `http://localhost:5159`) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID (must match backend) |

## License

MIT
