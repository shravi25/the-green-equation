const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const CryptoJS = require('crypto-js');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = 3000;
const secretKey = 'your-secret-key-here';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'green-equation-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) console.error('DB error:', err);
  else console.log('DB connected.');
  // Create tables
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, password TEXT, name TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS scans (id INTEGER PRIMARY KEY AUTOINCREMENT, beach_id TEXT, bin_id TEXT, trash_weight REAL, unique_key TEXT UNIQUE, scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP, user_id INTEGER REFERENCES users(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, discount TEXT, redeemed INTEGER DEFAULT 0, generated_at DATETIME DEFAULT CURRENT_TIMESTAMP, user_id INTEGER REFERENCES users(id))`);
});

// Middleware to check login
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

// Decrypt function
function decryptPayload(encrypted) {
  const bytes = CryptoJS.AES.decrypt(encrypted, secretKey);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
}

// Signup
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public/signup.html')));
app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword], function(err) {
      if (err) return res.send('Email already exists or error.');
      req.session.userId = this.lastID;
      res.redirect('/');
    });
  } catch (err) {
    res.send('Signup failed.');
  }
});

// Login
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user || !(await bcrypt.compare(password, user.password))) {
      return res.send('Invalid credentials.');
    }
    req.session.userId = user.id;
    res.redirect('/');
  });
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/login');
  });
});

// Home (Scanner) - requires login
app.get('/', requireLogin, (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

// Coupons page - requires login
app.get('/coupons', requireLogin, (req, res) => res.sendFile(path.join(__dirname, 'public/coupons.html')));

// Profile page - requires login
app.get('/profile', requireLogin, (req, res) => res.sendFile(path.join(__dirname, 'public/profile.html')));

// Scan QR (requires login)
app.post('/api/scan', requireLogin, (req, res) => {
  const { payload } = req.body;
  try {
    const decrypted = decryptPayload(payload);
    const { beach_id, bin_id, trash_weight, unique_key } = decrypted;
    db.get('SELECT * FROM scans WHERE unique_key = ?', [unique_key], (err, row) => {
      if (err) return res.status(500).json({ success: false, message: 'DB error.' });
      if (row) return res.json({ success: false, message: 'QR already scanned.' });
      db.run('INSERT INTO scans (beach_id, bin_id, trash_weight, unique_key, user_id) VALUES (?, ?, ?, ?, ?)',
        [beach_id, bin_id, trash_weight, unique_key, req.session.userId], function(err) {
          if (err) return res.status(500).json({ success: false, message: 'Error storing.' });
          let discount = null;
          if (trash_weight >= 5 && trash_weight < 10) discount = '10% off';
          else if (trash_weight >= 10) discount = '20% off';
          if (discount) {
            const code = 'COUPON-' + Math.random().toString(36).substr(2, 9).toUpperCase();
            db.run('INSERT INTO coupons (code, discount, user_id) VALUES (?, ?, ?)', [code, discount, req.session.userId], function(err) {
              if (err) return res.status(500).json({ success: false, message: 'Coupon error.' });
              res.json({ success: true, coupon: code, discount });
            });
          } else {
            res.json({ success: true, coupon: null });
          }
        });
    });
  } catch (err) {
    console.error('Decrypt error:', err);
    res.status(400).json({ success: false, message: 'Invalid QR code.' });
  }
});

// Redeem coupon
app.post('/api/redeem', requireLogin, (req, res) => {
  const { coupon_code } = req.body;
  db.get('SELECT * FROM coupons WHERE code = ? AND user_id = ?', [coupon_code, req.session.userId], (err, row) => {
    if (err || !row || row.redeemed) return res.json({ success: false, message: 'Invalid or redeemed.' });
    db.run('UPDATE coupons SET redeemed = 1 WHERE code = ?', [coupon_code], function(err) {
      if (err) return res.status(500).json({ success: false, message: 'Redeem error.' });
      res.json({ success: true, message: 'Redeemed!' });
    });
  });
});

// Profile data
app.get('/api/profile', requireLogin, (req, res) => {
  db.all('SELECT * FROM coupons WHERE user_id = ?', [req.session.userId], (err, coupons) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    db.get('SELECT SUM(trash_weight) as total_weight FROM scans WHERE user_id = ?', [req.session.userId], (err, scan) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      const carbonSaved = (scan?.total_weight || 0) * 2; // 2kg CO2 per kg trash
      res.json({ coupons, carbonSaved });
    });
  });
});

app.listen(PORT, () => console.log(`Server at http://localhost:${PORT}`));