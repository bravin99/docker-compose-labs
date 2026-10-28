from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.shortcuts import render, redirect
from django.utils import timezone
from django.views.decorators.http import require_POST

from .forms import RegisterForm


def index(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
    return redirect('login')


def register(request):
    if request.user.is_authenticated:
        return redirect('dashboard')

    if request.method == 'POST':
        form = RegisterForm(request.POST)
        if form.is_valid():
            user = form.save()
            messages.success(request, 'Account created successfully. Please log in.')
            return redirect('login')
    else:
        form = RegisterForm()

    return render(request, 'registration/register.html', {'form': form})


@login_required
def dashboard(request):
    users = User.objects.order_by('date_joined')
    return render(request, 'dashboard.html', {'users': users})


@login_required
@require_POST
def send_test_email(request):
    try:
        send_mail(
            subject='Test Email',
            message=(
                f"Hi {request.user.username},\n\n"
                "This is a test email sent from your Django app to confirm "
                "that your SMTP configuration is working correctly.\n\n"
                f"Sent at: {timezone.now().isoformat()}"
            ),
            from_email=None,  # uses DEFAULT_FROM_EMAIL
            recipient_list=[request.user.email],
            fail_silently=False,
        )
        messages.success(request, f'Test email sent to {request.user.email}.')
    except Exception as exc:
        messages.error(request, f'Failed to send test email: {exc}')

    return redirect('dashboard')
