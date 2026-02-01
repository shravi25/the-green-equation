const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const CryptoJS = require('crypto-js');
const path = require('path');

const app = express();
const PORT = 3000;
const secretKey = 'shra2006rith2012'; // Replace with a strong key; in production, use env vars

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (e.g., HTML/JS)

// Initialize SQLite database
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    // Create tables if they don't exist
    db.run(`CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      beach_id TEXT,
      bin_id TEXT,
      trash_weight REAL,
      unique_key TEXT UNIQUE,
      scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      redeemed INTEGER DEFAULT 0,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    /*db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      name TEXT
    )`);
// Update scans and coupons to link to users
    db.run(`ALTER TABLE scans ADD COLUMN user_id INTEGER REFERENCES users(id)`);
    db.run(`ALTER TABLE coupons ADD COLUMN user_id INTEGER REFERENCES users(id)`);*/
  }
});

// Decryption function
function decryptPayload(encrypted) {
  const bytes = CryptoJS.AES.decrypt(encrypted, secretKey);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
}

// API Endpoint for scanning QR code
app.post('/api/scan', (req, res) => {
  const { payload } = req.body;
  try {
    const decrypted = decryptPayload(payload);
    const { beach_id, bin_id, trash_weight, unique_key } = decrypted;

    // Check if unique_key has been scanned before
    db.get('SELECT * FROM scans WHERE unique_key = ?', [unique_key], (err, row) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error.' });
      }
      if (row) {
        return res.json({ success: false, message: 'QR code already scanned.' });
      }

      // Insert scan into database
      db.run('INSERT INTO scans (beach_id, bin_id, trash_weight, unique_key) VALUES (?, ?, ?, ?)',
        [beach_id, bin_id, trash_weight, unique_key], function(err) {
          if (err) {
            return res.status(500).json({ success: false, message: 'Error storing scan.' });
          }

          // Generate coupon if trash_weight >= 5
          let coupon = null;
          if (trash_weight >= 5) {
            coupon = generateCoupon();
          }

          res.json({ success: true, coupon });
        });
    });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Invalid QR code.' });
  }
});

// API Endpoint for redeeming coupon
app.post('/api/redeem', (req, res) => {
  const { coupon_code } = req.body;
  db.get('SELECT * FROM coupons WHERE code = ?', [coupon_code], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error.' });
    }
    if (!row || row.redeemed) {
      return res.json({ success: false, message: 'Invalid or already redeemed coupon.' });
    }
    // Mark as redeemed
    db.run('UPDATE coupons SET redeemed = 1 WHERE code = ?', [coupon_code], function(err) {
      if (err) {
        return res.status(500).json({ success: false, message: 'Error redeeming coupon.' });
      }
      res.json({ success: true, message: 'Coupon redeemed!' });
    });
  });
});

// Function to generate a unique coupon
function generateCoupon() {
  const code = 'COUPON-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  db.run('INSERT INTO coupons (code) VALUES (?)', [code], function(err) {
    if (err) {
      console.error('Error generating coupon:', err.message);
    }
  });
  return code;
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});