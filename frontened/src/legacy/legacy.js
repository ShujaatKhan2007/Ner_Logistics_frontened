// This module ports the reference prototype's vanilla-JS interactions
// (navigation, tabs, uploads, chat, weather, profile) so the exact markup
// extracted from the reference can stay functional inside React.

import {
  authApi,
  setToken,
  incidentApi,
  velocityApi,
  vehicleApi,
  deliveryApi,
  roadApi,
  alertApi,
  reportApi,
  routeApi,
  syncApi,
} from '../api/client.js';

const ROUTES = {
  login: '/login',
  register: '/register',
  dashboard: '/dashboard',
  roads: '/roads',
  vehicles: '/vehicles',
  routeopt: '/route-optimization',
  velocity: '/velocity',
  weather: '/weather',
  profile: '/profile',
  settings: '/settings',
  report: '/report',
  sync: '/sync',
  alerts: '/alerts',
  deliveries: '/deliveries',
  reports: '/reports',
};

let navigateFn = null;
export function setNavigate(fn) {
  navigateFn = fn;
}

export function toggleMobileMore(open) {
  const p = document.getElementById('mobileMorePanel');
  if (p) p.classList.toggle('open', !!open);
}

// goto() is attached to window so the onclick="goto('x')" attributes that
// live inside the extracted HTML fragments keep working untouched.
export function goto(page) {
  toggleMobileMore(false);
  if (page === 'profile') populateAccountProfile();
  const path = ROUTES[page] || '/dashboard';
  if (navigateFn) navigateFn(path);
}

export function installGlobalBindings() {
  window.goto = goto;
  window.toggleMobileMore = toggleMobileMore;
  window.detectLocation = detectLocation;
  window.geotagIncident = geotagIncident;
  window.setRegisterDriver = setRegisterDriver;
  window.handleRegisterSubmit = handleRegisterSubmit;
  window.handleLoginSubmit = handleLoginSubmit;
  window.velSend = velSend;
  window.velSendQuick = velSendQuick;
  window.fetchLiveWeather = fetchLiveWeather;
}

/* ---------- Role tabs (login / register) ---------- */
// Both the desktop and mobile fragments are present in the DOM at once
// (CSS media queries just hide one of them), so a plain
// querySelector('[data-role-panel="x"]') can grab the hidden copy. This picks
// the one that's actually laid out on screen.
function getVisiblePanel(role) {
  const panels = document.querySelectorAll('[data-role-panel="' + role + '"]');
  for (const p of panels) {
    if (p.offsetParent !== null) return p;
  }
  return panels[0] || null;
}

function wireRoleTabs(root) {
  root.querySelectorAll('.role-tabs').forEach((group) => {
    const tabs = group.querySelectorAll('.role-tab');
    const panelContainer = group.parentElement;
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const role = tab.dataset.role;
        panelContainer.querySelectorAll('[data-role-panel]').forEach((p) => {
          p.style.display = p.dataset.rolePanel === role ? 'block' : 'none';
        });
      });
    });
  });
}

function setLoginRole(root, role) {
  root.querySelectorAll('[data-group="login-role"], [data-group="login-role-m"]').forEach((group) => {
    const tabs = group.querySelectorAll('.role-tab');
    const panelContainer = group.parentElement;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.role === role));
    panelContainer.querySelectorAll('[data-role-panel]').forEach((p) => {
      p.style.display = p.dataset.rolePanel === role ? 'block' : 'none';
    });
  });
}

function showSuccessBanner(role) {
  const roleLabel = role === 'driver' ? 'driver' : 'user';
  const html =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>' +
    '<span>Account created. Sign in with your new ' + roleLabel + ' credentials to continue.</span>';
  ['banner-desktop', 'banner-mobile'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = html;
      el.style.display = 'flex';
    }
  });
}

export function hideSuccessBanner() {
  ['banner-desktop', 'banner-mobile'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function captureAccountDetails(role, profile) {
  try {
    localStorage.setItem('nerAccountProfile', JSON.stringify(profile));
  } catch (e) {
    /* ignore */
  }
  populateAccountProfile();
}

export function populateAccountProfile() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem('nerAccountProfile') || 'null');
  } catch (e) {
    /* ignore */
  }
  if (!data) return;
  const isDriver = !!data.isDriver;
  const name = data.username || (isDriver ? 'New Driver' : 'New User');
  const roleText = data.roleLabel || (isDriver ? 'Verified Driver · NER Logistics' : 'Field / Officer · NER Logistics');
  const initials = data.initials || (name.trim().charAt(0) || 'U').toUpperCase();
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || 'Not provided';
  };
  ['profileNameDesktop', 'profileNameMobile'].forEach((id) => set(id, name));
  ['profileRoleDesktop', 'profileRoleMobile'].forEach((id) => set(id, roleText));
  ['profileAvatarDesktop', 'profileAvatarMobile'].forEach((id) => set(id, initials));
  ['profileUsernameDesktop', 'profileUsernameMobile'].forEach((id) => set(id, data.username));
  ['profileMobileDesktop', 'profileMobileMobile'].forEach((id) => set(id, data.mobile));
  ['profileAadhaarDesktop', 'profileAadhaarMobile'].forEach((id) => set(id, data.aadhaar));
  ['profileLocationDesktop', 'profileLocationMobile'].forEach((id) => set(id, data.location));
  ['profileDlDesktop', 'profileDlMobile'].forEach((id) => set(id, data.dl));
  ['profileBaseDesktop', 'profileBaseMobile'].forEach((id) => set(id, data.location));
  ['profileVehicleDesktop', 'profileVehicleMobile'].forEach((id) =>
    set(id, data.vehiclePhotoUrl ? 'Uploaded and ready' : 'Not uploaded')
  );
  ['profileDriverCardDesktop', 'profileDriverCardMobile'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = isDriver ? 'block' : 'none';
  });
}

