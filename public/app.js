/* ==========================================================================
   ROADRESCUE — FRONTEND APPLICATION LOGIC
   ========================================================================== */
const API_BASE = '';

let state = {
  token: localStorage.getItem('rr_token') || null,
  user: JSON.parse(localStorage.getItem('rr_user') || 'null'),
  selectedRole: 'owner',
  currentPortalView: 'home',
  coords: null,
  socket: null,
  activeMap: null,
};

// ---------------------------------------------------------------------------
// INITIALIZATION
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initGeoLocation();
  updateAuthUI();
  if (state.token && state.user) {
    connectSocket();
  }
});

function toast(msg) {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const config = { ...opts, headers };
  
  if (config.body && typeof config.body !== 'string' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }
  if (config.body instanceof FormData) delete headers['Content-Type'];
  
  try {
    const res = await fetch(API_BASE + path, config);
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  } catch (err) {
    throw err;
  }
}

function initGeoLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (state.user && state.user.role === 'mechanic') {
          api('/api/mechanics/location', { method: 'PUT', body: state.coords }).catch(() => {});
        }
      },
      () => {
        state.coords = { lat: -0.3667, lng: 35.2833 }; // Default fallback coordinates (Kericho / Rift Valley)
      }
    );
  } else {
    state.coords = { lat: -0.3667, lng: 35.2833 };
  }
}

function connectSocket() {
  if (typeof io === 'undefined') return;
  state.socket = io();
  if (state.user) {
    state.socket.emit('register', state.user.id);
  }
  state.socket.on('notification', (n) => toast(`🔔 Notification: ${n.type.replace(/:/g, ' ')}`));
  state.socket.on('bid:received', () => toast('💰 New bid received on your service request!'));
  state.socket.on('job:assigned', (d) => {
    toast(`🎉 ${d.message || 'Your quote was accepted! You are assigned a new job.'}`);
    alert(`🎉 QUOTE ACCEPTED!\n\nYour quote was ACCEPTED by the car owner!\n\nJob #${d.jobId} has been assigned to you. Opening your active jobs list...`);
    showPortalTab('myjobs');
  });
  state.socket.on('job:status', (d) => {
    toast(`Job #${d.jobId} status updated to: ${d.status.replace('_', ' ')}`);
    if (state.currentPortalView === 'myjobs') renderPortalJobs();
  });
  state.socket.on('sos:broadcast', () => toast('🚨 Emergency SOS alert in your vicinity!'));
  state.socket.on('sos:accepted', () => toast('✅ A mechanic accepted your emergency SOS!'));
  state.socket.on('mechanic:verified', (d) => {
    toast(`🎉 ${d.message || 'Your mechanic account was verified by the Admin!'}`);
    alert(`🎉 ACCOUNT APPROVED!\n\n${d.message || 'Your mechanic account has been verified by the Admin.'}\n\nYou can now place bids on the Jobs Board and accept breakdown requests!`);
    if (state.currentPortalView === 'profile' || state.currentPortalView === 'board') {
      showPortalTab(state.currentPortalView);
    }
  });

  state.socket.on('chat:message', () => {
    toast('💬 New chat message received');
    if (state.currentPortalView === 'chat') renderChatView();
  });

}

// ---------------------------------------------------------------------------
// PUBLIC SITE INTERACTIONS (NAV, FAQ, CONTACT, QUICK FORM)
// ---------------------------------------------------------------------------
function toggleFaq(btn) {
  const ans = btn.nextElementSibling;
  const isHidden = ans.style.display === 'none';
  ans.style.display = isHidden ? 'block' : 'none';
  btn.querySelector('span').textContent = isHidden ? '−' : '+';
}

function toggleMobileNav() {
  const links = document.querySelector('.nav-links');
  if (links) {
    links.style.display = links.style.display === 'flex' ? 'none' : 'flex';
    links.style.flexDirection = 'column';
    links.style.position = 'absolute';
    links.style.top = '100%';
    links.style.left = '0';
    links.style.right = '0';
    links.style.background = 'var(--bg-card)';
    links.style.padding = '20px';
  }
}

function handleContactSubmit(e) {
  e.preventDefault();
  toast('Thank you for reaching out! Our dispatch team will respond shortly.');
  e.target.reset();
  return false;
}

function handleHeroQuickSubmit(e) {
  e.preventDefault();
  const issueType = document.getElementById('heroIssueType').value;
  const vehicle = document.getElementById('heroVehicleInfo').value;
  const desc = document.getElementById('heroDesc').value;

  if (!state.token) {
    toast('Please log in or register to dispatch your request.');
    openAuthModal('register');
    return false;
  }

  api('/api/requests', {
    method: 'POST',
    body: {
      title: `${issueType.toUpperCase()} - ${vehicle}`,
      description: desc,
      urgency: issueType === 'emergency' ? 'emergency' : 'medium',
      request_type: issueType,
      lat: state.coords?.lat,
      lng: state.coords?.lng
    }
  }).then(() => {
    toast('🚀 Request submitted! Opening your portal view...');
    openPortalView('myjobs');
  }).catch((err) => toast(err.message));

  return false;
}

function handleEmergencyQuickStart() {
  if (!state.token) {
    openAuthModal('login');
    toast('Log in to trigger an instant emergency SOS broadcast.');
    return;
  }
  triggerSOS();
}

// ---------------------------------------------------------------------------
// AUTHENTICATION & MODAL CONTROLS
// ---------------------------------------------------------------------------
function updateAuthUI() {
  const btn = document.getElementById('navAuthBtn');
  if (btn) {
    btn.textContent = state.token ? `Portal (${state.user?.name.split(' ')[0]})` : 'Log In';
    btn.onclick = () => {
      if (state.token) {
        openPortalView();
      } else {
        openAuthModal('login');
      }
    };
  }
}

function openAuthModal(tab = 'login') {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
    switchAuthTab(tab);
  }
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

