using System.Text.Json;
using backend.Models;

namespace backend.Data;

public static class SeedData
{
    public static void EnsureSeeded(AppDbContext db)
    {
        if (db.Posts.Any()) return;

        var posts = new List<Post>();

        // ===== Clean Code — Robert C. Martin =====
        posts.Add(new Post
        {
            Type = "insight",
            Title = "Meaningful Names",
            Content = "The name of a variable, function, or class should answer all the big questions. It should tell you why it exists, what it does, and how it is used. If a name requires a comment, then the name does not reveal its intent.",
            Category = "clean-code",
            BookTitle = "Clean Code",
            BookAuthor = "Robert C. Martin",
            Chapter = "Ch. 2: Meaningful Names",
            Language = "en",
            CreatedAt = DateTime.UtcNow.AddMinutes(-1)
        });

        posts.Add(new Post
        {
            Type = "quiz",
            Title = "The Boolean Argument Trap",
            Content = "What is the main drawback of passing a boolean flag into a function?",
            Category = "clean-code",
            BookTitle = "Clean Code",
            BookAuthor = "Robert C. Martin",
            Chapter = "Ch. 3: Functions",
            Language = "en",
            QuizOptionsJson = JsonSerializer.Serialize(new[]
            {
                new { id = "a", text = "It hurts performance", isCorrect = false, explanation = "Performance is not the main concern here." },
                new { id = "b", text = "It signals the function does more than one thing", isCorrect = true, explanation = "Correct! A flag means the function has two behaviors. Split it into two functions." },
                new { id = "c", text = "Booleans are deprecated in modern languages", isCorrect = false, explanation = "No, the issue is design, not syntax." }
            }),
            CreatedAt = DateTime.UtcNow.AddMinutes(-2)
        });

        posts.Add(new Post
        {
            Type = "action_code",
            Title = "Replace Magic Numbers with Named Constants",
            Content = "Magic numbers hide intent. Extract them into named constants so the code reads like prose and changes happen in one place.",
            Category = "clean-code",
            BookTitle = "Clean Code",
            BookAuthor = "Robert C. Martin",
            Chapter = "Ch. 17: Smells and Heuristics",
            Language = "en",
            CodeLanguage = "typescript",
            CodeSnippet = "const WORK_DAYS_PER_WEEK = 5;\nconst HOURS_PER_DAY = 8;\n\nconst totalHours = WORK_DAYS_PER_WEEK * HOURS_PER_DAY;",
            CreatedAt = DateTime.UtcNow.AddMinutes(-3)
        });

        posts.Add(new Post
        {
            Type = "insight",
            Title = "Small Functions, Single Responsibility",
            Content = "Functions should do one thing, do it well, and do it only. A function that does one thing cannot be reasonably divided into sections, each of which does something different.",
            Category = "clean-code",
            BookTitle = "Clean Code",
            BookAuthor = "Robert C. Martin",
            Chapter = "Ch. 3: Functions",
            Language = "en",
            CreatedAt = DateTime.UtcNow.AddMinutes(-4)
        });

        posts.Add(new Post
        {
            Type = "insight",
            Title = "Comments Are Not a Substitute for Good Code",
            Content = "Nothing can be quite so helpful as a well-placed comment. Nothing can be quite so damaging as an old, crufty comment that propagates lies and misinformation. Comments should explain why, not what.",
            Category = "clean-code",
            BookTitle = "Clean Code",
            BookAuthor = "Robert C. Martin",
            Chapter = "Ch. 4: Comments",
            Language = "en",
            CreatedAt = DateTime.UtcNow.AddMinutes(-5)
        });

        // ===== The Pragmatic Programmer — Hunt & Thomas =====
        posts.Add(new Post
        {
            Type = "insight",
            Title = "DRY — Don't Repeat Yourself",
            Content = "Every piece of knowledge must have a single, unambiguous, authoritative representation within a system. Duplication breeds inconsistency and maintenance pain.",
            Category = "pragmatic",
            BookTitle = "The Pragmatic Programmer",
            BookAuthor = "Hunt & Thomas",
            Chapter = "Ch. 2: A Pragmatic Approach",
            Language = "en",
            CreatedAt = DateTime.UtcNow.AddMinutes(-6)
        });

        posts.Add(new Post
        {
            Type = "quiz",
            Title = "Broken Window Theory",
            Content = "What does the Broken Window Theory teach us about software development?",
            Category = "pragmatic",
            BookTitle = "The Pragmatic Programmer",
            BookAuthor = "Hunt & Thomas",
            Chapter = "Ch. 1: A Pragmatic Philosophy",
            Language = "en",
            QuizOptionsJson = JsonSerializer.Serialize(new[]
            {
                new { id = "a", text = "Bugs should only be fixed at the end of the sprint", isCorrect = false, explanation = "Delaying fixes accelerates decay, the opposite of the theory." },
                new { id = "b", text = "One unfixed defect signals neglect and invites more damage", isCorrect = true, explanation = "Exactly. Fix broken windows as soon as you spot them." },
                new { id = "c", text = "You should release more often, even broken code", isCorrect = false, explanation = "That ignores the core message about quality and care." }
            }),
            CreatedAt = DateTime.UtcNow.AddMinutes(-7)
        });

        posts.Add(new Post
        {
            Type = "action_code",
            Title = "Tracer Bullets vs. Speculation",
            Content = "Build end-to-end thin slices first. Tracer code is not disposable prototype — it is production code that grows into the final system, giving early feedback on architecture and risks.",
            Category = "pragmatic",
            BookTitle = "The Pragmatic Programmer",
            BookAuthor = "Hunt & Thomas",
            Chapter = "Ch. 2: A Pragmatic Approach",
            Language = "en",
            CodeLanguage = "python",
            CodeSnippet = "def build_pipeline():\n    # Tracer: wire every layer with a no-op payload\n    fetch()\n    transform()\n    load()\n    # Once end-to-end works, flesh out each step",
            CreatedAt = DateTime.UtcNow.AddMinutes(-8)
        });

        posts.Add(new Post
        {
            Type = "insight",
            Title = "Orthogonal Design",
            Content = "Two things are orthogonal if changes in one do not affect the other. Strive for components that are self-contained, independent, and have a single, well-defined responsibility.",
            Category = "pragmatic",
            BookTitle = "The Pragmatic Programmer",
            BookAuthor = "Hunt & Thomas",
            Chapter = "Ch. 5: Bend, or Break",
            Language = "en",
            CreatedAt = DateTime.UtcNow.AddMinutes(-9)
        });

        // ===== Refactoring — Fowler =====
        posts.Add(new Post
        {
            Type = "insight",
            Title = "Code Smells Are Hints, Not Rules",
            Content = "A long method or a large class is not inherently wrong — it is a signal to look closer. Refactor when the smell obscures intent or makes change harder than it should be.",
            Category = "refactoring",
            BookTitle = "Refactoring",
            BookAuthor = "Martin Fowler",
            Chapter = "Ch. 3: Bad Smells in Code",
            Language = "en",
            CreatedAt = DateTime.UtcNow.AddMinutes(-10)
        });

        posts.Add(new Post
        {
            Type = "action_code",
            Title = "Extract Function for Clarity",
            Content = "Turn a fragment of a function into its own named function whenever the fragment explains what it does, not how. The name becomes documentation you can read at a glance.",
            Category = "refactoring",
            BookTitle = "Refactoring",
            BookAuthor = "Martin Fowler",
            Chapter = "Ch. 6: A First Set of Refactorings",
            Language = "en",
            CodeLanguage = "javascript",
            CodeSnippet = "function printInvoice(invoice) {\n  const outstanding = calculateOutstanding(invoice);\n  printDetails(invoice, outstanding);\n}",
            CreatedAt = DateTime.UtcNow.AddMinutes(-11)
        });

        // ===== Designing Data-Intensive Applications — Kleppmann =====
        posts.Add(new Post
        {
            Type = "insight",
            Title = "Indexes Trade Write Speed for Read Speed",
            Content = "Every index adds overhead on writes, because the index must be updated too. Choose indexes based on the read/write ratio of your workload and the queries you actually run.",
            Category = "system-design",
            BookTitle = "Designing Data-Intensive Applications",
            BookAuthor = "Martin Kleppmann",
            Chapter = "Ch. 3: Storage and Retrieval",
            Language = "en",
            CreatedAt = DateTime.UtcNow.AddMinutes(-12)
        });

        posts.Add(new Post
        {
            Type = "insight",
            Title = "Eventual Consistency Is a Spectrum",
            Content = "Replicas can lag by milliseconds, minutes, or more. Eventual consistency is not a binary — it is a set of guarantees about how stale a read can be and when replicas converge.",
            Category = "system-design",
            BookTitle = "Designing Data-Intensive Applications",
            BookAuthor = "Martin Kleppmann",
            Chapter = "Ch. 5: Replication",
            Language = "en",
            CreatedAt = DateTime.UtcNow.AddMinutes(-13)
        });

        posts.Add(new Post
        {
            Type = "quiz",
            Title = "CAP Theorem During a Partition",
            Content = "During a network partition, which two properties can a distributed system guarantee?",
            Category = "system-design",
            BookTitle = "Designing Data-Intensive Applications",
            BookAuthor = "Martin Kleppmann",
            Chapter = "Ch. 5: Replication",
            Language = "en",
            QuizOptionsJson = JsonSerializer.Serialize(new[]
            {
                new { id = "a", text = "Consistency and Availability", isCorrect = false, explanation = "You cannot keep both C and A during a partition." },
                new { id = "b", text = "Consistency and Partition Tolerance, or Availability and Partition Tolerance", isCorrect = true, explanation = "Right — CP systems reject some requests to stay consistent; AP systems serve stale data." },
                new { id = "c", text = "Availability and Storage Durability", isCorrect = false, explanation = "Durability is not one of the CAP letters." }
            }),
            CreatedAt = DateTime.UtcNow.AddMinutes(-14)
        });

        posts.Add(new Post
        {
            Type = "insight",
            Title = "Schema-on-Read vs. Schema-on-Write",
            Content = "Relational databases enforce a schema on write; many NoSQL stores defer it to read time. Neither is freer — the schema always exists, the question is who is responsible for it.",
            Category = "system-design",
            BookTitle = "Designing Data-Intensive Applications",
            BookAuthor = "Martin Kleppmann",
            Chapter = "Ch. 2: Data Models",
            Language = "en",
            CreatedAt = DateTime.UtcNow.AddMinutes(-15)
        });

        posts.AddRange(RussianCards());

        db.Posts.AddRange(posts);
        db.SaveChanges();
    }