async function handleRegisterSubmit(role) {
  const panel = getVisiblePanel(role);
  if (!panel) return;

  const inputs = panel.querySelectorAll('input');
  const value = (i) => (inputs[i] ? inputs[i].value.trim() : '');
  const username = value(0) || (role === 'driver' ? 'New Driver' : 'New User');
  const dl = role === 'driver' ? value(1) : '';
  const aadhaar = role === 'driver' ? value(2) : value(1);
  const mobile = role === 'driver' ? value(3) : value(2);
  const location = role === 'driver' ? value(4) : value(3);

  const passwordInput = panel.querySelector('input[type="password"], input.pw');
  const password = passwordInput ? passwordInput.value : '';
  if (!password || password.length < 6) {
    alert('Please choose a password with at least 6 characters.');
    return;
  }

  let photoFile = null;
  if (role === 'driver') {
    const fileInput = panel.querySelector('input[type="file"]');
    photoFile = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
  }

  const submitBtn = panel.querySelector('.btn-primary');
  if (submitBtn) submitBtn.disabled = true;
  try {
    await authApi.register({ role, username, password, aadhaar, mobile, location, dl }, photoFile);
    if (role === 'driver') publishVehicleProfile();
    setLoginRole(document, role);
    showSuccessBanner(role);
    goto('login');
  } catch (err) {
    alert(err.message || 'Registration failed. Please check the server is running and try again.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function handleLoginSubmit(buttonOrRole) {
  let role;
  let panel;
  if (typeof buttonOrRole === 'string') {
    role = buttonOrRole;
    panel = getVisiblePanel(role);
  } else {
    panel = buttonOrRole.closest('[data-role-panel]');
    role = panel ? panel.dataset.rolePanel : 'user';
  }
  if (!panel) return;

  const inputs = panel.querySelectorAll('input');
  const username = inputs[0] ? inputs[0].value.trim() : '';
  const passwordInput = panel.querySelector('input[type="password"], input.pw');
  const password = passwordInput ? passwordInput.value : '';

  if (!username || !password) {
    alert('Please enter your username and password.');
    return;
  }

  const submitBtn = typeof buttonOrRole === 'string' ? panel.querySelector('.btn-primary') : buttonOrRole;
  if (submitBtn) submitBtn.disabled = true;
  try {
    const { token, profile } = await authApi.login({ role, username, password });
    setToken(token);
    captureAccountDetails(role, profile);
    goto('dashboard');
  } catch (err) {
    alert(err.message || 'Login failed. Please check your credentials and that the server is running.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/* ---------- OTP + password visibility ---------- */
function wireOtpBoxes(root) {
  const boxes = root.querySelectorAll('.otp-box');
  boxes.forEach((box, i, all) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (box.value && all[i + 1]) all[i + 1].focus();
    });
  });
}

function wireFieldEyes(root) {
  root.querySelectorAll('.field-eye').forEach((eye) => {
    eye.addEventListener('click', () => {
      const input = eye.parentElement.querySelector('input[type="password"], input[type="text"].pw');
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        input.classList.add('pw');
      } else {
        input.type = 'password';
      }
    });
  });
}

/* ---------- Incident photo + geotag ---------- */
let incidentPhotoData = null;
let incidentPhotoFile = null;
let incidentGeo = null;

function wireIncidentPhoto(inputId, previewId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.wired) return;
  input.dataset.wired = '1';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('Please choose an incident photo smaller than 8 MB.');
      input.value = '';
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('Please choose a JPG or PNG image.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      incidentPhotoData = e.target.result;
      incidentPhotoFile = file;
      ['incidentPhotoPreviewDesktop', 'incidentPhotoPreviewMobile'].forEach((id) => {
        const preview = document.getElementById(id);
        if (preview) {
          const img = preview.querySelector('img');
          const nameEl = preview.querySelector('.preview-name');
          const geoEl = preview.querySelector('.preview-geo');
          if (img) img.src = incidentPhotoData;
          if (nameEl) nameEl.textContent = file.name;
          if (geoEl) geoEl.textContent = incidentGeo ? 'GPS coordinates attached to this incident photo.' : 'Ready to attach GPS location.';
          preview.classList.add('show');
        }
      });
    };
    reader.readAsDataURL(file);
  });
}

function geotagIncident(device) {
  const update = (text, success, coords) => {
    incidentGeo = { text, coords: coords || incidentGeo?.coords || null };
    ['Desktop', 'Mobile'].forEach((s) => {
      const status = document.getElementById('incidentGeoStatus' + s);
      if (status) status.textContent = text;
      const preview = document.getElementById('incidentPhotoPreview' + s);
      if (preview && incidentPhotoData) {
        const geoEl = preview.querySelector('.preview-geo');
        if (geoEl) geoEl.textContent = success ? 'GPS coordinates attached to this incident photo.' : text;
      }
    });
  };
  if (navigator.geolocation) {
    update('Getting current GPS coordinates...', false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(5);
        const lon = pos.coords.longitude.toFixed(5);
        update('Geotag ready · ' + lat + ', ' + lon, true, { lat: Number(lat), lng: Number(lon) });
      },
      () => {
        update('GPS permission unavailable · Sector 4 location can be used for this prototype.', false);
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  } else {
    update('GPS not supported · Sector 4 location can be used for this prototype.', false);
  }
}

function detectLocation(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = 'Locating...';
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(4);
        const lon = pos.coords.longitude.toFixed(4);
        input.value = lat + ', ' + lon;
      },
      () => {
        input.value = 'Sector 4, Field Unit (GPS unavailable)';
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  } else {
    input.value = 'Sector 4, Field Unit';
  }
}

