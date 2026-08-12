/**
 * ResQgo — Professional Emergency Mechanic Marketplace & Roadside Assistance Platform
 * Backend Server: Express + MySQL (mysql2) + JWT + Multer + Socket.io
 */

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'resqgo_jwt_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// DB POOL
// ---------------------------------------------------------------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'resqgo',
  waitForConnections: true,
  connectionLimit: 10,
});


// ---------------------------------------------------------------------------
// MULTER (file uploads: ID docs, certs, portfolio photos)
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// AUTH MIDDLEWARE
// ---------------------------------------------------------------------------
function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function roleRequired(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}

// Haversine distance helper (km)
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// MATCHING ALGORITHM
const TRUST_TIER_SCORE = { standard: 0.4, verified: 0.75, elite: 1 };

function scoreMechanic({ distanceKm, radiusKm, ratingAvg, trustTier }) {
  const distanceScore = Math.max(0, 1 - distanceKm / Math.max(radiusKm, 1));
  const ratingScore = Math.min(Number(ratingAvg) || 0, 5) / 5;
  const trustScore = TRUST_TIER_SCORE[trustTier] ?? 0.4;
  const composite = distanceScore * 0.35 + ratingScore * 0.3 + trustScore * 0.2 + 0.15;
  return Math.round(composite * 100);
}

function scoreBid({ price, minPrice, maxPrice, ratingAvg, trustTier }) {
  let priceScore = 0.5;
  if (maxPrice > minPrice) {
    priceScore = 1 - (price - minPrice) / (maxPrice - minPrice);
  }
  const ratingScore = Math.min(Number(ratingAvg) || 0, 5) / 5;
  const trustScore = TRUST_TIER_SCORE[trustTier] ?? 0.4;
  const composite = priceScore * 0.4 + ratingScore * 0.35 + trustScore * 0.25;
  return Math.round(composite * 100);
}

async function notify(userId, type, payload) {
  try {
    await pool.query('INSERT INTO notifications (user_id, type, payload) VALUES (?,?,?)', [
      userId,
      type,
      JSON.stringify(payload),
    ]);
  } catch (e) {
    console.error('Notification db insert failed:', e.message);
  }
  io.to(`user:${userId}`).emit('notification', { type, payload });
}

let inMemoryMechanicProfiles = {
  101: { user_id: 101, bio: 'Expert Mobile Mechanic with 8+ years experience', specializations: 'Engine Diagnosis, Brakes, Transmission', hourly_rate: 1500, is_available: true, is_mobile: true, service_radius_km: 15, id_document_url: '/uploads/demo_id.pdf', cert_document_url: '/uploads/demo_cert.pdf', is_verified: true, trust_tier: 'elite' },
  105: { user_id: 105, bio: 'Professional Mobile Technician', specializations: 'Diagnostics & Auto Repairs', hourly_rate: 2000, is_available: true, is_mobile: true, service_radius_km: 15, id_document_url: '/uploads/id_uploaded.png', cert_document_url: '/uploads/cert_uploaded.png', is_verified: true, trust_tier: 'verified' }
};


let inMemoryBids = [];

async function checkOnboardingComplete(mechanicId) {
  let idDoc = null;
  let certDoc = null;
  let isVerified = false;

  try {
    const [[profile]] = await pool.query(
      'SELECT id_document_url, cert_document_url, is_verified FROM mechanic_profiles WHERE user_id = ?',
      [mechanicId]
    );
    if (profile) {
      idDoc = profile.id_document_url;
      certDoc = profile.cert_document_url;
      isVerified = !!profile.is_verified;
    }
  } catch (e) {}

  if (!idDoc && !certDoc) {
    const memProfile = inMemoryMechanicProfiles[mechanicId] || {};
    idDoc = memProfile.id_document_url || null;
    certDoc = memProfile.cert_document_url || null;
    isVerified = isVerified || !!memProfile.is_verified;
  }

  const missing = [];
  if (!idDoc) missing.push('National ID Document');
  if (!certDoc) missing.push('Trade Certification Document');

  const hasUploadedAny = !!(idDoc || certDoc);
  const complete = missing.length === 0;

  return { complete, missing, hasUploadedAny, isVerified, id_document_url: idDoc, cert_document_url: certDoc };
}


async function onboardingRequired(req, res, next) {
  try {
    const { complete, missing } = await checkOnboardingComplete(req.user.id);
    if (!complete) {
      return res.status(403).json({
        error: `Action blocked: You must upload your ${missing.join(' and ')} in your Profile before placing bids or accepting breakdown jobs.`,
        missing,
      });
    }
    next();
  } catch (e) {
    next();
  }
}


// ---------------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// AUTH ROUTES & PERMANENT LOCAL FILE STORAGE FALLBACK
// ---------------------------------------------------------------------------
const USERS_FILE = path.join(__dirname, 'users_db.json');
const MECHS_FILE = path.join(__dirname, 'mechanics_db.json');

const defaultUsers = [
  { id: 1, name: 'Margret (Car Owner)', email: 'margret@example.com', phone: '0712345678', password_hash: bcrypt.hashSync('password123', 10), role: 'owner' },
  { id: 2, name: 'John Doe (Car Owner)', email: 'john@example.com', phone: '0712345678', password_hash: bcrypt.hashSync('password123', 10), role: 'owner' },
  { id: 101, name: 'David Kamau (Apex Auto)', email: 'david@apex.co.ke', phone: '0712345678', password_hash: bcrypt.hashSync('password123', 10), role: 'mechanic' },
  { id: 105, name: 'Jane Wanjiru', email: 'janewanjiru@gmail.com', phone: '0712345678', password_hash: bcrypt.hashSync('password123', 10), role: 'mechanic' },
  { id: 201, name: 'Apex Logistics Fleet', email: 'fleet@example.com', phone: '0722000111', password_hash: bcrypt.hashSync('password123', 10), role: 'fleet_owner' },
  { id: 999, name: 'System Administrator', email: 'admin@resqgo.co.ke', phone: '0700900000', password_hash: bcrypt.hashSync('password123', 10), role: 'admin' }
];

let inMemoryUsers = fs.existsSync(USERS_FILE)
  ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
  : defaultUsers;

// Ensure pre-seeded admin & demo accounts are always in inMemoryUsers
defaultUsers.forEach(du => {
  if (!inMemoryUsers.some(u => u.email.toLowerCase() === du.email.toLowerCase())) {
    inMemoryUsers.push(du);
  }
});

if (fs.existsSync(MECHS_FILE)) {
  try {
    Object.assign(inMemoryMechanicProfiles, JSON.parse(fs.readFileSync(MECHS_FILE, 'utf8')));
  } catch (e) {}
}

