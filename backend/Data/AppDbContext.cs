using Microsoft.EntityFrameworkCore;
using backend.Models;

namespace backend.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Post> Posts => Set<Post>();
    public DbSet<Book> Books => Set<Book>();
    public DbSet<Chapter> Chapters => Set<Chapter>();
    public DbSet<QuizPath> QuizPaths => Set<QuizPath>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<SavedPost> SavedPosts => Set<SavedPost>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Book>().HasIndex(b => b.FilePath);
        modelBuilder.Entity<Chapter>().HasIndex(c => new { c.BookId, c.ChapterOrder });
        modelBuilder.Entity<QuizPath>().HasIndex(q => new { q.ChapterId, q.OrderIndex });
        modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<User>().HasIndex(u => u.GoogleId);
        modelBuilder.Entity<Session>().HasIndex(s => s.Token).IsUnique();
        modelBuilder.Entity<SavedPost>().HasKey(sp => new { sp.UserId, sp.PostId });
    }
}
