using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace EmailApp.Pages;

public class IndexModel : PageModel
{
    public IActionResult OnGet()
    {
        return User.Identity?.IsAuthenticated == true
            ? RedirectToPage("/Dashboard")
            : RedirectToPage("/Login");
    }
}