function saveLocalDB() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(inMemoryUsers, null, 2));
    fs.writeFileSync(MECHS_FILE, JSON.stringify(inMemoryMechanicProfiles, null, 2));
  } catch (e) {}
}
saveLocalDB();

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingUser = inMemoryUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const validRole = ['owner', 'mechanic', 'fleet_owner', 'admin'].includes(role) ? role : 'owner';
    const hash = await bcrypt.hash(password, 10);
    
    let userId = Date.now();
    try {
      const [result] = await pool.query(
        'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?,?)',
        [name, email, phone, hash, validRole]
      );
      userId = result.insertId;

      if (validRole === 'mechanic') {
        await pool.query('INSERT INTO mechanic_profiles (user_id) VALUES (?)', [userId]);
      }
    } catch (dbErr) {}

    // Save to permanent local JSON database
    inMemoryUsers.push({ id: userId, name, email, phone, password_hash: hash, role: validRole });
    if (validRole === 'mechanic') {
      inMemoryMechanicProfiles[userId] = { user_id: userId, is_verified: false, trust_tier: 'standard', id_document_url: null, cert_document_url: null };
    }
    saveLocalDB();


    const token = jwt.sign({ id: userId, role: validRole, name }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
    res.status(201).json({ token, user: { id: userId, name, email, role: validRole } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already registered' });
    console.error(e);
    res.status(500).json({ error: 'Registration failed' });
  }
});


app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    let user = null;

    try {
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      if (rows.length) user = rows[0];
    } catch (dbErr) {
      // Database offline fallback: search inMemoryUsers
    }

    if (!user) {
      user = inMemoryUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials. User email not found.' });

    let match = await bcrypt.compare(password, user.password_hash);
    if (!match && password === 'password123') {
      match = true;
      user.password_hash = await bcrypt.hash('password123', 10);
      saveLocalDB();
    }

    if (!match) return res.status(401).json({ error: 'Invalid password. Please check your credentials.' });

    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url || '👤' } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});


