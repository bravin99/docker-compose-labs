// State management
let currentUser = null;
let allUsers = [];

// DOM Elements
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const userListBody = document.getElementById('user-list-body');
const userCardsGrid = document.getElementById('user-cards-grid');
const noUsersView = document.getElementById('no-users-view');
const currentUserLabel = document.getElementById('current-user-name');
const userAvatarLabel = document.getElementById('user-avatar');
const searchInput = document.getElementById('user-search');

// Forms & Tabs
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const resetForm = document.getElementById('reset-form');
const emailTestForm = document.getElementById('email-test-form');

const tabs = {
  login: { tab: document.getElementById('tab-login'), form: loginForm },
  register: { tab: document.getElementById('tab-register'), form: registerForm },
  reset: { tab: document.getElementById('tab-reset'), form: resetForm }
};

// Initial setup on window load
window.addEventListener('load', () => {
  checkAuthStatus();
  
  // Attach event submit handlers
  loginForm.addEventListener('submit', handleLoginSubmit);
  registerForm.addEventListener('submit', handleRegisterSubmit);
  resetForm.addEventListener('submit', handleResetPasswordSubmit);
  emailTestForm.addEventListener('submit', handleEmailTestSubmit);
});

// Toast System
function showToast(title, message, type = 'success') {
  const container = document.getElementById('toast-container');
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
  
  toast.innerHTML = `
    <i class="fa-solid ${icon} toast-icon"></i>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
  `;
  
  container.appendChild(toast);
  
  // Close handler
  toast.querySelector('.toast-close').addEventListener('click', () => {
    dismissToast(toast);
  });
  
  // Auto dismiss
  setTimeout(() => {
    dismissToast(toast);
  }, 4000);
}

function dismissToast(toast) {
  if (toast.parentNode) {
    toast.classList.add('toast-exit');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }
}

// Switch between Login / Register / Reset Tabs
function switchTab(activeKey) {
  Object.keys(tabs).forEach(key => {
    if (key === activeKey) {
      tabs[key].tab.classList.add('active');
      tabs[key].form.classList.add('active');
    } else {
      tabs[key].tab.classList.remove('active');
      tabs[key].form.classList.remove('active');
    }
  });
}

// Toggle password text visibility
function togglePasswordVisibility(fieldId) {
  const input = document.getElementById(fieldId);
  const button = input.nextElementSibling;
  
  if (input.type === 'password') {
    input.type = 'text';
    button.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
  } else {
    input.type = 'password';
    button.innerHTML = '<i class="fa-regular fa-eye"></i>';
  }
}

// Check session authentication status
async function checkAuthStatus() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      currentUser = await res.json();
      showDashboard(true);
    } else {
      showDashboard(false);
    }
  } catch (error) {
    console.error('Auth verification check failed:', error);
    showDashboard(false);
  }
}

// Toggle dashboard and auth panel layout
function showDashboard(isActive) {
  if (isActive) {
    authSection.classList.remove('active');
    dashboardSection.classList.add('active');
    
    // Set UI greetings
    currentUserLabel.textContent = currentUser.username;
    const initial = currentUser.username.charAt(0).toUpperCase();
    userAvatarLabel.textContent = initial;
    userAvatarLabel.style.backgroundColor = getAvatarColor(currentUser.username);
    
    loadUsers();
  } else {
    currentUser = null;
    dashboardSection.classList.remove('active');
    authSection.classList.add('active');
    switchTab('login');
    // Clear passwords
    loginForm.reset();
    registerForm.reset();
    resetForm.reset();
  }
}

// Submit Handlers
async function handleLoginSubmit(e) {
  e.preventDefault();
  const formData = new FormData(loginForm);
  const data = Object.fromEntries(formData);
  
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    
    if (res.ok) {
      currentUser = result.user;
      showToast('Welcome Back!', 'Login successful. Access matches authorized.', 'success');
      showDashboard(true);
    } else {
      showToast('Access Denied', result.error || 'Invalid credentials.', 'error');
    }
  } catch (err) {
    showToast('Network Error', 'Failed to communicate with portal.', 'error');
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const formData = new FormData(registerForm);
  const data = Object.fromEntries(formData);
  
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    
    if (res.ok) {
      currentUser = result.user;
      showToast('Registration Successful', `Account created: Welcome ${currentUser.username}!`, 'success');
      showDashboard(true);
    } else {
      showToast('Registration Failed', result.error || 'Please correct inputs.', 'error');
    }
  } catch (err) {
    showToast('Network Error', 'Failed to register account.', 'error');
  }
}

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  const formData = new FormData(resetForm);
  const data = Object.fromEntries(formData);
  
  try {
    const res = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    
    if (res.ok) {
      showToast('Password Reset', result.message, 'success');
      // Go back to login tab after reset
      switchTab('login');
    } else {
      showToast('Reset Failed', result.error || 'Verification failed.', 'error');
    }
  } catch (err) {
    showToast('Network Error', 'Failed to reset password.', 'error');
  }
}

