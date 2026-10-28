from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),

    # Login, logout, password_reset*, password_change* — built into Django,
    # using the templates in templates/registration/
    path('accounts/', include('django.contrib.auth.urls')),

    # Register, dashboard, send-test-email
    path('', include('accounts.urls')),
]