/* ---------- Weather ---------- */
const weatherCodeMap = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Depositing rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Dense drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'],
  80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: ['Violent rain showers', '⛈️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm with hail', '⛈️'], 99: ['Severe thunderstorm', '⛈️'],
};
function weatherLabel(code) {
  return (weatherCodeMap[code] || ['Conditions unavailable', '🌡️'])[0];
}

function renderWeather(suffix, data, locLabel) {
  const cur = data.current;
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText('weatherLoc' + suffix, locLabel);
  setText('weatherTemp' + suffix, Math.round(cur.temperature_2m) + '°C');
  setText('weatherDesc' + suffix, weatherLabel(cur.weather_code));
  setText('weatherWind' + suffix, Math.round(cur.wind_speed_10m) + ' km/h');
  setText('weatherHumidity' + suffix, Math.round(cur.relative_humidity_2m) + '%');
  setText('weatherFeels' + suffix, Math.round(cur.apparent_temperature) + '°C');
  const forecastEl = document.getElementById('weatherForecast' + suffix);
  if (forecastEl && data.daily) {
    const days = ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5'];
    forecastEl.innerHTML = data.daily.time
      .slice(0, 5)
      .map((d, i) => {
        return (
          '<div class="weather-day"><div class="d">' + days[i] + '</div><div style="font-size:20px;margin-top:4px;">' +
          (weatherCodeMap[data.daily.weather_code[i]] || ['', ''])[1] +
          '</div><div class="t">' + Math.round(data.daily.temperature_2m_max[i]) + '° / ' + Math.round(data.daily.temperature_2m_min[i]) + '°</div></div>'
        );
      })
      .join('');
  }
  const riskyCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99, 45, 48];
  const advisoryBox = document.getElementById('weatherAdvisory' + suffix);
  const advisoryText = document.getElementById('weatherAdvisoryText' + suffix);
  if (advisoryBox && advisoryText) {
    if (riskyCodes.includes(cur.weather_code)) {
      advisoryText.textContent =
        'Current conditions (' + weatherLabel(cur.weather_code) + ') may affect road visibility and travel time. Velocity AI is factoring this into route and vehicle recommendations.';
      advisoryBox.style.display = 'flex';
    } else {
      advisoryBox.style.display = 'none';
    }
  }
}

export function fetchLiveWeather(suffix) {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText('weatherLoc' + suffix, 'Detecting your location...');
  const useCoords = (lat, lon, label) => {
    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto';
    fetch(url)
      .then((r) => r.json())
      .then((data) => renderWeather(suffix, data, label))
      .catch(() => setText('weatherDesc' + suffix, 'Live weather unavailable right now — check your connection.'));
  };
  // Some browsers/OSes can leave the geolocation callback pending
  // indefinitely (e.g. a stalled permission prompt or no location
  // service available) without ever firing success or error — this
  // watchdog guarantees the page still loads a result within 10s.
  let settled = false;
  const settleOnce = (fn) => {
    if (settled) return;
    settled = true;
    fn();
  };
  const fallbackTimer = setTimeout(() => {
    settleOnce(() => useCoords('27.48', '95.35', 'Sector 4, Field Unit (approx.)'));
  }, 10000);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(fallbackTimer);
        settleOnce(() => {
          const lat = pos.coords.latitude.toFixed(3);
          const lon = pos.coords.longitude.toFixed(3);
          useCoords(lat, lon, 'Your location · ' + lat + ', ' + lon);
        });
      },
      () => {
        clearTimeout(fallbackTimer);
        settleOnce(() => useCoords('27.48', '95.35', 'Sector 4, Field Unit (approx.)'));
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  } else {
    clearTimeout(fallbackTimer);
    settleOnce(() => useCoords('27.48', '95.35', 'Sector 4, Field Unit (approx.)'));
  }
}

/* ---------- Velocity AI chatbot ---------- */
function velAppendMsg(containerId, text, who) {
  const body = document.getElementById(containerId);
  if (!body) return;
  const div = document.createElement('div');
  div.className = 'vel-msg ' + who;
  div.innerHTML = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}
function velShowTyping(containerId) {
  const body = document.getElementById(containerId);
  if (!body) return;
  const t = document.createElement('div');
  t.className = 'vel-typing';
  t.id = containerId + 'Typing';
  t.innerHTML = '<span></span><span></span><span></span>';
  body.appendChild(t);
  body.scrollTop = body.scrollHeight;
}
function velHideTyping(containerId) {
  const t = document.getElementById(containerId + 'Typing');
  if (t) t.remove();
}
async function velBotReply(userText, containerId) {
  let reply;
  try {
    const { reply: liveReply } = await velocityApi.chat(userText);
    reply = liveReply;
  } catch (err) {
    reply = velScriptedReply(userText);
  }
  velHideTyping(containerId);
  velAppendMsg(containerId, reply, 'bot');
}

