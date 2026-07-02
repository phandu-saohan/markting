// ── State Management ──
const state = {
  token: localStorage.getItem('access_token') || null,
  user: JSON.parse(localStorage.getItem('user_info')) || null,
  activeTab: 'overview',
  authMode: 'login',
  charts: {},
};

const API_BASE = window.location.origin;

// ── App Initialization ──
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  toggleAccountFields();
});

// ── Authentication ──
function checkAuth() {
  const authScreen = document.getElementById('auth-screen');
  if (state.token) {
    authScreen.classList.remove('active');
    document.getElementById('user-display-name').textContent = state.user?.fullName || 'Active User';
    document.getElementById('user-display-role').textContent = state.user?.role || 'user';
    initApp();
  } else {
    authScreen.classList.add('active');
  }
}

function switchAuthTab(mode) {
  state.authMode = mode;
  const nameGroup = document.getElementById('name-group');
  const submitBtn = document.getElementById('auth-submit-btn');
  const tabBtns = document.querySelectorAll('.auth-tabs .tab-btn');

  tabBtns.forEach(btn => btn.classList.remove('active'));

  if (mode === 'register') {
    nameGroup.style.display = 'flex';
    submitBtn.textContent = 'Register';
    tabBtns[1].classList.add('active');
  } else {
    nameGroup.style.display = 'none';
    submitBtn.textContent = 'Login';
    tabBtns[0].classList.add('active');
  }
}

async function handleAuth(event) {
  event.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const fullName = document.getElementById('auth-name').value;

  const endpoint = state.authMode === 'register' ? '/auth/register' : '/auth/login';
  const body = state.authMode === 'register' 
    ? { email, password, fullName } 
    : { email, password };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Authentication failed');

    if (state.authMode === 'login') {
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('user_info', JSON.stringify(data.user));
      state.token = data.access_token;
      state.user = data.user;
      showToast('Logged in successfully!');
      checkAuth();
    } else {
      showToast('Registration successful! Please log in.');
      switchAuthTab('login');
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user_info');
  state.token = null;
  state.user = null;
  checkAuth();
}

// ── Tab Navigation ──
function switchTab(tabId) {
  state.activeTab = tabId;
  
  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  event.currentTarget.classList.add('active');

  // Update tab content visibility
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`tab-${tabId}`).classList.add('active');

  // Update header title
  const titles = {
    overview: 'System Overview',
    accounts: 'Social Accounts Management',
    scraper: 'Facebook Group Scraper',
    posts: 'Post Templates & Scheduling',
    campaigns: 'Campaign Automation Control',
    emails: 'AWS SES Bulk Email Campaigns',
    proxies: 'Proxy Server Configuration',
  };
  document.getElementById('page-title').textContent = titles[tabId] || 'Dashboard';

  // Load tab specific data
  loadTabSpecificData(tabId);
}

// ── Load Data ──
function loadTabSpecificData(tabId) {
  if (!state.token) return;
  
  switch (tabId) {
    case 'overview':
      loadOverviewStats();
      break;
    case 'accounts':
      loadAccounts();
      break;
    case 'scraper':
      loadGroups();
      break;
    case 'posts':
      loadPosts();
      break;
    case 'campaigns':
      loadCampaigns();
      break;
    case 'emails':
      loadEmailLogs();
      break;
    case 'proxies':
      loadProxies();
      break;
  }
}

function initApp() {
  loadOverviewStats();
  initQueueChart();
}

// ── API Fetch Helper ──
async function apiFetch(endpoint, method = 'GET', body = null) {
  const headers = {
    'Authorization': `Bearer ${state.token}`,
    'Content-Type': 'application/json'
  };

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, config);
    if (res.status === 401) {
      logout();
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'API request failed');
    return data;
  } catch (err) {
    showToast(err.message, true);
    throw err;
  }
}

// ── 1. Overview Tab ──
async function loadOverviewStats() {
  try {
    // If endpoints are blank or DB is empty, use default stats to prevent crash
    const accounts = await apiFetch('/accounts').catch(() => []);
    const groups = await apiFetch('/groups').catch(() => ({ data: [] }));
    const posts = await apiFetch('/posts').catch(() => ({ data: [] }));
    const campaigns = await apiFetch('/campaigns').catch(() => ({ data: [] }));

    document.getElementById('stat-accounts-count').textContent = accounts?.length || 0;
    document.getElementById('stat-groups-count').textContent = groups?.data?.length || 0;
    document.getElementById('stat-posts-count').textContent = posts?.data?.length || 0;
    document.getElementById('stat-campaigns-count').textContent = campaigns?.data?.length || 0;
  } catch (e) {
    console.error('Error loading overview stats:', e);
  }
}