function switchAuthTab(tab) {
  const loginF = document.getElementById('loginForm');
  const regF = document.getElementById('registerForm');
  const adminF = document.getElementById('adminSetupForm');
  const loginBtn = document.getElementById('authTabLoginBtn');
  const regBtn = document.getElementById('authTabRegBtn');

  if (loginF) {
    loginF.style.display = tab === 'login' ? 'block' : 'none';
    loginF.classList.remove('hidden');
  }
  if (regF) {
    regF.style.display = tab === 'register' ? 'block' : 'none';
    regF.classList.remove('hidden');
  }
  if (adminF) {
    adminF.style.display = 'none';
    adminF.classList.remove('hidden');
  }

  if (loginBtn) {
    loginBtn.classList.toggle('btn-primary', tab === 'login');
  }
  if (regBtn) {
    regBtn.classList.toggle('btn-primary', tab === 'register');
  }
}

function openPortalView(defaultTab = null) {
  if (!state.token || !state.user) {
    openAuthModal('login');
    toast('Please log in or create an account to access the App Portal.');
    return;
  }
  const portal = document.getElementById('portalOverlay');
  if (portal) {
    portal.style.display = 'block';
    portal.classList.add('active');
    const badge = document.getElementById('portalUserBadge');
    if (badge) badge.textContent = `${state.user.name} (${state.user.role})`;
    renderPortalTabs();
    showPortalTab(defaultTab || (state.user.role === 'admin' ? 'adminStats' : 'requestAssistance'));
  }
}

function closePortalView() {
  const portal = document.getElementById('portalOverlay');
  if (portal) {
    portal.style.display = 'none';
    portal.classList.remove('active');
  }
}


function pickRole(role) {
  state.selectedRole = role;
  document.querySelectorAll('.role-opt').forEach((el) => {
    el.classList.toggle('selected', el.dataset.role === role);
  });
}

async function handleLoginForm(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    onAuthSuccess(data);
  } catch (err) {
    toast(err.message);
  }
  return false;
}

async function handleRegisterForm(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const phone = document.getElementById('regPhone').value;
  const password = document.getElementById('regPassword').value;
  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: { name, email, phone, password, role: state.selectedRole }
    });
    onAuthSuccess(data);
  } catch (err) {
    toast(err.message);
  }
  return false;
}

async function toggleAdminSetup(e) {
  e.preventDefault();
  const adminF = document.getElementById('adminSetupForm');
  const loginF = document.getElementById('loginForm');
  const regF = document.getElementById('registerForm');

  const opening = adminF.style.display === 'none';
  if (opening) {
    try {
      const res = await api('/api/admin/exists');
      if (res.exists) {
        toast('An admin account already exists. Please log in normally.');
        return;
      }
    } catch (err) {}
  }
  adminF.style.display = opening ? 'block' : 'none';
  loginF.style.display = 'none';
  regF.style.display = 'none';
}

async function handleAdminSetup(e) {
  e.preventDefault();
  try {
    const data = await api('/api/admin/setup', {
      method: 'POST',
      body: {
        name: document.getElementById('adminName').value,
        email: document.getElementById('adminEmail').value,
        phone: document.getElementById('adminPhone').value,
        password: document.getElementById('adminPassword').value
      }
    });
    onAuthSuccess(data);
  } catch (err) {
    toast(err.message);
  }
  return false;
}

function onAuthSuccess(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('rr_token', data.token);
  localStorage.setItem('rr_user', JSON.stringify(data.user));
  closeAuthModal();
  updateAuthUI();
  connectSocket();
  toast(`Welcome back, ${data.user.name}!`);
  openPortalView();
}

function logoutUser() {
  localStorage.removeItem('rr_token');
  localStorage.removeItem('rr_user');
  state.token = null;
  state.user = null;
  closePortalView();
  updateAuthUI();
  toast('Logged out successfully.');
}

// ---------------------------------------------------------------------------
// APP PORTAL DASHBOARD CONTROLS & VIEWS
// ---------------------------------------------------------------------------
function openPortalView(defaultTab = null) {
  if (!state.token || !state.user) {
    openAuthModal('login');
    return;
  }
  const portal = document.getElementById('portalOverlay');
  if (portal) {
    portal.classList.add('active');
    document.getElementById('portalUserBadge').textContent = `${state.user.name} (${state.user.role})`;
    renderPortalTabs();
    showPortalTab(defaultTab || (state.user.role === 'admin' ? 'adminStats' : 'home'));
  }
}

function closePortalView() {
  const portal = document.getElementById('portalOverlay');
  if (portal) {
    portal.classList.remove('active');
  }
}

function renderPortalTabs() {
  const role = state.user?.role || 'owner';
  let tabs = [];

  if (role === 'admin') {
    tabs = [
      { id: 'adminStats', label: '📊 Overview' },
      { id: 'adminPending', label: '✅ Verification Queue' },
      { id: 'adminMechanics', label: '🔧 Mechanics Directory' },
      { id: 'adminUsers', label: '👥 User Directory' }
    ];
  } else if (role === 'mechanic') {
    tabs = [
      { id: 'home', label: '🏠 Dashboard' },
      { id: 'board', label: '📋 Jobs Board' },
      { id: 'myjobs', label: '🔧 My Active Jobs' },
      { id: 'calendar', label: '📅 Availability' },
      { id: 'profile', label: '👤 Profile & Verification' }
    ];
  } else if (role === 'fleet_owner') {
    tabs = [
      { id: 'home', label: '🏠 Overview' },
      { id: 'nearby', label: '📍 Nearby Mechanics' },
      { id: 'myjobs', label: '🔧 My Requests' },
      { id: 'fleet', label: '🚚 Fleet & Vehicles' },
      { id: 'roadtrip', label: '🧭 Road Trip Ready' },
      { id: 'safety', label: '🛡️ Safety Center' }
    ];
  } else {
    // Car Owner
    tabs = [
      { id: 'home', label: '🏠 Overview' },
      { id: 'nearby', label: '📍 Find Nearby Mechanics' },
      { id: 'myjobs', label: '🔧 My Requests & Jobs' },
      { id: 'roadtrip', label: '🧭 Road Trip Ready' },
      { id: 'safety', label: '🛡️ Safety Center' }
    ];
  }

  const container = document.getElementById('portalNavTabs');
  container.innerHTML = tabs
    .map(
      (t) =>
        `<button class="portal-tab-btn" id="ptab-${t.id}" onclick="showPortalTab('${t.id}')">${t.label}</button>`
    )
    .join('');
}