    private static List<Post> RussianCards()
    {
        var posts = new List<Post>();

        posts.Add(new Post
        {
            Type = "insight",
            Title = "Говорящие имена",
            Content = "Имя переменной, функции или класса должно отвечать на главные вопросы: почему оно существует, что делает и как используется. Если для имени нужен комментарий — значит, имя не выражает намерение.",
            Category = "clean-code",
            BookTitle = "Чистый код",
            BookAuthor = "Роберт Мартин",
            Chapter = "Гл. 2: Осмысленные имена",
            Language = "ru",
            CreatedAt = DateTime.UtcNow.AddMinutes(-21)
        });

        posts.Add(new Post
        {
            Type = "quiz",
            Title = "Запах булевого аргумента",
            Content = "Каков главный недостаток передачи булевого флага в функцию?",
            Category = "clean-code",
            BookTitle = "Чистый код",
            BookAuthor = "Роберт Мартин",
            Chapter = "Гл. 3: Функции",
            Language = "ru",
            QuizOptionsJson = JsonSerializer.Serialize(new[]
            {
                new { id = "a", text = "Снижается производительность", isCorrect = false, explanation = "Производительность здесь не главная проблема." },
                new { id = "b", text = "Нарушается принцип единственной ответственности", isCorrect = true, explanation = "Верно! Флаг означает, что функция делает одно при true и другое при false. Разделите на две функции." },
                new { id = "c", text = "Булевы флаги считаются устаревшими", isCorrect = false, explanation = "Нет, проблема не в синтаксисе, а в дизайне." }
            }),
            CreatedAt = DateTime.UtcNow.AddMinutes(-22)
        });

        posts.Add(new Post
        {
            Type = "action_code",
            Title = "Заменяйте магические числа именованными константами",
            Content = "Магические числа скрывают смысл. Вынесите их в константы с говорящими именами, чтобы код читался без пояснений.",
            Category = "clean-code",
            BookTitle = "Чистый код",
            BookAuthor = "Роберт Мартин",
            Chapter = "Гл. 17: Запахи и эвристики",
            Language = "ru",
            CodeLanguage = "csharp",
            CodeSnippet = "public static class WorkDays\n{\n    public const int DaysPerWeek = 5;\n    public const int HoursPerDay = 8;\n}\n\nint totalHours = WorkDays.DaysPerWeek * WorkDays.HoursPerDay;",
            CreatedAt = DateTime.UtcNow.AddMinutes(-23)
        });

        posts.Add(new Post
        {
            Type = "insight",
            Title = "DRY — не повторяйся",
            Content = "Каждый фрагмент знания должен иметь единственное, однозначное, авторитетное представление в системе. Дублирование порождает несогласованность и боль при сопровождении.",
            Category = "pragmatic",
            BookTitle = "Программист-прагматик",
            BookAuthor = "Хант и Томас",
            Chapter = "Гл. 2: Прагматичный подход",
            Language = "ru",
            CreatedAt = DateTime.UtcNow.AddMinutes(-24)
        });

        posts.Add(new Post
        {
            Type = "quiz",
            Title = "Теория разбитых окон",
            Content = "Что означает теория разбитых окон в разработке ПО?",
            Category = "pragmatic",
            BookTitle = "Программист-прагматик",
            BookAuthor = "Хант и Томас",
            Chapter = "Гл. 1: Прагматичная философия",
            Language = "ru",
            QuizOptionsJson = JsonSerializer.Serialize(new[]
            {
                new { id = "a", text = "Баги нужно чинить только в конце спринта", isCorrect = false, explanation = "Откладывание ускоряет гниение — противоположность теории." },
                new { id = "b", text = "Одно неисправленное окно провоцирует дальнейшее пренебрежение", isCorrect = true, explanation = "Точно. Чините разбитые окна сразу, как только заметили." },
                new { id = "c", text = "Нужно выпускать код чаще, даже сломанный", isCorrect = false, explanation = "Это не про качество, а про отношение к дефектам." }
            }),
            CreatedAt = DateTime.UtcNow.AddMinutes(-25)
        });

        posts.Add(new Post
        {
            Type = "insight",
            Title = "Индексы ускоряют чтение, но замедляют запись",
            Content = "Каждый индекс в базе данных добавляет накладные расходы на запись, потому что индекс нужно обновлять. Выбирайте индексы исходя из баланса чтений и записей.",
            Category = "system-design",
            BookTitle = "Высоконагруженные приложения",
            BookAuthor = "Мартин Клеппман",
            Chapter = "Гл. 3: Хранение и извлечение данных",
            Language = "ru",
            CreatedAt = DateTime.UtcNow.AddMinutes(-26)
        });

        posts.Add(new Post
        {
            Type = "quiz",
            Title = "CAP-теорема",
            Content = "Во время сетевого разделения какие два свойства может гарантировать распределённая система?",
            Category = "system-design",
            BookTitle = "Высоконагруженные приложения",
            BookAuthor = "Мартин Клеппман",
            Chapter = "Гл. 5: Репликация",
            Language = "ru",
            QuizOptionsJson = JsonSerializer.Serialize(new[]
            {
                new { id = "a", text = "Согласованность и доступность", isCorrect = false, explanation = "При разделении сети нельзя сохранить и C, и A одновременно." },
                new { id = "b", text = "Согласованность и устойчивость к разделению", isCorrect = true, explanation = "Да — системы CP отказывают некоторым запросам ради согласованности; AP возвращают устаревшие данные." },
                new { id = "c", text = "Доступность и надёжность хранения", isCorrect = false, explanation = "Надёжность (durability) не входит в буквы CAP." }
            }),
            CreatedAt = DateTime.UtcNow.AddMinutes(-27)
        });

        posts.Add(new Post
        {
            Type = "insight",
            Title = "Рефакторинг: извлечение функции",
            Content = "Превращайте фрагмент функции в отдельную именованную функцию всякий раз, когда фрагмент объясняет, что делается, а не как. Имя становится документацией, читаемой с одного взгляда.",
            Category = "refactoring",
            BookTitle = "Рефакторинг",
            BookAuthor = "Мартин Фаулер",
            Chapter = "Гл. 6: Первый набор рефакторингов",
            Language = "ru",
            CreatedAt = DateTime.UtcNow.AddMinutes(-28)
        });

        posts.Add(new Post
        {
            Type = "action_code",
            Title = "Ортогональность компонентов",
            Content = "Две вещи ортогональны, если изменение одной не влияет на другую. Стремитесь к компонентам, которые самодостаточны, независимы и имеют единственную, чётко определённую ответственность.",
            Category = "pragmatic",
            BookTitle = "Программист-прагматик",
            BookAuthor = "Хант и Томас",
            Chapter = "Гл. 5: Гнись или сломайся",
            Language = "ru",
            CodeLanguage = "typescript",
            CodeSnippet = "// Хранилище и представление ортогональны:\n// изменение БД не должно касаться UI.\nclass Store { /* ... */ }\nclass View { constructor(private store: Store) {} }",
            CreatedAt = DateTime.UtcNow.AddMinutes(-29)
        });

        return posts;
    }
}
