const fs = require('fs').promises;
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

async function readDB() {
  try {
    const data = await fs.readFile(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or is corrupted, return default structure
    return { users: [] };
  }
}

async function writeDB(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function getUsers() {
  const db = await readDB();
  // Don't return passwords
  return db.users.map(({ password, ...userWithoutPassword }) => userWithoutPassword);
}

async function getUserByUsername(username) {
  const db = await readDB();
  const lowerUsername = username.toLowerCase().trim();
  return db.users.find(u => u.username.toLowerCase() === lowerUsername);
}

async function getUserByEmail(email) {
  const db = await readDB();
  const lowerEmail = email.toLowerCase().trim();
  return db.users.find(u => u.email.toLowerCase() === lowerEmail);
}

async function createUser(user) {
  const db = await readDB();
  const newUser = {
    id: Date.now().toString(),
    username: user.username.trim(),
    email: user.email.toLowerCase().trim(),
    password: user.password,
    createdAt: new Date().toISOString()
  };
  db.users.push(newUser);
  await writeDB(db);
  const { password, ...userWithoutPassword } = newUser;
  return userWithoutPassword;
}

async function updateUserPassword(username, newPasswordHash) {
  const db = await readDB();
  const lowerUsername = username.toLowerCase().trim();
  const userIndex = db.users.findIndex(u => u.username.toLowerCase() === lowerUsername);
  
  if (userIndex === -1) {
    return false;
  }
  
  db.users[userIndex].password = newPasswordHash;
  await writeDB(db);
  return true;
}

module.exports = {
  getUsers,
  getUserByUsername,
  getUserByEmail,
  createUser,
  updateUserPassword
};