// Deterministic fallback used when the backend/Velocity AI endpoint is
// unreachable (e.g. offline field use, or MongoDB/API not yet configured).
function velScriptedReply(userText) {
  const text = userText.toLowerCase();
  if (text.includes('2 vehicle') || text.includes('two vehicle') || text.includes('different direction')) {
    return "Got it — two vehicles, two directions. I compared both legs: <b>Order A</b> has an easy, low-risk road, while <b>Order B</b> runs through a longer, incident-prone stretch. I'm assigning the strongest available driver to Order B first so it isn't left running late, and a nearby driver will cover Order A right after.";
  }
  if (text.includes('confirm')) {
    return 'Booking confirmed ✅ Your driver is <b>Rajesh Kumar</b> (Tata 407 · AS 01 AB 4821). His contact number will be shared with you now that the trip is booked: <b>+91 98765 43210</b>.';
  }
  if (text.includes('safe') || text.includes('safety') || text.includes('risk')) {
    return 'Safety comes first. I cross-check every route against photos uploaded to Incident Reports and live Google Maps data, and I steer around any road flagged for landslides, flooding or blockages.';
  }
  if (text.includes('driver') || text.includes('vehicle')) {
    return "Based on your location, I'd recommend <b>Rajesh Kumar</b> driving a Tata 407 Cargo Truck — he's 0.8 km away, available now, and it's the best vehicle type for this load.";
  }
  if (text.includes('hi') || text.includes('hello') || text.includes('hey')) {
    return "Hey! Just tell me your pickup and drop location and I'll get you matched with the best driver.";
  }
  if (text.includes('to') || text.includes('→')) {
    return 'Searching nearby drivers and plotting the safest path with Google Maps...<br><br>Best match: <b>Rajesh Kumar</b> · Tata 407 Cargo Truck · 0.8 km away · <b>18 min ETA</b> on a 12.4 km route that avoids the Coastal Road B landslide reported this morning.<ul><li>Nearest available driver for this load right now</li><li>Lowest incident density on this corridor</li></ul>Want me to confirm this booking?';
  }
  return 'I can help you find the best driver and vehicle, plan routes around active incidents, or handle multiple orders heading in different directions. Try telling me a pickup and drop location, or tap one of the quick options below.';
}
function velSend(inputId, containerId) {
  const input = document.getElementById(inputId);
  if (!input || !input.value.trim()) return;
  const val = input.value.trim();
  velAppendMsg(containerId, val.replace(/</g, '&lt;'), 'user');
  input.value = '';
  velShowTyping(containerId);
  setTimeout(() => velBotReply(val, containerId), 400);
}
function velSendQuick(text, containerId) {
  velAppendMsg(containerId, text, 'user');
  velShowTyping(containerId);
  setTimeout(() => velBotReply(text, containerId), 400);
}

/* ---------- Vehicle photo (driver registration) ---------- */
let vehiclePhotoData = null;
function wireVehiclePhoto(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.wired) return;
  input.dataset.wired = '1';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Please choose a vehicle photo smaller than 5 MB.');
      input.value = '';
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('Please choose a JPG or PNG image.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      vehiclePhotoData = e.target.result;
      window.newVehiclePhotoReady = true;
      [document.getElementById('vehiclePreviewDesktop'), document.getElementById('vehiclePreviewMobile')].forEach((el) => {
        if (el) el.innerHTML = '<img src="' + vehiclePhotoData + '" alt="Vehicle preview">';
      });
      ['vehicleUploadSuccessDesktop', 'vehicleUploadSuccessMobile'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('show');
      });
    };
    reader.readAsDataURL(file);
  });
}
function setRegisterDriver() {
  document.querySelectorAll('[data-group="register-role"]').forEach((group) => {
    const tab = group.querySelector('[data-role="driver"]');
    if (tab) tab.click();
  });
}
function publishVehicleProfile() {
  if (!vehiclePhotoData) return;
  const card = document.getElementById('newDriverVehicleCard');
  const photo = document.getElementById('newDriverVehiclePhoto');
  if (card && photo) {
    photo.innerHTML = '<img src="' + vehiclePhotoData + '" alt="Registered driver vehicle">';
    card.style.display = 'block';
  }
}

