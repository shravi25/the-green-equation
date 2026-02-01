const CryptoJS = require('crypto-js');
const QRCode = require('qrcode');

const secretKey = 'shra2006rith2012'
const payload = JSON.stringify({
  beach_id: 'beach123',
  bin_id: 'bin456',
  trash_weight: 6,
  unique_key: 'abc260'  // Change for each QR
});

// Encrypt
const encrypted = CryptoJS.AES.encrypt(payload, secretKey).toString();
console.log('Encrypted Payload:', encrypted);

// Generate QR
QRCode.toFile('test-qr.png', encrypted, (err) => {
  if (err) throw err;
  console.log('QR code saved as test-qr.png');
});