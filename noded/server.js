const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const nodemailer = require('nodemailer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware configuration
app.use(session({
  secret: 'noded-super-secret-key-13579',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if running on HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Route protection middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
}

// Serve static assets from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// --- API ROUTES ---

// 1. Get current logged in user details
app.get('/api/me', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ id: req.session.userId, username: req.session.username });
  } else {
    res.status(401).json({ error: 'Not logged in' });
  }
});

// 2. User registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Verify email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    // Check if username already exists
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Check if email already exists
    const existingEmail = await db.getUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await db.createUser({
      username,
      email,
      password: passwordHash
    });

    // Session log in
    req.session.userId = newUser.id;
    req.session.username = newUser.username;

    res.status(201).json({ message: 'Registration successful', user: newUser });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// 3. User login (supports username or email)
app.post('/api/login', async (req, res) => {
  try {
    const { loginIdentifier, password } = req.body;

    if (!loginIdentifier || !password) {
      return res.status(400).json({ error: 'Username/email and password are required' });
    }

    // Find user (by username or email)
    let user = await db.getUserByUsername(loginIdentifier);
    if (!user) {
      user = await db.getUserByEmail(loginIdentifier);
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Compare passwords
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Session log in
    req.session.userId = user.id;
    req.session.username = user.username;

    // Send back safe user info
    const { password: _, ...userWithoutPassword } = user;
    res.json({ message: 'Login successful', user: userWithoutPassword });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// 4. Password Reset
// Resets password by verifying username and matched email
app.post('/api/reset-password', async (req, res) => {
  try {
    const { username, email, newPassword } = req.body;

    if (!username || !email || !newPassword) {
      return res.status(400).json({ error: 'Username, email, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Verify user exists and email matches
    const user = await db.getUserByUsername(username);
    if (!user || user.email.toLowerCase() !== email.toLowerCase().trim()) {
      return res.status(400).json({ error: 'Invalid username and email combination' });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update DB
    const success = await db.updateUserPassword(username, passwordHash);
    if (!success) {
      return res.status(500).json({ error: 'Failed to update password' });
    }

    res.json({ message: 'Password has been reset successfully. You can now login.' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Internal server error during password reset' });
  }
});

// 5. User logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Failed to log out' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

// 6. Get registered users list (authenticated route)
app.get('/api/users', requireAuth, async (req, res) => {
  try {
    const users = await db.getUsers();
    res.json({ users });
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Internal server error fetching users' });
  }
});

// 7. Send test email (authenticated route)
app.post('/api/send-test-email', requireAuth, async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ error: 'Recipient email address (to) is required' });
    }

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE } = process.env;

    if (!SMTP_HOST || !SMTP_PORT) {
      return res.status(400).json({
        error: 'SMTP configuration is incomplete. Please ensure SMTP_HOST and SMTP_PORT are set.'
      });
    }

    // Configure transporter
    const transporterConfig = {
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
      secure: SMTP_SECURE === 'true',
      auth: (SMTP_USER && SMTP_PASS) ? {
        user: SMTP_USER,
        pass: SMTP_PASS
      } : undefined
    };

    const transporter = nodemailer.createTransport(transporterConfig);

    const fromAddress = SMTP_FROM || `noded Portal <noreply@noded.local>`;

    const mailOptions = {
      from: fromAddress,
      to: to,
      subject: 'noded Test Communication Connection',
      text: `Hello,\n\nThis is an automated test email sent from the noded system by user: "${req.session.username}".\n\nSMTP Connection Status: Active & Operational.\n\nSent at: ${new Date().toISOString()}\n\nCrypto ID: ${Math.random().toString(36).substring(7).toUpperCase()}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #8b5cf6;">noded Security Portal</h2>
          <p>This is a verification test email transmitted securely from your containerized environment.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-weight: bold;" width="40%">Triggered By:</td>
              <td style="padding: 6px 0; color: #111827;">${req.session.username}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-weight: bold;">SMTP Server:</td>
              <td style="padding: 6px 0; color: #111827;">${SMTP_HOST}:${SMTP_PORT}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-weight: bold;">Transport Secure:</td>
              <td style="padding: 6px 0; color: #111827;">${SMTP_SECURE === 'true' ? 'Yes (SSL/TLS)' : 'No (STARTTLS/Plain)'}</td>
            </tr>
          </table>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">This message is automated. Do not reply directly.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: `Test email successfully dispatched to ${to}!` });
  } catch (error) {
    console.error('SMTP send error:', error);
    res.status(500).json({ error: `Failed to send email: ${error.message}` });
  }
});

// Handle wildcard routing for frontend SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