/* ---------- Incident report submission ---------- */
function wireSeverityButtons(containerId) {
  const container = document.getElementById(containerId);
  if (!container || container.dataset.wired) return;
  container.dataset.wired = '1';
  const buttons = container.querySelectorAll('[data-value]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function getSelectedSeverity(containerId) {
  const container = document.getElementById(containerId);
  const active = container && container.querySelector('.active[data-value]');
  return active ? active.dataset.value : 'Medium';
}

async function submitIncidentReport(suffix) {
  const typeEl = document.getElementById('incidentType' + suffix);
  const descEl = document.getElementById('incidentDesc' + suffix);
  const msgEl = document.getElementById('incidentSubmitMsg' + suffix);
  const submitBtn = document.getElementById('incidentSubmit' + suffix);

  const type = typeEl ? typeEl.value : '';
  if (!type) {
    alert('Please select an incident type.');
    return;
  }

  const severity = getSelectedSeverity('incidentSeverity' + suffix);
  const description = descEl ? descEl.value.trim() : '';

  const showMsg = (text, isError) => {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.color = isError ? '#DC2626' : '#16A34A';
    msgEl.style.display = 'block';
  };

  if (submitBtn) submitBtn.disabled = true;
  try {
    const fields = {
      type,
      severity,
      description,
      locationLabel: incidentGeo?.text || '',
      lat: incidentGeo?.coords?.lat,
      lng: incidentGeo?.coords?.lng,
    };
    await incidentApi.create(fields, incidentPhotoFile);
    showMsg('Incident report submitted successfully.', false);
    if (descEl) descEl.value = '';
    incidentPhotoFile = null;
    incidentPhotoData = null;
  } catch (err) {
    showMsg(err.message || 'Could not submit right now — it will be queued for sync.', true);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function wireIncidentSubmit(suffix) {
  const btn = document.getElementById('incidentSubmit' + suffix);
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', () => submitIncidentReport(suffix));
}

/* ---------- Live data rendering (Dashboard / Roads / Vehicles / Deliveries / Alerts / Reports) ---------- */
// Every function below is defensive: if the backend isn't reachable (no
// token yet, MongoDB not configured, server not running...) it simply
// leaves the original static mock markup in place instead of throwing.

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const ALERT_TAG_CLASS = { CRITICAL: 'critical', 'HIGH RISK': 'highrisk', UPDATE: '', LOGISTICS: '' };
const ALERT_TAG_CHIP = { CRITICAL: 'critical', 'HIGH RISK': 'highrisk', UPDATE: 'update', LOGISTICS: 'logistics' };

function renderAlertItemHtml(alert) {
  const itemClass = ALERT_TAG_CLASS[alert.tag] || '';
  const chipClass = ALERT_TAG_CHIP[alert.tag] || 'update';
  return (
    `<div class="alert-item ${itemClass}"><div class="alert-top">` +
    `<span class="alert-tag ${chipClass}">${escapeHtml(alert.tag)}</span>` +
    `<span class="alert-time">${timeAgo(alert.createdAt)}</span></div>` +
    `<div class="alert-title">${escapeHtml(alert.title)}</div>` +
    `<div class="alert-desc">${escapeHtml(alert.description)}</div></div>`
  );
}

async function loadDashboardData(root) {
  const hasStats = root.querySelector('#statVehiclesDesktop, #statVehiclesMobile');
  const hasAlerts = root.querySelector('#dashboardAlertsListDesktop');
  if (!hasStats && !hasAlerts) return;

  try {
    const [{ vehicles }, { deliveries, stats }, { roads }, { incidents }, { alerts }] = await Promise.all([
      vehicleApi.list(),
      deliveryApi.list('?limit=1'),
      roadApi.list('?limit=200'),
      incidentApi.list('?status=Open&limit=200'),
      alertApi.list(6),
    ]);

    const activeVehicles = vehicles.filter((v) => v.status === 'Active').length;
    const blockedRoads = roads.filter((r) => r.status === 'Blocked').length;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('statVehiclesDesktop', activeVehicles);
    setText('statVehiclesMobile', activeVehicles);
    setText('statDeliveriesDesktop', stats.active);
    setText('statDeliveriesMobile', stats.active);
    setText('statRoadsDesktop', blockedRoads);
    setText('statAlertsMobile', alerts.length);
    setText('statIncidentsDesktop', incidents.length);
    setText('statIncidentsMobile', incidents.length);

    const listEl = document.getElementById('dashboardAlertsListDesktop');
    if (listEl && alerts.length) {
      listEl.innerHTML = alerts.map(renderAlertItemHtml).join('');
    }
  } catch (err) {
    // Backend not reachable yet — keep the static demo content visible.
    console.warn('Dashboard live data unavailable:', err.message);
  }
}

const ROAD_STATUS_CLASS = { Accessible: 'accessible', Risky: 'risky', Blocked: 'blocked' };

async function loadRoadsData(root) {
  const tbody = document.getElementById('roadsTableBody');
  const mobileList = document.getElementById('roadsListMobile');
  if (!tbody && !mobileList) return;

  try {
    const { roads, total } = await roadApi.list('?limit=50');
    if (tbody) {
      tbody.innerHTML = roads
        .map((r) => {
          const risk = r.riskReason ? `${r.riskLevel} - ${r.riskReason}` : r.riskLevel;
          return (
            `<tr><td class="road-name">${escapeHtml(r.name)}</td><td>${escapeHtml(r.district)}</td>` +
            `<td><span class="status-pill ${ROAD_STATUS_CLASS[r.status] || 'accessible'}">${escapeHtml(r.status)}</span></td>` +
            `<td>${escapeHtml(risk)}</td><td>${timeAgo(r.lastUpdatedAt)}</td></tr>`
          );
        })
        .join('');
      const foot = tbody.closest('.panel-card')?.querySelector('.table-foot div');
      if (foot) foot.textContent = `Showing 1 to ${roads.length} of ${total} routes`;
    }
    if (mobileList) {
      const countEl = document.getElementById('roadsCountMobile');
      if (countEl) countEl.textContent = `${total} routes`;
      mobileList.innerHTML = roads
        .slice(0, 8)
        .map((r) => {
          const isBlocked = r.status === 'Blocked';
          const style = isBlocked ? ' style="background:#FCE8E8;color:#DC2626;"' : '';
          return (
            `<div class="mobile-list-item"><div><div class="mobile-list-title">${escapeHtml(r.name)}</div>` +
            `<div class="mobile-list-sub">${escapeHtml(r.district)}${r.riskReason ? ' · ' + escapeHtml(r.riskReason) : ''}</div></div>` +
            `<span class="mobile-status"${style}>${escapeHtml(r.status)}</span></div>`
          );
        })
        .join('');
    }
  } catch (err) {
    console.warn('Roads live data unavailable:', err.message);
  }
}

async function loadVehiclesData(root) {
  const grid = document.getElementById('vehicleGrid');
  const mobileList = document.getElementById('vehicleListMobile');
  if (!grid && !mobileList) return;

  try {
    const { vehicles } = await vehicleApi.list();
    if (!vehicles.length) return;

    if (grid) {
      grid.innerHTML = vehicles
        .map((v) => {
          const ownerName = v.owner?.username || 'Unassigned';
          const initial = (ownerName.trim().charAt(0) || 'D').toUpperCase();
          const photo = v.photoUrl
            ? `<img src="${escapeHtml(fileUrlLocal(v.photoUrl))}" alt="${escapeHtml(v.name)}" style="width:100%;height:100%;object-fit:cover;">`
            : `<svg fill="none" stroke="currentColor" stroke-width="1.5" viewbox="0 0 24 24"><rect height="9" rx="1.5" width="13" x="1" y="7"></rect><path d="M14 10h4l3 3v3h-7z"></path><circle cx="6" cy="18" r="1.6"></circle><circle cx="17" cy="18" r="1.6"></circle></svg>`;
          return (
            `<div class="vehicle-card"><div class="vehicle-card-photo">${photo}</div>` +
            `<div class="vehicle-card-body"><div class="vehicle-card-top"><div><div class="vehicle-name">${escapeHtml(v.name)}</div>` +
            `<div class="vehicle-number">${escapeHtml(v.number)}</div></div><span class="vehicle-status">${escapeHtml(v.status)}</span></div>` +
            `<div class="vehicle-meta"><div class="vehicle-meta-box"><div class="vehicle-meta-k">Type</div><div class="vehicle-meta-v">${escapeHtml(v.type)}</div></div>` +
            `<div class="vehicle-meta-box"><div class="vehicle-meta-k">Capacity</div><div class="vehicle-meta-v">${v.capacityTons} Ton</div></div></div>` +
            `<div class="vehicle-owner"><span class="vehicle-owner-avatar">${initial}</span> ${escapeHtml(ownerName)} · Verified Driver</div></div></div>`
          );
        })
        .join('');
    }
    if (mobileList) {
      mobileList.innerHTML = vehicles
        .map((v) => {
          const ownerName = v.owner?.username || 'Unassigned';
          return (
            `<div class="vehicle-mobile-card"><div class="vehicle-mobile-photo"><svg fill="none" stroke="currentColor" stroke-width="1.5" viewbox="0 0 24 24"><rect height="9" rx="1.5" width="13" x="1" y="7"></rect><path d="M14 10h4l3 3v3h-7z"></path><circle cx="6" cy="18" r="1.6"></circle><circle cx="17" cy="18" r="1.6"></circle></svg></div>` +
            `<div class="vehicle-mobile-info"><strong>${escapeHtml(v.name)} · ${escapeHtml(v.number)}</strong><p>Registered driver: ${escapeHtml(ownerName)}</p>` +
            `<div class="vehicle-meta-row"><span class="vehicle-chip">${escapeHtml(v.type)}</span><span class="vehicle-chip">${v.capacityTons} Ton</span><span class="vehicle-chip">${escapeHtml(v.status)}</span></div></div></div>`
          );
        })
        .join('');
    }
  } catch (err) {
    console.warn('Vehicles live data unavailable:', err.message);
  }
}

function fileUrlLocal(path) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  return path.startsWith('http') ? path : `${base}${path}`;
}

const DELIVERY_STATUS_CLASS = {
  'On Route': 'accessible', Scheduled: 'accessible', Delivered: 'accessible',
  Delayed: 'risky', Rerouting: 'blocked',
};

async function loadDeliveriesData(root) {
  const tbody = document.getElementById('deliveriesTableBody');
  const mobileList = document.getElementById('deliveriesListMobile');
  if (!tbody && !mobileList) return;

  try {
    const { deliveries, total, stats } = await deliveryApi.list('?limit=50');

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('statActiveDeliveriesDesktop', stats.active);
    setText('statDeliveredTodayDesktop', stats.deliveredToday);
    setText('statScheduledDesktop', stats.scheduled);

    if (tbody) {
      tbody.innerHTML = deliveries
        .map((d) => {
          const driverName = d.driver?.username || '—';
          const pillClass = DELIVERY_STATUS_CLASS[d.status] || 'accessible';
          return (
            `<tr><td class="road-name">${escapeHtml(d.displayId)}</td>` +
            `<td>${escapeHtml(d.originLabel)} → ${escapeHtml(d.destinationLabel)}</td>` +
            `<td>${escapeHtml(driverName)}</td>` +
            `<td><span class="status-pill ${pillClass}">${escapeHtml(d.status)}</span></td>` +
            `<td>${escapeHtml(d.etaLabel)}</td></tr>`
          );
        })
        .join('');
      const foot = tbody.closest('.panel-card')?.querySelector('.table-foot div');
      if (foot) foot.textContent = `Showing 1 to ${deliveries.length} of ${total} deliveries`;
    }
    if (mobileList) {
      const countEl = document.getElementById('deliveriesActiveCountMobile');
      if (countEl) countEl.textContent = `${stats.active} active`;
      mobileList.innerHTML = deliveries
        .slice(0, 8)
        .map(
          (d) =>
            `<div class="mobile-list-item"><div class="mobile-list-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewbox="0 0 24 24"><rect height="4" rx="1" width="18" x="3" y="4"></rect><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"></path></svg></div>` +
            `<div><div class="mobile-list-title">Delivery ${escapeHtml(d.displayId)}</div><div class="mobile-list-sub">${escapeHtml(d.originLabel)} → ${escapeHtml(d.destinationLabel)}</div></div>` +
            `<span class="mobile-status">${escapeHtml(d.status)}</span></div>`
        )
        .join('');
    }
  } catch (err) {
    console.warn('Deliveries live data unavailable:', err.message);
  }
}

async function loadAlertsPageData(root) {
  const listEl = document.getElementById('alertsListDesktop');
  if (!listEl) return;
  try {
    const { alerts } = await alertApi.list(30);
    if (alerts.length) listEl.innerHTML = alerts.map(renderAlertItemHtml).join('');
  } catch (err) {
    console.warn('Alerts live data unavailable:', err.message);
  }
}

const REPORT_TAG_CHIP = { DAILY: 'logistics', FIELD: 'update', WEEKLY: 'logistics', MONTHLY: 'update' };

async function loadReportsData(root) {
  const listEl = document.getElementById('reportsListDesktop');
  const genBtn = document.getElementById('generateReportBtn');

  if (genBtn && !genBtn.dataset.wired) {
    genBtn.dataset.wired = '1';
    genBtn.addEventListener('click', async () => {
      genBtn.textContent = 'Generating…';
      try {
        await reportApi.generate({ cadence: 'DAILY' });
        await loadReportsData(root);
      } catch (err) {
        alert(err.message || 'Could not generate report.');
      } finally {
        genBtn.textContent = '+ Generate Report';
      }
    });
  }

  if (!listEl) return;
  try {
    const { reports } = await reportApi.list();
    if (reports.length) {
      listEl.innerHTML = reports
        .map(
          (r) =>
            `<div class="alert-item"><div class="alert-top"><span class="alert-tag ${REPORT_TAG_CHIP[r.cadence] || 'update'}">${escapeHtml(r.cadence)}</span>` +
            `<span class="alert-time">${r.status === 'Ready' ? 'Ready' : 'Generating…'}</span></div>` +
            `<div class="alert-title">${escapeHtml(r.title)}</div><div class="alert-desc">${escapeHtml(r.description)}</div></div>`
        )
        .join('');
    }
  } catch (err) {
    console.warn('Reports live data unavailable:', err.message);
  }
}

/* ---------- Real map (Leaflet + OpenStreetMap — free, no API key) ---------- */
let leafletLoadingPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadingPromise) return leafletLoadingPromise;
  leafletLoadingPromise = new Promise((resolve, reject) => {
    const cssHref = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    if (!document.querySelector(`link[href="${cssHref}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssHref;
      document.head.appendChild(link);
    }
    const scriptSrc = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    const existing = document.querySelector(`script[src="${scriptSrc}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L));
      return;
    }
    const script = document.createElement('script');
    script.src = scriptSrc;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Could not load the map library.'));
    document.head.appendChild(script);
  });
  return leafletLoadingPromise;
}

// Decodes the Google/ORS "encoded polyline" format into [lat, lng] pairs —
// both providers use the same well-known algorithm, so this works for either.
function decodePolyline(encoded) {
  if (!encoded) return [];
  let index = 0, lat = 0, lng = 0;
  const coordinates = [];
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lat / 1e5, lng / 1e5]);
  }
  return coordinates;
}