function showPortalTab(tabId) {
  state.currentPortalView = tabId;
  document.querySelectorAll('.portal-tab-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById(`ptab-${tabId}`);
  if (btn) btn.classList.add('active');

  const main = document.getElementById('portalMainContent');
  if (!main) return;

  const renderers = {
    home: renderPortalHome,
    nearby: renderPortalNearby,
    board: renderPortalBoard,
    myjobs: renderPortalJobs,
    calendar: renderPortalCalendar,
    profile: renderPortalProfile,
    fleet: renderPortalFleet,
    roadtrip: renderPortalRoadTrip,
    safety: renderPortalSafety,
    chat: renderChatView,
    adminStats: renderAdminStatsView,
    adminPending: renderAdminPendingView,
    adminMechanics: renderAdminMechanicsView,
    adminUsers: renderAdminUsersView
  };

  (renderers[tabId] || renderPortalHome)();
}

function renderPortalHome() {
  const main = document.getElementById('portalMainContent');

  main.innerHTML = `
    <div class="card">
      <h2>Welcome back, ${state.user.name} 👋</h2>
      <p style="color:var(--text-muted); margin-bottom:20px;">Role: <strong>${state.user.role.toUpperCase()}</strong></p>
      
      <div class="grid-2">
        <div class="card" style="margin:0;">
          <h3>🚨 Instant Emergency SOS</h3>
          <p>Stranded right now? Broadcast your GPS coordinates to the 3 nearest elite mechanics.</p>
          <button class="btn btn-danger btn-sm" style="margin-top:10px;" onclick="triggerSOS()">Trigger Emergency SOS</button>
        </div>
        
        <div class="card" style="margin:0;">
          <h3>📍 Find Nearby Mechanics</h3>
          <p>Browse active mobile mechanics on an interactive map and inspect ratings.</p>
          <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="showPortalTab('nearby')">Open Interactive Map</button>
        </div>
      </div>
    </div>
  `;
}

// 1. NEARBY MECHANICS MAP VIEW
function renderPortalNearby() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `
    <div class="card">
      <div class="eyebrow">Interactive Map</div>
      <h2>📍 Mechanics Around You</h2>
      <p style="color:var(--text-muted); margin-bottom:16px;">Vetted mobile mechanics currently on duty near your location.</p>
      
      <div id="map"></div>
      <div id="nearbyListContainer">Loading nearby mechanics...</div>
    </div>
  `;
  initNearbyMap();
}

