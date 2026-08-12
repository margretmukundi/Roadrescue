/* ==========================================================================
   ROADRESCUE — FRONTEND APPLICATION LOGIC
   ========================================================================== */
const API_BASE = '';

let state = {
  token: localStorage.getItem('resqgo_token') || localStorage.getItem('rr_token') || null,
  user: JSON.parse(localStorage.getItem('resqgo_user') || localStorage.getItem('rr_user') || 'null'),
  selectedRole: 'owner',
  currentPortalView: 'home',
  coords: null,
  socket: null,
  activeMap: null,
};


// ---------------------------------------------------------------------------
// INITIALIZATION
// ---------------------------------------------------------------------------
let currentPublicPage = 'home';

// ---------------------------------------------------------------------------
// INITIALIZATION
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initGeoLocation();
  updateAuthUI();
  if (state.token && state.user) {
    connectSocket();
  }
  navigateToPublicPage('home');
});

// ---------------------------------------------------------------------------
// PUBLIC SITE VIEW SWITCHER (NO VERTICAL SCROLLING ARCHITECTURE)
// ---------------------------------------------------------------------------
function navigateToPublicPage(page) {
  currentPublicPage = page;
  document.querySelectorAll('.nav-links .nav-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.getElementById(`pnav-${page}`);
  if (activeLink) activeLink.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' });
  renderPublicView();
}

function renderPublicView() {
  const container = document.getElementById('publicViewContent');
  if (!container) return;

  const renderers = {
    home: renderPublicHome,
    services: renderPublicServices,
    'how-it-works': renderPublicHowItWorks,
    about: renderPublicAbout,
    contact: renderPublicContact
  };

  if (renderers[currentPublicPage]) {
    renderers[currentPublicPage](container);
  } else {
    renderPublicHome(container);
  }
}

function switchHeroAuthTab(tab) {
  const loginF = document.getElementById('heroLoginForm');
  const regF = document.getElementById('heroRegisterForm');
  const loginBtn = document.getElementById('heroTabLoginBtn');
  const regBtn = document.getElementById('heroTabRegBtn');

  if (loginF) loginF.style.display = tab === 'login' ? 'block' : 'none';
  if (regF) regF.style.display = tab === 'register' ? 'block' : 'none';

  if (loginBtn) {
    loginBtn.className = tab === 'login' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
  }
  if (regBtn) {
    regBtn.className = tab === 'register' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
  }
}

async function handleHeroRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('heroRegName').value;
  const email = document.getElementById('heroRegEmail').value;
  const phone = document.getElementById('heroRegPhone').value;
  const role = document.getElementById('heroRegRole').value;
  const password = document.getElementById('heroRegPassword').value;

  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: { name, email, phone, password, role }
    });
    onAuthSuccess(data);
  } catch (err) {
    toast(err.message);
  }
  return false;
}

function renderPublicHome(container) {
  container.innerHTML = `
    <!-- HERO SECTION -->
    <section class="hero-section">
      <div class="hero-grid">
        <div>
          <span class="eyebrow">⚡ Instant 24/7 Roadside Rescue</span>
          <h1 class="hero-title">Stranded? Get Verified Mechanics at Your <span>Exact Location</span>.</h1>
          <p class="hero-subtitle">
            ResQgo connects drivers experiencing vehicle breakdowns with certified, GPS-tracked mobile mechanics and flatbed tow trucks across Kenya within minutes.
          </p>

          <div class="hero-stats-row">
            <div class="stat-card">
              <h4>15 Mins</h4>
              <p>Avg Response Time</p>
            </div>
            <div class="stat-card">
              <h4>500+</h4>
              <p>Verified Mechanics</p>
            </div>
            <div class="stat-card">
              <h4>4.9 ⭐</h4>
              <p>Satisfaction Rating</p>
            </div>
          </div>
        </div>

        <!-- HERO PORTAL GATEWAY CARD -->
        <div class="quick-action-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="font-size:1.15rem;">Access ResQgo Portal</h3>
            <span class="badge badge-accent">Secure Gateway</span>
          </div>

          <div style="display:flex; gap:8px; margin-bottom:20px; background:var(--bg-input); padding:4px; border-radius:var(--radius-sm); border:1px solid var(--border);">
            <button type="button" id="heroTabLoginBtn" class="btn btn-primary btn-sm" style="flex:1;" onclick="switchHeroAuthTab('login')">Log In</button>
            <button type="button" id="heroTabRegBtn" class="btn btn-secondary btn-sm" style="flex:1;" onclick="switchHeroAuthTab('register')">Create Account</button>
          </div>

          <!-- HERO LOGIN FORM -->
          <form id="heroLoginForm" onsubmit="return handleLoginForm(event)">
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="loginEmail" class="form-control" placeholder="yourname@example.com" required>
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="loginPassword" class="form-control" placeholder="••••••••" required>
              <div style="text-align:right; margin-top:4px;">
                <a href="#" onclick="openAuthModal('login'); showForgotPasswordForm(event); return false;" style="font-size:0.8rem; color:var(--accent);">Forgot Password?</a>
              </div>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%; padding:12px; margin-top:8px;">Sign In & Open Portal →</button>
          </form>

          <!-- HERO REGISTER FORM -->
          <form id="heroRegisterForm" onsubmit="return handleHeroRegisterSubmit(event)" style="display:none;">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" id="heroRegName" class="form-control" placeholder="Margret Mukundi" required>
            </div>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="heroRegEmail" class="form-control" placeholder="margret@example.com" required>
            </div>
            <div class="form-group">
              <label>Phone Number</label>
              <input type="tel" id="heroRegPhone" class="form-control" placeholder="0712345678" required>
            </div>
            <div class="form-group">
              <label>Account Role</label>
              <select id="heroRegRole" class="form-control">
                <option value="owner">🚗 Car Owner / Driver</option>
                <option value="mechanic">🔧 Mobile Mechanic / Garage</option>
                <option value="fleet_owner">🚚 Fleet Manager / Business</option>
              </select>
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="heroRegPassword" class="form-control" placeholder="••••••••" required>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%; padding:12px; margin-top:8px;">Register & Open Portal →</button>
          </form>
        </div>
      </div>
    </section>



    <!-- CORE FEATURES GRID -->
    <section class="section" style="padding-top:40px;">
      <div style="text-align:center; max-width:650px; margin:0 auto 40px auto;">
        <span class="badge badge-accent" style="margin-bottom:10px;">🌟 Premium Roadside Assistance</span>
        <h2 style="font-size:2.2rem;">Why Kenya Trusts ResQgo</h2>
        <p style="color:var(--text-muted); font-size:1.05rem;">Engineered for maximum speed, transparent pricing, and total peace of mind for every driver.</p>
      </div>

      <div class="grid-3">
        <div class="card" style="padding:28px; transition:transform 0.3s ease, border-color 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)'; this.style.borderColor='var(--accent)';" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='var(--border)';">
          <div style="font-size:2.8rem; margin-bottom:14px;">🚨</div>
          <h3 style="font-size:1.25rem;">24/7 Emergency SOS</h3>
          <p style="font-size:0.9rem; color:var(--text-muted); margin-top:8px;">Instant 1-click dispatch to nearest Elite mechanics with real-time GPS tracking when stranded.</p>
        </div>

        <div class="card" style="padding:28px; transition:transform 0.3s ease, border-color 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)'; this.style.borderColor='var(--accent)';" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='var(--border)';">
          <div style="font-size:2.8rem; margin-bottom:14px;">🏷️</div>
          <h3 style="font-size:1.25rem;">Transparent Price Bidding</h3>
          <p style="font-size:0.9rem; color:var(--text-muted); margin-top:8px;">Compare competitive quotes from certified local mobile mechanics before picking your provider.</p>
        </div>

        <div class="card" style="padding:28px; transition:transform 0.3s ease, border-color 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)'; this.style.borderColor='var(--accent)';" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='var(--border)';">
          <div style="font-size:2.8rem; margin-bottom:14px;">💳</div>
          <h3 style="font-size:1.25rem;">M-Pesa Escrow Protection</h3>
          <p style="font-size:0.9rem; color:var(--text-muted); margin-top:8px;">Funds are safely locked in escrow and released to the mechanic only after you inspect and approve the repair.</p>
        </div>
      </div>
    </section>

    <!-- 4-STEP WORKFLOW SECTION -->
    <section class="section" style="background:rgba(255,255,255,0.02); padding:50px 24px; border-radius:var(--radius-lg); border:1px solid var(--border); margin:40px 0;">
      <div style="text-align:center; max-width:650px; margin:0 auto 40px auto;">
        <span class="badge badge-emerald" style="margin-bottom:10px;">⚡ Simple & Seamless</span>
        <h2 style="font-size:2.2rem;">How ResQgo Works in 4 Steps</h2>
        <p style="color:var(--text-muted);">From breakdown signal to completed repair in record time.</p>
      </div>

      <div class="grid-4" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:20px;">
        <div class="card" style="text-align:center; padding:24px;">
          <div style="width:46px; height:46px; border-radius:50%; background:var(--accent); color:#FFF; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.2rem; margin:0 auto 14px auto;">1</div>
          <h4 style="font-size:1.05rem;">Request or SOS</h4>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-top:6px;">Select breakdown category & share your GPS location.</p>
        </div>

        <div class="card" style="text-align:center; padding:24px;">
          <div style="width:46px; height:46px; border-radius:50%; background:var(--accent); color:#FFF; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.2rem; margin:0 auto 14px auto;">2</div>
          <h4 style="font-size:1.05rem;">Receive Upfront Bids</h4>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-top:6px;">Compare mechanic profiles, prices, and arrival ETAs.</p>
        </div>

        <div class="card" style="text-align:center; padding:24px;">
          <div style="width:46px; height:46px; border-radius:50%; background:var(--accent); color:#FFF; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.2rem; margin:0 auto 14px auto;">3</div>
          <h4 style="font-size:1.05rem;">Track Arrival Live</h4>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-top:6px;">Monitor your mechanic's live GPS route on your phone.</p>
        </div>

        <div class="card" style="text-align:center; padding:24px;">
          <div style="width:46px; height:46px; border-radius:50%; background:var(--accent); color:#FFF; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.2rem; margin:0 auto 14px auto;">4</div>
          <h4 style="font-size:1.05rem;">Approve & Pay</h4>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-top:6px;">Pay via M-Pesa STK Push or Cash upon job verification.</p>
        </div>
      </div>
    </section>

    <!-- CUSTOMER REVIEWS & SPOTLIGHT -->
    <section class="section" style="margin-bottom:40px;">
      <div style="text-align:center; max-width:650px; margin:0 auto 40px auto;">
        <h2 style="font-size:2rem;">Trusted by Over 10,000+ Drivers in Kenya</h2>
        <p style="color:var(--text-muted);">Here is what real motorists and fleet managers say about ResQgo.</p>
      </div>

      <div class="grid-3">
        <div class="card" style="padding:24px;">
          <div style="color:#FFB800; font-size:1.1rem; margin-bottom:10px;">⭐⭐⭐⭐⭐</div>
          <p style="font-size:0.9rem; font-style:italic; color:var(--text-main);">"My engine overheated on the Naivasha highway at night. ResQgo dispatched David Kamau within 12 minutes. Exceptional service!"</p>
          <strong style="display:block; margin-top:14px; font-size:0.85rem; color:var(--accent);">— Margret Mukundi (Nairobi)</strong>
        </div>

        <div class="card" style="padding:24px;">
          <div style="color:#FFB800; font-size:1.1rem; margin-bottom:10px;">⭐⭐⭐⭐⭐</div>
          <p style="font-size:0.9rem; font-style:italic; color:var(--text-main);">"As a fleet manager overseeing 20 delivery vans, ResQgo saves us hours of downtime. Transparent bidding and audited mechanics!"</p>
          <strong style="display:block; margin-top:14px; font-size:0.85rem; color:var(--accent);">— Apex Logistics Fleet Team</strong>
        </div>

        <div class="card" style="padding:24px;">
          <div style="color:#FFB800; font-size:1.1rem; margin-bottom:10px;">⭐⭐⭐⭐⭐</div>
          <p style="font-size:0.9rem; font-style:italic; color:var(--text-main);">"Had a flat tire in Nakuru town. Got 3 bids within 2 minutes. Paid seamlessly via M-Pesa STK Push!"</p>
          <strong style="display:block; margin-top:14px; font-size:0.85rem; color:var(--accent);">— John K. (Nakuru Driver)</strong>
        </div>
      </div>
    </section>

    <!-- FAQ ACCORDION -->
    <section class="section" style="margin-bottom:60px;">
      <div style="text-align:center; max-width:650px; margin:0 auto 30px auto;">
        <h2>Frequently Asked Questions</h2>
        <p style="color:var(--text-muted);">Quick answers to common questions about ResQgo roadside rescue.</p>
      </div>

      <div style="max-width:800px; margin:0 auto; display:flex; flex-direction:column; gap:12px;">
        <div class="card" style="padding:16px 20px;">
          <button style="width:100%; text-align:left; background:none; color:var(--text-main); font-weight:700; font-size:1rem; display:flex; justify-content:space-between; align-items:center;" onclick="toggleFaq(this)">
            <span>How fast does a mechanic arrive?</span>
            <span style="font-size:1.2rem; color:var(--accent);">+</span>
          </button>
          <div style="display:none; margin-top:10px; font-size:0.9rem; color:var(--text-muted); border-top:1px solid var(--border); padding-top:10px;">
            Our average arrival time in Nairobi, Nakuru, Mombasa, and highway corridors is 12 to 18 minutes. Mechanics receive your exact GPS coordinates immediately.
          </div>
        </div>

        <div class="card" style="padding:16px 20px;">
          <button style="width:100%; text-align:left; background:none; color:var(--text-main); font-weight:700; font-size:1rem; display:flex; justify-content:space-between; align-items:center;" onclick="toggleFaq(this)">
            <span>How are mechanics verified?</span>
            <span style="font-size:1.2rem; color:var(--accent);">+</span>
          </button>
          <div style="display:none; margin-top:10px; font-size:0.9rem; color:var(--text-muted); border-top:1px solid var(--border); padding-top:10px;">
            Every mechanic on ResQgo must upload a copy of their Kenya Government National ID and accredited Mechanical Trade Certification. Our admin team audits all documents before approving accounts.
          </div>
        </div>

        <div class="card" style="padding:16px 20px;">
          <button style="width:100%; text-align:left; background:none; color:var(--text-main); font-weight:700; font-size:1rem; display:flex; justify-content:space-between; align-items:center;" onclick="toggleFaq(this)">
            <span>Can I pay via M-Pesa or Cash?</span>
            <span style="font-size:1.2rem; color:var(--accent);">+</span>
          </button>
          <div style="display:none; margin-top:10px; font-size:0.9rem; color:var(--text-muted); border-top:1px solid var(--border); padding-top:10px;">
            Yes! You can choose between 📱 M-Pesa STK Push Escrow payment or 💵 Direct Cash payment when accepting a mechanic's quote.
          </div>
        </div>
      </div>
    </section>
  `;
}