/* ---------- Route Optimization page ---------- */
let routeOptMap = null;
let routeOptLayers = [];

function renderRouteCardHtml(option) {
  const chipClass = option.riskLevel === 'High' ? 'high' : option.riskLevel === 'Medium' ? 'neutral' : 'low';
  const tag = option.recommended
    ? '<div class="route-tag"><svg fill="none" stroke="currentColor" stroke-width="2" viewbox="0 0 24 24"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"></path><path d="M9 12l2 2 4-4"></path></svg>RECOMMENDED</div>'
    : '';
  const btn = option.recommended
    ? '<button class="begin-btn"><svg fill="none" stroke="currentColor" stroke-width="2.4" viewbox="0 0 24 24"><path d="M3 11l18-8-8 18-2-8-8-2z"></path></svg>Begin Navigation</button>'
    : '';
  return (
    `<div class="route-card${option.recommended ? ' recommended' : ''}">` +
    tag +
    `<div class="route-top"><div class="route-name">${escapeHtml(option.label)}</div>` +
    `<div class="route-eta"><div class="dur">${Math.floor(option.durationMinutes / 60)}h ${option.durationMinutes % 60}m</div>` +
    `<div class="eta">${escapeHtml(option.durationText || '')}</div></div></div>` +
    `<div class="route-meta"><div class="meta-chip neutral"><div class="k">Distance</div><div class="v">${option.distanceKm} km</div></div>` +
    `<div class="meta-chip ${chipClass}"><div class="k">Risk Level</div><div class="v">${escapeHtml(option.riskLevel)} <svg fill="currentColor" viewbox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle></svg></div></div></div>` +
    btn +
    `</div>`
  );
}

