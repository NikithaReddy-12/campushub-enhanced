/* ══════════════════════════════════════════
   SCROLL REVEAL ANIMATIONS
══════════════════════════════════════════ */
let scrollRevealObserver = null;

function initScrollAnimations() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('[data-scroll]').forEach(el => {
      el.classList.add(el.dataset.scroll || 'fade-in-up');
    });
    return;
  }

  if (scrollRevealObserver) scrollRevealObserver.disconnect();
  scrollRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        element.classList.add(element.dataset.scroll || 'fade-in-up');
        scrollRevealObserver.unobserve(element);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
  });

  observeScrollAnimations();
}

// Also initialize after data loads or page switches.
function addScrollAnimationsToNewElements() {
  observeScrollAnimations();
}

function observeScrollAnimations() {
  const elements = document.querySelectorAll('[data-scroll]:not(.fade-in-up):not(.fade-in-down):not(.slide-in-left):not(.slide-in-right):not(.scale-in)');
  if (!scrollRevealObserver) {
    elements.forEach(el => el.classList.add(el.dataset.scroll || 'fade-in-up'));
    return;
  }
  elements.forEach(el => scrollRevealObserver.observe(el));
}

/* ══════════════════════════════════════════
   PAGE LOAD ANIMATION
══════════════════════════════════════════ */
/* ── Cinematic loader helpers ── */
const PL_STEPS = [
  { pct: 18, label: 'Loading resources…' },
  { pct: 42, label: 'Fetching campus data…' },
  { pct: 67, label: 'Setting up your hub…' },
  { pct: 88, label: 'Almost ready…' },
  { pct: 100, label: 'Welcome! 🎉' },
];

function showLoadingAnimation() {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;
  loader.classList.add('pl-visible');

  const fill    = document.getElementById('plProgressFill');
  const pct     = document.getElementById('plProgressPct');
  const status  = document.getElementById('plStatus');

  let step = 0;
  const totalMs = 3200; // ~3.5 s total with hide transition
  const gaps = [0, 600, 1100, 1800, 2500]; // timing per step

  function runStep(i) {
    if (i >= PL_STEPS.length) return;
    const s = PL_STEPS[i];
    if (fill)   fill.style.width  = s.pct + '%';
    if (pct)    pct.textContent   = s.pct + '%';
    if (status) status.textContent = s.label;
    if (i + 1 < PL_STEPS.length) {
      setTimeout(() => runStep(i + 1), gaps[i + 1] - gaps[i]);
    }
  }
  runStep(0);
}

function hideLoadingAnimation() {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;
  // Brief pause so user sees "Welcome 🎉" then fade out
  setTimeout(() => {
    loader.classList.add('pl-hiding');
    setTimeout(() => {
      loader.classList.remove('pl-visible', 'pl-hiding');
    }, 700);
  }, 400);
}

/* ══════════════════════════════════════════
   DATA STORE
══════════════════════════════════════════ */
/* ── Backend API base URL ── */
const API = 'http://localhost:5000/api';

let clubs = [], events = [], registrations = [];

/* ── Connection status dot in navbar ── */
function setConnectionStatus(status) {
  let dot = document.getElementById('_connDot');
  if (!dot) {
    dot = document.createElement('span');
    dot.id = '_connDot';
    dot.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:0.72rem;font-weight:600;padding:3px 10px;border-radius:20px;margin-left:8px;transition:all .3s';
    const nav = document.getElementById('navbar');
    if (nav) nav.appendChild(dot);
  }
  const map = {
    connecting: ['⏳ Connecting…', '#f59e0b', '#fffbeb'],
    ok:         ['🟢 Connected',   '#10b981', '#ecfdf5'],
    error:      ['🔴 Backend Offline', '#ef4444', '#fef2f2'],
  };
  const [label, color, bg] = map[status] || map.error;
  dot.textContent = label;
  dot.style.color = color;
  dot.style.background = bg;
}

async function loadData() {
  setConnectionStatus('connecting');
  try {
    const [c, e, r] = await Promise.all([
      fetch(`${API}/clubs`).then(res => { if (!res.ok) throw new Error('clubs'); return res.json(); }),
      fetch(`${API}/events`).then(res => { if (!res.ok) throw new Error('events'); return res.json(); }),
      fetch(`${API}/registrations`).then(res => { if (!res.ok) throw new Error('registrations'); return res.json(); }),
    ]);
    clubs         = Array.isArray(c) ? c : [];
    events        = Array.isArray(e) ? e : [];
    registrations = Array.isArray(r) ? r : [];
    setConnectionStatus('ok');
  } catch (err) {
    clubs = []; events = []; registrations = [];
    setConnectionStatus('error');
    showToast('⚠️ Cannot reach backend at localhost:5000. Is the server running?', 'error');
    console.error('[CampusHub] Backend connection failed:', err.message);
  }
  renderHome();
  renderClubs();
  hideLoadingAnimation();
  addScrollAnimationsToNewElements();
}

const ADMIN_CREDENTIALS = { username:'admin', password:'admin123' };

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
let currentUser = null;
let activeCatFilter = 'all';
let activeStatusFilter = 'all';
let editingEventId = null;
let isDark = false;

/* ══════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function fmt(ds) {
  if (!ds) return '—';
  return new Date(ds).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtDate(ds) {
  if (!ds) return '—';
  return new Date(ds).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

const getClub  = id => clubs.find(c => c.id === id);
const getEvent = id => events.find(e => e.id === id);
const regsForEvent = eid => registrations.filter(r => r.eventId === eid);
function regsForClub(clubId) {
  const eIds = events.filter(e => e.clubId === clubId).map(e => e.id);
  return registrations.filter(r => eIds.includes(r.eventId));
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════
   TOAST — fixed: use correct class names
══════════════════════════════════════════ */
let _toastTimer = null;
function showToast(msg, type = 'success') {
  const t   = document.getElementById('toast');
  const ico = document.getElementById('toastIcon');
  const msgEl = document.getElementById('toastMsg');
  ico.textContent = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  msgEl.textContent = msg;
  // Remove all type classes, add correct ones
  t.className = 'show ' + type;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className = ''; }, 3800);
}