async function initNearbyMap() {
  const coords = state.coords || { lat: -0.3667, lng: 35.2833 };
  setTimeout(() => {
    if (state.activeMap) { state.activeMap.remove(); }
    state.activeMap = L.map('map').setView([coords.lat, coords.lng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(state.activeMap);
    L.marker([coords.lat, coords.lng]).addTo(state.activeMap).bindPopup('📍 Your Current Location').openPopup();
  }, 50);

  try {
    const mechs = await api(`/api/mechanics/nearby?lat=${coords.lat}&lng=${coords.lng}&radius=25`);
    const container = document.getElementById('nearbyListContainer');
    if (!mechs.length) {
      container.innerHTML = `<p style="color:var(--text-muted);">No active mechanics found within 25km right now.</p>`;
      return;
    }

    container.innerHTML = mechs.map((m) => `
      <div style="padding:14px 0; border-bottom:1px solid var(--border); display:flex; justify-space-between; align-items:center;">
        <div>
          <strong>${m.name}</strong> <span class="trust-tier-tag tier-${m.trust_tier}">${m.trust_tier}</span>
          <p style="font-size:0.85rem; color:var(--text-muted);">${m.specializations || 'General Repairs'} · ${m.distance_km ? m.distance_km.toFixed(1) + ' km away' : 'Nearby'} · ⭐ ${m.rating_avg || '5.0'}</p>
        </div>
        <div>
          <span class="badge ${m.is_available ? 'badge-emerald' : 'badge-warn'}">${m.is_available ? 'Available' : 'Offline'}</span>
        </div>
      </div>
    `).join('');

    setTimeout(() => {
      mechs.forEach((m) => {
        if (m.lat && m.lng && state.activeMap) {
          L.marker([m.lat, m.lng]).addTo(state.activeMap).bindPopup(`🔧 ${m.name} (${m.trust_tier})`);
        }
      });
    }, 100);
  } catch (err) {
    document.getElementById('nearbyListContainer').innerHTML = `<p style="color:var(--danger);">${err.message}</p>`;
  }
}

// 2. MECHANIC JOBS BOARD VIEW
async function renderPortalBoard() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `
    <div class="card">
      <h2>📋 Breakdown Jobs Board</h2>
      <p style="color:var(--text-muted); margin-bottom:16px;">Browse open customer requests and submit competitive quotes.</p>
      <div id="docWarningBanner"></div>
      <div id="boardList">Loading open requests...</div>
    </div>
  `;

  let docStatus = { complete: true, missing: [] };
  try {
    docStatus = await api('/api/mechanics/onboarding-status');
  } catch (err) {}

  if (!docStatus.complete) {
    document.getElementById('docWarningBanner').innerHTML = `
      <div style="background:rgba(245, 158, 11, 0.12); border:1px solid var(--warn); border-radius:var(--radius-md); padding:16px; margin-bottom:20px;">
        <strong style="color:var(--warn);">🔒 Document Registration Required</strong>
        <p style="font-size:0.9rem; color:var(--text-main); margin-top:6px;">
          You must register your <strong>${docStatus.missing.join(' and ')}</strong> in your profile before you can place bids or accept breakdown jobs.
        </p>
        <button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="showPortalTab('profile')">Go to Profile & Upload Documents →</button>
      </div>
    `;
  }

  try {
    const reqs = await api('/api/requests');
    const container = document.getElementById('boardList');
    if (!reqs.length) {
      container.innerHTML = `<p style="color:var(--text-muted);">No open breakdown requests at this time.</p>`;
      return;
    }
    container.innerHTML = reqs.map((r) => `
      <div style="padding:18px; border:1px solid var(--border); border-radius:var(--radius-md); margin-bottom:16px; background:var(--bg-input);">
        <div style="display:flex; justify-content:space-between;">
          <strong>${r.title}</strong>
          <span class="badge badge-accent">${r.urgency}</span>
        </div>
        <p style="font-size:0.9rem; color:var(--text-muted); margin:6px 0;">${r.description}</p>
        <p style="font-size:0.8rem; color:var(--text-faint);">Requested by: ${r.owner_name} · Budget: KES ${r.budget_min || '?'}-${r.budget_max || '?'}</p>
        ${!docStatus.complete 
          ? `<button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="showPortalTab('profile')">🔒 Upload Documents to Bid</button>`
          : `<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="showBidForm(${r.id})">Place Quote / Bid</button>`
        }
        <div id="bidContainer-${r.id}"></div>
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('boardList').innerHTML = `<p>${err.message}</p>`;
  }
}


function showBidForm(reqId) {
  const box = document.getElementById(`bidContainer-${reqId}`);
  box.innerHTML = `
    <form onsubmit="return submitBid(event, ${reqId})" style="margin-top:12px; padding:12px; background:var(--bg-card); border-radius:var(--radius-sm);">
      <div class="grid-2">
        <div class="form-group"><label>Proposed Price (KES)</label><input type="number" id="bidPrice-${reqId}" class="form-control" required placeholder="3500"></div>
        <div class="form-group"><label>ETA (Minutes)</label><input type="number" id="bidEta-${reqId}" class="form-control" required placeholder="20"></div>
      </div>
      <div class="form-group"><label>Message to Owner</label><input type="text" id="bidMsg-${reqId}" class="form-control" placeholder="I have tools & parts ready..."></div>
      <button type="submit" class="btn btn-primary btn-sm">Submit Quote</button>
    </form>
  `;
}

async function submitBid(e, reqId) {
  e.preventDefault();
  try {
    await api(`/api/requests/${reqId}/bids`, {
      method: 'POST',
      body: {
        proposed_price: document.getElementById(`bidPrice-${reqId}`).value,
        eta_minutes: document.getElementById(`bidEta-${reqId}`).value,
        message: document.getElementById(`bidMsg-${reqId}`).value
      }
    });
    toast('Bid submitted successfully!');
    renderPortalBoard();
  } catch (err) {
    toast(err.message);
  }
  return false;
}

// 3. MY JOBS VIEW & VISUAL PROGRESS TRACKER
async function renderPortalJobs() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `
    <div class="card">
      <h2>🔧 Active Repairs & Requests</h2>
      <div id="myJobsListContainer">Loading jobs...</div>
    </div>
  `;
  try {
    const jobs = await api('/api/jobs/my');
    const container = document.getElementById('myJobsListContainer');
    if (!jobs.length) {
      container.innerHTML = `<p style="color:var(--text-muted);">No active jobs or past requests found.</p>`;
      return;
    }
    container.innerHTML = jobs.map((j) => `
      <div style="padding:18px; border:1px solid var(--border); border-radius:var(--radius-md); margin-bottom:16px; background:var(--bg-input);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${j.title}</strong>
          <span class="badge badge-accent">${j.status.replace('_', ' ')}</span>
        </div>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">${state.user.role === 'mechanic' ? 'Owner: ' + j.owner_name : 'Mechanic: ' + j.mechanic_name}</p>
        
        <!-- Step Tracker -->
        <div style="display:flex; justify-content:space-between; margin:20px 0; padding:12px; background:var(--bg-card); border-radius:var(--radius-sm);">
          <span style="font-weight:${j.status === 'en_route' ? '700' : '400'}; color:${j.status === 'en_route' ? 'var(--accent)' : 'var(--text-muted)'};">1. 🚗 En Route</span> →
          <span style="font-weight:${j.status === 'in_progress' ? '700' : '400'}; color:${j.status === 'in_progress' ? 'var(--accent)' : 'var(--text-muted)'};">2. 🔧 In Progress</span> →
          <span style="font-weight:${j.status === 'completed' ? '700' : '400'}; color:${j.status === 'completed' ? 'var(--emerald)' : 'var(--text-muted)'};">3. ✅ Completed</span>
        </div>

        <div style="display:flex; gap:10px;">
          ${j.status !== 'completed' ? `<button class="btn btn-primary btn-sm" onclick="advanceJobStatus(${j.id}, '${j.status === 'en_route' ? 'in_progress' : 'completed'}')">Mark Next Stage</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="openChatForJob(${j.id})">💬 Open In-App Chat</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('myJobsListContainer').innerHTML = `<p>${err.message}</p>`;
  }
}

async function advanceJobStatus(jobId, nextStatus) {
  try {
    await api(`/api/jobs/${jobId}/status`, { method: 'PUT', body: { status: nextStatus } });
    toast(`Job status updated to: ${nextStatus.replace('_', ' ')}`);
    renderPortalJobs();
  } catch (err) {
    toast(err.message);
  }
}

// 4. IN-APP CHAT VIEW
let activeChatJobId = null;
function openChatForJob(jobId) {
  activeChatJobId = jobId;
  showPortalTab('chat');
}

async function renderChatView() {
  const main = document.getElementById('portalMainContent');
  if (!activeChatJobId) {
    main.innerHTML = `<div class="card"><p>Select a job from 'My Jobs' to open the chat room.</p></div>`;
    return;
  }
  main.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
        <h3>💬 Repair Chat (Job #${activeChatJobId})</h3>
        <button class="btn btn-ghost btn-sm" onclick="showPortalTab('myjobs')">Back to Jobs</button>
      </div>

      <div class="chat-window" id="chatWindow">Loading messages...</div>

      <form onsubmit="return sendChatMessage(event)" style="display:flex; gap:10px;">
        <input type="text" id="chatInput" class="form-control" placeholder="Type a message..." required>
        <button type="submit" class="btn btn-primary">Send</button>
      </form>
    </div>
  `;
  loadChatMessages();
}

async function loadChatMessages() {
  try {
    const msgs = await api(`/api/jobs/${activeChatJobId}/messages`);
    const win = document.getElementById('chatWindow');
    win.innerHTML = msgs
      .map(
        (m) =>
          `<div class="chat-bubble ${m.sender_id === state.user.id ? 'mine' : 'theirs'}">${m.body}</div>`
      )
      .join('');
    win.scrollTop = win.scrollHeight;
  } catch (err) {}
}

async function sendChatMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  try {
    await api(`/api/jobs/${activeChatJobId}/messages`, { method: 'POST', body: { body: input.value } });
    input.value = '';
    loadChatMessages();
  } catch (err) {
    toast(err.message);
  }
  return false;
}

// 5. MECHANIC AVAILABILITY CALENDAR VIEW
async function renderPortalCalendar() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `
    <div class="card">
      <h2>📅 Availability Calendar</h2>
      <p style="color:var(--text-muted); margin-bottom:16px;">Set your working time slots so drivers can book advance repairs.</p>
      
      <form onsubmit="return addSlot(event)" style="margin-bottom:24px;">
        <div class="grid-3">
          <div class="form-group">
            <label>Day of Week</label>
            <select id="slotDay" class="form-control">
              <option value="1">Monday</option><option value="2">Tuesday</option>
              <option value="3">Wednesday</option><option value="4">Thursday</option>
              <option value="5">Friday</option><option value="6">Saturday</option><option value="0">Sunday</option>
            </select>
          </div>
          <div class="form-group"><label>Start Time</label><input type="time" id="slotStart" class="form-control" required></div>
          <div class="form-group"><label>End Time</label><input type="time" id="slotEnd" class="form-control" required></div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Add Time Slot</button>
      </form>

      <div id="slotsList">Loading slots...</div>
    </div>
  `;
  loadSlots();
}

async function loadSlots() {
  try {
    const slots = await api(`/api/mechanics/${state.user.id}/availability`);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    document.getElementById('slotsList').innerHTML = slots.length
      ? slots
          .map(
            (s) =>
              `<div style="padding:10px 0; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;">
                <span>${days[s.day_of_week]} · ${s.start_time} - ${s.end_time}</span>
                <span class="badge badge-emerald">Open for booking</span>
              </div>`
          )
          .join('')
      : `<p style="color:var(--text-muted);">No custom availability slots created yet.</p>`;
  } catch (err) {}
}

async function addSlot(e) {
  e.preventDefault();
  try {
    await api('/api/mechanics/availability', {
      method: 'POST',
      body: {
        day_of_week: document.getElementById('slotDay').value,
        start_time: document.getElementById('slotStart').value,
        end_time: document.getElementById('slotEnd').value
      }
    });
    toast('Slot added!');
    loadSlots();
  } catch (err) {
    toast(err.message);
  }
  return false;
}

// 6. MECHANIC PROFILE & VERIFICATION DOCS
async function renderPortalProfile() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `
    <div class="card">
      <h2>👤 Profile & Verification Documents</h2>
      <p style="color:var(--text-muted); margin-bottom:16px;">Upload your National ID and mechanical certification to unlock Elite tier jobs.</p>
      
      <form onsubmit="return saveProfile(event)">
        <div class="form-group"><label>Bio & Specializations</label><textarea id="pBio" class="form-control" placeholder="Engine diagnostics, transmission..."></textarea></div>
        <div class="form-group"><label>Hourly Rate (KES)</label><input type="number" id="pRate" class="form-control" placeholder="2000"></div>
        <button type="submit" class="btn btn-primary btn-sm">Save Profile</button>
      </form>

      <hr style="margin:24px 0; border-color:var(--border);">
      <h3>📄 Verification Documents</h3>
      <form onsubmit="return uploadDocs(event)" style="margin-top:12px;">
        <div class="form-group"><label>Government ID Copy (Image / PDF)</label><input type="file" id="docId" class="form-control"></div>
        <div class="form-group"><label>Mechanical Trade Cert (Image / PDF)</label><input type="file" id="docCert" class="form-control"></div>
        <button type="submit" class="btn btn-secondary btn-sm">Upload Documents</button>
      </form>
    </div>
  `;
}

async function saveProfile(e) {
  e.preventDefault();
  try {
    await api('/api/mechanics/profile', {
      method: 'PUT',
      body: {
        bio: document.getElementById('pBio').value,
        hourly_rate: document.getElementById('pRate').value,
        is_available: true
      }
    });
    toast('Profile updated');
  } catch (err) { toast(err.message); }
  return false;
}

async function uploadDocs(e) {
  e.preventDefault();
  try {
    const fd = new FormData();
    const idF = document.getElementById('docId').files[0];
    const certF = document.getElementById('docCert').files[0];
    if (idF) fd.append('id_document', idF);
    if (certF) fd.append('cert_document', certF);
    await api('/api/mechanics/documents', { method: 'POST', body: fd });
    toast('Documents submitted for admin verification!');
  } catch (err) { toast(err.message); }
  return false;
}

// 7. STREAMLINED FLEET OWNER PORTAL VIEWS
async function renderPortalFleet() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
          <h2>🚚 Company Fleet Vehicles</h2>
          <p style="color:var(--text-muted);">Manage your registered company fleet vehicles and trigger quick breakdown repairs.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="showAddVehicleModal()">+ Add New Vehicle</button>
      </div>

      <div id="addVehicleBox" style="display:none; padding:16px; background:var(--bg-input); border-radius:var(--radius-md); margin-bottom:20px;">
        <h4>Register New Vehicle to Fleet</h4>
        <form onsubmit="return addVehicle(event)" style="margin-top:12px;">
          <div class="grid-3">
            <div class="form-group"><label>Make</label><input type="text" id="vMake" class="form-control" placeholder="Toyota" required></div>
            <div class="form-group"><label>Model</label><input type="text" id="vModel" class="form-control" placeholder="HiAce / Landcruiser" required></div>
            <div class="form-group"><label>Plate Number</label><input type="text" id="vPlate" class="form-control" placeholder="KCY 890X" required></div>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Save Vehicle</button>
        </form>
      </div>

      <div id="fleetVehiclesList">Loading vehicles...</div>
    </div>
  `;
  loadVehicles();
}

function showAddVehicleModal() {
  const box = document.getElementById('addVehicleBox');
  if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

async function loadVehicles() {
  try {
    const vehicles = await api('/api/vehicles/my');
    document.getElementById('fleetVehiclesList').innerHTML = vehicles.length
      ? `<div class="grid-2">` + vehicles
          .map(
            (v) =>
              `<div style="padding:18px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg-input);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <strong style="font-size:1.1rem;">${v.make} ${v.model}</strong>
                  <span class="badge badge-accent">${v.plate_number || 'No Plate'}</span>
                </div>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">Year: ${v.year || 2022} · Status: Active Fleet</p>
                <div style="display:flex; gap:8px;">
                  <button class="btn btn-primary btn-sm" onclick="quickDispatchForVehicle(${v.id}, '${v.make} ${v.model} (${v.plate_number})')">🚨 Quick Repair Dispatch</button>
                </div>
              </div>`
          )
          .join('') + `</div>`
      : `<p style="color:var(--text-muted);">No fleet vehicles registered yet. Click '+ Add New Vehicle' above to get started.</p>`;
  } catch (err) {}
}

async function renderPortalFleetDispatch() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `
    <div class="card">
      <h2>🚨 Fleet Repair & Towing Dispatch</h2>
      <p style="color:var(--text-muted); margin-bottom:16px;">Select any vehicle in your fleet to dispatch an emergency mobile mechanic or flatbed tow truck.</p>

      <form onsubmit="return handleFleetDispatchSubmit(event)">
        <div class="form-group">
          <label>Select Fleet Vehicle</label>
          <select id="dispatchVehicleSelect" class="form-control" required>
            <option value="">Loading vehicles...</option>
          </select>
        </div>

        <div class="form-group">
          <label>Dispatch Type</label>
          <select id="dispatchType" class="form-control">
            <option value="emergency">🚨 Emergency Breakdown Repair (Mobile Mechanic)</option>
            <option value="towing">🚛 Flatbed Towing Recovery</option>
            <option value="quotation">💬 Request Repair Quotes</option>
          </select>
        </div>

        <div class="form-group">
          <label>Breakdown Location & Driver Phone</label>
          <input type="text" id="dispatchLocation" class="form-control" placeholder="e.g. Eldoret Highway, Driver: Alex 0712345678" required>
        </div>

        <div class="form-group">
          <label>Problem Description</label>
          <textarea id="dispatchDesc" class="form-control" placeholder="Describe the mechanical issue..." required></textarea>
        </div>

        <button type="submit" class="btn btn-primary" style="width:100%;">Dispatch Now</button>
      </form>
    </div>
  `;
  populateFleetDropdown();
}

async function populateFleetDropdown() {
  try {
    const vehicles = await api('/api/vehicles/my');
    const sel = document.getElementById('dispatchVehicleSelect');
    if (sel && vehicles.length) {
      sel.innerHTML = vehicles.map(v => `<option value="${v.id}">${v.make} ${v.model} - ${v.plate_number}</option>`).join('');
    } else if (sel) {
      sel.innerHTML = `<option value="">No registered vehicles found - Add one in Vehicle Fleet tab</option>`;
    }
  } catch (err) {}
}

function quickDispatchForVehicle(vId, vName) {
  showPortalTab('fleetDispatch');
  setTimeout(() => {
    const sel = document.getElementById('dispatchVehicleSelect');
    if (sel) sel.value = vId;
  }, 100);
}

async function handleFleetDispatchSubmit(e) {
  e.preventDefault();
  const vId = document.getElementById('dispatchVehicleSelect').value;
  const dType = document.getElementById('dispatchType').value;
  const loc = document.getElementById('dispatchLocation').value;
  const desc = document.getElementById('dispatchDesc').value;

  if (dType === 'towing') {
    try {
      const res = await api('/api/towing/request', { method: 'POST', body: { lat: state.coords?.lat, lng: state.coords?.lng } });
      toast(`🚛 Towing dispatched: ${res.assignedPartner ? res.assignedPartner.name : 'Tow Partner'}`);
    } catch (err) { toast(err.message); }
  } else {
    try {
      await api('/api/requests', {
        method: 'POST',
        body: {
          title: `FLEET DISPATCH - ${loc}`,
          description: desc,
          urgency: 'emergency',
          request_type: dType,
          vehicle_id: vId,
          lat: state.coords?.lat,
          lng: state.coords?.lng
        }
      });
      toast('🚀 Fleet repair request dispatched to mechanics!');
    } catch (err) { toast(err.message); }
  }
  return false;
}

async function renderPortalFleetHistory() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `
    <div class="card">
      <h2>📖 Fleet Service History & Expense Logs</h2>
      <p style="color:var(--text-muted); margin-bottom:16px;">Comprehensive repair costs and maintenance history per fleet vehicle.</p>
      
      <div id="fleetExpensesSummary" class="grid-3" style="margin-bottom:20px;">
        <div class="card" style="margin:0; padding:16px;">
          <h3 style="color:var(--accent);">KES 14,500</h3>
          <p style="font-size:0.85rem; color:var(--text-muted);">Total Repair Expenses</p>
        </div>
        <div class="card" style="margin:0; padding:16px;">
          <h3 style="color:var(--emerald);">3 Repairs</h3>
          <p style="font-size:0.85rem; color:var(--text-muted);">Completed Services</p>
        </div>
        <div class="card" style="margin:0; padding:16px;">
          <h3 style="color:var(--blue-neon);">100%</h3>
          <p style="font-size:0.85rem; color:var(--text-muted);">Fleet Readiness Rate</p>
        </div>
      </div>

      <div id="fleetHistoryTableContainer">Loading service history...</div>
    </div>
  `;
  loadFleetHistory();
}

async function loadFleetHistory() {
  try {
    const vehicles = await api('/api/vehicles/my');
    if (!vehicles.length) {
      document.getElementById('fleetHistoryTableContainer').innerHTML = `<p style="color:var(--text-muted);">No vehicles in fleet yet.</p>`;
      return;
    }
    const vId = vehicles[0].id;
    const history = await api(`/api/vehicles/${vId}/history`);
    document.getElementById('fleetHistoryTableContainer').innerHTML = history.length
      ? history.map(h => `
        <div style="padding:14px; border:1px solid var(--border); border-radius:var(--radius-sm); margin-bottom:10px; background:var(--bg-input); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${h.description}</strong>
            <p style="font-size:0.85rem; color:var(--text-muted);">Serviced by: ${h.mechanic_name || 'Verified Technician'} · ${new Date(h.serviced_at).toLocaleDateString()}</p>
          </div>
          <div>
            <span class="badge badge-accent" style="font-size:0.9rem;">KES ${h.cost ? Number(h.cost).toLocaleString() : '3,500'}</span>
          </div>
        </div>
      `).join('')
      : `<p style="color:var(--text-muted);">No recorded service history entries yet.</p>`;
  } catch (err) {}
}


async function loadVehicles() {
  try {
    const vehicles = await api('/api/vehicles/my');
    document.getElementById('fleetVehiclesList').innerHTML = vehicles.length
      ? vehicles
          .map(
            (v) =>
              `<div style="padding:12px; border:1px solid var(--border); border-radius:var(--radius-sm); margin-bottom:10px; background:var(--bg-input);">
                <strong>${v.make} ${v.model} (${v.plate_number})</strong>
              </div>`
          )
          .join('')
      : `<p style="color:var(--text-muted);">No fleet vehicles added yet.</p>`;
  } catch (err) {}
}

async function addVehicle(e) {
  e.preventDefault();
  try {
    await api('/api/vehicles', {
      method: 'POST',
      body: {
        make: document.getElementById('vMake').value,
        model: document.getElementById('vModel').value,
        plate_number: document.getElementById('vPlate').value
      }
    });
    toast('Vehicle added!');
    loadVehicles();
  } catch (err) { toast(err.message); }
  return false;
}

// 8. ROAD TRIP READY VIEW
async function renderPortalRoadTrip() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `
    <div class="card">
      <h2>🧭 Road Trip Ready Clearance</h2>
      <p style="color:var(--text-muted); margin-bottom:16px;">Schedule pre-journey comprehensive inspection & request travel companion mechanics.</p>

      <form onsubmit="return requestInspection(event)">
        <div class="form-group">
          <label>Request Travel Companion Mechanic</label>
          <select id="inspCompanion" class="form-control">
            <option value="false">No, standard pre-journey inspection only</option>
            <option value="true">Yes, request mobile mechanic travel companion</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Schedule Clearance Inspection</button>
      </form>
    </div>
  `;
}

async function requestInspection(e) {
  e.preventDefault();
  try {
    await api('/api/inspections', {
      method: 'POST',
      body: {
        travel_companion_requested: document.getElementById('inspCompanion').value === 'true',
        mechanic_id: 101
      }
    });
    toast('Inspection request sent to top-rated mechanic!');
  } catch (err) { toast(err.message); }
  return false;
}

// 9. SAFETY CENTER & PANIC BUTTON VIEW
async function renderPortalSafety() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `
    <div class="card">
      <h2>🛡️ Safety Center & Emergency Contacts</h2>
      <p style="color:var(--text-muted); margin-bottom:16px;">Save trusted family/friends who will be notified if you trigger panic alert.</p>

      <form onsubmit="return addContact(event)" style="margin-bottom:24px;">
        <div class="grid-3">
          <div class="form-group"><label>Name</label><input type="text" id="cName" class="form-control" required placeholder="Jane Doe"></div>
          <div class="form-group"><label>Phone</label><input type="tel" id="cPhone" class="form-control" required placeholder="0711223344"></div>
          <div class="form-group"><label>Relationship</label><input type="text" id="cRel" class="form-control" placeholder="Spouse / Parent"></div>
        </div>
        <button type="submit" class="btn btn-secondary btn-sm">Add Emergency Contact</button>
      </form>

      <div class="card" style="background:rgba(239,68,68,0.1); border-color:var(--danger);">
        <h3 style="color:var(--danger);">🚨 Panic Emergency Trigger</h3>
        <p style="color:var(--text-muted); margin:8px 0;">Instantly broadcasts your live GPS location to your emergency contacts.</p>
        <button class="btn btn-danger" onclick="triggerPanic()">Trigger Panic Alert Now</button>
      </div>
    </div>
  `;
}

async function addContact(e) {
  e.preventDefault();
  try {
    await api('/api/safety/contacts', {
      method: 'POST',
      body: {
        name: document.getElementById('cName').value,
        phone: document.getElementById('cPhone').value,
        relationship: document.getElementById('cRel').value
      }
    });
    toast('Emergency contact added!');
  } catch (err) { toast(err.message); }
  return false;
}

async function triggerPanic() {
  if (!confirm('Broadcast emergency alert with your live GPS location to contacts?')) return;
  try {
    const res = await api('/api/safety/panic', { method: 'POST', body: state.coords || {} });
    toast(`🚨 Panic alert dispatched to ${res.contactsNotified} contacts!`);
  } catch (err) { toast(err.message); }
}

async function triggerSOS() {
  if (!state.token) {
    openAuthModal('login');
    return;
  }
  if (!confirm('Broadcast immediate emergency SOS to 3 nearest mechanics?')) return;
  try {
    const res = await api('/api/sos', { method: 'POST', body: state.coords || { lat: -0.3667, lng: 35.2833 } });
    toast(`🚨 SOS broadcast to ${res.notifiedMechanics} nearby emergency mechanics!`);
  } catch (err) { toast(err.message); }
}

// 10. ADMIN DASHBOARD & VERIFICATION QUEUE
async function renderAdminStatsView() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `<div class="card"><h2>📊 Platform Analytics Overview</h2><div id="adminStatsGrid" class="grid-3" style="margin-top:16px;">Loading stats...</div></div>`;
  try {
    const s = await api('/api/admin/stats');
    const items = [
      ['Total Platform Users', s.userCounts.total_users],
      ['Registered Mechanics', s.userCounts.mechanics],
      ['Verified Mechanics', s.mechanicVerification.verified || 0],
      ['Completed Repairs', s.jobCounts.completed || 0],
      ['Open Breakdown Requests', s.requestCounts.open_requests || 0],
      ['Total SOS Broadcasts', s.sosCounts.total_sos || 0]
    ];
    document.getElementById('adminStatsGrid').innerHTML = items.map(([label, val]) => `
      <div class="card" style="margin:0; padding:20px;">
        <h3 style="font-size:2rem; color:var(--accent);">${val}</h3>
        <p style="font-size:0.85rem; color:var(--text-muted);">${label}</p>
      </div>
    `).join('');
  } catch (err) {}
}

async function renderAdminPendingView() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `<div class="card"><h2>✅ Mechanic Verification Queue</h2><p style="color:var(--text-muted); margin-bottom:16px;">Review uploaded National IDs and trade certifications to promote mechanics to Verified or Elite status.</p><div id="adminPendingList">Loading verification queue...</div></div>`;
  try {
    const rows = await api('/api/admin/pending');
    document.getElementById('adminPendingList').innerHTML = rows.length ? rows.map(m => `
      <div style="padding:18px; border:1px solid var(--border); border-radius:var(--radius-md); margin-bottom:14px; background:var(--bg-input);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="font-size:1.1rem;">${m.name}</strong>
            <p style="font-size:0.85rem; color:var(--text-muted);">${m.email} · ${m.phone || 'No phone'}</p>
          </div>
          <span class="badge badge-warn">Pending Audit</span>
        </div>

        <div style="margin:12px 0; font-size:0.85rem;">
          ${m.id_document_url ? `📄 <a href="${m.id_document_url}" target="_blank">View National ID Document</a>` : '❌ <span style="color:var(--text-faint);">No ID uploaded</span>'}<br>
          ${m.cert_document_url ? `📜 <a href="${m.cert_document_url}" target="_blank">View Trade Certification</a>` : '❌ <span style="color:var(--text-faint);">No Certification uploaded</span>'}
        </div>

        <div style="display:flex; gap:12px; align-items:center; margin-top:14px;">
          <label style="font-size:0.85rem; color:var(--text-muted);">Assign Trust Tier:</label>
          <select id="trustTier-${m.user_id}" class="form-control" style="width:auto; padding:6px 12px; font-size:0.85rem;">
            <option value="verified">Verified Tier (Standard Jobs)</option>
            <option value="elite">Elite Tier (24/7 Emergency SOS Eligible)</option>
          </select>
          <button class="btn btn-primary btn-sm" onclick="approveMechanic(${m.user_id}, true)">Approve & Promote</button>
          <button class="btn btn-ghost btn-sm" onclick="approveMechanic(${m.user_id}, false)">Reject</button>
        </div>
      </div>
    `).join('') : `<p style="color:var(--text-muted);">No pending mechanic verification submissions at this time.</p>`;
  } catch (err) {}
}

async function approveMechanic(userId, approve) {
  try {
    const tier = approve ? document.getElementById(`trustTier-${userId}`).value : 'standard';
    await api(`/api/mechanics/${userId}/verify`, {
      method: 'PUT',
      body: { is_verified: approve, trust_tier: tier, sos_eligible: approve && tier === 'elite' }
    });
    toast(approve ? `Mechanic approved and promoted to ${tier.toUpperCase()} tier!` : 'Mechanic rejected');
    renderAdminPendingView();
  } catch (err) { toast(err.message); }
}


async function renderAdminMechanicsView() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `<div class="card"><h2>🔧 Registered Mechanics</h2><div id="adminMechList">Loading...</div></div>`;
  try {
    const mechs = await api('/api/admin/mechanics');
    document.getElementById('adminMechList').innerHTML = mechs.map(m => `
      <div style="padding:10px 0; border-bottom:1px solid var(--border);">
        <strong>${m.name}</strong> · Tier: <span class="trust-tier-tag tier-${m.trust_tier}">${m.trust_tier}</span> · Rating: ⭐ ${m.rating_avg || '5.0'}
      </div>
    `).join('');
  } catch (err) {}
}

async function renderAdminUsersView() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `<div class="card"><h2>👥 Platform User Directory</h2><div id="adminUserList">Loading...</div></div>`;
  try {
    const users = await api('/api/admin/users');
    document.getElementById('adminUserList').innerHTML = users.map(u => `
      <div style="padding:10px 0; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;">
        <span><strong>${u.name}</strong> (${u.email})</span>
        <span class="badge badge-accent">${u.role}</span>
      </div>
    `).join('');
  } catch (err) {}
}
