using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace EmailApp.Services;

/// <summary>
/// Sends mail via SMTP using MailKit. System.Net.Mail.SmtpClient (the
/// built-in .NET client) has a long-standing history of unreliable
/// STARTTLS/AUTH sequencing, especially in Linux containers — some SMTP
/// servers will accept the connection but silently treat it as
/// unauthenticated if the handshake isn't done exactly right, and then
/// reject the send with something like "Client host rejected: Access
/// denied" instead of a clear auth error. MailKit handles this correctly.
/// </summary>
public class SmtpEmailSender : IEmailSender
{
    private readonly SmtpSettings _settings;

    public SmtpEmailSender(IOptions<SmtpSettings> options)
    {
        _settings = options.Value;
    }

    public async Task SendEmailAsync(string toEmail, string subject, string message)
    {
        var email = new MimeMessage();
        email.From.Add(new MailboxAddress(_settings.FromName, _settings.FromAddress));
        email.To.Add(MailboxAddress.Parse(toEmail));
        email.Subject = subject;
        email.Body = new TextPart("plain") { Text = message };

        using var client = new SmtpClient();

        // Port 465 = implicit TLS (SslOnConnect). Port 587 (and most others)
        // = STARTTLS, upgrading a plaintext connection. StartTlsWhenAvailable
        // covers both correctly if EnableSsl is true; if false, connect
        // without any TLS at all (only appropriate for local/trusted networks).
        var socketOptions = !_settings.EnableSsl
            ? SecureSocketOptions.None
            : _settings.Port == 465
                ? SecureSocketOptions.SslOnConnect
                : SecureSocketOptions.StartTls;

        await client.ConnectAsync(_settings.Host, _settings.Port, socketOptions);

        if (!string.IsNullOrEmpty(_settings.Username))
        {
            await client.AuthenticateAsync(_settings.Username, _settings.Password);
        }

        await client.SendAsync(email);
        await client.DisconnectAsync(true);
    }
}