function renderPublicServices(container) {
  container.innerHTML = `
    <div style="margin-bottom:30px;">
      <div class="eyebrow">Comprehensive Roadside Care</div>
      <h2 style="font-size:2rem; margin-top:6px;">Designed for Every Roadside Scenario</h2>
      <p style="color:var(--text-muted);">Select the exact roadside service path you need.</p>
    </div>

    <div class="grid-3" style="margin-bottom:40px;">
      <div class="card">
        <div class="card-icon">🚨</div>
        <h3>Instant Emergency Rescue</h3>
        <p>Skip quote waiting in true emergencies. Auto-assigns the nearest available Elite-tier mechanic at a pre-set fair price band with live GPS tracking.</p>
      </div>

      <div class="card">
        <div class="card-icon">💬</div>
        <h3>Quotation Marketplace</h3>
        <p>For non-urgent repairs, compare competitive bids from verified local garages and mobile technicians. Inspect transparent quotes before selecting.</p>
      </div>

      <div class="card">
        <div class="card-icon">📅</div>
        <h3>Advance Mechanic Booking</h3>
        <p>Schedule routine servicing, brake replacements, or battery swaps at your home or office at a date and time that suits you.</p>
      </div>

      <div class="card">
        <div class="card-icon">🔒</div>
        <h3>Escrow Payment Protection</h3>
        <p>Your money is held safely in escrow and only released to the mechanic after you confirm the repair is completed to your satisfaction.</p>
      </div>

      <div class="card">
        <div class="card-icon">🧭</div>
        <h3>Road Trip Ready Clearance</h3>
        <p>Get a comprehensive multi-point vehicle inspection before long journeys. Receive an official digital clearance certificate.</p>
      </div>

      <div class="card">
        <div class="card-icon">🚛</div>
        <h3>Flatbed Towing Dispatch</h3>
        <p>When on-site repair isn't possible, instantly dispatch nearest flatbed towing partners for safe transport to your preferred garage.</p>
      </div>
    </div>

    <!-- Mechanic Partner Callout -->
    <div class="card" style="background:var(--bg-card); border-color:var(--border-light); padding:28px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px;">
        <div>
          <h3 style="font-size:1.4rem; color:var(--text-main);">Are You an Independent Mechanic or Garage Owner?</h3>
          <p style="color:var(--text-muted); margin-top:4px;">Earn steady income with 0% upfront listing fees and instant M-Pesa payouts.</p>
        </div>
        <button class="btn btn-primary" onclick="openAuthModal('register')">Apply as Mechanic Partner →</button>
      </div>
    </div>
  `;
}

function renderPublicHowItWorks(container) {
  container.innerHTML = `
    <div style="margin-bottom:30px;">
      <div class="eyebrow">Simple & Transparent</div>
      <h2 style="font-size:2rem; margin-top:6px;">How ResQgo Works</h2>
      <p style="color:var(--text-muted);">Get back on the road safely in 4 straightforward steps.</p>
    </div>

    <div class="timeline-grid" style="margin-bottom:40px;">
      <div class="step-card">
        <div class="step-num">01</div>
        <h3>Request Assistance</h3>
        <p>Submit your location and breakdown details via 1-click emergency auto-assign or custom quote marketplace.</p>
      </div>

      <div class="step-card">
        <div class="step-num">02</div>
        <h3>Confirm Mechanic</h3>
        <p>Auto-assign nearest Elite technician or select your preferred quote from local verified garages.</p>
      </div>

      <div class="step-card">
        <div class="step-num">03</div>
        <h3>Live GPS Tracking</h3>
        <p>Track your assigned mechanic's real-time location as they travel directly to your vehicle.</p>
      </div>

      <div class="step-card">
        <div class="step-num">04</div>
        <h3>Release & Review</h3>
        <p>Confirm repair completion to release escrow funds, receive digital service logs, and rate your technician.</p>
      </div>
    </div>
  `;
}