async function calculateRoute(suffix) {
  const originInput = document.getElementById('routeOrigin' + suffix);
  const destInput = document.getElementById('routeDest' + suffix);
  const errorEl = document.getElementById('routeError' + suffix);
  const resultsEl = document.getElementById('routeResults' + suffix);
  const mapEl = document.getElementById('routeMap' + suffix);
  const btn = document.getElementById('routeCalcBtn' + suffix);

  if (!originInput || !destInput) return;
  const origin = originInput.value.trim();
  const destination = destInput.value.trim();
  if (errorEl) errorEl.style.display = 'none';
  if (!origin || !destination) {
    if (errorEl) {
      errorEl.textContent = 'Please enter both an origin and a destination.';
      errorEl.style.display = 'block';
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Calculating...';
  }

  try {
    const { routeOptimization } = await routeApi.optimize({ origin, destination });
    const options = routeOptimization.options || [];

    if (resultsEl) {
      resultsEl.innerHTML = options.map(renderRouteCardHtml).join('');
    }

    if (mapEl) {
      const L = await loadLeaflet();
      if (!routeOptMap) {
        routeOptMap = L.map(mapEl).setView([27.48, 95.35], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(routeOptMap);
      } else {
        routeOptMap.setView(routeOptMap.getCenter());
      }
      routeOptLayers.forEach((l) => routeOptMap.removeLayer(l));
      routeOptLayers = [];

      const bounds = [];
      const colors = ['#2563EB', '#94A3B8', '#F59E0B'];
      options.forEach((opt, i) => {
        const points = decodePolyline(opt.polyline);
        if (!points.length) return;
        const line = L.polyline(points, { color: colors[i] || '#94A3B8', weight: opt.recommended ? 6 : 4, opacity: opt.recommended ? 0.95 : 0.6 }).addTo(routeOptMap);
        routeOptLayers.push(line);
        points.forEach((p) => bounds.push(p));
      });
      if (bounds.length) {
        const originMarker = L.marker(bounds[0]).addTo(routeOptMap).bindPopup(`Origin: ${escapeHtml(origin)}`);
        const destMarker = L.marker(bounds[bounds.length - 1]).addTo(routeOptMap).bindPopup(`Destination: ${escapeHtml(destination)}`);
        routeOptLayers.push(originMarker, destMarker);
        routeOptMap.fitBounds(bounds, { padding: [30, 30] });
      }
      setTimeout(() => routeOptMap && routeOptMap.invalidateSize(), 200);
    }
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'Could not calculate a route right now.';
      errorEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Calculate Route';
    }
  }
}

function wireRouteOptimizationPage(root) {
  const btn = document.getElementById('routeCalcBtnDesktop');
  if (btn && !btn.dataset.wired) {
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => calculateRoute('Desktop'));
    // Auto-run once on first visit using the pre-filled demo origin/destination.
    calculateRoute('Desktop');
  }
}

