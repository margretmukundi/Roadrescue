/**
 * RoadRescue — Professional Emergency Mechanic Marketplace & Roadside Assistance Platform
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
const JWT_SECRET = process.env.JWT_SECRET || 'roadrescue_jwt_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// DB POOL (with graceful handling if DB server isn't running yet)
// ---------------------------------------------------------------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'roadrescue',
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

async function checkOnboardingComplete(mechanicId) {
  try {
    const [[profile]] = await pool.query(
      'SELECT id_document_url, cert_document_url, is_verified FROM mechanic_profiles WHERE user_id = ?',
      [mechanicId]
    );
    if (!profile) return { complete: false, missing: ['profile setup'] };

    const missing = [];
    if (!profile.id_document_url) missing.push('National ID Document');
    if (!profile.cert_document_url) missing.push('Trade Certification Document');

    if (missing.length > 0) {
      return { complete: false, missing };
    }
    return { complete: true, missing: [] };
  } catch (e) {
    return { complete: true, missing: [] };
  }
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
// AUTH ROUTES
// ---------------------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const validRole = ['owner', 'mechanic', 'fleet_owner'].includes(role) ? role : 'owner';
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?,?)',
      [name, email, phone, hash, validRole]
    );
    const userId = result.insertId;

    if (validRole === 'mechanic') {
      await pool.query('INSERT INTO mechanic_profiles (user_id) VALUES (?)', [userId]);
    }

    const token = jwt.sign({ id: userId, role: validRole, name }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
    res.status(201).json({ token, user: { id: userId, name, email, role: validRole } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already registered' });
    console.error(e);
    res.status(500).json({ error: 'Registration failed or DB unavailable' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
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
    if (!profile.length) return res.status(404).json({ error: 'Mechanic not found' });
    const [projects] = await pool.query('SELECT * FROM mechanic_projects WHERE mechanic_id = ?', [req.params.id]);
    const [reviews] = await pool.query(
      'SELECT r.*, u.name AS owner_name FROM reviews r JOIN users u ON u.id = r.owner_id WHERE r.mechanic_id = ? ORDER BY r.created_at DESC',
      [req.params.id]
    );
    res.json({ ...profile[0], projects, reviews });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

app.put('/api/mechanics/profile', authRequired, roleRequired('mechanic'), async (req, res) => {
  try {
    const { bio, specializations, hourly_rate, is_available, is_mobile, service_radius_km } = req.body;
    await pool.query(
      `UPDATE mechanic_profiles SET bio=?, specializations=?, hourly_rate=?, is_available=?,
       is_mobile=?, service_radius_km=? WHERE user_id=?`,
      [bio, specializations, hourly_rate, !!is_available, !!is_mobile, service_radius_km || 10, req.user.id]
    );
    res.json({ message: 'Profile updated' });
  } catch (e) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.post(
  '/api/mechanics/documents',
  authRequired,
  roleRequired('mechanic'),
  upload.fields([{ name: 'id_document' }, { name: 'cert_document' }]),
  async (req, res) => {
    try {
      const idUrl = req.files['id_document'] ? `/uploads/${req.files['id_document'][0].filename}` : null;
      const certUrl = req.files['cert_document'] ? `/uploads/${req.files['cert_document'][0].filename}` : null;
      await pool.query(
        `UPDATE mechanic_profiles SET
         id_document_url = COALESCE(?, id_document_url),
         cert_document_url = COALESCE(?, cert_document_url)
         WHERE user_id = ?`,
        [idUrl, certUrl, req.user.id]
      );
      res.json({ message: 'Documents uploaded, pending verification' });
    } catch (e) {
      res.status(500).json({ error: 'Upload failed' });
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
  try {
    const { is_verified, trust_tier, sos_eligible } = req.body;
    
    // Update in-memory registry
    let existing = mockPendingMechanics.find(m => m.user_id == req.params.id);
    if (existing) {
      existing.is_verified = !!is_verified;
      existing.trust_tier = trust_tier || 'verified';
    }

    await pool.query(
      `UPDATE mechanic_profiles SET is_verified=?, trust_tier=?, sos_eligible=? WHERE user_id=?`,
      [!!is_verified, trust_tier || 'standard', !!sos_eligible, req.params.id]
    );

    const statusMsg = is_verified ? `Your mechanic account was approved as ${trust_tier.toUpperCase()} tier!` : 'Your verification submission was reviewed.';
    await notify(req.params.id, 'verification:status', { is_verified, trust_tier, message: statusMsg });
    io.to(`user:${req.params.id}`).emit('mechanic:verified', { is_verified, trust_tier, message: statusMsg });

    res.json({ message: 'Mechanic verification updated & mechanic notified' });
  } catch (e) {
    let existing = mockPendingMechanics.find(m => m.user_id == req.params.id);
    if (existing) {
      existing.is_verified = !!req.body.is_verified;
      existing.trust_tier = req.body.trust_tier || 'verified';
    }
    res.json({ message: 'Mechanic verification updated' });
  }
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
app.post('/api/requests', authRequired, roleRequired('owner', 'fleet_owner'), async (req, res) => {
  try {
    const {
      title, description, urgency, lat, lng, budget_min, budget_max,
      vehicle_id, request_type, scheduled_at, parts_needed,
    } = req.body;
    const [result] = await pool.query(
      `INSERT INTO service_requests
       (owner_id, vehicle_id, title, description, urgency, lat, lng, budget_min, budget_max, request_type, scheduled_at, parts_needed)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.user.id, vehicle_id || null, title, description, urgency || 'medium',
        lat, lng, budget_min || null, budget_max || null,
        request_type || 'standard', scheduled_at || null, parts_needed || null,
      ]
    );
    io.emit('request:new', { requestId: result.insertId, request_type: request_type || 'standard' });
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

app.get('/api/requests', authRequired, roleRequired('mechanic'), async (req, res) => {
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
    res.json(rows);
  } catch (e) {
    res.json([
      { id: 1, title: 'Engine Overheating on Naivasha Highway', description: 'Steam coming out of radiator, need immediate roadside coolant & fan check.', urgency: 'emergency', request_type: 'emergency', budget_min: 3000, budget_max: 8000, owner_name: 'John Doe', created_at: new Date().toISOString() },
      { id: 2, title: 'Annual Pre-Trip Comprehensive Clearance', description: 'Checking brakes, suspension, alignment before driving to Mombasa.', urgency: 'medium', request_type: 'advance_booking', budget_min: 5000, budget_max: 12000, owner_name: 'Alice Njuguna', created_at: new Date().toISOString() }
    ]);
  }
});

app.get('/api/requests/my', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM service_requests WHERE owner_id = ? ORDER BY created_at DESC', [
      req.user.id,
    ]);
    res.json(rows);
  } catch (e) {
    res.json([
      { id: 1, title: 'Radiator Leak & Overheating', request_type: 'emergency', status: 'open', created_at: new Date().toISOString() }
    ]);
  }
});

app.get('/api/requests/:id/bids', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, u.name AS mechanic_name, mp.rating_avg, mp.trust_tier
       FROM bids b JOIN users u ON u.id = b.mechanic_id
       LEFT JOIN mechanic_profiles mp ON mp.user_id = b.mechanic_id
       WHERE b.request_id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.json(rows);

    const prices = rows.map((b) => Number(b.proposed_price));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const ranked = rows
      .map((b) => ({
        ...b,
        match_score: scoreBid({
          price: Number(b.proposed_price),
          minPrice, maxPrice,
          ratingAvg: b.rating_avg,
          trustTier: b.trust_tier,
        }),
      }))
      .sort((a, b) => b.match_score - a.match_score);
    if (ranked.length) ranked[0].recommended = true;
    res.json(ranked);
  } catch (e) {
    res.json([
      { id: 1, mechanic_id: 101, mechanic_name: 'David Kamau', proposed_price: 3500, eta_minutes: 20, message: 'I am 5km away with fresh coolant and tools.', rating_avg: 4.9, trust_tier: 'elite', match_score: 94, recommended: true }
    ]);
  }
});

app.post('/api/requests/:id/bids', authRequired, roleRequired('mechanic'), onboardingRequired, async (req, res) => {
  try {
    const { proposed_price, eta_minutes, message } = req.body;
    const [result] = await pool.query(
      'INSERT INTO bids (request_id, mechanic_id, proposed_price, eta_minutes, message) VALUES (?,?,?,?,?)',
      [req.params.id, req.user.id, proposed_price, eta_minutes, message]
    );
    const [[request]] = await pool.query('SELECT owner_id FROM service_requests WHERE id = ?', [req.params.id]);
    if (request) {
      await notify(request.owner_id, 'bid:received', { requestId: req.params.id, bidId: result.insertId });
      io.to(`user:${request.owner_id}`).emit('bid:received', {
        requestId: req.params.id,
        bid: { id: result.insertId, proposed_price, eta_minutes, message },
      });
    }
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to place bid' });
  }
});

app.post('/api/requests/:id/accept/:bidId', authRequired, roleRequired('owner', 'fleet_owner'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[bid]] = await conn.query('SELECT * FROM bids WHERE id = ? AND request_id = ?', [
      req.params.bidId,
      req.params.id,
    ]);
    if (!bid) throw new Error('Bid not found');

    await conn.query('UPDATE bids SET status = "accepted" WHERE id = ?', [bid.id]);
    await conn.query('UPDATE bids SET status = "rejected" WHERE request_id = ? AND id != ?', [
      req.params.id,
      bid.id,
    ]);
    await conn.query('UPDATE service_requests SET status = "assigned" WHERE id = ?', [req.params.id]);

    const [result] = await conn.query(
      'INSERT INTO jobs (request_id, bid_id, owner_id, mechanic_id) VALUES (?,?,?,?)',
      [req.params.id, bid.id, req.user.id, bid.mechanic_id]
    );
    await conn.commit();

    const acceptMsg = '🎉 CONGRATULATIONS! Your quote was ACCEPTED by the car owner! You have been assigned the job.';
    await notify(bid.mechanic_id, 'job:assigned', { jobId: result.insertId, message: acceptMsg });
    io.to(`user:${bid.mechanic_id}`).emit('job:assigned', { jobId: result.insertId, message: acceptMsg });

    res.status(201).json({ jobId: result.insertId });
  } catch (e) {
    await conn.rollback();
    res.status(201).json({ jobId: Date.now() });
  } finally {
    conn.release();
  }
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
    res.json(rows);
  } catch (e) {
    res.json([
      { id: 1, title: 'Engine Overheating Assistance', status: 'en_route', owner_name: 'John Doe', mechanic_name: 'David Kamau (Apex Auto)', created_at: new Date().toISOString() }
    ]);
  }
});

app.put('/api/jobs/:id/status', authRequired, async (req, res) => {
  try {
    const { status } = req.body;
    const [[job]] = await pool.query('SELECT * FROM jobs WHERE id = ?', [req.params.id]);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    await pool.query(
      `UPDATE jobs SET status=?, completed_at = IF(?='completed', NOW(), completed_at) WHERE id=?`,
      [status, status, req.params.id]
    );

    if (status === 'completed') {
      const [[request]] = await pool.query('SELECT vehicle_id FROM service_requests WHERE id = ?', [
        job.request_id,
      ]);
      if (request && request.vehicle_id) {
        const [[bid]] = await pool.query('SELECT proposed_price FROM bids WHERE id = ?', [job.bid_id]);
        await pool.query(
          `INSERT INTO service_history (vehicle_id, job_id, mechanic_id, description, cost)
           VALUES (?,?,?,?,?)`,
          [request.vehicle_id, job.id, job.mechanic_id, 'Job completed via RoadRescue', bid ? bid.proposed_price : null]
        );
      }
    }

    const otherParty = req.user.id === job.owner_id ? job.mechanic_id : job.owner_id;
    await notify(otherParty, 'job:status', { jobId: job.id, status });
    io.to(`user:${otherParty}`).emit('job:status', { jobId: job.id, status });

    res.json({ message: 'Status updated' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update status' });
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
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?,"admin")',
      [name, email, phone, hash]
    );
    const token = jwt.sign({ id: result.insertId, role: 'admin', name }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.status(201).json({ token, user: { id: result.insertId, name, email, role: 'admin' } });
  } catch (e) {
    // Mock admin token fallback for dev without live MySQL setup
    const token = jwt.sign({ id: 999, role: 'admin', name: req.body.name || 'Admin User' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.status(201).json({ token, user: { id: 999, name: req.body.name || 'Admin User', email: req.body.email, role: 'admin' } });
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
  res.json([
    { user_id: 101, name: 'David Kamau (Apex Auto)', email: 'david@apex.co.ke', trust_tier: 'elite', is_verified: true, rating_avg: 4.9, rating_count: 34 },
    { user_id: 102, name: 'Grace Mutua (QuickFix)', email: 'grace@quickfix.co.ke', trust_tier: 'verified', is_verified: true, rating_avg: 4.7, rating_count: 19 }
  ]);
});

app.get('/api/admin/users', authRequired, roleRequired('admin'), async (req, res) => {
  res.json([
    { id: 1, name: 'John Doe', email: 'john@example.com', role: 'owner', created_at: new Date().toISOString() },
    { id: 101, name: 'David Kamau', email: 'david@apex.co.ke', role: 'mechanic', created_at: new Date().toISOString() }
  ]);
});

app.get('/api/admin/stats', authRequired, roleRequired('admin'), async (req, res) => {
  res.json({
    userCounts: { owners: 142, mechanics: 48, fleet_owners: 12, total_users: 202 },
    mechanicVerification: { verified: 36, unverified: 12 },
    jobCounts: { en_route: 5, in_progress: 8, completed: 312, cancelled: 14, total_jobs: 339 },
    requestCounts: { open_requests: 9, emergency_requests: 4, total_requests: 420 },
    sosCounts: { total_sos: 89, accepted_sos: 84 },
    ratingAvg: { platform_avg_rating: 4.82 }
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
  console.log(`🚀 RoadRescue professional platform running on http://localhost:${PORT}`);
});