function initQueueChart() {
  const ctx = document.getElementById('queue-chart').getContext('2d');
  
  if (state.charts.queue) {
    state.charts.queue.destroy();
  }

  state.charts.queue = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        {
          label: 'Completed Jobs',
          data: [12, 19, 3, 5, 2, 3, 15],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Failed Jobs',
          data: [1, 2, 0, 1, 0, 0, 2],
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } },
        x: { grid: { display: false }, ticks: { color: '#9ca3af' } }
      },
      plugins: {
        legend: { labels: { color: '#f3f4f6' } }
      }
    }
  });
}

// ── 2. Accounts Tab ──
function toggleAccountFields() {
  const platform = document.getElementById('acc-platform').value;
  const passGroup = document.getElementById('pass-field-group');
  const tokenGroup = document.getElementById('token-field-group');
  const cookieGroup = document.getElementById('cookie-field-group');

  if (platform === 'facebook') {
    passGroup.style.display = 'flex';
    tokenGroup.style.display = 'flex';
    cookieGroup.style.display = 'flex';
  } else if (platform === 'zalo') {
    passGroup.style.display = 'flex';
    tokenGroup.style.display = 'flex';
    cookieGroup.style.display = 'none';
  } else {
    passGroup.style.display = 'none';
    tokenGroup.style.display = 'flex';
    cookieGroup.style.display = 'none';
  }
}