/* ══════════════════════════════════════════
   DARK MODE
══════════════════════════════════════════ */
function toggleTheme() {
  isDark = !isDark;
  document.body.classList.toggle('dark', isDark);
  document.getElementById('themeBtn').textContent = isDark ? '☀️' : '🌙';
}

/* ══════════════════════════════════════════
   PAGE NAVIGATION
══════════════════════════════════════════ */
function showPage(pageId) {
  if (pageId === 'dashboard' && (!currentUser || currentUser.type !== 'club')) { showPage('login'); return; }
  if (pageId === 'admin'     && (!currentUser || currentUser.type !== 'admin')) { showPage('adminLogin'); return; }

  // Fade out current page
  const currentPage = document.querySelector('.page.active');
  if (currentPage) {
    currentPage.style.animation = 'pageOut 0.25s ease-out forwards';
    setTimeout(() => {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const target = document.getElementById('page-' + pageId);
      if (target) {
        target.classList.add('active');
        target.style.animation = 'pageFade 0.35s ease';
      }
    }, 250);
  } else {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + pageId);
    if (target) {
      target.classList.add('active');
      target.style.animation = 'pageFade 0.35s ease';
    }
  }

  document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
  if (['home','events','clubs'].includes(pageId)) {
    const ab = document.querySelector(`.nav-link[onclick="showPage('${pageId}')"]`);
    if (ab) ab.classList.add('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Show footer on non-login pages
  const footer = document.getElementById('siteFooter');
  footer.style.display = ['login','adminLogin'].includes(pageId) ? 'none' : 'block';

  if (pageId === 'home')      renderHome();
  if (pageId === 'events')    renderEvents();
  if (pageId === 'clubs')     renderClubs();
  if (pageId === 'dashboard') renderDashboard();
  if (pageId === 'admin')     renderAdmin();

  setTimeout(addScrollAnimationsToNewElements, 40);
}

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
async function clubLogin() {
  const id   = document.getElementById('loginClubId').value.trim().toUpperCase();
  const pass = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  
  if (!id || !pass) {
    errEl.style.display = 'flex';
    return;
  }

  try {
    const res = await fetch(`${API}/clubs/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password: pass })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      errEl.style.display = 'flex';
      return;
    }
    
    errEl.style.display = 'none';
    currentUser = { type:'club', clubId: data.club.id };
    updateNav();
    showToast(`Welcome, ${data.club.name}! 🎉`);
    showPage('dashboard');
  } catch (err) {
    errEl.style.display = 'flex';
    showToast('Connection error: ' + err.message, 'error');
  }
}

function adminLogin() {
  const u = document.getElementById('adminUser').value.trim();
  const p = document.getElementById('adminPass').value;
  const errEl = document.getElementById('adminLoginError');
  if (u === ADMIN_CREDENTIALS.username && p === ADMIN_CREDENTIALS.password) {
    errEl.style.display = 'none';
    currentUser = { type:'admin' };
    updateNav();
    showToast('Admin access granted ⚙️', 'info');
    showPage('admin');
  } else {
    errEl.style.display = 'flex';
  }
}

function logout() {
  currentUser = null;
  updateNav();
  showToast('Logged out successfully.', 'info');
  showPage('home');
}

function updateNav() {
  const loginBtn  = document.getElementById('loginNavBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const dashBtn   = document.getElementById('dashBtn');
  const adminBtn  = document.getElementById('adminBtn');
  const userPill  = document.getElementById('userPill');
  const pillName  = document.getElementById('userPillName');

  if (!currentUser) {
    loginBtn.style.display  = 'inline-flex';
    logoutBtn.style.display = 'none';
    dashBtn.style.display   = 'none';
    adminBtn.style.display  = 'none';
    userPill.style.display  = 'none';
    return;
  }
  loginBtn.style.display  = 'none';
  logoutBtn.style.display = 'inline-flex';

  if (currentUser.type === 'club') {
    const club = getClub(currentUser.clubId);
    dashBtn.style.display  = 'inline-flex';
    adminBtn.style.display = 'none';
    userPill.style.display = 'flex';
    pillName.textContent   = club ? club.name : '';
  } else {
    dashBtn.style.display  = 'none';
    adminBtn.style.display = 'inline-flex';
    userPill.style.display = 'flex';
    pillName.textContent   = 'Admin';
  }
}

/* ══════════════════════════════════════════
   HOME PAGE
══════════════════════════════════════════ */
function renderHome() {
  const openEvents = events.filter(e => e.status === 'open');
  const totalRegs  = registrations.length;

  document.getElementById('hvOpenCount').textContent = openEvents.length;
  document.getElementById('hvClubCount').textContent = clubs.length;
  document.getElementById('hvRegCount').textContent  = totalRegs;

  animateCount('statClubs',  clubs.length);
  animateCount('statEvents', events.length);
  animateCount('statOpen',   openEvents.length);
  animateCount('statRegs',   totalRegs);

  ['Technical','Cultural','Sports','Social'].forEach(cat => {
    const cnt = events.filter(e => e.category === cat).length;
    document.getElementById('catCount' + cat).textContent = cnt + (cnt === 1 ? ' event' : ' events');
  });

  const container = document.getElementById('homeEvents');
  const preview   = openEvents.slice(0, 3);
  container.innerHTML = preview.length
    ? preview.map((e, i) => `<div data-scroll="fade-in-up" class="stagger-${i+1}">${eventCard(e)}</div>`).join('')
    : '<p style="color:var(--text-muted);padding:2rem;">No upcoming events right now.</p>';

  renderCarousel();
  addScrollAnimationsToNewElements();
}

/* ══════════════════════════════════════════
   ACTIVE EVENTS CAROUSEL
══════════════════════════════════════════ */
let carouselIndex   = 0;
let carouselTotal   = 0;
let carouselVisible = 3;   // slides visible at once on desktop
let carouselAutoTimer = null;

function getCarouselVisible() {
  return window.innerWidth < 768 ? 1 : window.innerWidth < 1024 ? 2 : 3;
}

const catCarouselColor = {
  Technical: '#6366f1', Cultural: '#ec4899',
  Sports: '#f59e0b',    Social: '#10b981',
};
const catCarouselEmoji = { Technical:'💻', Cultural:'🎭', Sports:'⚽', Social:'🤝' };

function renderCarousel() {
  const openEvents = events.filter(e => e.status === 'open');
  const track      = document.getElementById('carouselTrack');
  const dots       = document.getElementById('carouselDots');
  const empty      = document.getElementById('carouselEmpty');
  const viewport   = document.querySelector('.carousel-viewport');
  if (!track) return;

  carouselVisible = getCarouselVisible();
  carouselIndex   = 0;

  if (!openEvents.length) {
    track.innerHTML    = '';
    dots.innerHTML     = '';
    if (viewport) viewport.style.display = 'none';
    if (empty)   empty.style.display     = 'block';
    updateCarouselButtons();
    return;
  }

  if (viewport) viewport.style.display = '';
  if (empty)   empty.style.display     = 'none';

  carouselTotal = openEvents.length;

  // Build slides (duplicate first few for seamless feel on desktop)
  track.innerHTML = openEvents.map((e, i) => {
    const club    = clubs.find(c => c.id === e.clubId);
    const clubImg = club?.imageUrl || '';
    const cat     = e.category || 'Technical';
    const color   = catCarouselColor[cat] || '#6366f1';
    const emoji   = catCarouselEmoji[cat] || '🎉';
    const imgContent = clubImg
      ? `<img class="carousel-slide-img" src="${esc(clubImg)}" alt="${esc(e.title)}" loading="lazy" />`
      : `<div class="carousel-slide-fallback" style="background:linear-gradient(135deg,${color},#111827)">${emoji}</div>`;

    return `
      <div class="carousel-slide" onclick="openStudentRegModal('${esc(e.id)}')" title="Register for ${esc(e.title)}">
        ${imgContent}
        <div class="carousel-slide-overlay">
          <span class="cs-cat-badge" style="background:${color}20;border:1px solid ${color}60;color:#fff">${cat}</span>
          <div class="cs-title">${esc(e.title)}</div>
          <div class="cs-meta">
            <span class="cs-status-dot"></span>
            <span>Open</span>
            ${e.date  ? `<span>📅 ${esc(e.date)}</span>`  : ''}
            ${e.venue ? `<span>📍 ${esc(e.venue)}</span>` : ''}
            ${club    ? `<span>🏛 ${esc(club.name)}</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  // Dots: one per page
  const pages = Math.ceil(carouselTotal / carouselVisible) || 1;
  dots.innerHTML = Array.from({ length: pages }, (_, i) =>
    `<button class="carousel-dot${i === 0 ? ' active' : ''}" onclick="carouselGoTo(${i * carouselVisible})"></button>`
  ).join('');

  updateCarouselTrack();
  updateCarouselButtons();
  startCarouselAuto();
}

function carouselMove(dir) {
  carouselVisible = getCarouselVisible();
  const maxIndex  = Math.max(0, carouselTotal - carouselVisible);
  carouselIndex   = Math.min(Math.max(carouselIndex + dir, 0), maxIndex);
  updateCarouselTrack();
  updateCarouselButtons();
  resetCarouselAuto();
}

function carouselGoTo(index) {
  carouselVisible = getCarouselVisible();
  const maxIndex  = Math.max(0, carouselTotal - carouselVisible);
  carouselIndex   = Math.min(index, maxIndex);
  updateCarouselTrack();
  updateCarouselButtons();
  resetCarouselAuto();
}

function updateCarouselTrack() {
  const track      = document.getElementById('carouselTrack');
  const viewport   = document.querySelector('.carousel-viewport');
  if (!track || !viewport) return;

  const slideWidth = viewport.clientWidth / carouselVisible;
  const gapPx      = 18;
  const offset     = carouselIndex * (slideWidth + gapPx - gapPx / carouselVisible);
  track.style.transform = `translateX(-${offset}px)`;

  // Update dots
  const currentPage = Math.floor(carouselIndex / carouselVisible);
  document.querySelectorAll('.carousel-dot').forEach((d, i) =>
    d.classList.toggle('active', i === currentPage)
  );
}

function updateCarouselButtons() {
  carouselVisible = getCarouselVisible();
  const prev = document.getElementById('carouselPrev');
  const next = document.getElementById('carouselNext');
  if (!prev || !next) return;
  prev.disabled = carouselIndex <= 0;
  next.disabled = carouselIndex >= carouselTotal - carouselVisible;
}

function startCarouselAuto() {
  clearInterval(carouselAutoTimer);
  if (carouselTotal <= carouselVisible) return;
  carouselAutoTimer = setInterval(() => {
    carouselVisible = getCarouselVisible();
    const maxIndex = Math.max(0, carouselTotal - carouselVisible);
    carouselIndex = carouselIndex >= maxIndex ? 0 : carouselIndex + 1;
    updateCarouselTrack();
    updateCarouselButtons();
  }, 4000);
}

function resetCarouselAuto() {
  clearInterval(carouselAutoTimer);
  startCarouselAuto();
}

window.addEventListener('resize', () => {
  carouselVisible = getCarouselVisible();
  carouselIndex   = 0;
  updateCarouselTrack();
  updateCarouselButtons();
});

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let start = 0;
  const step = Math.max(1, Math.ceil(target / 40));
  const timer = setInterval(() => {
    start = Math.min(start + step, target);
    el.textContent = start;
    if (start >= target) clearInterval(timer);
  }, 20);
}

function goToCategory(cat) {
  activeCatFilter = cat;
  showPage('events');
  setTimeout(() => {
    document.querySelectorAll('#categoryFilters .pill').forEach(p => {
      p.classList.toggle('active', p.dataset.cat === cat);
    });
  }, 60);
}

/* ══════════════════════════════════════════
   EVENTS PAGE
══════════════════════════════════════════ */
function renderEvents() {
  const search = (document.getElementById('eventSearch')?.value || '').toLowerCase().trim();

  let filtered = events.filter(e => {
    const club = getClub(e.clubId);
    const matchSearch = !search
      || e.title.toLowerCase().includes(search)
      || (club && club.name.toLowerCase().includes(search))
      || (e.venue  && e.venue.toLowerCase().includes(search))
      || e.category.toLowerCase().includes(search);
    const matchCat    = activeCatFilter === 'all' || e.category === activeCatFilter;
    const matchStatus = activeStatusFilter === 'all' || e.status === activeStatusFilter;
    return matchSearch && matchCat && matchStatus;
  });

  // Update subtitle
  const sub = document.getElementById('eventsSubtitle');
  if (sub) sub.textContent = `${filtered.length} of ${events.length} events`;

  const grid = document.getElementById('eventsGrid');
  grid.innerHTML = filtered.length
    ? filtered.map((e, i) => {
        const delay = (i % 9) + 1;
        return `<div class="stagger-${delay}">${eventCard(e)}</div>`;
      }).join('')
    : `<div class="empty-state-box" style="grid-column:1/-1">
         <div class="empty-icon">🔍</div>
         <p>No events match your filters.</p>
       </div>`;
  
  addScrollAnimationsToNewElements();
}

/* ── Event Card — fixed HTML structure matches CSS ── */
function eventCard(e) {
  const club     = getClub(e.clubId);
  const regCount = regsForEvent(e.id).length;
  const catLower = e.category.toLowerCase();
  const isOpen   = e.status === 'open';

  return `
    <div class="event-card">
      <div class="event-card-stripe ec-stripe-${catLower}"></div>
      <div class="event-card-body">
        <div class="ec-top-row">
          <span class="ec-club-name">${esc(club ? club.name : 'Unknown Club')}</span>
          <span class="ec-status-badge ec-status-${e.status}">${isOpen ? 'Open' : 'Closed'}</span>
        </div>
        <h3>${esc(e.title)}</h3>
        <div class="ec-meta">
          <div class="ec-meta-row"><span class="ec-meta-icon">📅</span>${fmt(e.date)}</div>
          ${e.venue ? `<div class="ec-meta-row"><span class="ec-meta-icon">📍</span>${esc(e.venue)}</div>` : ''}
          ${e.description ? `<div class="ec-meta-row" style="color:var(--text-muted);font-size:0.79rem;line-height:1.45;">${esc(e.description.slice(0,90))}${e.description.length > 90 ? '…' : ''}</div>` : ''}
        </div>
        <div class="ec-footer">
          <span class="ec-reg-count">👥 ${regCount} registered</span>
          ${isOpen
            ? `<button class="btn-cta btn-sm" onclick="openStudentRegModal('${e.id}')">Register →</button>`
            : `<button class="btn-cta btn-sm" disabled>Closed</button>`}
        </div>
      </div>
    </div>`;
}

function setCatFilter(cat, btn) {
  activeCatFilter = cat;
  document.querySelectorAll('#categoryFilters .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderEvents();
}

function setStatusFilter(status, btn) {
  activeStatusFilter = status;
  btn.closest('.filter-pills').querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderEvents();
}

/* ══════════════════════════════════════════
   CLUBS PAGE — fixed: card HTML matches CSS classes
══════════════════════════════════════════ */
function renderClubs() {
  const grid     = document.getElementById('clubsGrid');
  const subtitle = document.getElementById('clubsSubtitle');
  if (subtitle) subtitle.textContent = `${clubs.length} clubs registered`;

  const catEmoji = { Technical:'💻', Cultural:'🎭', Sports:'⚽', Social:'🤝' };
  const catColor = { Technical:'#6366f1', Cultural:'#ec4899', Sports:'#f59e0b', Social:'#10b981' };

  grid.innerHTML = clubs.map((c, idx) => {
    const evCount  = events.filter(e => e.clubId === c.id).length;
    const regCount = regsForClub(c.id).length;
    const cat      = c.category || 'default';
    const emoji    = catEmoji[cat] || '🏛️';
    const delay = (idx % 8) + 1;
    const imgHtml  = c.imageUrl
      ? `<img src="${esc(c.imageUrl)}" alt="${esc(c.name)}" style="width:100%;height:160px;object-fit:cover;display:block" />`
      : `<div style="width:100%;height:160px;background:linear-gradient(135deg,${catColor[cat]||'#6366f1'},#111827);display:flex;align-items:center;justify-content:center;font-size:3.5rem">${emoji}</div>`;
    return `
      <div class="stagger-${delay}">
        <div class="club-card" onclick="openClubDetail('${esc(c.id)}')" style="cursor:pointer">
          <div class="cc-stripe-${cat}" style="position:absolute;top:0;left:0;right:0;height:3px;z-index:1"></div>
          <div style="overflow:hidden;border-radius:var(--radius) var(--radius) 0 0;margin:-0px">${imgHtml}</div>
          <div style="padding:1rem 1.2rem 1.2rem">
            <div class="club-card-top" style="margin-bottom:8px">
              <div>
                <div class="club-name">${esc(c.name)}</div>
                <div class="club-id-tag">${esc(c.id)}</div>
              </div>
            </div>
            <p class="club-desc" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(c.description || 'No description available.')}</p>
            <div class="club-footer">
              <span class="club-cat-badge cat-badge-${cat}">${cat}</span>
              <span class="club-stats-mini">📅 ${evCount} events · 👥 ${regCount} regs</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
  
  addScrollAnimationsToNewElements();
}

function openClubDetail(clubId) {
  const c   = clubs.find(cl => cl.id === clubId);
  if (!c) return;
  const cat      = c.category || 'default';
  const catEmoji = { Technical:'💻', Cultural:'🎭', Sports:'⚽', Social:'🤝' };
  const catColor = { Technical:'#6366f1', Cultural:'#ec4899', Sports:'#f59e0b', Social:'#10b981' };
  const clEvents = events.filter(e => e.clubId === clubId);
  const regCount = regsForClub(clubId).length;

  // Image
  const img = document.getElementById('cdImage');
  const fb  = document.getElementById('cdImgFallback');
  if (c.imageUrl) {
    img.src = c.imageUrl; img.style.display = 'block'; fb.style.display = 'none';
  } else {
    img.style.display = 'none';
    fb.style.display  = 'flex';
    fb.textContent    = catEmoji[cat] || '🏛️';
    document.getElementById('cdImgWrapper').style.background =
      `linear-gradient(135deg,${catColor[cat]||'#6366f1'},#111827)`;
  }

  // Category badge
  const badge = document.getElementById('cdCatBadge');
  badge.textContent   = cat;
  badge.style.background = catColor[cat] || '#6366f1';

  document.getElementById('cdName').textContent = c.name;
  document.getElementById('cdId').textContent   = c.id;
  document.getElementById('cdDesc').textContent = c.description || 'No description available.';
  document.getElementById('cdStats').innerHTML  =
    `<div>📅 ${clEvents.length} events</div><div>👥 ${regCount} registrations</div>`;

  // Upcoming events list
  const evDiv = document.getElementById('cdEvents');
  if (clEvents.length) {
    evDiv.innerHTML = `<div style="font-weight:700;font-size:0.85rem;margin-bottom:4px;color:var(--text-secondary)">EVENTS</div>` +
      clEvents.map(e => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-muted);border-radius:var(--radius-sm);padding:0.6rem 0.9rem;font-size:0.83rem">
          <div><strong>${esc(e.title)}</strong> <span style="color:var(--text-muted)">· ${esc(e.date||'TBD')}</span></div>
          <span class="ec-status-badge ec-status-${e.status==='open'?'open':'closed'}">${e.status}</span>
        </div>`).join('');
  } else {
    evDiv.innerHTML = `<div style="font-size:0.83rem;color:var(--text-muted)">No events yet.</div>`;
  }

  openModal('clubDetailModal');
}

/* ══════════════════════════════════════════
   STUDENT REGISTRATION MODAL
══════════════════════════════════════════ */
function openStudentRegModal(preselectedEventId = null) {
  const select   = document.getElementById('regEvent');
  const openEvts = events.filter(e => e.status === 'open');

  if (!openEvts.length) {
    showToast('No open events to register for.', 'error');
    return;
  }

  select.innerHTML = openEvts.map(e =>
    `<option value="${e.id}" ${e.id === preselectedEventId ? 'selected' : ''}>${esc(e.title)}</option>`
  ).join('');

  ['regName','regRoll','regEmail'].forEach(id => document.getElementById(id).value = '');
  ['regNameErr','regRollErr','regEmailErr'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('regSuccess').style.display = 'none';
  document.getElementById('regError').style.display   = 'none';

  updateEventInfo();
  openModal('regModal');
}

function updateEventInfo() {
  const eventId = document.getElementById('regEvent').value;
  const ev  = getEvent(eventId);
  const box = document.getElementById('eventInfoBox');
  if (!ev) { box.innerHTML = ''; box.classList.remove('show'); return; }
  const club = getClub(ev.clubId);
  box.innerHTML = `
    <div class="event-info-item"><span>📅</span>${fmt(ev.date)}</div>
    <div class="event-info-item"><span>📍</span>${ev.venue || 'TBA'}</div>
    <div class="event-info-item"><span>🏛️</span>${club ? esc(club.name) : '—'}</div>
    <div class="event-info-item"><span>👥</span>${regsForEvent(eventId).length} already registered</div>`;
  box.classList.add('show');
}

async function submitRegistration() {
  const eventId = document.getElementById('regEvent').value;
  const name    = document.getElementById('regName').value.trim();
  const roll    = document.getElementById('regRoll').value.trim().toUpperCase();
  const email   = document.getElementById('regEmail').value.trim();

  let valid = true;
  if (!name)  { showFieldErr('regNameErr');  valid = false; } else hideFieldErr('regNameErr');
  if (!roll)  { showFieldErr('regRollErr');  valid = false; } else hideFieldErr('regRollErr');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFieldErr('regEmailErr'); valid = false; } else hideFieldErr('regEmailErr');
  if (!valid) return;

  const duplicate = registrations.find(r => r.eventId === eventId && r.roll === roll);
  if (duplicate) {
    document.getElementById('regError').style.display   = 'flex';
    document.getElementById('regSuccess').style.display = 'none';
    return;
  }

  try {
    const payload = { id: 'REG' + uid(), eventId, name, roll, email, date: new Date().toISOString().split('T')[0] };
    const res  = await fetch(`${API}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const saved = await res.json();
    if (!res.ok) throw new Error(saved.error || 'Registration failed');
    registrations.push(saved);
    document.getElementById('regSuccess').style.display = 'flex';
    document.getElementById('regError').style.display   = 'none';
    showToast(`Registered for "${getEvent(eventId)?.title}"! 🎉`);
    updateEventInfo();
    renderHome();
    setTimeout(() => closeModal('regModal'), 2600);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/* ══════════════════════════════════════════
   DASHBOARD — fixed: class names match CSS
══════════════════════════════════════════ */
function renderDashboard() {
  if (!currentUser || currentUser.type !== 'club') return;
  const club      = getClub(currentUser.clubId);
  const myEvents  = events.filter(e => e.clubId === currentUser.clubId);
  const myRegs    = regsForClub(currentUser.clubId);
  const openCount = myEvents.filter(e => e.status === 'open').length;

  document.getElementById('dashTitle').textContent = club ? club.name + ' Dashboard' : 'Dashboard';
  document.getElementById('dashSub').textContent   = club ? club.description : '';

  // Fixed: use dsc-num / dsc-lbl to match CSS, add color classes
  document.getElementById('dashStats').innerHTML = `
    <div class="dash-stat-card dsc-blue">
      <div class="dsc-num">${myEvents.length}</div>
      <div class="dsc-lbl">Total Events</div>
    </div>
    <div class="dash-stat-card dsc-green">
      <div class="dsc-num">${openCount}</div>
      <div class="dsc-lbl">Open Events</div>
    </div>
    <div class="dash-stat-card dsc-orange">
      <div class="dsc-num">${myRegs.length}</div>
      <div class="dsc-lbl">Registrations</div>
    </div>
    <div class="dash-stat-card dsc-red">
      <div class="dsc-num">${myEvents.length - openCount}</div>
      <div class="dsc-lbl">Closed Events</div>
    </div>`;

  const evTbody = document.getElementById('myEventsTable');
  evTbody.innerHTML = myEvents.length
    ? myEvents.map(e => `
        <tr>
          <td><strong>${esc(e.title)}</strong></td>
          <td>${esc(e.category)}</td>
          <td>${fmt(e.date)}</td>
          <td>${esc(e.venue || '—')}</td>
          <td><span class="status-pill status-${e.status}">${e.status}</span></td>
          <td>${regsForEvent(e.id).length}</td>
          <td class="action-btns">
            <button class="btn-icon" onclick="openEventModal('${e.id}')">✏️ Edit</button>
            <button class="btn-icon ${e.status==='open'?'btn-danger':'btn-success'}" onclick="toggleEventStatus('${e.id}')">
              ${e.status === 'open' ? '🔒 Close' : '🔓 Open'}
            </button>
          </td>
        </tr>`).join('')
    : '<tr class="empty-row"><td colspan="7">No events yet. Click "+ New Event" to create one.</td></tr>';

  const regTbody = document.getElementById('myRegsTable');
  regTbody.innerHTML = myRegs.length
    ? myRegs.map(r => {
        const ev = getEvent(r.eventId);
        return `<tr>
          <td>${esc(r.name)}</td>
          <td>${esc(r.roll)}</td>
          <td>${esc(r.email)}</td>
          <td>${ev ? esc(ev.title) : '—'}</td>
          <td>${ev ? esc(ev.category) : '—'}</td>
          <td>${fmtDate(r.date)}</td>
        </tr>`;
      }).join('')
    : '<tr class="empty-row"><td colspan="6">No registrations yet.</td></tr>';
}

async function toggleEventStatus(eventId) {
  const ev = getEvent(eventId);
  if (!ev) return;
  const newStatus = ev.status === 'open' ? 'closed' : 'open';
  try {
    const res = await fetch(`${API}/events/${eventId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...ev, status: newStatus }),
    });
    const updated = await res.json();
    if (!res.ok) throw new Error(updated.error || 'Failed to update status');
    const idx = events.findIndex(e => e.id === eventId);
    if (idx !== -1) events[idx] = updated;
    showToast(`"${updated.title}" is now ${updated.status}.`, updated.status === 'open' ? 'success' : 'info');
    renderDashboard();
    renderEvents();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');
}

/* ══════════════════════════════════════════
   ADD/EDIT EVENT MODAL
══════════════════════════════════════════ */
function openEventModal(eventId = null) {
  editingEventId = eventId;
  document.getElementById('eventModalTitle').textContent = eventId ? 'Edit Event' : 'New Event';
  document.getElementById('eTitleErr').style.display = 'none';
  document.getElementById('eDateErr').style.display  = 'none';

  if (eventId) {
    const ev = getEvent(eventId);
    if (!ev) return;
    document.getElementById('eTitle').value    = ev.title;
    document.getElementById('eCategory').value = ev.category;
    document.getElementById('eDate').value     = ev.date;
    document.getElementById('eVenue').value    = ev.venue || '';
    document.getElementById('eDesc').value     = ev.description || '';
    document.getElementById('eStatus').value   = ev.status;
  } else {
    document.getElementById('eTitle').value    = '';
    document.getElementById('eCategory').value = 'Technical';
    document.getElementById('eDate').value     = '';
    document.getElementById('eVenue').value    = '';
    document.getElementById('eDesc').value     = '';
    document.getElementById('eStatus').value   = 'open';
  }
  openModal('eventModal');
}

async function saveEvent() {
  const title = document.getElementById('eTitle').value.trim();
  const date  = document.getElementById('eDate').value;
  let valid = true;

  if (!title) { document.getElementById('eTitleErr').style.display = 'block'; valid = false; }
  else          document.getElementById('eTitleErr').style.display = 'none';
  if (!date)  { document.getElementById('eDateErr').style.display  = 'block'; valid = false; }
  else          document.getElementById('eDateErr').style.display  = 'none';
  if (!valid) return;

  const payload = {
    title,
    category:    document.getElementById('eCategory').value,
    date,
    venue:       document.getElementById('eVenue').value.trim(),
    description: document.getElementById('eDesc').value.trim(),
    status:      document.getElementById('eStatus').value,
  };

  try {
    if (editingEventId) {
      const res = await fetch(`${API}/events/${editingEventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || 'Failed to update event');
      const idx = events.findIndex(e => e.id === editingEventId);
      if (idx !== -1) events[idx] = updated;
      showToast('Event updated successfully! ✅');
    } else {
      const clubId = currentUser?.type === 'club' ? currentUser.clubId : clubs[0]?.id;
      const newEvent = { id: 'EVT' + uid(), clubId, ...payload };
      const res = await fetch(`${API}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || 'Failed to create event');
      events.push(saved);
      showToast('New event created! 🎉');
    }
    closeModal('eventModal');
    renderDashboard();
    if (currentUser?.type === 'admin') renderAdmin();
    renderHome();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/* ══════════════════════════════════════════
   ADMIN PANEL
══════════════════════════════════════════ */
function renderAdmin() {
  if (!currentUser || currentUser.type !== 'admin') return;
  renderAdminClubs();
  renderAdminEvents();
  renderAdminRegs();
  renderAnalytics();
}

function adminSection(sectionId, btn) {
  document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(sectionId).style.display = 'block';
  btn.classList.add('active');
}

function renderAdminClubs() {
  const tbody = document.getElementById('adminClubsTable');
  tbody.innerHTML = clubs.map(c => {
    const evCount = events.filter(e => e.clubId === c.id).length;
    return `<tr>
      <td><code>${esc(c.id)}</code></td>
      <td><strong>${esc(c.name)}</strong></td>
      <td>${esc(c.description || '—')}</td>
      <td>${evCount}</td>
      <td class="action-btns">
        <button class="btn-icon btn-danger" onclick="deleteClub('${c.id}')">🗑️ Delete</button>
      </td>
    </tr>`;
  }).join('') || '<tr class="empty-row"><td colspan="5">No clubs.</td></tr>';
}

function renderAdminEvents() {
  const countEl = document.getElementById('adminEventsCount');
  if (countEl) countEl.textContent = events.length + ' events';
  const tbody = document.getElementById('adminEventsTable');
  tbody.innerHTML = events.map(e => {
    const club = getClub(e.clubId);
    return `<tr>
      <td><strong>${esc(e.title)}</strong></td>
      <td>${club ? esc(club.name) : '—'}</td>
      <td>${esc(e.category)}</td>
      <td>${fmtDate(e.date)}</td>
      <td>${esc(e.venue || '—')}</td>
      <td><span class="status-pill status-${e.status}">${e.status}</span></td>
      <td>${regsForEvent(e.id).length}</td>
      <td><button class="btn-icon btn-danger" onclick="deleteEvent('${e.id}')">🗑️</button></td>
    </tr>`;
  }).join('') || '<tr class="empty-row"><td colspan="8">No events.</td></tr>';
}

function renderAdminRegs() {
  const countEl = document.getElementById('adminRegsCount');
  if (countEl) countEl.textContent = registrations.length + ' registrations';
  const tbody = document.getElementById('adminRegsTable');
  tbody.innerHTML = registrations.map(r => {
    const ev   = getEvent(r.eventId);
    const club = ev ? getClub(ev.clubId) : null;
    return `<tr>
      <td>${esc(r.name)}</td>
      <td>${esc(r.roll)}</td>
      <td>${esc(r.email)}</td>
      <td>${ev ? esc(ev.title) : '—'}</td>
      <td>${ev ? esc(ev.category) : '—'}</td>
      <td>${club ? esc(club.name) : '—'}</td>
      <td>${fmtDate(r.date)}</td>
    </tr>`;
  }).join('') || '<tr class="empty-row"><td colspan="7">No registrations yet.</td></tr>';
}

/* Analytics — fixed: use ac-value/ac-label to match CSS */
function renderAnalytics() {
  const grid     = document.getElementById('analyticsGrid');
  const cats     = ['Technical','Cultural','Sports','Social'];
  const catEmoji = { Technical:'💻', Cultural:'🎭', Sports:'⚽', Social:'🤝' };

  const cards = [
    { label:'Total Clubs',         value: clubs.length,                                     icon:'🏛️' },
    { label:'Total Events',        value: events.length,                                    icon:'📅' },
    { label:'Open Events',         value: events.filter(e => e.status === 'open').length,   icon:'🟢' },
    { label:'Total Registrations', value: registrations.length,                             icon:'📋' },
    ...cats.map(cat => ({
      label: cat + ' Events',
      value: events.filter(e => e.category === cat).length,
      icon:  catEmoji[cat],
    })),
    ...clubs.map(c => ({
      label: c.name + ' Regs',
      value: regsForClub(c.id).length,
      icon: '👥',
    })),
  ];

  grid.innerHTML = cards.map(c => `
    <div class="analytics-card">
      <div class="ac-icon">${c.icon}</div>
      <div class="ac-value">${c.value}</div>
      <div class="ac-label">${esc(c.label)}</div>
    </div>`).join('');
}

function openClubModal() {
  document.getElementById('clubModalTitle').textContent = 'Add New Club';
  document.getElementById('cId').value = '';
  document.getElementById('cName').value = '';
  document.getElementById('cDesc').value = '';
  document.getElementById('cPass').value = '';
  document.getElementById('cCategory').value = 'Technical';
  document.getElementById('cImage').value = '';
  document.getElementById('cImgPreviewWrap').style.display = 'none';
  document.getElementById('cImgPlaceholder').style.display = 'block';
  document.getElementById('cSaveBtn').style.display = 'block';
  document.getElementById('cUploadProgress').style.display = 'none';
  openModal('clubModal');
}

function previewClubImg(input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('cImgPreview').src = e.target.result;
    document.getElementById('cImgPreviewWrap').style.display = 'block';
    document.getElementById('cImgPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(input.files[0]);
}

function handleImgDrop(e) {
  e.preventDefault();
  e.currentTarget.style.borderColor = 'var(--border)';
  const file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  const input = document.getElementById('cImage');
  input.files = dt.files;
  previewClubImg(input);
}

async function saveClub() {
  const id   = document.getElementById('cId').value.trim().toUpperCase();
  const name = document.getElementById('cName').value.trim();
  const pass = document.getElementById('cPass').value;
  let valid  = true;

  if (!id || clubs.find(c => c.id === id)) { document.getElementById('cIdErr').style.display   = 'block'; valid = false; }
  else                                        document.getElementById('cIdErr').style.display   = 'none';
  if (!name)                                { document.getElementById('cNameErr').style.display = 'block'; valid = false; }
  else                                        document.getElementById('cNameErr').style.display = 'none';
  if (!pass)                                { document.getElementById('cPassErr').style.display = 'block'; valid = false; }
  else                                        document.getElementById('cPassErr').style.display = 'none';
  if (!valid) return;

  // Build FormData to support optional image upload
  const fd = new FormData();
  fd.append('id',          id);
  fd.append('name',        name);
  fd.append('description', document.getElementById('cDesc').value.trim());
  fd.append('category',    document.getElementById('cCategory').value);
  fd.append('password',    pass);
  const imgFile = document.getElementById('cImage').files[0];
  if (imgFile) fd.append('image', imgFile);

  document.getElementById('cSaveBtn').style.display      = 'none';
  document.getElementById('cUploadProgress').style.display = 'block';

  try {
    const res  = await fetch(`${API}/clubs`, { method: 'POST', body: fd });
    const saved = await res.json();
    if (!res.ok) throw new Error(saved.error || 'Failed to create club');
    clubs.push(saved);
    showToast(`Club "${name}" added! 🏛️`);
    closeModal('clubModal');
    renderAdmin();
    renderClubs();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    document.getElementById('cSaveBtn').style.display      = 'block';
    document.getElementById('cUploadProgress').style.display = 'none';
  }
}

async function deleteClub(clubId) {
  if (!confirm('Delete this club? All its events and registrations will also be removed.')) return;
  try {
    const clubEventIds = events.filter(e => e.clubId === clubId).map(e => e.id);
    await Promise.all(clubEventIds.map(eid =>
      fetch(`${API}/events/${eid}`, { method: 'DELETE' })
    ));
    const res = await fetch(`${API}/clubs/${clubId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete club');
    await loadData();
    showToast('Club deleted.', 'error');
    renderAdmin();
    renderClubs();
    renderHome();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteEvent(eventId) {
  if (!confirm('Delete this event? All its registrations will also be removed.')) return;
  try {
    const res = await fetch(`${API}/events/${eventId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete event');
    await loadData();
    showToast('Event deleted.', 'error');
    renderAdmin();
    renderHome();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/* ══════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════ */
function openModal(id)  { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

/* ══════════════════════════════════════════
   FORM ERROR HELPERS
══════════════════════════════════════════ */
function showFieldErr(id) { const el = document.getElementById(id); if(el) el.style.display = 'block'; }
function hideFieldErr(id) { const el = document.getElementById(id); if(el) el.style.display = 'none';  }

/* ── Hero quick search ──────────────────────────────── */
function heroQuickSearch(val) {
  if (!val.trim()) return;
  const evSearch = document.getElementById('eventSearch');
  if (evSearch) evSearch.value = val;
  activeCatFilter    = 'all';
  activeStatusFilter = 'all';
}

/* ══════════════════════════════════════════
   INITIALIZATION & EVENT LISTENERS
══════════════════════════════════════════ */

function initApp() {
  showLoadingAnimation();
  updateNav();

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    isDark = true;
    document.body.classList.add('dark');
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.textContent = '☀️';
  }

  initScrollAnimations();
  updateScrollProgress();
  loadData();

  window.addEventListener('scroll', () => {
    updateScrollProgress();
    updateBackToTop();
    const navbar = document.getElementById('navbar');
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  document.addEventListener('mousemove', updateCardPointer);
  document.addEventListener('click', handleInteractiveClick);
}

function updateScrollProgress() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  const progress = document.getElementById('scroll-progress');
  if (progress) progress.style.width = scrollPercent + '%';
}

function updateBackToTop() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  const visible = window.scrollY > 450;
  btn.style.display = visible ? 'flex' : 'none';
  btn.style.transform = visible ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.95)';
}

function updateCardPointer(e) {
  const card = e.target.closest('.event-card, .club-card, .cat-card, .analytics-card');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
  card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
}

function handleInteractiveClick(e) {
  const target = e.target.closest('button, a, [role="button"]');
  if (!target) return;

  if (navigator.vibrate) navigator.vibrate(10);

  const style = getComputedStyle(target);
  if (style.position === 'static') target.style.position = 'relative';
  target.style.overflow = 'hidden';

  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.className = 'ripple-ink';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  target.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

document.addEventListener('DOMContentLoaded', initApp);

window.addEventListener('load', () => {
  document.documentElement.style.scrollBehavior = 'smooth';
});