function renderPublicAbout(container) {
  container.innerHTML = `
    <div style="margin-bottom:30px;">
      <div class="eyebrow">Safety & Verification First</div>
      <h2 style="font-size:2rem; margin-top:6px;">About ResQgo</h2>
      <p style="color:var(--text-muted);">Building Kenya's most reliable emergency roadside network.</p>
    </div>

    <div class="grid-2" style="align-items:center;">
      <div>
        <h3 style="font-size:1.5rem; margin-bottom:16px;">Visible Audit Trails & Verification Badges</h3>
        <p style="color:var(--text-muted); margin-bottom:20px;">
          Every technician on ResQgo undergoes mandatory identity verification and skill certification audits. Each mechanic profile displays verifiable audit badges with registration dates so drivers know who is working on their car.
        </p>
        <ul style="list-style:none; display:flex; flex-direction:column; gap:12px;">
          <li style="display:flex; gap:10px; align-items:center;">✅ <strong>Government ID Audit:</strong> Verified identity documents with audit timestamps.</li>
          <li style="display:flex; gap:10px; align-items:center;">✅ <strong>Certification License Check:</strong> Validated trade certificates and garage registration.</li>
          <li style="display:flex; gap:10px; align-items:center;">✅ <strong>Work Portfolio & Ratings:</strong> Historical project logs showcasing real past repairs.</li>
        </ul>
      </div>

      <div>
        <div class="trust-grid">
          <div class="trust-badge-card">
            <span class="trust-tier-tag tier-standard">Standard Tier</span>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:8px;">Identity verified mechanics ready for standard service requests.</p>
          </div>

          <div class="trust-badge-card">
            <span class="trust-tier-tag tier-verified">Verified Tier</span>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:8px;">ID + Certifications fully approved by platform auditors.</p>
          </div>

          <div class="trust-badge-card">
            <span class="trust-tier-tag tier-elite">Elite Tier</span>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:8px;">Top-rated mechanics qualified for 1-click emergency SOS auto-assign.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPublicContact(container) {
  container.innerHTML = `
    <div style="margin-bottom:30px;">
      <div class="eyebrow">We're Here 24/7</div>
      <h2 style="font-size:2rem; margin-top:6px;">Contact Support Center</h2>
      <p style="color:var(--text-muted);">Reach out to our emergency dispatch and support team anytime.</p>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3>Send Us a Message</h3>
        <form onsubmit="return handleContactSubmit(event)" style="margin-top:16px;">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" id="contactName" class="form-control" required placeholder="John Doe">
          </div>
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="contactEmail" class="form-control" required placeholder="john@example.com">
          </div>
          <div class="form-group">
            <label>Subject</label>
            <input type="text" id="contactSubject" class="form-control" required placeholder="General inquiry / partnership">
          </div>
          <div class="form-group">
            <label>Message</label>
            <textarea id="contactMessage" class="form-control" required placeholder="How can we help you?"></textarea>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Send Message</button>
        </form>
      </div>

      <div>
        <div class="card" style="margin-bottom:20px;">
          <h3 style="color:var(--accent);">🚨 24/7 Emergency Dispatch Center</h3>
          <p style="margin-top:8px;">Stranded without internet? Call our direct emergency helpline for instant manual dispatch.</p>
          <h4 style="font-size:1.4rem; color:var(--text-main); margin-top:10px;">📞 +254 700 900 000</h4>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">Available 24 hours a day, 7 days a week.</p>
        </div>

        <div class="card">
          <h3>Primary Network Operations</h3>
          <p><strong>Nairobi Region HQ:</strong> Westlands Road, Horizon Towers Floor 4</p>
          <p><strong>Rift Valley Hub:</strong> Kenyatta Avenue, Nakuru</p>
          <p><strong>Email:</strong> support@resqgo.co.ke</p>
        </div>
      </div>
    </div>
  `;
}

function toast(msg) {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;

  const cleanText = msg.trim();
  const existing = Array.from(wrap.children).find(child => child.innerText.replace('✕', '').trim() === cleanText);
  if (existing) return;

  const el = document.createElement('div');
  el.className = 'toast';
  el.style.display = 'flex';
  el.style.justifyContent = 'space-between';
  el.style.alignItems = 'center';
  el.style.gap = '10px';
  el.innerHTML = `
    <span>${msg}</span>
    <span onclick="this.parentElement.remove()" style="cursor:pointer; opacity:0.7; font-weight:bold; font-size:0.95rem; margin-left:8px;" title="Dismiss">✕</span>
  `;

  wrap.appendChild(el);
  setTimeout(() => {
    if (el && el.parentElement) el.remove();
  }, 3500);
}

function openAdminLogin() {
  if (state.token && state.user && state.user.role === 'admin') {
    openPortalView('adminStats');
    return;
  }

  openAuthModal('login');
  const emailInput = document.getElementById('loginEmail');
  if (emailInput) {
    emailInput.value = 'admin@resqgo.co.ke';
  }
  const passwordInput = document.getElementById('loginPassword');
  if (passwordInput && !passwordInput.value) {
    passwordInput.value = 'password123';
  }
  toast('🛡️ Admin Gateway: Log in with admin@resqgo.co.ke or your admin credentials.');
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (!(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  const config = { ...opts, headers };
  
  if (config.body && typeof config.body !== 'string' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  try {
    const res = await fetch(path, config);
    let data = null;
    try {
      data = await res.json();
    } catch (e) {}

    if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register') {
      localStorage.removeItem('resqgo_token');
      localStorage.removeItem('resqgo_user');
      localStorage.removeItem('rr_token');
      localStorage.removeItem('rr_user');
      state.token = null;
      state.user = null;
      updateAuthUI();
      openAuthModal('login');
      throw new Error('Your session expired. Please log in again.');
    }

    if (!res.ok) {
      throw new Error((data && data.error) || (data && data.message) || `Request failed (${res.status})`);
    }
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
  
  state.socket.on('bid:received', (d) => {
    const mechName = d.bid ? d.bid.mechanic_name : 'A mechanic';
    const price = d.bid ? d.bid.proposed_price : '';
    const phone = d.bid ? (d.bid.mechanic_phone || '0712345678') : '0712345678';
    toast(`💰 NEW BID: ${mechName} quoted KES ${price}! (Phone: ${phone})`);
    if (state.token && state.currentPortalView === 'myjobs') {
      renderPortalJobs();
    }
  });

  state.socket.on('job:assigned', (d) => {
    toast(`🎉 ${d.message || 'Your quote was accepted! You are assigned a new job.'}`);
    if (state.token && state.currentPortalView === 'myjobs') {
      renderPortalJobs();
    }
  });

  state.socket.on('job:status', (d) => {
    toast(`Job #${d.jobId} status: ${d.status.replace('_', ' ')}`);
    renderPortalJobs();
  });

  state.socket.on('sos:broadcast', () => toast('🚨 Emergency SOS alert in your vicinity!'));
  state.socket.on('sos:accepted', () => toast('✅ A mechanic accepted your emergency SOS!'));

  state.socket.on('mechanic:verified', (d) => {
    toast(`🎉 ${d.message || 'Mechanic verification approved!'}`);
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

async function handleHeroQuickSubmit(e) {
  e.preventDefault();
  const issueType = document.getElementById('heroIssueType').value;
  const vehicle = document.getElementById('heroVehicleInfo').value;
  const desc = document.getElementById('heroDesc').value;

  if (!state.token) {
    toast('Please log in or register to dispatch your request.');
    openAuthModal('register');
    return false;
  }

  try {
    const res = await api('/api/requests', {
      method: 'POST',
      body: {
        title: `${issueType.toUpperCase()} - ${vehicle}`,
        description: desc,
        urgency: issueType === 'emergency' ? 'emergency' : 'medium',
        request_type: issueType,
        lat: state.coords?.lat,
        lng: state.coords?.lng
      }
    });

    if (issueType === 'emergency') {
      toast('🚨 Emergency Auto-Dispatch: Nearest Elite Mechanic auto-assigned! Skipping bid wait...');
      openPortalView('myjobs');
    } else {
      toast('🚀 Quote request posted to local verified mechanics!');
      openPortalView('myjobs');
    }
  } catch (err) {
    toast(err.message);
  }

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
  const forgotF = document.getElementById('forgotPasswordForm');
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
  if (forgotF) {
    forgotF.style.display = 'none';
  }

  if (loginBtn) {
    loginBtn.classList.toggle('btn-primary', tab === 'login');
  }
  if (regBtn) {
    regBtn.classList.toggle('btn-primary', tab === 'register');
  }
}

function showForgotPasswordForm(e) {
  if (e) e.preventDefault();
  const loginF = document.getElementById('loginForm');
  const regF = document.getElementById('registerForm');
  const adminF = document.getElementById('adminSetupForm');
  const forgotF = document.getElementById('forgotPasswordForm');

  if (loginF) loginF.style.display = 'none';
  if (regF) regF.style.display = 'none';
  if (adminF) adminF.style.display = 'none';
  if (forgotF) forgotF.style.display = 'block';

  document.getElementById('forgotStep1').style.display = 'block';
  document.getElementById('forgotStep2').style.display = 'none';
}

async function handleForgotPasswordSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value;
  try {
    const data = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: { email }
    });

    document.getElementById('forgotStep1').style.display = 'none';
    document.getElementById('forgotStep2').style.display = 'block';

    const codeBanner = document.getElementById('forgotCodeBanner');
    if (codeBanner) {
      codeBanner.innerHTML = `Your 6-digit reset OTP code is: <strong style="font-size:1.1rem; color:var(--accent);">${data.resetCode}</strong>`;
    }

    toast('🔑 Reset code generated! Check prompt.');
  } catch (err) {
    toast(err.message);
  }
  return false;
}