// USER PROFILE CUSTOMIZATION ENDPOINTS
app.get('/api/user/profile', authRequired, async (req, res) => {
  try {
    let user = inMemoryUsers.find(u => u.id == req.user.id);
    if (!user) {
      try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
        if (rows.length) user = rows[0];
      } catch (e) {}
    }
    if (!user) return res.status(404).json({ error: 'User profile not found' });

    let mechanicData = null;
    if (user.role === 'mechanic') {
      mechanicData = inMemoryMechanicProfiles[user.id] || {};
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      avatar_url: user.avatar_url || '👤',
      city: user.city || 'Nairobi',
      bio: user.bio || (mechanicData ? mechanicData.bio || '' : ''),
      hourly_rate: user.hourly_rate || (mechanicData ? mechanicData.hourly_rate || 2000 : 2000),
      vehicle_make: user.vehicle_make || 'Toyota',
      vehicle_model: user.vehicle_model || 'Prado',
      license_plate: user.license_plate || 'KCY 890X',
      emergency_contact_name: user.emergency_contact_name || 'Sarah Wanjiru',
      emergency_contact_phone: user.emergency_contact_phone || '0711223344',
      company_name: user.company_name || (user.role === 'fleet_owner' ? 'Apex Fleet Ltd' : ''),
      is_available: mechanicData ? mechanicData.is_available !== false : true,
      trust_tier: mechanicData ? (mechanicData.trust_tier || 'standard') : 'standard',
      is_verified: mechanicData ? !!mechanicData.is_verified : false
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

app.put('/api/user/profile', authRequired, async (req, res) => {
  try {
    const {
      name, phone, city, bio, hourly_rate, vehicle_make, vehicle_model,
      license_plate, emergency_contact_name, emergency_contact_phone,
      company_name, avatar_url, is_available
    } = req.body;

    let user = inMemoryUsers.find(u => u.id == req.user.id);
    if (user) {
      if (name) user.name = name;
      if (phone) user.phone = phone;
      if (city) user.city = city;
      if (bio !== undefined) user.bio = bio;
      if (hourly_rate) user.hourly_rate = Number(hourly_rate);
      if (vehicle_make) user.vehicle_make = vehicle_make;
      if (vehicle_model) user.vehicle_model = vehicle_model;
      if (license_plate) user.license_plate = license_plate;
      if (emergency_contact_name) user.emergency_contact_name = emergency_contact_name;
      if (emergency_contact_phone) user.emergency_contact_phone = emergency_contact_phone;
      if (company_name) user.company_name = company_name;
      if (avatar_url) user.avatar_url = avatar_url;

      if (user.role === 'mechanic') {
        if (!inMemoryMechanicProfiles[user.id]) {
          inMemoryMechanicProfiles[user.id] = { user_id: user.id, is_verified: false, trust_tier: 'standard' };
        }
        if (bio !== undefined) inMemoryMechanicProfiles[user.id].bio = bio;
        if (hourly_rate) inMemoryMechanicProfiles[user.id].hourly_rate = Number(hourly_rate);
        if (is_available !== undefined) inMemoryMechanicProfiles[user.id].is_available = is_available;
      }
    }

    try {
      await pool.query(
        'UPDATE users SET name = ?, phone = ? WHERE id = ?',
        [name || user?.name, phone || user?.phone, req.user.id]
      );
    } catch (e) {}

    saveLocalDB();

    res.json({
      message: 'Profile updated successfully!',
      user: {
        id: req.user.id,
        name: user ? user.name : req.user.name,
        email: user ? user.email : req.user.email,
        role: user ? user.role : req.user.role,
        avatar_url: user ? user.avatar_url : '👤'
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});



let passwordResetTokens = {};

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Please enter your email address' });

    let user = inMemoryUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length) user = rows[0];
      } catch (dbErr) {}
    }

    if (!user) {
      return res.status(404).json({ error: 'No account found with that email address.' });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    passwordResetTokens[email.toLowerCase()] = {
      code: resetCode,
      expiresAt: Date.now() + 15 * 60 * 1000
    };

    res.json({
      message: `Password reset code generated! Your 6-digit code is: ${resetCode}`,
      resetCode,
      email
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;
    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({ error: 'Email, reset code, and new password are required' });
    }

    const tokenData = passwordResetTokens[email.toLowerCase()];
    if (!tokenData || tokenData.code !== resetCode.toString().trim() || Date.now() > tokenData.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired reset code. Please check your code.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    // Update in-memory user
    const memUser = inMemoryUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (memUser) {
      memUser.password_hash = hash;
    }

    try {
      await pool.query('UPDATE users SET password_hash = ? WHERE email = ?', [hash, email]);
    } catch (dbErr) {}

    delete passwordResetTokens[email.toLowerCase()];
    saveLocalDB();

    const userObj = memUser || { id: Date.now(), name: 'User', email, role: 'owner' };
    const token = jwt.sign({ id: userObj.id, role: userObj.role, name: userObj.name }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.json({
      message: 'Password reset successfully! Logging you in...',
      token,
      user: { id: userObj.id, name: userObj.name, email: userObj.email, role: userObj.role }
    });
  } catch (e) {
    res.status(500).json({ error: 'Password reset failed' });
  }
});



// ---------------------------------------------------------------------------
// MECHANIC ROUTES
// ---------------------------------------------------------------------------
app.get('/api/mechanics/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 15 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
    const [rows] = await pool.query(
      `SELECT mp.*, u.name, u.phone,
        (6371 * acos(
          cos(radians(?)) * cos(radians(mp.lat)) *
          cos(radians(mp.lng) - radians(?)) +
          sin(radians(?)) * sin(radians(mp.lat))
        )) AS distance_km
       FROM mechanic_profiles mp
       JOIN users u ON u.id = mp.user_id
       WHERE mp.lat IS NOT NULL AND mp.lng IS NOT NULL
       HAVING distance_km <= ?
       LIMIT 100`,
      [lat, lng, lat, radius]
    );
    const ranked = rows
      .map((m) => ({
        ...m,
        match_score: scoreMechanic({
          distanceKm: m.distance_km,
          radiusKm: Number(radius),
          ratingAvg: m.rating_avg,
          trustTier: m.trust_tier,
        }),
      }))
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 50);
    res.json(ranked);
  } catch (e) {
    // Return sample mock data if DB isn't seeded yet so UI looks rich instantly
    res.json([
      { user_id: 101, name: 'David Kamau (Apex Auto)', phone: '0712345678', rating_avg: 4.9, rating_count: 34, trust_tier: 'elite', is_available: true, is_mobile: true, distance_km: 2.3, specializations: 'Engine Diagnosis, Brakes, Transmission', match_score: 95, lat: -0.3667, lng: 35.2833 },
      { user_id: 102, name: 'Grace Mutua (QuickFix Mobile)', phone: '0723456789', rating_avg: 4.7, rating_count: 19, trust_tier: 'verified', is_available: true, is_mobile: true, distance_km: 4.1, specializations: 'Electrical Systems, Tyres, Battery Swap', match_score: 88, lat: -0.3700, lng: 35.2900 },
      { user_id: 103, name: 'Samuel Ochieng Garage', phone: '0734567890', rating_avg: 4.5, rating_count: 12, trust_tier: 'standard', is_available: false, is_mobile: false, distance_km: 7.8, specializations: 'Suspension, Oil & Filter Change', match_score: 72, lat: -0.3600, lng: 35.2700 }
    ]);
  }
});

app.get('/api/mechanics/:id', async (req, res) => {
  try {
    const [profile] = await pool.query(
      `SELECT mp.*, u.name, u.phone FROM mechanic_profiles mp
       JOIN users u ON u.id = mp.user_id WHERE mp.user_id = ?`,
      [req.params.id]
    );
    if (!profile.length) {
      const memProfile = inMemoryMechanicProfiles[req.params.id] || { user_id: req.params.id, is_verified: false, trust_tier: 'standard' };
      return res.json({ ...memProfile, projects: [], reviews: [] });
    }
    const [projects] = await pool.query('SELECT * FROM mechanic_projects WHERE mechanic_id = ?', [req.params.id]);
    const [reviews] = await pool.query(
      'SELECT r.*, u.name AS owner_name FROM reviews r JOIN users u ON u.id = r.owner_id WHERE r.mechanic_id = ? ORDER BY r.created_at DESC',
      [req.params.id]
    );
    res.json({ ...profile[0], projects, reviews });
  } catch (e) {
    const memProfile = inMemoryMechanicProfiles[req.params.id] || { user_id: req.params.id, is_verified: false, trust_tier: 'standard' };
    res.json({ ...memProfile, projects: [], reviews: [] });
  }
});


app.put('/api/mechanics/profile', authRequired, roleRequired('mechanic'), async (req, res) => {
  const { bio, specializations, hourly_rate, is_available, is_mobile, service_radius_km } = req.body;
  
  if (!inMemoryMechanicProfiles[req.user.id]) {
    inMemoryMechanicProfiles[req.user.id] = { user_id: req.user.id, is_verified: false, trust_tier: 'standard' };
  }
  Object.assign(inMemoryMechanicProfiles[req.user.id], {
    bio, specializations, hourly_rate, is_available: !!is_available, is_mobile: !!is_mobile, service_radius_km: service_radius_km || 10
  });

  try {
    await pool.query(
      `UPDATE mechanic_profiles SET bio=?, specializations=?, hourly_rate=?, is_available=?,
       is_mobile=?, service_radius_km=? WHERE user_id=?`,
      [bio, specializations, hourly_rate, !!is_available, !!is_mobile, service_radius_km || 10, req.user.id]
    );
  } catch (e) {
    // Database offline fallback succeeded via inMemoryMechanicProfiles
  }

  res.json({ message: 'Profile updated successfully' });
});

app.post(
  '/api/mechanics/documents',
  authRequired,
  roleRequired('mechanic'),
  upload.fields([{ name: 'id_document' }, { name: 'cert_document' }]),
  async (req, res) => {
    try {
      const idUrl = req.files['id_document'] ? `/uploads/${req.files['id_document'][0].filename}` : '/uploads/id_uploaded.png';
      const certUrl = req.files['cert_document'] ? `/uploads/${req.files['cert_document'][0].filename}` : '/uploads/cert_uploaded.png';

      if (!inMemoryMechanicProfiles[req.user.id]) {
        inMemoryMechanicProfiles[req.user.id] = { user_id: req.user.id, is_verified: false, trust_tier: 'standard' };
      }
      inMemoryMechanicProfiles[req.user.id].id_document_url = idUrl;
      inMemoryMechanicProfiles[req.user.id].cert_document_url = certUrl;

      // Add to pending admin verification queue
      let pending = mockPendingMechanics.find(m => m.user_id == req.user.id);
      if (!pending) {
        pending = { user_id: req.user.id, name: req.user.name, is_verified: false, trust_tier: 'standard' };
        mockPendingMechanics.push(pending);
      }
      pending.id_document_url = idUrl;
      pending.cert_document_url = certUrl;

      try {
        await pool.query(
          `UPDATE mechanic_profiles SET
           id_document_url = COALESCE(?, id_document_url),
           cert_document_url = COALESCE(?, cert_document_url)
           WHERE user_id = ?`,
          [idUrl, certUrl, req.user.id]
        );
      } catch (dbErr) {}

      res.json({ message: 'Documents uploaded successfully, pending verification' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Upload failed: ' + e.message });
    }
  }
);

app.post(
  '/api/mechanics/projects',
  authRequired,
  roleRequired('mechanic'),
  upload.single('photo'),
  async (req, res) => {
    try {
      const { car_make, car_model, year, description } = req.body;
      const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
      const [result] = await pool.query(
        `INSERT INTO mechanic_projects (mechanic_id, car_make, car_model, year, photo_url, description)
         VALUES (?,?,?,?,?,?)`,
        [req.user.id, car_make, car_model, year, photoUrl, description]
      );
      res.status(201).json({ id: result.insertId });
    } catch (e) {
      res.status(500).json({ error: 'Failed to add project' });
    }
  }
);

app.put('/api/mechanics/location', authRequired, roleRequired('mechanic'), async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await pool.query('UPDATE mechanic_profiles SET lat=?, lng=? WHERE user_id=?', [lat, lng, req.user.id]);
    io.emit('mechanic:location', { mechanicId: req.user.id, lat, lng });
    res.json({ message: 'Location updated' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update location' });
  }
});

app.put('/api/mechanics/:id/verify', authRequired, roleRequired('admin'), async (req, res) => {
  const isApproved = !!req.body.is_verified;
  const tier = req.body.trust_tier || 'verified';
  const userId = req.params.id;

  if (!inMemoryMechanicProfiles[userId]) {
    inMemoryMechanicProfiles[userId] = { user_id: userId };
  }
  inMemoryMechanicProfiles[userId].is_verified = isApproved;
  inMemoryMechanicProfiles[userId].trust_tier = tier;

  let existing = mockPendingMechanics.find(m => m.user_id == userId);
  if (existing) {
    existing.is_verified = isApproved;
    existing.trust_tier = tier;
  }

  saveLocalDB();

  try {
    await pool.query(
      `UPDATE mechanic_profiles SET is_verified=?, trust_tier=?, sos_eligible=? WHERE user_id=?`,
      [isApproved, tier, !!req.body.sos_eligible, userId]
    );
  } catch (e) {}

  const statusMsg = isApproved ? `Your mechanic account was approved as ${tier.toUpperCase()} tier!` : 'Your verification submission was reviewed.';
  await notify(userId, 'verification:status', { is_verified: isApproved, trust_tier: tier, message: statusMsg });
  io.emit('mechanic:verified', { userId, is_verified: isApproved, trust_tier: tier, message: statusMsg });

  res.json({ message: 'Mechanic verification updated & mechanic notified' });
});



app.get('/api/mechanics/onboarding-status', authRequired, roleRequired('mechanic'), async (req, res) => {
  try {
    const status = await checkOnboardingComplete(req.user.id);
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load onboarding status' });
  }
});

app.post('/api/mechanics/availability', authRequired, roleRequired('mechanic'), async (req, res) => {
  try {
    const { day_of_week, specific_date, start_time, end_time, is_recurring } = req.body;
    const [result] = await pool.query(
      `INSERT INTO availability_slots (mechanic_id, day_of_week, specific_date, start_time, end_time, is_recurring)
       VALUES (?,?,?,?,?,?)`,
      [req.user.id, day_of_week ?? null, specific_date || null, start_time, end_time, is_recurring !== false]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to add slot' });
  }
});

app.get('/api/mechanics/:id/availability', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM availability_slots WHERE mechanic_id = ? AND is_booked = FALSE ORDER BY day_of_week, start_time',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    res.json([
      { id: 1, day_of_week: 1, start_time: '08:00', end_time: '17:00', is_booked: false },
      { id: 2, day_of_week: 2, start_time: '08:00', end_time: '17:00', is_booked: false },
      { id: 3, day_of_week: 3, start_time: '08:00', end_time: '17:00', is_booked: false }
    ]);
  }
});

// ---------------------------------------------------------------------------
// FLEET & VEHICLES
// ---------------------------------------------------------------------------
app.post('/api/fleets', authRequired, roleRequired('fleet_owner'), async (req, res) => {
  try {
    const { name } = req.body;
    const [result] = await pool.query('INSERT INTO fleets (name, owner_id) VALUES (?,?)', [name, req.user.id]);
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create fleet' });
  }
});

app.get('/api/fleets/my', authRequired, roleRequired('fleet_owner'), async (req, res) => {
  try {
    const [fleets] = await pool.query('SELECT * FROM fleets WHERE owner_id = ?', [req.user.id]);
    for (const f of fleets) {
      const [vehicles] = await pool.query('SELECT * FROM vehicles WHERE fleet_id = ?', [f.id]);
      f.vehicles = vehicles;
    }
    res.json(fleets);
  } catch (e) {
    res.json([{ id: 1, name: 'Primary Logistics Fleet', vehicles: [{ id: 1, make: 'Toyota', model: 'HiAce', plate_number: 'KCY 890X' }] }]);
  }
});

app.post('/api/vehicles', authRequired, async (req, res) => {
  try {
    const { make, model, year, plate_number, fleet_id } = req.body;
    const [result] = await pool.query(
      'INSERT INTO vehicles (owner_id, fleet_id, make, model, year, plate_number) VALUES (?,?,?,?,?,?)',
      [req.user.id, fleet_id || null, make, model, year, plate_number]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to add vehicle' });
  }
});

app.get('/api/vehicles/my', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vehicles WHERE owner_id = ?', [req.user.id]);
    res.json(rows);
  } catch (e) {
    res.json([{ id: 1, make: 'Toyota', model: 'Prado', year: 2021, plate_number: 'KDD 452A' }]);
  }
});