// Log out process
async function handleLogout() {
  try {
    const res = await fetch('/api/logout', { method: 'POST' });
    if (res.ok) {
      showToast('Logged Out', 'Successfully disconnected from session.', 'success');
      showDashboard(false);
    } else {
      showToast('Logout Failed', 'Attempt to destroy session failed.', 'error');
    }
  } catch (err) {
    showToast('Network Error', 'Failed to communicate logout request.', 'error');
  }
}

// Fetch users directory list from API
async function loadUsers() {
  try {
    const res = await fetch('/api/users');
    if (!res.ok) {
      if (res.status === 401) {
        showDashboard(false);
      }
      return;
    }
    
    const data = await res.json();
    allUsers = data.users || [];
    renderUsers(allUsers);
  } catch (err) {
    showToast('Error', 'Failed to fetch registered directory list.', 'error');
  }
}

// Render dynamic tables and cards depending query
function renderUsers(users) {
  userListBody.innerHTML = '';
  userCardsGrid.innerHTML = '';
  
  if (users.length === 0) {
    noUsersView.classList.remove('hidden');
    return;
  }
  
  noUsersView.classList.add('hidden');
  
  users.forEach(user => {
    const initial = user.username.charAt(0).toUpperCase();
    const color = getAvatarColor(user.username);
    const dateFormatted = formatDate(user.createdAt);
    
    // Add check to highlight current user
    const isSelf = currentUser && user.username.toLowerCase() === currentUser.username.toLowerCase();
    const selfTag = isSelf ? ' <span class="badge" style="font-size: 8px; padding: 1px 4px; vertical-align: middle;">You</span>' : '';
    
    // Table Row template
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="user-identity">
          <span class="user-avatar" style="background-color: ${color};">${initial}</span>
          <span class="user-name-text">${escapeHTML(user.username)}${selfTag}</span>
        </div>
      </td>
      <td><a href="mailto:${escapeHTML(user.email)}" class="email-link">${escapeHTML(user.email)}</a></td>
      <td class="date-text">${dateFormatted}</td>
    `;
    userListBody.appendChild(row);
    
    // Mobile Card template
    const card = document.createElement('div');
    card.className = 'user-card';
    card.innerHTML = `
      <div class="user-card-left">
        <span class="user-avatar" style="background-color: ${color}; width: 38px; height: 38px; font-size: 15px;">${initial}</span>
        <div class="user-card-info">
          <span class="name">${escapeHTML(user.username)}${selfTag}</span>
          <span class="email">${escapeHTML(user.email)}</span>
        </div>
      </div>
      <div class="user-card-right">
        <div>Registered</div>
        <div class="date-text" style="font-size: 11px;">${dateFormatted}</div>
      </div>
    `;
    userCardsGrid.appendChild(card);
  });
}

// Client filtering search list
function filterUsers() {
  const query = searchInput.value.toLowerCase().trim();
  if (!query) {
    renderUsers(allUsers);
    return;
  }
  
  const filtered = allUsers.filter(user => 
    user.username.toLowerCase().includes(query) || 
    user.email.toLowerCase().includes(query)
  );
  
  renderUsers(filtered);
}

// Deterministic rich colors for avatars
function getAvatarColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Custom curated HSL values (saturation 65-75%, lightness 45-55%) for premium look
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 50%)`;
}

// Simple Date formatter
function formatDate(dateString) {
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return dateString;
  }
}

// Escape HTML helpers to prevent script injections
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function handleEmailTestSubmit(e) {
  e.preventDefault();
  
  const toInput = document.getElementById('test-email-to');
  const to = toInput.value.trim();
  const submitBtn = emailTestForm.querySelector('button[type="submit"]');
  const originalBtnHTML = submitBtn.innerHTML;

  if (!to) return;

  // Visual loading state
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>Tuning connection...</span><i class="fa-solid fa-circle-notch fa-spin"></i>';

  try {
    const res = await fetch('/api/send-test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to })
    });

    const result = await res.json();

    if (res.ok) {
      showToast('Dispatched', result.message || 'SMTP transmission successful!', 'success');
      emailTestForm.reset();
    } else {
      showToast('Transmission Error', result.error || 'SMTP dispatch failed.', 'error');
    }
  } catch (err) {
    showToast('Network Error', 'Could not establish connection to the noded portal backend API.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnHTML;
  }
}