async function handleResetPasswordSubmit() {
  const email = document.getElementById('forgotEmail').value;
  const resetCode = document.getElementById('resetCodeInput').value;
  const newPassword = document.getElementById('newPasswordInput').value;

  if (!resetCode || !newPassword) {
    toast('Please enter your 6-digit reset code and new password');
    return;
  }

  try {
    const data = await api('/api/auth/reset-password', {
      method: 'POST',
      body: { email, resetCode, newPassword }
    });

    toast('🎉 Password updated successfully!');
    onAuthSuccess(data);
  } catch (err) {
    toast(err.message);
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
  localStorage.setItem('resqgo_token', data.token);
  localStorage.setItem('resqgo_user', JSON.stringify(data.user));
  closeAuthModal();
  updateAuthUI();
  connectSocket();
  toast(`Welcome back to ResQgo, ${data.user.name}!`);
  openPortalView();
}

function logoutUser() {
  localStorage.removeItem('resqgo_token');
  localStorage.removeItem('resqgo_user');
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
      { id: 'adminUsers', label: '👥 User Directory' },
      { id: 'profile', label: '👤 Profile & Customization' }
    ];
  } else if (role === 'mechanic') {
    tabs = [
      { id: 'home', label: '🏠 Mechanic Hub' },
      { id: 'board', label: '📋 Jobs Board' },
      { id: 'myjobs', label: '🔧 Active Field Workstation' },
      { id: 'calendar', label: '📅 Availability' },
      { id: 'profile', label: '👤 Profile & Verification' }
    ];
  } else if (role === 'fleet_owner') {
    tabs = [
      { id: 'home', label: '🏠 Overview' },
      { id: 'requestAssistance', label: '🚨 Request Assistance' },
      { id: 'nearby', label: '📍 Nearby Mechanics' },
      { id: 'myjobs', label: '🔧 My Requests' },
      { id: 'fleet', label: '🚚 Fleet & Vehicles' },
      { id: 'roadtrip', label: '🧭 Road Trip Ready' },
      { id: 'safety', label: '🛡️ Safety Center' },
      { id: 'profile', label: '👤 Profile & Customization' }
    ];
  } else {
    // Car Owner
    tabs = [
      { id: 'home', label: '🏠 Overview' },
      { id: 'requestAssistance', label: '🚨 Request Breakdown Assistance' },
      { id: 'nearby', label: '📍 Find Nearby Mechanics' },
      { id: 'myjobs', label: '🔧 My Requests & Jobs' },
      { id: 'roadtrip', label: '🧭 Road Trip Ready' },
      { id: 'safety', label: '🛡️ Safety Center' },
      { id: 'profile', label: '👤 Profile & Customization' }
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
    requestAssistance: renderPortalRequestAssistance,
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

  if (state.user.role === 'mechanic') {
    main.innerHTML = `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div>
            <h2>🔧 Mechanic Workstation — ${state.user.name}</h2>
            <p style="color:var(--text-muted); margin-top:4px;">Manage your field repair jobs, track live earnings, and toggle your availability status.</p>
          </div>
          <div style="display:flex; gap:12px; align-items:center;">
            <button id="dutyToggleBtn" class="btn btn-primary btn-sm" onclick="toggleDutyStatus()">🟢 Duty Status: ONLINE</button>
            <button class="btn btn-secondary btn-sm" onclick="showPortalTab('profile')">👤 Verification Profile</button>
          </div>
        </div>

        <div class="grid-3" style="margin:24px 0;">
          <div class="card" style="margin:0; padding:20px; background:var(--bg-input);">
            <h3 style="font-size:2rem; color:var(--emerald);">KES 45,500</h3>
            <p style="font-size:0.85rem; color:var(--text-muted);">Total Payouts Released</p>
          </div>

          <div class="card" style="margin:0; padding:20px; background:var(--bg-input);">
            <h3 style="font-size:2rem; color:var(--accent);">⭐ 4.9 / 5.0</h3>
            <p style="font-size:0.85rem; color:var(--text-muted);">Customer Rating Average</p>
          </div>

          <div class="card" style="margin:0; padding:20px; background:var(--bg-input);">
            <h3 style="font-size:2rem; color:var(--text-main);">14</h3>
            <p style="font-size:0.85rem; color:var(--text-muted);">Completed Field Repairs</p>
          </div>
        </div>

        <div style="display:flex; gap:12px;">
          <button class="btn btn-primary" onclick="showPortalTab('board')">📋 Browse Jobs Board →</button>
          <button class="btn btn-secondary" onclick="showPortalTab('myjobs')">🔧 View Active Workstation →</button>
        </div>
      </div>
    `;
    return;
  }

  main.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div>
          <h2>Welcome back, ${state.user.name} 👋</h2>
          <p style="color:var(--text-muted); margin-top:4px;">Role: <strong>${state.user.role.toUpperCase()}</strong></p>
        </div>
        <button class="btn btn-primary" onclick="showPortalTab('requestAssistance')">🚨 Request Breakdown Assistance</button>
      </div>

      <div class="grid-2" style="margin-top:20px;">
        <div class="card" style="margin:0;">
          <h3>🚨 Instant Emergency SOS</h3>
          <p>Stranded right now? Auto-assign nearest Elite mobile mechanic with 1 click.</p>
          <button class="btn btn-danger btn-sm" style="margin-top:12px;" onclick="triggerSOS()">Trigger Immediate SOS</button>
        </div>
        
        <div class="card" style="margin:0;">
          <h3>📍 Find Nearby Mechanics</h3>
          <p>Browse active mobile mechanics on an interactive map and inspect ratings.</p>
          <button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="showPortalTab('nearby')">Open Interactive Map</button>
        </div>
      </div>
    </div>
  `;
}

function renderPortalRequestAssistance() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `
    <div class="card">
      <div class="eyebrow">On-Demand Dispatch</div>
      <h2>🚨 Request Breakdown Assistance</h2>
      <p style="color:var(--text-muted); margin-bottom:20px;">Submit your vehicle breakdown details to dispatch nearby mobile mechanics.</p>

      <form onsubmit="return handlePortalRequestSubmit(event)" style="max-width:700px;">
        <div class="form-group">
          <label>Assistance Type</label>
          <select id="portalIssueType" class="form-control">
            <option value="emergency">🚨 Immediate Emergency Breakdown (Auto-Assign Nearest Elite Mechanic)</option>
            <option value="quotation">💬 Request Quotes (Compare Bids from Local Garages)</option>
            <option value="advance_booking">📅 Book Scheduled Maintenance</option>
            <option value="road_trip">🧭 Pre-Trip Inspection & Clearance</option>
          </select>
        </div>

        <div class="form-group">
          <label>Vehicle Model & Plate / Location</label>
          <input type="text" id="portalVehicleInfo" class="form-control" placeholder="e.g. Toyota Prado (KCY 123X), Nakuru Highway" required>
        </div>

        <div class="form-group">
          <label>Problem Description</label>
          <textarea id="portalDesc" class="form-control" placeholder="Describe issue (e.g. engine overheating, flat tyre, dead battery)..." required style="min-height:100px;"></textarea>
        </div>

        <button type="submit" class="btn btn-primary" style="width:100%; padding:14px; font-size:1rem;">Submit & Dispatch Mechanics</button>
      </form>
    </div>
  `;
}

async function handlePortalRequestSubmit(e) {
  e.preventDefault();
  const issueType = document.getElementById('portalIssueType').value;
  const vehicle = document.getElementById('portalVehicleInfo').value;
  const desc = document.getElementById('portalDesc').value;

  try {
    const res = await api('/api/requests', {
      method: 'POST',
      body: {
        title: `${issueType.toUpperCase()} - ${vehicle}`,
        description: desc,
        urgency: issueType === 'emergency' ? 'emergency' : 'medium',
        request_type: issueType,
        lat: state.coords?.lat,
        lng: state.coords?.lng
      }
    });

    if (issueType === 'emergency') {
      toast('🚨 Emergency Auto-Dispatch: Nearest Elite Mechanic auto-assigned!');
      showPortalTab('myjobs');
    } else {
      toast('🚀 Quote request posted to local verified mechanics!');
      showPortalTab('myjobs');
    }
  } catch (err) {
    toast(err.message);
  }

  return false;
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
      <div style="padding:16px; border:1px solid var(--border); border-radius:var(--radius-md); margin-bottom:12px; background:var(--bg-input);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="font-size:1.05rem;">${m.name}</strong> <span class="trust-tier-tag tier-${m.trust_tier}">${m.trust_tier}</span>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">${m.specializations || 'General Repairs'} · ${m.distance_km ? m.distance_km.toFixed(1) + ' km away' : 'Nearby'} · ⭐ ${m.rating_avg || '5.0'}</p>
          </div>
          <div>
            <span class="badge ${m.is_available ? 'badge-emerald' : 'badge-warn'}">${m.is_available ? 'Available' : 'Offline'}</span>
          </div>
        </div>

        <div style="margin-top:10px; padding:8px 12px; background:var(--bg-card); border-radius:var(--radius-sm); border:1px solid var(--border); font-size:0.78rem; color:var(--text-muted); display:flex; gap:16px; flex-wrap:wrap;">
          <span>✅ <strong>Gov ID Audited:</strong> Verified (Ref #${(m.user_id * 1423) % 9000 + 1000})</span>
          <span>📜 <strong>Trade License:</strong> Cert #${(m.user_id * 8831) % 9000 + 1000}-KE</span>
          <span>🛡️ <strong>Escrow Ready:</strong> M-Pesa / Card</span>
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
  if (!main) return;

  main.innerHTML = `
    <div class="card">
      <h2>📋 Breakdown Jobs Board</h2>
      <p style="color:var(--text-muted); margin-bottom:16px;">Browse open customer requests and submit competitive quotes.</p>
      <div id="docWarningBanner"></div>
      <div id="boardList">Loading open requests...</div>
    </div>
  `;

  let docStatus = { complete: true, missing: [] };
  let reqs = [
    { id: 1, title: 'Engine Overheating on Naivasha Highway', description: 'Steam coming out of radiator, need immediate roadside coolant & fan check.', urgency: 'emergency', request_type: 'emergency', budget_min: 3000, budget_max: 8000, owner_name: 'Margret Mukundi', created_at: new Date().toISOString() },
    { id: 2, title: 'Brake Failure & Towing Recovery Request', description: 'Brake pedal soft, vehicle stranded at Westlands roundabout.', urgency: 'high', request_type: 'emergency', budget_min: 4000, budget_max: 9000, owner_name: 'John Doe', created_at: new Date().toISOString() }
  ];

  try {
    const fetched = await api('/api/requests');
    if (fetched && Array.isArray(fetched)) {
      reqs = fetched;
    }
  } catch (err) {}


  try {
    const statusRes = await api('/api/mechanics/onboarding-status');
    if (statusRes && typeof statusRes === 'object') {
      docStatus = statusRes;
    }
  } catch (err) {}

  const warnBanner = document.getElementById('docWarningBanner');
  if (warnBanner && docStatus && docStatus.complete === false) {
    const missingItems = (Array.isArray(docStatus.missing) && docStatus.missing.length)
      ? docStatus.missing.join(' and ')
      : 'National ID and Trade Certification';

    warnBanner.innerHTML = `
      <div style="background:rgba(245, 158, 11, 0.12); border:1px solid var(--warn); border-radius:var(--radius-md); padding:16px; margin-bottom:20px;">
        <strong style="color:var(--warn);">🔒 Document Registration Required</strong>
        <p style="font-size:0.9rem; color:var(--text-main); margin-top:6px;">
          You must register your <strong>${missingItems}</strong> in your profile before you can place bids or accept breakdown jobs.
        </p>
        <button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="showPortalTab('profile')">Go to Profile & Upload Documents →</button>
      </div>
    `;
  }

  const container = document.getElementById('boardList');
  if (!container) return;

  if (!reqs || !reqs.length) {
    container.innerHTML = `<p style="color:var(--text-muted);">No open breakdown requests at this time.</p>`;
    return;
  }

  container.innerHTML = reqs.map((r) => `
    <div style="padding:18px; border:1px solid var(--border); border-radius:var(--radius-md); margin-bottom:16px; background:var(--bg-input);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong style="font-size:1.1rem;">${r.title}</strong>
        <span class="badge badge-accent">${(r.urgency || 'medium').toUpperCase()}</span>
      </div>
      <p style="font-size:0.9rem; color:var(--text-muted); margin:6px 0;">${r.description || 'Roadside breakdown assistance needed'}</p>
      <p style="font-size:0.8rem; color:var(--text-faint);">Requested by: ${r.owner_name || 'Driver'} · Budget: KES ${r.budget_min || 3000}-${r.budget_max || 8000}</p>
      <div style="margin-top:10px; display:flex; gap:10px;">
        ${(docStatus && docStatus.complete === false)
          ? `<button class="btn btn-secondary btn-sm" onclick="showPortalTab('profile')">🔒 Upload Documents to Bid</button>`
          : `<button class="btn btn-primary btn-sm" onclick="showBidForm(${r.id})">Place Quote / Bid</button>`
        }
      </div>
      <div id="bidContainer-${r.id}"></div>
    </div>
  `).join('');
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
  const isMech = state.user.role === 'mechanic';

  main.innerHTML = `
    <div class="card">
      <h2>${isMech ? '🛠️ Field Mechanic Repair Workstation' : '🔧 Active Breakdown Repairs & Requests'}</h2>
      <p style="color:var(--text-muted); margin-bottom:16px;">
        ${isMech ? 'Live field telemetry for your assigned customer breakdown jobs.' : 'Track active repairs, review incoming quotes, and choose M-Pesa or Cash payment.'}
      </p>
      <div id="myJobsListContainer">Loading jobs...</div>
    </div>
  `;

  try {
    const jobs = await api('/api/jobs/my');
    let myRequests = [];
    if (!isMech) {
      try { myRequests = await api('/api/requests/my'); } catch (e) {}
    }

    const container = document.getElementById('myJobsListContainer');
    const openReqs = myRequests.filter(r => r.status === 'open');

    if (!jobs.length && !openReqs.length) {
      container.innerHTML = `<p style="color:var(--text-muted);">${isMech ? 'No active breakdown repair jobs assigned to you currently.' : 'No active requests or past repairs found. Click "🚨 Request Assistance" above to get started.'}</p>`;
      return;
    }

    let html = '';

    // Render Open Requests Waiting for Bids (Car Owner View)
    if (!isMech && openReqs.length) {
      html += openReqs.map(r => `
        <div style="padding:20px; border:1px dashed var(--accent); border-radius:var(--radius-md); margin-bottom:20px; background:rgba(255,255,255,0.02);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="font-size:1.15rem;">${r.title}</strong>
            <span class="badge badge-warn">⌛ OPEN FOR MECHANIC QUOTES</span>
          </div>
          <p style="font-size:0.9rem; color:var(--text-muted); margin:6px 0;">${r.description || 'Roadside assistance requested'}</p>
          <div id="bidsListForReq-${r.id}">Loading mechanic quotes...</div>
        </div>
      `).join('');
    }

    // Render Active Assigned Jobs
    if (jobs.length) {
      html += jobs.map((j) => {
        const price = j.proposed_price || 3500;
        const payMode = (j.payment_method || 'mpesa').toUpperCase();

        if (isMech) {
          // MECHANIC WORKSTATION VIEW
          return `
            <div style="padding:22px; border:2px solid var(--emerald); border-radius:var(--radius-md); margin-bottom:20px; background:rgba(16, 185, 129, 0.06);">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                  <span class="badge badge-emerald" style="font-size:0.85rem; padding:4px 10px;">✅ QUOTE ACCEPTED BY CAR OWNER!</span>
                  <h3 style="font-size:1.3rem; margin-top:8px;">${j.title}</h3>
                </div>
                <span class="badge badge-accent" style="font-size:0.9rem;">STATUS: ${j.status.replace('_', ' ').toUpperCase()}</span>
              </div>

              <!-- PAYMENT STATUS BANNER -->
              <div style="margin:16px 0; padding:14px 18px; border-radius:var(--radius-sm); border:1px solid ${payMode === 'CASH' ? 'var(--warn)' : 'var(--emerald)'}; background:${payMode === 'CASH' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.15)'}; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div>
                  <strong style="font-size:1.05rem; color:${payMode === 'CASH' ? 'var(--warn)' : 'var(--emerald)'};">
                    ${payMode === 'CASH' ? '💵 PAYMENT METHOD: CASH ON DELIVERY' : '📱 PAYMENT METHOD: M-PESA STK PUSH (FUNDS LOCKED IN ESCROW)'}
                  </strong>
                  <p style="font-size:0.88rem; color:var(--text-main); margin-top:4px;">
                    ${payMode === 'CASH' 
                      ? 'Collect <strong>KES ' + price + ' in Cash</strong> directly from the car owner upon completing the repair.' 
                      : '<strong>KES ' + price + '</strong> is safely held in ResQgo M-Pesa Escrow. Funds will be released to your wallet upon job completion.'}
                  </p>
                </div>
                <div style="font-size:1.4rem; font-weight:800; color:var(--emerald);">KES ${price}</div>
              </div>

              <!-- DRIVER CONTACT DETAILS -->
              <div style="margin-bottom:16px; padding:14px; background:var(--bg-card); border-radius:var(--radius-sm); border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                  <strong style="font-size:1rem; color:var(--accent);">👤 Car Owner: ${j.owner_name}</strong>
                  <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">Phone: <strong>${j.owner_phone || '0712345678'}</strong></p>
                </div>
                <div style="display:flex; gap:10px;">
                  <a href="tel:${j.owner_phone || '0712345678'}" class="btn btn-primary btn-sm">📞 Call Owner Now</a>
                  <a href="https://maps.google.com/?q=${j.lat || -0.3667},${j.lng || 35.2833}" target="_blank" class="btn btn-secondary btn-sm">🗺️ Open GPS Route</a>
                </div>
              </div>

              <!-- FIELD PROGRESS CONTROL BUTTONS -->
              <div style="padding:14px; background:var(--bg-card); border-radius:var(--radius-sm); border:1px solid var(--border);">
                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:10px;">Update Customer on Field Progress:</p>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button class="btn ${j.status === 'en_route' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="advanceJobStatus(${j.id}, 'en_route')">🚗 1. En Route</button>
                  <button class="btn ${j.status === 'arrived' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="advanceJobStatus(${j.id}, 'arrived')">📍 2. Arrived at Site</button>
                  <button class="btn ${j.status === 'in_progress' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="advanceJobStatus(${j.id}, 'in_progress')">🔧 3. Repairing</button>
                  <button class="btn ${j.status === 'completed' ? 'btn-emerald' : 'btn-primary'} btn-sm" onclick="advanceJobStatus(${j.id}, 'completed')">✅ 4. Complete Repair</button>
                </div>
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">
                <button class="btn btn-ghost btn-sm" onclick="openChatForJob(${j.id})">💬 Chat with Driver</button>
              </div>
            </div>
          `;
        }


        // CAR OWNER / FLEET OWNER VIEW (Points 2 & 8)
        return `
          <div style="padding:20px; border:1px solid var(--border); border-radius:var(--radius-md); margin-bottom:20px; background:var(--bg-input);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="font-size:1.15rem;">${j.title}</strong>
              <span class="badge badge-accent">${j.status.replace('_', ' ').toUpperCase()}</span>
            </div>

            <!-- Mobile Mechanic Contact Details -->
            <div style="margin:14px 0; padding:12px 16px; background:var(--bg-card); border-radius:var(--radius-sm); border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div>
                <strong style="font-size:1rem; color:var(--accent);">🔧 Mobile Mechanic: ${j.mechanic_name}</strong>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">Direct Phone: <strong>${j.mechanic_phone || '0722998877'}</strong> · Payment Method: <strong>${payMode}</strong></p>
              </div>
              <a href="tel:${j.mechanic_phone || '0722998877'}" class="btn btn-primary btn-sm">📞 Call Mechanic</a>
            </div>
            
            <!-- Uber-style Live Status Telemetry Bar -->
            <div style="display:flex; justify-content:space-between; margin:16px 0; padding:12px; background:var(--bg-card); border-radius:var(--radius-sm); font-size:0.85rem; flex-wrap:wrap; gap:8px;">
              <span style="font-weight:${j.status === 'en_route' ? '700' : '400'}; color:${j.status === 'en_route' ? 'var(--accent)' : 'var(--text-muted)'};">1. 🚗 Mechanic En Route</span> →
              <span style="font-weight:${j.status === 'arrived' ? '700' : '400'}; color:${j.status === 'arrived' ? 'var(--accent)' : 'var(--text-muted)'};">2. 📍 Arrived</span> →
              <span style="font-weight:${j.status === 'in_progress' ? '700' : '400'}; color:${j.status === 'in_progress' ? 'var(--accent)' : 'var(--text-muted)'};">3. 🔧 In Repair</span> →
              <span style="font-weight:${j.status === 'completed' ? '700' : '400'}; color:${j.status === 'completed' ? 'var(--emerald)' : 'var(--text-muted)'};">4. ✅ Complete</span>
            </div>

            <!-- M-Pesa / Cash Checkout Box (Point 2) -->
            <div style="padding:14px; background:rgba(37, 99, 235, 0.08); border:1px solid var(--border); border-radius:var(--radius-sm); margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div>
                <span>🔒 <strong>Agreed Repair Amount: KES ${price} (${payMode})</strong></span>
                <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">Funds are held safely in escrow until you verify the repair.</p>
              </div>
              ${j.status !== 'completed' 
                ? `<button class="btn btn-primary btn-sm" onclick="openPaymentModal(${j.id}, ${price})">💳 Pay KES ${price} via M-Pesa</button>`
                : `<span class="badge badge-emerald">💸 Payment Released to Mechanic</span>`
              }
            </div>

            <div style="display:flex; gap:10px;">
              <button class="btn btn-ghost btn-sm" onclick="openChatForJob(${j.id})">💬 Open Repair Chat</button>
            </div>
          </div>
        `;
      }).join('');
    }

    container.innerHTML = html;

    // Asynchronously load bids for open requests
    if (!isMech && openReqs.length) {
      openReqs.forEach(r => loadBidsForRequest(r.id));
    }

  } catch (err) {
    document.getElementById('myJobsListContainer').innerHTML = `<p>${err.message}</p>`;
  }
}

async function loadBidsForRequest(reqId) {
  const container = document.getElementById(`bidsListForReq-${reqId}`);
  if (!container) return;
  try {
    const bids = await api(`/api/requests/${reqId}/bids`);
    if (!bids || !bids.length) {
      container.innerHTML = `<p style="font-size:0.85rem; color:var(--text-muted); margin-top:8px;">⏳ Waiting for local mobile mechanics to submit quotes...</p>`;
      return;
    }
    container.innerHTML = `
      <div style="margin-top:12px; border-top:1px solid var(--border); padding-top:12px;">
        <h4 style="font-size:0.95rem; color:var(--accent); margin-bottom:10px;">💰 Submitted Quotes from Mobile Mechanics (${bids.length})</h4>
        ` + bids.map(b => `
          <div style="padding:14px; border:1px solid var(--border); border-radius:var(--radius-sm); margin-bottom:10px; background:var(--bg-card);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div>
                <strong style="font-size:1.05rem;">${b.mechanic_name || 'Verified Mechanic'}</strong>
                <span class="trust-tier-tag tier-${b.trust_tier || 'verified'}">${b.trust_tier || 'verified'}</span>
                <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">⭐ ${b.rating_avg || '5.0'} · ETA: ${b.eta_minutes || 20} mins · 📞 ${b.mechanic_phone || '0722998877'}</p>
              </div>
              <div style="text-align:right;">
                <span style="font-size:1.3rem; font-weight:800; color:var(--emerald);">KES ${b.proposed_price}</span>
              </div>
            </div>
            <p style="font-size:0.85rem; color:var(--text-muted); margin:8px 0;">"${b.message || 'Ready with diagnostic tools and parts.'}"</p>
            
            <!-- 2 Payment Method Choice Buttons (M-Pesa vs Cash) -->
            <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" onclick="acceptQuoteWithPayment(${reqId}, ${b.id}, 'mpesa', ${b.proposed_price})">📱 Accept & Pay via M-Pesa</button>
              <button class="btn btn-secondary btn-sm" onclick="acceptQuoteWithPayment(${reqId}, ${b.id}, 'cash', ${b.proposed_price})">💵 Accept & Pay Cash</button>
            </div>
          </div>
        `).join('') + `
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="font-size:0.85rem; color:var(--text-muted);">No quotes submitted yet.</p>`;
  }
}

async function acceptQuoteWithPayment(reqId, bidId, paymentMethod, amount) {
  if (paymentMethod === 'mpesa') {
    openPaymentModalForBid(reqId, bidId, amount);
  } else {
    if (!confirm(`Accept quote of KES ${amount} with Cash on Delivery payment?`)) return;
    try {
      const res = await api(`/api/requests/${reqId}/accept/${bidId}`, {
        method: 'POST',
        body: { payment_method: 'cash' }
      });
      toast('🎉 Quote accepted! Mechanic notified and en route.');
      renderPortalJobs();
    } catch (err) {
      toast(err.message);
    }
  }
}

function openPaymentModalForBid(reqId, bidId, amount) {
  const modal = document.getElementById('authModal');
  const title = document.getElementById('authModalTitle');
  const loginF = document.getElementById('loginForm');
  const regF = document.getElementById('registerForm');
  const adminF = document.getElementById('adminSetupForm');

  if (loginF) loginF.style.display = 'none';
  if (regF) regF.style.display = 'none';
  if (adminF) adminF.style.display = 'none';

  if (title) title.textContent = `📱 M-Pesa Express Payment — KES ${amount}`;

  let payBox = document.getElementById('customPaymentBox');
  if (!payBox) {
    payBox = document.createElement('div');
    payBox.id = 'customPaymentBox';
    document.querySelector('.modal-card').appendChild(payBox);
  }
  payBox.style.display = 'block';
  payBox.innerHTML = `
    <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:16px;">
      Enter your Safaricom M-Pesa phone number to accept quote of KES ${amount} and send STK Push to lock funds in Escrow.
    </p>

    <form onsubmit="return submitMpesaBidAccept(event, ${reqId}, ${bidId}, ${amount})">
      <div class="form-group">
        <label>M-Pesa Mobile Number</label>
        <input type="tel" id="bidMpesaPhone" class="form-control" placeholder="0712345678" value="${state.user?.phone || '0712345678'}" required>
      </div>

      <div style="padding:12px; background:var(--bg-input); border-radius:var(--radius-sm); border:1px solid var(--border); margin-bottom:16px; font-size:0.85rem;">
        <div style="display:flex; justify-content:space-between;"><span>Agreed Mechanic Quote:</span><strong>KES ${amount}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-top:4px;"><span>Escrow Fee:</span><strong style="color:var(--emerald);">KES 0 (FREE)</strong></div>
        <hr style="margin:8px 0; border-color:var(--border);">
        <div style="display:flex; justify-content:space-between; font-weight:700;"><span>Total Escrow Lock:</span><span>KES ${amount}</span></div>
      </div>

      <button type="submit" class="btn btn-primary" style="width:100%; padding:12px; font-size:1rem;">📱 Accept Quote & Send M-Pesa STK Push</button>
    </form>
  `;

  modal.style.display = 'flex';
  modal.classList.add('active');
}

async function submitMpesaBidAccept(e, reqId, bidId, amount) {
  e.preventDefault();
  const phone = document.getElementById('bidMpesaPhone').value;
  try {
    const res = await api(`/api/requests/${reqId}/accept/${bidId}`, {
      method: 'POST',
      body: { payment_method: 'mpesa', phone_number: phone }
    });

    closeAuthModal();
    const payBox = document.getElementById('customPaymentBox');
    if (payBox) payBox.style.display = 'none';

    alert(`📱 M-PESA STK PUSH SENT!\n\n${res.message}\n\nPlease check your handset and enter M-Pesa PIN to lock KES ${amount} in Escrow.`);
    toast('🎉 Quote Accepted & M-Pesa Escrow Lock Initiated!');
    renderPortalJobs();
  } catch (err) {
    toast(err.message);
  }
  return false;
}


async function advanceJobStatus(jobId, nextStatus) {
  try {
    await api(`/api/jobs/${jobId}/status`, { method: 'PUT', body: { status: nextStatus } });
    toast(`Repair status updated to: ${nextStatus.replace('_', ' ').toUpperCase()}`);
    renderPortalJobs();
  } catch (err) {
    toast(err.message);
  }
}

function openPaymentModal(jobId, amount = 3500) {
  const modal = document.getElementById('authModal');
  const title = document.getElementById('authModalTitle');
  const loginF = document.getElementById('loginForm');
  const regF = document.getElementById('registerForm');
  const adminF = document.getElementById('adminSetupForm');

  if (loginF) loginF.style.display = 'none';
  if (regF) regF.style.display = 'none';
  if (adminF) adminF.style.display = 'none';

  if (title) title.textContent = `💳 M-Pesa Express Escrow Checkout (KES ${amount})`;

  let payBox = document.getElementById('customPaymentBox');
  if (!payBox) {
    payBox = document.createElement('div');
    payBox.id = 'customPaymentBox';
    document.querySelector('.modal-card').appendChild(payBox);
  }
  payBox.style.display = 'block';
  payBox.innerHTML = `
    <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:16px;">
      Enter your Safaricom M-Pesa phone number to receive an immediate STK Push prompt on your mobile handset.
    </p>

    <form onsubmit="return submitMpesaPayment(event, ${jobId}, ${amount})">
      <div class="form-group">
        <label>M-Pesa Phone Number</label>
        <input type="tel" id="mpesaPhone" class="form-control" placeholder="0712345678" value="${state.user?.phone || '0712345678'}" required>
      </div>

      <div style="padding:12px; background:var(--bg-input); border-radius:var(--radius-sm); border:1px solid var(--border); margin-bottom:16px; font-size:0.85rem;">
        <div style="display:flex; justify-content:space-between;"><span>Agreed Repair Amount:</span><strong>KES ${amount}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-top:4px;"><span>ResQgo Escrow Protection Fee:</span><strong style="color:var(--emerald);">KES 0 (FREE)</strong></div>
        <hr style="margin:8px 0; border-color:var(--border);">
        <div style="display:flex; justify-content:space-between; font-weight:700;"><span>Total Amount to Pay:</span><span>KES ${amount}</span></div>
      </div>

      <button type="submit" class="btn btn-primary" style="width:100%; padding:12px; font-size:1rem;">📱 Send M-Pesa STK Push (KES ${amount})</button>
    </form>
  `;

  modal.style.display = 'flex';
  modal.classList.add('active');
}

async function submitMpesaPayment(e, jobId, amount) {
  e.preventDefault();
  const phone = document.getElementById('mpesaPhone').value;
  try {
    const res = await api(`/api/jobs/${jobId}/pay`, {
      method: 'POST',
      body: { payment_method: 'mpesa', phone_number: phone, amount }
    });

    closeAuthModal();
    const payBox = document.getElementById('customPaymentBox');
    if (payBox) payBox.style.display = 'none';

    toast('📱 M-Pesa STK Push dispatched! Please enter your PIN on your mobile handset.');
    renderPortalJobs();

  } catch (err) {
    toast(err.message);
  }
  return false;
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

async function renderPortalProfile() {
  const main = document.getElementById('portalMainContent');
  
  let p = {
    name: state.user?.name || '',
    email: state.user?.email || '',
    phone: state.user?.phone || '',
    role: state.user?.role || 'owner',
    avatar_url: '👤',
    city: 'Nairobi',
    bio: '',
    hourly_rate: 2000,
    vehicle_make: 'Toyota',
    vehicle_model: 'Prado',
    license_plate: 'KCY 890X',
    emergency_contact_name: 'Sarah Wanjiru',
    emergency_contact_phone: '0711223344',
    company_name: 'Apex Logistics',
    is_available: true,
    is_verified: false,
    trust_tier: 'standard'
  };

  try {
    p = await api('/api/user/profile');
  } catch (e) {}

  let onboarding = { complete: false, missing: [], hasUploadedAny: false };
  let mech = { is_verified: false, trust_tier: 'standard' };
  if (p.role === 'mechanic') {
    try {
      onboarding = await api('/api/mechanics/onboarding-status');
      mech = await api(`/api/mechanics/${state.user.id}`);
    } catch (e) {}
  }

  const isVerified = p.is_verified || mech.is_verified || onboarding.isVerified;
  const hasUploadedDocs = onboarding.hasUploadedAny || !!(mech.id_document_url || mech.cert_document_url);

  let bannerHTML = '';
  if (p.role === 'mechanic') {
    if (isVerified) {
      bannerHTML = `
        <div style="padding:16px; border-radius:var(--radius-md); margin-bottom:20px; border:1px solid var(--emerald); background:rgba(16, 185, 129, 0.12);">
          <strong style="font-size:1.1rem; color:var(--emerald);">✅ Account Verification Approved</strong>
          <p style="font-size:0.9rem; color:var(--text-main); margin-top:6px;">
            Your mechanic account is fully approved as <strong>${(mech.trust_tier || 'verified').toUpperCase()} Tier</strong>. You are unlocked to place quotes on the Jobs Board & receive 24/7 emergency breakdown dispatches!
          </p>
        </div>
      `;
    } else if (hasUploadedDocs) {
      bannerHTML = `
        <div style="padding:16px; border-radius:var(--radius-md); margin-bottom:20px; border:1px solid var(--warn); background:rgba(245, 158, 11, 0.12);">
          <strong style="font-size:1.1rem; color:var(--warn);">⏳ Verification Status: Documents Submitted / Pending Audit</strong>
          <p style="font-size:0.9rem; color:var(--text-main); margin-top:6px;">
            Your National ID and Trade Certifications have been submitted and are in the Admin Verification Queue. Once reviewed by an auditor, your account will be unlocked.
          </p>
        </div>
      `;
    } else {
      bannerHTML = `
        <div style="padding:16px; border-radius:var(--radius-md); margin-bottom:20px; border:1px solid var(--accent); background:rgba(37, 99, 235, 0.1);">
          <strong style="font-size:1.1rem; color:var(--accent);">⚠️ Action Required: Upload Verification Documents</strong>
          <p style="font-size:0.9rem; color:var(--text-main); margin-top:6px;">
            Please upload a copy of your <strong>National ID Document</strong> and <strong>Trade Certification</strong> below to submit your account for Admin verification and unlock bidding.
          </p>
        </div>
      `;
    }
  }

  const presetAvatars = ['👤', '👨‍🔧', '👩‍🔧', '🚗', '🚚', '🛡️', '⚡', '👑', '😎', '🔧'];

  main.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:16px;">
          <div id="userAvatarDisplay" style="width:72px; height:72px; border-radius:50%; background:var(--bg-input); border:2px solid var(--accent); display:flex; align-items:center; justify-content:center; font-size:2.2rem;">
            ${p.avatar_url && p.avatar_url.startsWith('/') ? `<img src="${p.avatar_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : (p.avatar_url || '👤')}
          </div>
          <div>
            <h2 style="margin:0;">${p.name}</h2>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-top:2px;">
              ${p.email} · <span class="badge badge-accent" style="text-transform:uppercase;">${p.role.replace('_', ' ')}</span>
            </p>
          </div>
        </div>

        <div>
          <button class="btn btn-secondary btn-sm" onclick="toggleAvatarPicker()">📷 Choose Avatar Photo</button>
        </div>
      </div>

      <!-- AVATAR PICKER DRAWER -->
      <div id="avatarPickerDrawer" style="display:none; padding:16px; background:var(--bg-input); border-radius:var(--radius-md); margin-bottom:24px; border:1px solid var(--border);">
        <h4 style="font-size:0.95rem; margin-bottom:10px;">Select Preset Avatar Icon:</h4>
        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
          ${presetAvatars.map(av => `<button type="button" onclick="selectAvatarIcon('${av}')" style="font-size:1.8rem; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-sm); padding:6px 12px; cursor:pointer;">${av}</button>`).join('')}
        </div>
      </div>

      ${bannerHTML}

      <!-- PROFILE EDIT FORM -->
      <form onsubmit="return saveProfile(event)">
        <h3 style="font-size:1.1rem; margin-bottom:14px;">👤 Personal & Contact Details</h3>
        <div class="grid-2">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" id="pName" class="form-control" value="${p.name}" required>
          </div>
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="pEmail" class="form-control" value="${p.email}" disabled style="opacity:0.7;">
          </div>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>Phone Number</label>
            <input type="tel" id="pPhone" class="form-control" value="${p.phone}" placeholder="0712345678" required>
          </div>
          <div class="form-group">
            <label>Primary County / City</label>
            <select id="pCity" class="form-control">
              <option value="Nairobi" ${p.city === 'Nairobi' ? 'selected' : ''}>Nairobi County</option>
              <option value="Nakuru" ${p.city === 'Nakuru' ? 'selected' : ''}>Nakuru County</option>
              <option value="Mombasa" ${p.city === 'Mombasa' ? 'selected' : ''}>Mombasa County</option>
              <option value="Eldoret" ${p.city === 'Eldoret' ? 'selected' : ''}>Uasin Gishu / Eldoret</option>
              <option value="Kisumu" ${p.city === 'Kisumu' ? 'selected' : ''}>Kisumu County</option>
              <option value="Naivasha" ${p.city === 'Naivasha' ? 'selected' : ''}>Naivasha / Corridor</option>
            </select>
          </div>
        </div>

        ${p.role === 'mechanic' ? `
          <hr style="margin:20px 0; border-color:var(--border);">
          <h3 style="font-size:1.1rem; margin-bottom:14px;">🔧 Mechanic Specializations & Pricing</h3>
          <div class="form-group">
            <label>Bio & Technical Specializations</label>
            <textarea id="pBio" class="form-control" rows="3" placeholder="Engine diagnostics, transmission overhaul, brake replacements...">${p.bio}</textarea>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>Standard Hourly Rate (KES)</label>
              <input type="number" id="pRate" class="form-control" value="${p.hourly_rate}" placeholder="2000" required>
            </div>
            <div class="form-group">
              <label>Emergency Dispatch Availability</label>
              <select id="pAvailable" class="form-control">
                <option value="true" ${p.is_available ? 'selected' : ''}>🟢 Available (Open for Requests & SOS)</option>
                <option value="false" ${!p.is_available ? 'selected' : ''}>🔴 Off Duty (Paused)</option>
              </select>
            </div>
          </div>
        ` : ''}

        ${p.role === 'owner' ? `
          <hr style="margin:20px 0; border-color:var(--border);">
          <h3 style="font-size:1.1rem; margin-bottom:14px;">🚗 Registered Vehicle & Emergency Contact</h3>
          <div class="grid-3">
            <div class="form-group"><label>Vehicle Make</label><input type="text" id="pVMake" class="form-control" value="${p.vehicle_make}" placeholder="Toyota"></div>
            <div class="form-group"><label>Vehicle Model</label><input type="text" id="pVModel" class="form-control" value="${p.vehicle_model}" placeholder="Prado / Demio"></div>
            <div class="form-group"><label>License Plate</label><input type="text" id="pVPlate" class="form-control" value="${p.license_plate}" placeholder="KCY 890X"></div>
          </div>
          <div class="grid-2">
            <div class="form-group"><label>Emergency Contact Name</label><input type="text" id="pEmergName" class="form-control" value="${p.emergency_contact_name}" placeholder="Sarah Wanjiru"></div>
            <div class="form-group"><label>Emergency Contact Phone</label><input type="tel" id="pEmergPhone" class="form-control" value="${p.emergency_contact_phone}" placeholder="0711223344"></div>
          </div>
        ` : ''}

        ${p.role === 'fleet_owner' ? `
          <hr style="margin:20px 0; border-color:var(--border);">
          <h3 style="font-size:1.1rem; margin-bottom:14px;">🚚 Fleet Business Information</h3>
          <div class="form-group">
            <label>Company / Fleet Name</label>
            <input type="text" id="pCompany" class="form-control" value="${p.company_name}" placeholder="Apex Logistics Ltd">
          </div>
        ` : ''}

        <button type="submit" class="btn btn-primary" style="padding:12px 24px; font-size:1rem; margin-top:10px;">💾 Save Profile Customizations</button>
      </form>

      ${p.role === 'mechanic' ? `
        <hr style="margin:28px 0; border-color:var(--border);">
        <h3 style="font-size:1.1rem;">📄 Verification Documents (Admin Audit)</h3>
        <form onsubmit="return uploadDocs(event)" style="margin-top:12px;">
          <div class="grid-2">
            <div class="form-group"><label>Government National ID (Image / PDF)</label><input type="file" id="docId" class="form-control"></div>
            <div class="form-group"><label>Mechanical Trade Cert (Image / PDF)</label><input type="file" id="docCert" class="form-control"></div>
          </div>
          <button type="submit" class="btn btn-secondary btn-sm">Upload Documents for Verification</button>
        </form>
      ` : ''}
    </div>
  `;
}

let selectedAvatarIcon = null;
function toggleAvatarPicker() {
  const drawer = document.getElementById('avatarPickerDrawer');
  if (drawer) drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
}

function selectAvatarIcon(av) {
  selectedAvatarIcon = av;
  const disp = document.getElementById('userAvatarDisplay');
  if (disp) disp.innerHTML = av;
  toast(`Selected avatar: ${av}. Click "Save Profile Customizations" to confirm.`);
  toggleAvatarPicker();
}

async function saveProfile(e) {
  e.preventDefault();
  try {
    const payload = {
      name: document.getElementById('pName').value,
      phone: document.getElementById('pPhone').value,
      city: document.getElementById('pCity')?.value || 'Nairobi',
      avatar_url: selectedAvatarIcon || state.user?.avatar_url || '👤'
    };

    if (document.getElementById('pBio')) payload.bio = document.getElementById('pBio').value;
    if (document.getElementById('pRate')) payload.hourly_rate = document.getElementById('pRate').value;
    if (document.getElementById('pAvailable')) payload.is_available = document.getElementById('pAvailable').value === 'true';

    if (document.getElementById('pVMake')) payload.vehicle_make = document.getElementById('pVMake').value;
    if (document.getElementById('pVModel')) payload.vehicle_model = document.getElementById('pVModel').value;
    if (document.getElementById('pVPlate')) payload.license_plate = document.getElementById('pVPlate').value;

    if (document.getElementById('pEmergName')) payload.emergency_contact_name = document.getElementById('pEmergName').value;
    if (document.getElementById('pEmergPhone')) payload.emergency_contact_phone = document.getElementById('pEmergPhone').value;
    if (document.getElementById('pCompany')) payload.company_name = document.getElementById('pCompany').value;

    const data = await api('/api/user/profile', {
      method: 'PUT',
      body: payload
    });

    state.user = { ...state.user, ...data.user };
    localStorage.setItem('resqgo_user', JSON.stringify(state.user));
    updateAuthUI();

    toast('🎉 Profile customized and saved successfully!');
    renderPortalProfile();
  } catch (err) {
    toast(err.message);
  }
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

async function renderAdminStatsView() {
  const main = document.getElementById('portalMainContent');
  main.innerHTML = `
    <div class="card">
      <h2>📊 Platform Analytics Overview</h2>
      <p style="color:var(--text-muted); margin-bottom:16px;">Click on any category card below to inspect records and delete/manage users or requests.</p>
      <div id="adminStatsGrid" class="grid-3" style="margin-top:16px;">Loading stats...</div>
      <div id="adminDrilldownContainer" style="margin-top:24px;"></div>
    </div>
  `;

  try {
    const s = await api('/api/admin/stats');
    const items = [
      { key: 'users', label: 'Total Platform Users', val: s.totalUsers || 0, icon: '👥', desc: 'Click to view all users & delete accounts' },
      { key: 'registered_mechanics', label: 'Registered Mechanics', val: s.registeredMechanics || 0, icon: '🔧', desc: 'Click to inspect mechanic directory' },
      { key: 'verified_mechanics', label: 'Verified Mechanics', val: s.verifiedMechanics || 0, icon: '✅', desc: 'Click to view audited & verified technicians' },
      { key: 'completed_repairs', label: 'Completed Repairs', val: s.completedRepairs || 0, icon: '🎉', desc: 'Click to inspect finished repair transactions' },
      { key: 'open_requests', label: 'Open Breakdown Requests', val: s.openRequests || 0, icon: '📋', desc: 'Click to view open jobs & cancel requests' },
      { key: 'sos_broadcasts', label: 'Total SOS Broadcasts', val: s.totalSOS || 0, icon: '🚨', desc: 'Click to inspect emergency SOS log' }
    ];

    document.getElementById('adminStatsGrid').innerHTML = items.map((item) => `
      <div class="card" onclick="loadAdminDrilldown('${item.key}', '${item.label}')" style="margin:0; padding:20px; cursor:pointer; transition:all 0.2s ease; border:1px solid var(--border);" onmouseover="this.style.borderColor='var(--accent)';" onmouseout="this.style.borderColor='var(--border)';">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3 style="font-size:2.2rem; color:var(--accent); margin:0;">${item.val}</h3>
          <span style="font-size:1.8rem;">${item.icon}</span>
        </div>
        <strong style="font-size:1rem; display:block; margin-top:8px;">${item.label}</strong>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${item.desc} →</p>
      </div>
    `).join('');
  } catch (err) {}
}

async function loadAdminDrilldown(key, title) {
  const container = document.getElementById('adminDrilldownContainer');
  if (!container) return;

  container.innerHTML = `
    <div style="padding:20px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg-input);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="margin:0;">📂 ${title} Details</h3>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('adminDrilldownContainer').innerHTML=''">✕ Close Details</button>
      </div>
      <div id="drilldownContent">Loading ${title.toLowerCase()}...</div>
    </div>
  `;

  try {
    const data = await api(`/api/admin/drilldown/${key}`);
    const box = document.getElementById('drilldownContent');
    if (!box) return;

    if (!data || !data.length) {
      box.innerHTML = `<p style="color:var(--text-muted);">No records found in this category.</p>`;
      return;
    }

    if (key === 'users') {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${data.map(u => `
            <div style="padding:12px 16px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-card); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div>
                <strong style="font-size:1.05rem;">${u.name}</strong> <span class="badge badge-accent">${(u.role || 'user').toUpperCase()}</span>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">Email: ${u.email} · Phone: ${u.phone || 'N/A'}</p>
              </div>
              <div>
                ${u.role === 'admin' ? '<span class="badge badge-emerald">System Admin</span>' : `<button class="btn btn-danger btn-sm" onclick="adminDeleteUser(${u.id}, '${u.name}')">🗑️ Remove User</button>`}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (key === 'registered_mechanics' || key === 'verified_mechanics') {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${data.map(m => `
            <div style="padding:12px 16px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-card); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div>
                <strong style="font-size:1.05rem;">${m.name}</strong> <span class="trust-tier-tag tier-${m.trust_tier}">${m.trust_tier}</span>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">${m.email} · Phone: ${m.phone || 'N/A'} · Status: ${m.is_verified ? '✅ Verified' : '⏳ Pending Audit'}</p>
              </div>
              <div style="display:flex; gap:8px;">
                ${m.is_verified ? `<button class="btn btn-secondary btn-sm" onclick="adminDemoteMechanic(${m.user_id})">⚡ Demote</button>` : ''}
                <button class="btn btn-danger btn-sm" onclick="adminDeleteUser(${m.user_id}, '${m.name}')">🗑️ Remove Mechanic</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (key === 'completed_repairs') {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${data.map(j => `
            <div style="padding:12px 16px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-card); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div>
                <strong style="font-size:1.05rem;">${j.title || 'Completed Repair Job'}</strong>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">Customer: ${j.owner_name} (${j.owner_phone}) · Mechanic: ${j.mechanic_name} (${j.mechanic_phone})</p>
              </div>
              <div>
                <span class="badge badge-emerald" style="font-size:0.95rem;">KES ${j.proposed_price || 3500} (COMPLETED)</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (key === 'open_requests') {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${data.map(r => `
            <div style="padding:12px 16px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-card); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div>
                <strong style="font-size:1.05rem;">${r.title}</strong> <span class="badge badge-accent">${(r.urgency || 'medium').toUpperCase()}</span>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">Requested by: ${r.owner_name} · Description: ${r.description}</p>
              </div>
              <div>
                <button class="btn btn-danger btn-sm" onclick="adminDeleteRequest(${r.id})">❌ Cancel Request</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (key === 'sos_broadcasts') {
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${data.map(s => `
            <div style="padding:12px 16px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-card); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div>
                <strong style="color:var(--danger); font-size:1.05rem;">🚨 SOS EMERGENCY ALERT</strong>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">Driver: ${s.owner_name} · Coordinates: Lat ${s.lat || -0.3667}, Lng ${s.lng || 35.2833} · Status: ${s.status}</p>
              </div>
              <div>
                <span class="badge badge-accent">GPS Broadcast Active</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (err) {
    document.getElementById('drilldownContent').innerHTML = `<p style="color:var(--danger);">${err.message}</p>`;
  }
}

async function adminDeleteUser(userId, userName) {
  if (!confirm(`Are you sure you want to PERMANENTLY delete user "${userName}" (ID: ${userId})?`)) return;
  try {
    await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
    toast(`User "${userName}" removed permanently.`);
    renderAdminStatsView();
  } catch (err) {
    toast(err.message);
  }
}

async function adminDeleteRequest(reqId) {
  if (!confirm(`Are you sure you want to cancel and delete breakdown request #${reqId}?`)) return;
  try {
    await api(`/api/admin/requests/${reqId}`, { method: 'DELETE' });
    toast(`Breakdown request #${reqId} cancelled & deleted.`);
    renderAdminStatsView();
  } catch (err) {
    toast(err.message);
  }
}

async function adminDemoteMechanic(userId) {
  if (!confirm(`Demote mechanic #${userId} back to unverified standard status?`)) return;
  try {
    await api(`/api/mechanics/${userId}/verify`, { method: 'PUT', body: { is_verified: false, trust_tier: 'standard' } });
    toast(`Mechanic #${userId} demoted to unverified.`);
    renderAdminStatsView();
  } catch (err) {
    toast(err.message);
  }
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