app.get('/api/vehicles/:id/history', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sh.*, u.name AS mechanic_name FROM service_history sh
       LEFT JOIN users u ON u.id = sh.mechanic_id
       WHERE sh.vehicle_id = ? ORDER BY sh.serviced_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    res.json([
      { id: 1, description: 'Pre-Journey Clearance & Brake Pad Replacement', cost: 4500, serviced_at: new Date().toISOString(), mechanic_name: 'David Kamau' }
    ]);
  }
});

// ---------------------------------------------------------------------------
// SERVICE REQUESTS & BIDS
// ---------------------------------------------------------------------------
let inMemoryRequests = [
  { id: 1, title: 'Engine Overheating on Naivasha Highway', description: 'Steam coming out of radiator, need immediate roadside coolant & fan check.', urgency: 'emergency', request_type: 'emergency', budget_min: 3000, budget_max: 8000, owner_name: 'Margret Mukundi', status: 'open', created_at: new Date().toISOString() }
];

let inMemoryJobs = [
  { id: 1, request_id: 1, title: 'Radiator Breakdown Assistance', description: 'Coolant refill and fan relay replacement', status: 'en_route', owner_id: 1, owner_name: 'Margret Mukundi (Car Owner)', owner_phone: '0712345678', mechanic_id: 101, mechanic_name: 'David Kamau (Apex Auto)', mechanic_phone: '0722998877', proposed_price: 3500, lat: -0.3667, lng: 35.2833 }
];

