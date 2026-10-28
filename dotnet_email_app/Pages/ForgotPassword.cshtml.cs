using System.ComponentModel.DataAnnotations;
using System.Text;
using EmailApp.Models;
using EmailApp.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.WebUtilities;

namespace EmailApp.Pages;

public class ForgotPasswordModel : PageModel
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IEmailSender _emailSender;

    public ForgotPasswordModel(UserManager<ApplicationUser> userManager, IEmailSender emailSender)
    {
        _userManager = userManager;
        _emailSender = emailSender;
    }

    [BindProperty]
    public InputModel Input { get; set; } = new();

    public class InputModel
    {
        [Required]
        [EmailAddress]
        [Display(Name = "Email")]
        public string Email { get; set; } = string.Empty;
    }

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostAsync()
    {
        if (!ModelState.IsValid)
        {
            return Page();
        }

        var user = await _userManager.FindByEmailAsync(Input.Email);

        if (user != null)
        {
            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));

            var resetUrl = Url.Page(
                "/ResetPassword",
                pageHandler: null,
                values: new { code = encodedToken, email = user.Email },
                protocol: Request.Scheme,
                host: Request.Host.ToString());

            var body =
                $"Hi {user.DisplayName},\n\n" +
                "We received a request to reset your password.\n" +
                "Click the link below to choose a new password:\n\n" +
                $"{resetUrl}\n\n" +
                "If you did not request this, you can safely ignore this email.";

            try
            {
                await _emailSender.SendEmailAsync(user.Email!, "Password Reset Request", body);
            }
            catch
            {
                // Swallow send errors here too — we always show the same
                // generic message below regardless of outcome, so we don't
                // leak whether the email exists or whether sending failed.
            }
        }

        // Always show the same message, whether or not the email exists,
        // so we don't leak which emails are registered.
        TempData["StatusMessage"] = "If an account with that email exists, a reset link has been sent.";
        return RedirectToPage("/Login");
    }
}