/* ---------- Sync page ---------- */
function applySyncUi(suffix, { pendingReports, pendingPhotos, lastSyncedAt }) {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText('syncPendingReports' + suffix, pendingReports);
  setText('syncPendingPhotos' + suffix, pendingPhotos);
  setText('syncRowReports' + suffix, pendingReports);
  setText('syncRowPhotos' + suffix, pendingPhotos);
  const lastSyncedLabel = lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Never';
  setText('syncLastSynced' + suffix, lastSyncedLabel);

  const totalPending = (pendingReports || 0) + (pendingPhotos || 0);
  const isOnline = navigator.onLine !== false;
  setText('syncStatusText' + suffix, totalPending === 0 ? 'Status: Up to date' : isOnline ? 'Status: Online' : 'Status: Offline');
  setText(
    'syncStatusDesc' + suffix,
    totalPending === 0
      ? 'All field reports and photos have been synchronized.'
      : isOnline
      ? `${totalPending} item(s) are ready to sync.`
      : 'Data is being saved locally until the connection is restored.'
  );
  const badge = document.getElementById('syncStatusBadge' + suffix);
  if (badge) badge.textContent = totalPending === 0 ? 'UP TO DATE' : 'SYNC READY';
}

async function loadSyncPageData(root) {
  const hasSyncUi = document.getElementById('syncPendingReportsDesktop') || document.getElementById('syncPendingReportsMobile');
  if (!hasSyncUi) return;
  try {
    const status = await syncApi.status();
    applySyncUi('Desktop', status);
    applySyncUi('Mobile', status);
  } catch (err) {
    console.warn('Sync status unavailable:', err.message);
  }
}

function wireSyncButtons(root) {
  ['Desktop', 'Mobile'].forEach((suffix) => {
    const btn = document.getElementById('syncNowBtn' + suffix);
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', async () => {
      const original = btn.textContent;
      btn.textContent = 'Syncing...';
      btn.disabled = true;
      try {
        await syncApi.run();
        await loadSyncPageData(root);
      } catch (err) {
        alert(err.message || 'Could not sync right now — check your connection.');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
}

function loadLiveData(root) {
  loadDashboardData(root);
  loadRoadsData(root);
  loadVehiclesData(root);
  loadDeliveriesData(root);
  loadAlertsPageData(root);
  loadReportsData(root);
  wireRouteOptimizationPage(root);
  wireSyncButtons(root);
  loadSyncPageData(root);
}

/* ---------- Master init, called after every page render ---------- */
export function initPageBehaviors(root) {
  if (!root) return;
  wireRoleTabs(root);
  wireOtpBoxes(root);
  wireFieldEyes(root);

  wireIncidentPhoto('incidentPhotoDesktop', 'incidentPhotoPreviewDesktop');
  wireIncidentPhoto('incidentGalleryDesktop', 'incidentPhotoPreviewDesktop');
  wireIncidentPhoto('incidentPhotoMobile', 'incidentPhotoPreviewMobile');
  wireIncidentPhoto('incidentGalleryMobile', 'incidentPhotoPreviewMobile');

  wireSeverityButtons('incidentSeverityDesktop');
  wireSeverityButtons('incidentSeverityMobile');
  wireIncidentSubmit('Desktop');
  wireIncidentSubmit('Mobile');

  wireVehiclePhoto('vehiclePhotoDesktop');
  wireVehiclePhoto('vehiclePhotoMobile');

  if (root.querySelector('#weatherLocDesktop') || root.querySelector('#weatherLocMobile')) {
    fetchLiveWeather('Desktop');
    fetchLiveWeather('Mobile');
  }

  if (root.querySelector('[data-page="profile"]') || document.getElementById('profileNameDesktop')) {
    populateAccountProfile();
  }

  loadLiveData(root);
}