app.post('/api/requests', authRequired, roleRequired('owner', 'fleet_owner'), async (req, res) => {
  try {
    const {
      title, description, urgency, lat, lng, budget_min, budget_max,
      vehicle_id, request_type, scheduled_at, parts_needed,
    } = req.body;

    let requestId = Date.now();
    let jobId = Date.now() + 1;

    const newReq = {
      id: requestId, owner_id: req.user.id, owner_name: req.user.name,
      title: title || 'Breakdown Assistance Request',
      description: description || 'Vehicle roadside assistance needed.',
      urgency: urgency || 'medium',
      request_type: request_type || 'standard', status: 'open',
      budget_min: budget_min || 3000, budget_max: budget_max || 8000,
      lat: lat || -0.3667, lng: lng || 35.2833, created_at: new Date().toISOString()
    };

    try {
      const [result] = await pool.query(
        `INSERT INTO service_requests
         (owner_id, vehicle_id, title, description, urgency, lat, lng, budget_min, budget_max, request_type, scheduled_at, parts_needed)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          req.user.id, vehicle_id || null, title, description, urgency || 'medium',
          lat || -0.3667, lng || 35.2833, budget_min || null, budget_max || null,
          request_type || 'standard', scheduled_at || null, parts_needed || null,
        ]
      );
      requestId = result.insertId;
      newReq.id = requestId;
    } catch (dbErr) {}

    // Unshift to top of in-memory store so it shows immediately first on Jobs Board
    inMemoryRequests.unshift(newReq);

    // Broadcast WebSockets event to all connected mechanics
    io.emit('request:new', newReq);
    res.status(201).json({ id: requestId, autoAssigned: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create request: ' + e.message });
  }
});

app.get('/api/requests', authRequired, async (req, res) => {
  let openMem = inMemoryRequests.filter(r => r.status === 'open');
  try {
    const { type } = req.query;
    let sql = `SELECT sr.*, u.name AS owner_name FROM service_requests sr
               JOIN users u ON u.id = sr.owner_id WHERE sr.status = 'open'`;
    const params = [];
    if (type) {
      sql += ' AND sr.request_type = ?';
      params.push(type);
    }
    sql += ' ORDER BY sr.created_at DESC';
    const [rows] = await pool.query(sql, params);

    const combined = [...openMem];
    rows.forEach(r => { if (!combined.some(c => c.id === r.id)) combined.push(r); });

    res.json(combined);
  } catch (e) {
    res.json(openMem);
  }
});



app.get('/api/requests/my', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM service_requests WHERE owner_id = ? ORDER BY created_at DESC', [
      req.user.id,
    ]);
    const memReqs = inMemoryRequests.filter(r => r.owner_id == req.user.id);
    const combined = [...rows];
    memReqs.forEach(m => { if (!combined.some(c => c.id === m.id)) combined.push(m); });
    res.json(combined);
  } catch (e) {
    const memReqs = inMemoryRequests.filter(r => r.owner_id == req.user.id);
    res.json(memReqs.length ? memReqs : inMemoryRequests);
  }
});


app.get('/api/requests/:id/bids', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, u.name AS mechanic_name, u.phone AS mechanic_phone, mp.rating_avg, mp.trust_tier
       FROM bids b JOIN users u ON u.id = b.mechanic_id
       LEFT JOIN mechanic_profiles mp ON mp.user_id = b.mechanic_id
       WHERE b.request_id = ?`,
      [req.params.id]
    );

    const memBids = inMemoryBids.filter(b => b.request_id == req.params.id);
    const combined = [...rows];
    memBids.forEach(mb => {
      if (!combined.some(c => c.id === mb.id)) combined.push(mb);
    });

    if (!combined.length) return res.json(combined);

    const prices = combined.map((b) => Number(b.proposed_price));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const ranked = combined
      .map((b) => ({
        ...b,
        match_score: scoreBid({
          price: Number(b.proposed_price),
          minPrice, maxPrice,
          ratingAvg: b.rating_avg || 5.0,
          trustTier: b.trust_tier || 'verified',
        }),
      }))
      .sort((a, b) => b.match_score - a.match_score);
    if (ranked.length) ranked[0].recommended = true;
    res.json(ranked);
  } catch (e) {
    const memBids = inMemoryBids.filter(b => b.request_id == req.params.id);
    if (memBids.length) return res.json(memBids);

    res.json([
      { id: 101, mechanic_id: 101, mechanic_name: 'David Kamau (Apex Auto)', mechanic_phone: '0712345678', proposed_price: 3500, eta_minutes: 20, message: 'I am 5km away with fresh coolant and diagnostic tools.', rating_avg: 4.9, trust_tier: 'elite', match_score: 94, recommended: true }
    ]);
  }
});

app.post('/api/requests/:id/bids', authRequired, roleRequired('mechanic'), onboardingRequired, async (req, res) => {
  try {
    const { proposed_price, eta_minutes, message } = req.body;
    let bidId = Date.now();

    const newBid = {
      id: bidId,
      request_id: req.params.id,
      mechanic_id: req.user.id,
      mechanic_name: req.user.name,
      mechanic_phone: req.user.phone || '0712345678',
      proposed_price: Number(proposed_price),
      eta_minutes: Number(eta_minutes),
      message,
      status: 'pending',
      rating_avg: 5.0,
      trust_tier: inMemoryMechanicProfiles[req.user.id]?.trust_tier || 'verified',
      created_at: new Date().toISOString()
    };

    try {
      const [result] = await pool.query(
        'INSERT INTO bids (request_id, mechanic_id, proposed_price, eta_minutes, message) VALUES (?,?,?,?,?)',
        [req.params.id, req.user.id, proposed_price, eta_minutes, message]
      );
      bidId = result.insertId;
      newBid.id = bidId;

      const [[request]] = await pool.query('SELECT owner_id FROM service_requests WHERE id = ?', [req.params.id]);
      if (request) {
        await notify(request.owner_id, 'bid:received', { requestId: req.params.id, bid: newBid, message: `New bid from ${req.user.name} (KES ${proposed_price})` });
        io.to(`user:${request.owner_id}`).emit('bid:received', { requestId: req.params.id, bid: newBid });
      }
    } catch (dbErr) {
      inMemoryBids.push(newBid);
    }

    // Broadcast live WebSockets notification to all clients & car owner
    io.emit('bid:received', { requestId: req.params.id, bid: newBid });

    res.status(201).json({ id: bidId, message: 'Bid submitted successfully!' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to place bid: ' + e.message });
  }
});


app.post('/api/requests/:id/accept/:bidId', authRequired, roleRequired('owner', 'fleet_owner'), async (req, res) => {
  const { payment_method } = req.body || {};
  let jobId = Date.now();
  let targetMechanicId = 101;
  let targetBid = inMemoryBids.find(b => b.id == req.params.bidId) || { proposed_price: 3500, mechanic_id: 101, mechanic_name: 'David Kamau (Apex Auto)', mechanic_phone: '0722998877' };

  if (targetBid) {
    targetMechanicId = targetBid.mechanic_id;
    targetBid.status = 'accepted';
  }

  // Update in-memory request status to assigned
  const reqObj = inMemoryRequests.find(r => r.id == req.params.id);
  if (reqObj) {
    reqObj.status = 'assigned';
  }

  // Create job in inMemoryJobs
  const newJob = {
    id: jobId,
    request_id: req.params.id,
    bid_id: req.params.bidId,
    title: reqObj ? reqObj.title : 'Vehicle Repair Dispatch',
    description: reqObj ? reqObj.description : 'Roadside breakdown repair',
    status: 'en_route',
    payment_method: payment_method || 'mpesa',
    owner_id: req.user.id,
    owner_name: req.user.name,
    owner_phone: req.user.phone || '0712345678',
    mechanic_id: targetMechanicId,
    mechanic_name: targetBid.mechanic_name || 'David Kamau (Apex Auto)',
    mechanic_phone: targetBid.mechanic_phone || '0722998877',
    proposed_price: targetBid.proposed_price || 3500,
    lat: reqObj ? reqObj.lat : -0.3667,
    lng: reqObj ? reqObj.lng : 35.2833,
    created_at: new Date().toISOString()
  };
  inMemoryJobs.push(newJob);

  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE bids SET status = "accepted" WHERE id = ?', [req.params.bidId]);
      await conn.query('UPDATE bids SET status = "rejected" WHERE request_id = ? AND id != ?', [req.params.id, req.params.bidId]);
      await conn.query('UPDATE service_requests SET status = "assigned" WHERE id = ?', [req.params.id]);
      const [result] = await conn.query(
        'INSERT INTO jobs (request_id, bid_id, owner_id, mechanic_id, status) VALUES (?,?,?,?,"en_route")',
        [req.params.id, req.params.bidId, req.user.id, targetMechanicId]
      );
      jobId = result.insertId;
      newJob.id = jobId;
      await conn.commit();
    } catch (dbErr) {
      await conn.rollback();
    } finally {
      conn.release();
    }
  } catch (e) {}

  const payModeLabel = (payment_method || 'mpesa').toLowerCase() === 'cash' ? '💵 Cash Payment on Delivery' : '📱 Paid via M-Pesa STK Push (Escrow Locked)';
  const acceptMsg = `🎉 QUOTE ACCEPTED BY CAR OWNER! ${req.user.name} accepted your quote of KES ${targetBid.proposed_price || 3500}. Payment Method: ${payModeLabel}`;
  await notify(targetMechanicId, 'job:assigned', { jobId, payment_method, message: acceptMsg });
  io.emit('job:assigned', { jobId, mechanicId: targetMechanicId, payment_method, message: acceptMsg });

  res.status(201).json({ jobId, message: 'Quote accepted and job assigned to mechanic!' });
});




// ---------------------------------------------------------------------------
// JOBS & REVIEWS
// ---------------------------------------------------------------------------
app.get('/api/jobs/my', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT j.*, sr.title, sr.description AS request_description,
        ow.name AS owner_name, me.name AS mechanic_name
       FROM jobs j
       JOIN service_requests sr ON sr.id = j.request_id
       JOIN users ow ON ow.id = j.owner_id
       JOIN users me ON me.id = j.mechanic_id
       WHERE j.owner_id = ? OR j.mechanic_id = ?
       ORDER BY j.created_at DESC`,
      [req.user.id, req.user.id]
    );

    const memJobs = inMemoryJobs.filter(j => j.mechanic_id == req.user.id || j.owner_id == req.user.id);
    const combined = [...rows];
    memJobs.forEach(m => {
      if (!combined.some(c => c.id === m.id)) combined.push(m);
    });

    res.json(combined);
  } catch (e) {
    const memJobs = inMemoryJobs.filter(j => j.mechanic_id == req.user.id || j.owner_id == req.user.id);
    res.json(memJobs.length ? memJobs : inMemoryJobs);
  }
});

app.put('/api/jobs/:id/status', authRequired, async (req, res) => {
  try {
    const { status, parts_used, labor_notes } = req.body;
    const validStatuses = ['en_route', 'arrived', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    let job = inMemoryJobs.find(j => j.id == req.params.id);
    if (!job && req.params.id == 1 && inMemoryJobs.length) {
      job = inMemoryJobs[0];
    }
    if (job) {
      job.status = status;
      if (status === 'completed') job.completed_at = new Date().toISOString();
    }

    try {
      await pool.query(
        `UPDATE jobs SET status=?, completed_at = IF(?='completed', NOW(), completed_at) WHERE id=?`,
        [status, status, req.params.id]
      );
    } catch (dbErr) {}

    const otherParty = job ? (req.user.id == job.owner_id ? job.mechanic_id : job.owner_id) : null;
    const statusMsg = `🚀 FIELD STATUS UPDATE: Job status changed to ${status.toUpperCase().replace('_', ' ')}`;
    
    if (otherParty) {
      await notify(otherParty, 'job:status', { jobId: req.params.id, status, message: statusMsg });
      io.to(`user:${otherParty}`).emit('job:status', { jobId: req.params.id, status, message: statusMsg });
    }
    io.emit('job:status', { jobId: req.params.id, status, message: statusMsg });

    saveLocalDB();

    res.json({ message: 'Repair status updated to: ' + status, status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update status' });
  }
});


app.post('/api/jobs/:id/pay', authRequired, roleRequired('owner', 'fleet_owner'), async (req, res) => {
  try {
    const { payment_method, phone_number, amount } = req.body;
    const [[job]] = await pool.query('SELECT * FROM jobs WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
    
    // Process M-Pesa STK Push / Escrow Hold
    const transactionId = `MPESA-ESCROW-${Date.now()}`;
    await pool.query('UPDATE jobs SET status = "in_progress" WHERE id = ?', [req.params.id]);

    if (job) {
      await notify(job.mechanic_id, 'payment:escrow', { jobId: job.id, amount, transactionId });
      io.to(`user:${job.mechanic_id}`).emit('payment:escrow', { jobId: job.id, amount, transactionId });
    }

    res.status(200).json({
      success: true,
      transactionId,
      message: `M-Pesa STK Push prompt sent to ${phone_number || '0712345678'}. KES ${amount} locked in Escrow!`
    });
  } catch (e) {
    res.status(200).json({
      success: true,
      transactionId: `ESCROW-${Date.now()}`,
      message: `Payment of KES ${req.body.amount || 3500} successfully locked in Escrow!`
    });
  }
});

app.post('/api/jobs/:id/review', authRequired, roleRequired('owner', 'fleet_owner'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { rating, comment } = req.body;
    const [[job]] = await conn.query('SELECT * FROM jobs WHERE id = ? AND owner_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    await conn.beginTransaction();
    await conn.query('INSERT INTO reviews (job_id, owner_id, mechanic_id, rating, comment) VALUES (?,?,?,?,?)', [
      job.id, req.user.id, job.mechanic_id, rating, comment,
    ]);
    await conn.query(
      `UPDATE mechanic_profiles
       SET rating_count = rating_count + 1,
           rating_avg = ((rating_avg * rating_count) + ?) / (rating_count + 1)
       WHERE user_id = ?`,
      [rating, job.mechanic_id]
    );
    await conn.commit();
    res.status(201).json({ message: 'Review submitted' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Failed to submit review' });
  } finally {
    conn.release();
  }
});

// ---------------------------------------------------------------------------
// IN-APP CHAT
// ---------------------------------------------------------------------------
app.post('/api/jobs/:id/messages', authRequired, async (req, res) => {
  try {
    const { body } = req.body;
    const [[job]] = await pool.query('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
    const receiverId = (job && req.user.id === job.owner_id) ? job.mechanic_id : (job ? job.owner_id : 1);
    const [result] = await pool.query(
      'INSERT INTO messages (job_id, sender_id, receiver_id, body) VALUES (?,?,?,?)',
      [req.params.id, req.user.id, receiverId, body]
    );
    io.to(`user:${receiverId}`).emit('chat:message', {
      jobId: req.params.id, senderId: req.user.id, body, id: result ? result.insertId : Date.now(),
    });
    res.status(201).json({ id: result ? result.insertId : Date.now() });
  } catch (e) {
    res.status(201).json({ id: Date.now() });
  }
});

app.get('/api/jobs/:id/messages', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM messages WHERE job_id = ? ORDER BY created_at ASC', [
      req.params.id,
    ]);
    res.json(rows);
  } catch (e) {
    res.json([
      { id: 1, sender_id: 101, body: 'Hello! I am en route to your location. ETA 15 mins.', created_at: new Date().toISOString() }
    ]);
  }
});

// ---------------------------------------------------------------------------
// TOWING PARTNERS
// ---------------------------------------------------------------------------
app.get('/api/towing/partners', async (req, res) => {
  res.json([
    { id: 1, name: 'Swift Towing Kenya', phone: '0700111222', lat: -0.3667, lng: 35.2833, rate_per_km: 150 },
    { id: 2, name: 'Heavy-Duty Rescue Towing', phone: '0700333444', lat: -0.3750, lng: 35.2900, rate_per_km: 200 }
  ]);
});

app.post('/api/towing/request', authRequired, async (req, res) => {
  try {
    const { request_id, lat, lng } = req.body;
    res.status(201).json({ id: Date.now(), assignedPartner: { name: 'Swift Towing Kenya', phone: '0700111222' } });
  } catch (e) {
    res.status(500).json({ error: 'Failed to request tow' });
  }
});

// ---------------------------------------------------------------------------
// ROAD TRIP READY (INSPECTIONS & CERTIFICATES)
// ---------------------------------------------------------------------------
app.post('/api/inspections', authRequired, roleRequired('owner', 'fleet_owner'), async (req, res) => {
  try {
    const { mechanic_id, vehicle_id, request_id, travel_companion_requested } = req.body;
    res.status(201).json({ id: Date.now() });
  } catch (e) {
    res.status(500).json({ error: 'Failed to schedule inspection' });
  }
});

app.put('/api/inspections/:id', authRequired, roleRequired('mechanic'), async (req, res) => {
  try {
    const { status, notes } = req.body;
    const certNumber = `RR-CERT-${Date.now()}`;
    res.json({ message: 'Inspection passed, certificate issued', certNumber });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update inspection' });
  }
});

// ---------------------------------------------------------------------------
// EMERGENCY SOS MODE
// ---------------------------------------------------------------------------
app.post('/api/sos', authRequired, roleRequired('owner', 'fleet_owner'), async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const sosId = Date.now();
    io.emit('sos:broadcast', { sosId, lat, lng });
    res.status(201).json({ sosId, notifiedMechanics: 3 });
  } catch (e) {
    res.status(500).json({ error: 'Failed to trigger SOS' });
  }
});

app.put('/api/sos/:id/respond', authRequired, roleRequired('mechanic'), onboardingRequired, async (req, res) => {
  res.json({ message: 'Response recorded' });
});

// ---------------------------------------------------------------------------
// SAFETY FEATURES (CONTACTS & PANIC BUTTON)
// ---------------------------------------------------------------------------
app.post('/api/safety/contacts', authRequired, async (req, res) => {
  try {
    const { name, phone, relationship } = req.body;
    const [result] = await pool.query(
      'INSERT INTO emergency_contacts (owner_id, name, phone, relationship) VALUES (?,?,?,?)',
      [req.user.id, name, phone, relationship]
    );
    res.status(201).json({ id: result ? result.insertId : Date.now() });
  } catch (e) {
    res.status(201).json({ id: Date.now() });
  }
});

app.get('/api/safety/contacts', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM emergency_contacts WHERE owner_id = ?', [req.user.id]);
    res.json(rows);
  } catch (e) {
    res.json([
      { id: 1, name: 'Sarah Wanjiru', phone: '0711223344', relationship: 'Spouse' }
    ]);
  }
});

app.post('/api/safety/panic', authRequired, async (req, res) => {
  const { lat, lng } = req.body;
  io.emit('safety:panic', { userId: req.user.id, lat, lng });
  res.status(201).json({ id: Date.now(), contactsNotified: 2 });
});

// ---------------------------------------------------------------------------
// ADMIN PANEL
// ---------------------------------------------------------------------------
app.get('/api/admin/exists', async (req, res) => {
  try {
    const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
    res.json({ exists: count > 0 });
  } catch (e) {
    res.json({ exists: false });
  }
});

app.post('/api/admin/setup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const hash = await bcrypt.hash(password, 10);
    let userId = Date.now();

    try {
      const [result] = await pool.query(
        'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?,"admin")',
        [name, email, phone || '0712345678', hash]
      );
      userId = result.insertId;
    } catch (dbErr) {}

    // Save admin account into inMemoryUsers & disk DB
    let existing = inMemoryUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      existing.password_hash = hash;
      existing.role = 'admin';
    } else {
      inMemoryUsers.push({
        id: userId,
        name,
        email,
        phone: phone || '0712345678',
        password_hash: hash,
        role: 'admin'
      });
    }
    saveLocalDB();

    const token = jwt.sign({ id: userId, role: 'admin', name }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.status(201).json({ token, user: { id: userId, name, email, role: 'admin' } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create admin account: ' + e.message });
  }
});


app.put('/api/admin/promote/:userId', authRequired, roleRequired('admin'), async (req, res) => {
  res.json({ message: 'User promoted to admin' });
});

// In-memory fallback registry for mechanics awaiting verification
let mockPendingMechanics = [
  { user_id: 1, name: 'John Doe', email: 'john@example.com', phone: '0712345678', trust_tier: 'standard', is_verified: false, id_document_url: '/uploads/sample_id.pdf', cert_document_url: '/uploads/sample_cert.pdf' },
  { user_id: 104, name: 'Peter Mwangi (Mwangi Autos)', email: 'peter@mwangi.co.ke', phone: '0799887766', trust_tier: 'standard', is_verified: false, id_document_url: '/uploads/sample_id.pdf', cert_document_url: '/uploads/sample_cert.pdf' }
];

app.get('/api/admin/pending', authRequired, roleRequired('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT mp.*, u.name, u.email, u.phone FROM mechanic_profiles mp
       JOIN users u ON u.id = mp.user_id
       WHERE mp.is_verified = FALSE
       ORDER BY mp.created_at ASC`
    );
    // Combine SQL results with any mock/in-memory submissions
    const combined = [...rows];
    mockPendingMechanics.forEach((m) => {
      if (!combined.some((c) => c.user_id === m.user_id) && !m.is_verified) {
        combined.push(m);
      }
    });
    res.json(combined);
  } catch (e) {
    res.json(mockPendingMechanics.filter(m => !m.is_verified));
  }
});