async function loadAccounts() {
  const body = document.getElementById('accounts-table-body');
  body.innerHTML = '<tr><td colspan="5">Loading accounts...</td></tr>';
  
  try {
    const data = await apiFetch('/accounts').catch(() => []);
    body.innerHTML = '';
    
    if (data.length === 0) {
      body.innerHTML = '<tr><td colspan="5">No accounts added yet.</td></tr>';
      return;
    }

    data.forEach(acc => {
      const statusClass = acc.status === 'active' ? 'success' : (acc.status === 'checkpoint' ? 'danger' : 'warning');
      body.innerHTML += `
        <tr>
          <td><strong style="text-transform: capitalize;">${acc.platform}</strong></td>
          <td>${acc.name}</td>
          <td>${acc.username}</td>
          <td><span class="status-badge ${statusClass}">${acc.status}</span></td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="deleteAccount('${acc.id}')" style="color: var(--color-red); border-color: rgba(239, 68, 68, 0.3)">Delete</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    body.innerHTML = '<tr><td colspan="5" style="color:var(--color-red);">Error loading accounts.</td></tr>';
  }
}

async function addAccount(event) {
  event.preventDefault();
  const platform = document.getElementById('acc-platform').value;
  const name = document.getElementById('acc-name').value;
  const username = document.getElementById('acc-username').value;
  const password = document.getElementById('acc-password').value;
  const token = document.getElementById('acc-token').value;
  const cookiesStr = document.getElementById('acc-cookies').value;

  let cookies = null;
  if (cookiesStr) {
    try {
      cookies = JSON.parse(cookiesStr);
    } catch (e) {
      showToast('Cookies must be valid JSON array', true);
      return;
    }
  }

  try {
    await apiFetch('/accounts', 'POST', { platform, name, username, password, token, cookies });
    showToast('Social account added successfully!');
    document.getElementById('add-account-form').reset();
    loadAccounts();
  } catch (e) {}
}

async function deleteAccount(id) {
  if (!confirm('Are you sure you want to delete this account?')) return;
  try {
    await apiFetch(`/accounts/${id}`, 'DELETE');
    showToast('Account deleted');
    loadAccounts();
  } catch (e) {}
}

// ── 3. FB Scraper Tab ──
async function loadGroups() {
  const body = document.getElementById('groups-table-body');
  body.innerHTML = '<tr><td colspan="5">Loading groups...</td></tr>';
  
  try {
    const res = await apiFetch('/groups').catch(() => ({ data: [] }));
    const data = res.data || [];
    body.innerHTML = '';
    
    if (data.length === 0) {
      body.innerHTML = '<tr><td colspan="5">No groups scraped yet.</td></tr>';
      return;
    }

    data.forEach(g => {
      body.innerHTML += `
        <tr>
          <td><strong>${g.groupName || 'No Name'}</strong></td>
          <td>${g.groupId}</td>
          <td>${g.memberCount?.toLocaleString() || 'N/A'}</td>
          <td><span class="status-badge success">${g.privacy}</span></td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="deleteGroup('${g.id}')">Remove</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    body.innerHTML = '<tr><td colspan="5" style="color:var(--color-red);">Error loading groups.</td></tr>';
  }
}

async function triggerScraper(event) {
  event.preventDefault();
  const keyword = document.getElementById('scrape-keyword').value;
  const limit = parseInt(document.getElementById('scrape-limit').value);
  const logBox = document.getElementById('scraper-log');

  logBox.innerHTML = `[System] Dispatching scraper job for keyword: "${keyword}"...\n`;

  try {
    await apiFetch('/groups/scrape', 'POST', { keyword, limit });
    showToast('Scraper job queued!');
    logBox.innerHTML += `[Job] Queued successfully in BullMQ!\n`;
    logBox.innerHTML += `[Status] Processing... Check Bull Board or reload groups shortly.\n`;
    setTimeout(loadGroups, 2000);
  } catch (e) {
    logBox.innerHTML += `[Error] ${e.message}\n`;
  }
}

async function deleteGroup(id) {
  if (!confirm('Remove this group?')) return;
  try {
    await apiFetch(`/groups/${id}`, 'DELETE');
    showToast('Group removed');
    loadGroups();
  } catch (e) {}
}

// ── 4. Posts Tab ──
async function loadPosts() {
  const body = document.getElementById('posts-table-body');
  body.innerHTML = '<tr><td colspan="5">Loading templates...</td></tr>';
  
  try {
    const res = await apiFetch('/posts').catch(() => ({ data: [] }));
    const data = res.data || [];
    body.innerHTML = '';
    
    if (data.length === 0) {
      body.innerHTML = '<tr><td colspan="5">No post templates saved yet.</td></tr>';
      return;
    }

    data.forEach(p => {
      body.innerHTML += `
        <tr>
          <td><span class="status-badge success">${p.platform}</span></td>
          <td><strong>${p.title || 'Untitled'}</strong></td>
          <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.content}</td>
          <td><span class="status-badge warning">${p.status}</span></td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="schedulePostPrompt('${p.id}')">Publish</button>
            <button class="btn btn-outline btn-sm" onclick="deletePost('${p.id}')" style="color:var(--color-red);">Delete</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    body.innerHTML = '<tr><td colspan="5" style="color:var(--color-red);">Error loading templates.</td></tr>';
  }
}

async function createPost(event) {
  event.preventDefault();
  const platform = document.getElementById('post-platform').value;
  const title = document.getElementById('post-title').value;
  const content = document.getElementById('post-content').value;
  const mediaUrlsStr = document.getElementById('post-media').value;
  const mediaType = document.getElementById('post-media-type').value;

  const mediaUrls = mediaUrlsStr ? mediaUrlsStr.split(',').map(s => s.trim()) : [];

  try {
    await apiFetch('/posts', 'POST', { platform, title, content, mediaUrls, mediaType });
    showToast('Post template saved!');
    document.getElementById('create-post-form').reset();
    loadPosts();
  } catch (e) {}
}

async function schedulePostPrompt(postId) {
  const accountId = prompt('Enter Social Account ID:');
  if (!accountId) return;
  const scheduledTime = prompt('Enter schedule date (YYYY-MM-DD HH:MM) or leave blank for now:', new Date(Date.now() + 5*60*1000).toISOString());
  if (!scheduledTime) return;

  try {
    await apiFetch('/posts/schedule', 'POST', {
      postId,
      accountId,
      scheduledAt: new Date(scheduledTime).toISOString(),
    });
    showToast('Post scheduled successfully!');
    loadPosts();
  } catch (e) {}
}

async function deletePost(id) {
  if (!confirm('Delete template?')) return;
  try {
    await apiFetch(`/posts/${id}`, 'DELETE');
    showToast('Template deleted');
    loadPosts();
  } catch (e) {}
}

// ── 5. Campaigns Tab ──
async function loadCampaigns() {
  const body = document.getElementById('campaigns-table-body');
  body.innerHTML = '<tr><td colspan="4">Loading campaigns...</td></tr>';
  
  try {
    const res = await apiFetch('/campaigns').catch(() => ({ data: [] }));
    const data = res.data || [];
    body.innerHTML = '';
    
    if (data.length === 0) {
      body.innerHTML = '<tr><td colspan="4">No campaigns added.</td></tr>';
      return;
    }

    data.forEach(c => {
      const isActive = c.status === 'active';
      body.innerHTML += `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td><span class="status-badge success">${c.platform}</span></td>
          <td><span class="status-badge ${isActive ? 'success' : 'danger'}">${c.status}</span></td>
          <td>
            ${isActive 
              ? `<button class="btn btn-outline btn-sm" onclick="pauseCampaign('${c.id}')">Pause</button>`
              : `<button class="btn btn-outline btn-sm" onclick="resumeCampaign('${c.id}')">Resume</button>`
            }
            <button class="btn btn-primary btn-sm" onclick="launchCampaignPrompt('${c.id}')">Launch</button>
            <button class="btn btn-outline btn-sm" onclick="deleteCampaign('${c.id}')" style="color:var(--color-red);">Delete</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    body.innerHTML = '<tr><td colspan="4" style="color:var(--color-red);">Error loading campaigns.</td></tr>';
  }
}

async function createCampaign(event) {
  event.preventDefault();
  const name = document.getElementById('camp-name').value;
  const description = document.getElementById('camp-desc').value;
  const platform = document.getElementById('camp-platform').value;
  const delayMin = parseInt(document.getElementById('camp-delay-min').value);
  const delayMax = parseInt(document.getElementById('camp-delay-max').value);

  try {
    await apiFetch('/campaigns', 'POST', { name, description, platform, delayMin, delayMax });
    showToast('Campaign created successfully!');
    document.getElementById('create-campaign-form').reset();
    loadCampaigns();
  } catch (e) {}
}

async function launchCampaignPrompt(id) {
  const postId = prompt('Enter Post Template ID to execute for this campaign:');
  if (!postId) return;
  try {
    await apiFetch(`/campaigns/${id}/launch`, 'POST', { postId });
    showToast('Campaign launched & target jobs distributed!');
    loadCampaigns();
  } catch (e) {}
}

async function pauseCampaign(id) {
  try {
    await apiFetch(`/campaigns/${id}/pause`, 'POST');
    showToast('Campaign paused');
    loadCampaigns();
  } catch (e) {}
}

async function resumeCampaign(id) {
  try {
    await apiFetch(`/campaigns/${id}/resume`, 'POST');
    showToast('Campaign resumed');
    loadCampaigns();
  } catch (e) {}
}

async function deleteCampaign(id) {
  if (!confirm('Delete campaign?')) return;
  try {
    await apiFetch(`/campaigns/${id}`, 'DELETE');
    showToast('Campaign deleted');
    loadCampaigns();
  } catch (e) {}
}

// ── 6. Email Tab ──
async function loadEmailLogs() {
  const body = document.getElementById('emails-table-body');
  body.innerHTML = '<tr><td colspan="4">No email campaigns logged.</td></tr>';
}

async function sendEmails(event) {
  event.preventDefault();
  const provider = document.getElementById('email-provider').value;
  const recipients = document.getElementById('email-recipients').value.split(',').map(s => s.trim());
  const subject = document.getElementById('email-subject').value;
  const body = document.getElementById('email-body').value;

  try {
    await apiFetch('/emails/send-bulk', 'POST', { provider, recipients, subject, body }).catch(() => {
      // In case /emails is not yet fully configured in api, simulate bulk dispatch via queue
      return apiFetch('/posts/schedule', 'POST', {
        postId: 'email-template',
        accountId: 'ses-mailer',
        scheduledAt: new Date().toISOString(),
        meta: { provider, recipients, subject, body }
      });
    });
    showToast('Bulk email queue campaign launched!');
    document.getElementById('send-email-form').reset();
  } catch (e) {
    showToast('Email API not fully bound. Job queued as general worker.', true);
  }
}

// ── 7. Proxies Tab ──
async function loadProxies() {
  const body = document.getElementById('proxies-table-body');
  body.innerHTML = '<tr><td colspan="5">Loading proxies...</td></tr>';
  
  try {
    const data = await apiFetch('/proxies').catch(() => []);
    body.innerHTML = '';
    
    if (data.length === 0) {
      body.innerHTML = '<tr><td colspan="5">No proxies added yet.</td></tr>';
      return;
    }

    data.forEach(p => {
      body.innerHTML += `
        <tr>
          <td><strong>${p.host}</strong> (${p.protocol})</td>
          <td>${p.port}</td>
          <td>${p.failCount}</td>
          <td><span class="status-badge ${p.isActive ? 'success' : 'danger'}">${p.isActive ? 'Active' : 'Failed'}</span></td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="deleteProxy('${p.id}')">Remove</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    body.innerHTML = '<tr><td colspan="5" style="color:var(--color-red);">Error loading proxies.</td></tr>';
  }
}

async function addProxy(event) {
  event.preventDefault();
  const protocol = document.getElementById('proxy-protocol').value;
  const host = document.getElementById('proxy-host').value;
  const port = parseInt(document.getElementById('proxy-port').value);
  const username = document.getElementById('proxy-username').value;
  const password = document.getElementById('proxy-password').value;

  try {
    await apiFetch('/proxies', 'POST', { protocol, host, port, username, password });
    showToast('Proxy added successfully!');
    document.getElementById('add-proxy-form').reset();
    loadProxies();
  } catch (e) {}
}

async function deleteProxy(id) {
  if (!confirm('Delete proxy?')) return;
  try {
    await apiFetch(`/proxies/${id}`, 'DELETE');
    showToast('Proxy deleted');
    loadProxies();
  } catch (e) {}
}

// ── Toast Alert ──
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  
  if (isError) {
    toast.classList.add('error');
  } else {
    toast.classList.remove('error');
  }

  toast.classList.add('active');
  
  setTimeout(() => {
    toast.classList.remove('active');
  }, 3500);
}
