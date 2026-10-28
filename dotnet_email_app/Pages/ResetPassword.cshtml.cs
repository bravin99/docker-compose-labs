using System.ComponentModel.DataAnnotations;
using System.Text;
using EmailApp.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.WebUtilities;

namespace EmailApp.Pages;

public class ResetPasswordModel : PageModel
{
    private readonly UserManager<ApplicationUser> _userManager;

    public ResetPasswordModel(UserManager<ApplicationUser> userManager)
    {
        _userManager = userManager;
    }

    [BindProperty]
    public InputModel Input { get; set; } = new();

    public class InputModel
    {
        [Required]
        public string Code { get; set; } = string.Empty;

        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        [Required]
        [StringLength(100, MinimumLength = 8)]
        [DataType(DataType.Password)]
        [Display(Name = "Password")]
        public string Password { get; set; } = string.Empty;

        [DataType(DataType.Password)]
        [Display(Name = "Confirm Password")]
        [Compare("Password", ErrorMessage = "Passwords do not match.")]
        public string ConfirmPassword { get; set; } = string.Empty;
    }

    public IActionResult OnGet(string? code = null, string? email = null)
    {
        if (code == null || email == null)
        {
            TempData["ErrorMessage"] = "That reset link is invalid.";
            return RedirectToPage("/ForgotPassword");
        }

        // The code arrives URL-safe-base64-encoded (see ForgotPassword.cshtml.cs);
        // decode it back to the raw token Identity expects.
        try
        {
            Input.Code = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(code));
        }
        catch (FormatException)
        {
            TempData["ErrorMessage"] = "That reset link is invalid.";
            return RedirectToPage("/ForgotPassword");
        }

        Input.Email = email;

        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
    {
        if (!ModelState.IsValid)
        {
            return Page();
        }

        var user = await _userManager.FindByEmailAsync(Input.Email);
        if (user == null)
        {
            // Don't reveal that the user does not exist.
            TempData["StatusMessage"] = "Your password has been updated. Please log in.";
            return RedirectToPage("/Login");
        }

        var result = await _userManager.ResetPasswordAsync(user, Input.Code, Input.Password);

        if (result.Succeeded)
        {
            TempData["StatusMessage"] = "Your password has been updated. Please log in.";
            return RedirectToPage("/Login");
        }

        foreach (var error in result.Errors)
        {
            ModelState.AddModelError(string.Empty, error.Description);
        }

        return Page();
    }
}