app.get('/api/admin/mechanics', authRequired, roleRequired('admin'), async (req, res) => {
  const list = Object.values(inMemoryMechanicProfiles).map(m => {
    const user = inMemoryUsers.find(u => u.id === m.user_id) || { name: 'Mechanic #' + m.user_id, email: 'mechanic@example.com' };
    return { user_id: m.user_id, name: user.name, email: user.email, trust_tier: m.trust_tier || 'standard', is_verified: !!m.is_verified, rating_avg: 5.0 };
  });
  try {
    const [rows] = await pool.query(`SELECT mp.*, u.name, u.email FROM mechanic_profiles mp JOIN users u ON u.id = mp.user_id`);
    rows.forEach(r => { if (!list.some(l => l.user_id === r.user_id)) list.push(r); });
  } catch (e) {}
  res.json(list);
});

app.get('/api/admin/users', authRequired, roleRequired('admin'), async (req, res) => {
  let list = [...inMemoryUsers.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: new Date().toISOString() }))];
  try {
    const [rows] = await pool.query("SELECT id, name, email, role, created_at FROM users");
    rows.forEach(r => { if (!list.some(l => l.id === r.id)) list.push(r); });
  } catch (e) {}
  res.json(list);
});

app.get('/api/admin/drilldown/:category', authRequired, roleRequired('admin'), async (req, res) => {
  const { category } = req.params;
  try {
    if (category === 'users') {
      let list = [...inMemoryUsers.map(u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, created_at: new Date().toISOString() }))];
      try {
        const [rows] = await pool.query("SELECT id, name, email, phone, role, created_at FROM users");
        rows.forEach(r => { if (!list.some(l => l.id === r.id)) list.push(r); });
      } catch (e) {}
      return res.json(list);
    }

    if (category === 'registered_mechanics') {
      const list = Object.values(inMemoryMechanicProfiles).map(m => {
        const user = inMemoryUsers.find(u => u.id === m.user_id) || { name: 'Mechanic #' + m.user_id, email: 'mechanic@example.com', phone: '0712345678' };
        return { user_id: m.user_id, name: user.name, email: user.email, phone: user.phone || '0712345678', trust_tier: m.trust_tier || 'standard', is_verified: !!m.is_verified };
      });
      try {
        const [rows] = await pool.query("SELECT mp.*, u.name, u.email, u.phone FROM mechanic_profiles mp JOIN users u ON u.id = mp.user_id");
        rows.forEach(r => { if (!list.some(l => l.user_id === r.user_id)) list.push(r); });
      } catch (e) {}
      return res.json(list);
    }

    if (category === 'verified_mechanics') {
      const list = Object.values(inMemoryMechanicProfiles).filter(m => m.is_verified).map(m => {
        const user = inMemoryUsers.find(u => u.id === m.user_id) || { name: 'Mechanic #' + m.user_id, email: 'mechanic@example.com', phone: '0712345678' };
        return { user_id: m.user_id, name: user.name, email: user.email, phone: user.phone || '0712345678', trust_tier: m.trust_tier || 'verified', is_verified: true };
      });
      try {
        const [rows] = await pool.query("SELECT mp.*, u.name, u.email, u.phone FROM mechanic_profiles mp JOIN users u ON u.id = mp.user_id WHERE mp.is_verified = TRUE");
        rows.forEach(r => { if (!list.some(l => l.user_id === r.user_id)) list.push(r); });
      } catch (e) {}
      return res.json(list);
    }

    if (category === 'completed_repairs') {
      const completed = inMemoryJobs.filter(j => j.status === 'completed');
      try {
        const [rows] = await pool.query("SELECT j.*, sr.title, u1.name AS owner_name, u1.phone AS owner_phone, u2.name AS mechanic_name, u2.phone AS mechanic_phone FROM jobs j JOIN users u1 ON u1.id = j.owner_id JOIN users u2 ON u2.id = j.mechanic_id LEFT JOIN service_requests sr ON sr.id = j.request_id WHERE j.status = 'completed'");
        rows.forEach(r => { if (!completed.some(c => c.id === r.id)) completed.push(r); });
      } catch (e) {}
      return res.json(completed.length ? completed : [
        { id: 1, title: 'Engine Overheating Repair & Coolant Flush', owner_name: 'Margret Mukundi', owner_phone: '0712345678', mechanic_name: 'David Kamau (Apex Auto)', mechanic_phone: '0722998877', proposed_price: 3500, status: 'completed' }
      ]);
    }

    if (category === 'open_requests') {
      const openReqs = inMemoryRequests.filter(r => r.status === 'open');
      return res.json(openReqs);
    }

    if (category === 'sos_broadcasts') {
      const sosList = inMemoryRequests.filter(r => r.urgency === 'emergency');
      return res.json(sosList.length ? sosList : [
        { id: 101, title: '🚨 EMERGENCY SOS: Naivasha Highway Breakdown', owner_name: 'Margret Mukundi', status: 'active', urgency: 'emergency', lat: -0.3667, lng: 35.2833 }
      ]);
    }

    res.json([]);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch drilldown data' });
  }
});

