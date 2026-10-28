using EmailApp.Data;
using EmailApp.Models;
using EmailApp.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace EmailApp.Pages;

[Authorize]
public class DashboardModel : PageModel
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IEmailSender _emailSender;

    public DashboardModel(ApplicationDbContext db, UserManager<ApplicationUser> userManager, IEmailSender emailSender)
    {
        _db = db;
        _userManager = userManager;
        _emailSender = emailSender;
    }

    public List<ApplicationUser> Users { get; set; } = new();

    public string CurrentUserId { get; set; } = string.Empty;
    public string CurrentUserName { get; set; } = string.Empty;
    public string CurrentUserEmail { get; set; } = string.Empty;

    public async Task OnGetAsync()
    {
        await LoadAsync();
    }

    public async Task<IActionResult> OnPostSendTestEmailAsync()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null)
        {
            return RedirectToPage("/Login");
        }

        try
        {
            var body =
                $"Hi {user.DisplayName},\n\n" +
                "This is a test email sent from your ASP.NET Core app to confirm that " +
                "your SMTP configuration is working correctly.\n\n" +
                $"Sent at: {DateTime.UtcNow:O}";

            await _emailSender.SendEmailAsync(user.Email!, "Test Email", body);
            TempData["StatusMessage"] = $"Test email sent to {user.Email}.";
        }
        catch (Exception e)
        {
            TempData["ErrorMessage"] = $"Failed to send test email: {e.Message}";
        }

        return RedirectToPage();
    }

    private async Task LoadAsync()
    {
        var user = await _userManager.GetUserAsync(User);
        CurrentUserId = user?.Id ?? string.Empty;
        CurrentUserName = user?.DisplayName ?? string.Empty;
        CurrentUserEmail = user?.Email ?? string.Empty;

        Users = await _db.Users.OrderBy(u => u.CreatedAt).ToListAsync();
    }
}