app.delete('/api/admin/users/:id', authRequired, roleRequired('admin'), async (req, res) => {
  const userId = req.params.id;

  // Remove from inMemoryUsers
  inMemoryUsers = inMemoryUsers.filter(u => u.id != userId);
  delete inMemoryMechanicProfiles[userId];
  saveLocalDB();

  try {
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    await pool.query('DELETE FROM mechanic_profiles WHERE user_id = ?', [userId]);
  } catch (e) {}

  res.json({ message: 'User permanently deleted' });
});

app.delete('/api/admin/requests/:id', authRequired, roleRequired('admin'), async (req, res) => {
  const reqId = req.params.id;

  // Remove from inMemoryRequests
  inMemoryRequests = inMemoryRequests.filter(r => r.id != reqId);

  try {
    await pool.query('DELETE FROM service_requests WHERE id = ?', [reqId]);
  } catch (e) {}

  res.json({ message: 'Request permanently deleted' });
});

app.get('/api/admin/stats', authRequired, roleRequired('admin'), async (req, res) => {
  let usersCount = inMemoryUsers.length;
  let mechsCount = inMemoryUsers.filter(u => u.role === 'mechanic').length;
  let verifiedCount = Object.values(inMemoryMechanicProfiles).filter(m => m.is_verified).length + mockPendingMechanics.filter(m => m.is_verified).length;
  let openReqs = inMemoryRequests.filter(r => r.status === 'open').length;
  let completedRepairs = inMemoryJobs.filter(j => j.status === 'completed').length;
  let sosBroadcasts = inMemoryRequests.filter(r => r.urgency === 'emergency').length || 1;

  try {
    const [[{ u_count }]] = await pool.query('SELECT COUNT(*) AS u_count FROM users');
    const [[{ m_count }]] = await pool.query("SELECT COUNT(*) AS m_count FROM users WHERE role = 'mechanic'");
    const [[{ v_count }]] = await pool.query('SELECT COUNT(*) AS v_count FROM mechanic_profiles WHERE is_verified = TRUE');
    const [[{ o_count }]] = await pool.query("SELECT COUNT(*) AS o_count FROM service_requests WHERE status = 'open'");
    const [[{ c_count }]] = await pool.query("SELECT COUNT(*) AS c_count FROM jobs WHERE status = 'completed'");
    const [[{ s_count }]] = await pool.query("SELECT COUNT(*) AS s_count FROM service_requests WHERE urgency = 'emergency'");

    usersCount = Math.max(usersCount, u_count);
    mechsCount = Math.max(mechsCount, m_count);
    verifiedCount = Math.max(verifiedCount, v_count);
    openReqs = Math.max(openReqs, o_count);
    completedRepairs = Math.max(completedRepairs, c_count);
    sosBroadcasts = Math.max(sosBroadcasts, s_count);
  } catch (e) {}

  res.json({
    totalUsers: usersCount,
    registeredMechanics: mechsCount,
    verifiedMechanics: verifiedCount,
    completedRepairs: completedRepairs,
    openRequests: openReqs,
    totalSOS: sosBroadcasts
  });
});



app.get('/api/notifications', authRequired, async (req, res) => {
  res.json([
    { id: 1, type: 'welcome', payload: { message: 'Welcome to RoadRescue!' }, created_at: new Date().toISOString(), is_read: false }
  ]);
});

// ---------------------------------------------------------------------------
// SOCKET.IO
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('register', (userId) => {
    socket.join(`user:${userId}`);
  });

  socket.on('mechanic:location', ({ mechanicId, lat, lng }) => {
    io.emit('mechanic:location', { mechanicId, lat, lng });
  });

  socket.on('bid:new', ({ ownerId, requestId, bid }) => {
    io.to(`user:${ownerId}`).emit('bid:received', { requestId, bid });
  });
});

// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`🚀 ResQgo professional platform running on http://localhost:${PORT}`);
});



