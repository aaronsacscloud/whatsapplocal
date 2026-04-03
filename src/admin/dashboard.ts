export function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WhatsApp Local - Admin</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    line-height: 1.6;
    min-height: 100vh;
  }

  header {
    background: #16213e;
    padding: 1.25rem 2rem;
    border-bottom: 1px solid #0f3460;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
  }

  header h1 {
    font-size: 1.4rem;
    font-weight: 700;
    color: #fff;
  }

  header h1 span { color: #4ecca3; }

  .stats-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .stat-card {
    background: #0f3460;
    border-radius: 8px;
    padding: 0.75rem 1.25rem;
    min-width: 130px;
    text-align: center;
  }

  .stat-card .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #4ecca3;
  }

  .stat-card .stat-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8899aa;
  }

  main { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }

  .section {
    background: #16213e;
    border-radius: 10px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    border: 1px solid #0f3460;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .section-header h2 {
    font-size: 1.15rem;
    font-weight: 600;
    color: #fff;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 1rem;
    border-radius: 6px;
    border: none;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn:hover { opacity: 0.85; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-primary { background: #4ecca3; color: #1a1a2e; }
  .btn-danger { background: #e94560; color: #fff; }
  .btn-sm { padding: 0.3rem 0.65rem; font-size: 0.72rem; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  th {
    text-align: left;
    padding: 0.6rem 0.75rem;
    font-weight: 600;
    color: #8899aa;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid #0f3460;
    white-space: nowrap;
  }

  td {
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid rgba(15, 52, 96, 0.5);
    vertical-align: middle;
  }

  tr:hover td { background: rgba(78, 204, 163, 0.04); }

  .badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-active { background: rgba(78, 204, 163, 0.15); color: #4ecca3; }
  .badge-inactive { background: rgba(233, 69, 96, 0.15); color: #e94560; }
  .badge-high { background: rgba(233, 69, 96, 0.15); color: #e94560; }
  .badge-medium { background: rgba(255, 183, 77, 0.15); color: #ffb74d; }
  .badge-low { background: rgba(100, 181, 246, 0.15); color: #64b5f6; }

  .toggle {
    position: relative;
    width: 40px;
    height: 22px;
    cursor: pointer;
  }

  .toggle input { opacity: 0; width: 0; height: 0; }

  .toggle .slider {
    position: absolute;
    inset: 0;
    background: #333;
    border-radius: 22px;
    transition: 0.2s;
  }

  .toggle .slider::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 3px;
    bottom: 3px;
    background: #fff;
    border-radius: 50%;
    transition: 0.2s;
  }

  .toggle input:checked + .slider { background: #4ecca3; }
  .toggle input:checked + .slider::before { transform: translateX(18px); }

  select, input[type="text"], input[type="url"] {
    background: #1a1a2e;
    color: #e0e0e0;
    border: 1px solid #0f3460;
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
    font-family: inherit;
  }

  select:focus, input:focus { outline: none; border-color: #4ecca3; }

  .form-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    align-items: flex-end;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #0f3460;
  }

  .form-group { display: flex; flex-direction: column; gap: 0.25rem; }
  .form-group label { font-size: 0.7rem; color: #8899aa; text-transform: uppercase; letter-spacing: 0.04em; }
  .form-group input, .form-group select { min-width: 140px; }

  .filters {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-top: 1rem;
    font-size: 0.85rem;
  }

  .expandable { cursor: pointer; }
  .expand-row td {
    padding: 1rem;
    background: #1a1a2e;
    font-size: 0.8rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .expand-row td .label {
    font-weight: 600;
    color: #4ecca3;
    margin-top: 0.5rem;
    display: block;
  }

  .expand-row td .label:first-child { margin-top: 0; }

  .truncate {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .url-cell {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .url-cell a { color: #4ecca3; text-decoration: none; }
  .url-cell a:hover { text-decoration: underline; }

  .confidence-bar {
    width: 60px;
    height: 6px;
    background: #333;
    border-radius: 3px;
    overflow: hidden;
    display: inline-block;
    vertical-align: middle;
    margin-right: 0.35rem;
  }

  .confidence-bar .fill {
    height: 100%;
    border-radius: 3px;
    background: #4ecca3;
  }

  .toast {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    padding: 0.75rem 1.25rem;
    font-size: 0.85rem;
    z-index: 1000;
    opacity: 0;
    transform: translateY(10px);
    transition: all 0.25s;
    pointer-events: none;
  }

  .toast.show { opacity: 1; transform: translateY(0); pointer-events: auto; }
  .toast.error { border-color: #e94560; color: #e94560; }
  .toast.success { border-color: #4ecca3; color: #4ecca3; }

  .loading { opacity: 0.5; pointer-events: none; }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: #8899aa;
    font-size: 0.9rem;
  }

  .table-wrap { overflow-x: auto; }

  @media (max-width: 768px) {
    header { padding: 1rem; }
    main { padding: 1rem; }
    .section { padding: 1rem; }
    .stat-card { min-width: 100px; padding: 0.5rem 0.75rem; }
    .stat-card .stat-value { font-size: 1.2rem; }
    .form-group input, .form-group select { min-width: 100px; }
  }
</style>
</head>
<body>

<header>
  <h1>WhatsApp Local - <span>Admin</span></h1>
  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-value" id="stat-events">-</div>
      <div class="stat-label">Total Events</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="stat-sources">-</div>
      <div class="stat-label">Active Sources</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="stat-users">-</div>
      <div class="stat-label">Total Users</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="stat-today">-</div>
      <div class="stat-label">Events Today</div>
    </div>
  </div>
</header>

<main>

  <!-- Sources Section -->
  <div class="section" id="sources-section">
    <div class="section-header">
      <h2>Sources</h2>
      <button class="btn btn-primary" id="btn-scrape" onclick="triggerScrape()">Run Scraper Now</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>URL</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Last Scraped</th>
            <th>Success</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="sources-body"></tbody>
      </table>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="new-source-name" placeholder="Source name">
      </div>
      <div class="form-group">
        <label>URL</label>
        <input type="url" id="new-source-url" placeholder="https://..." style="min-width:220px">
      </div>
      <div class="form-group">
        <label>Type</label>
        <select id="new-source-type">
          <option value="facebook_page">Facebook Page</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="user_forwarded">User Forwarded</option>
        </select>
      </div>
      <div class="form-group">
        <label>Priority</label>
        <select id="new-source-priority">
          <option value="medium" selected>Medium</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
      </div>
      <button class="btn btn-primary" onclick="addSource()">Add Source</button>
    </div>
  </div>

  <!-- Events Section -->
  <div class="section" id="events-section">
    <div class="section-header">
      <h2>Events</h2>
      <div class="filters">
        <div class="form-group">
          <select id="filter-category" onchange="loadEvents()">
            <option value="">All Categories</option>
            <option value="music">Music</option>
            <option value="food">Food</option>
            <option value="nightlife">Nightlife</option>
            <option value="culture">Culture</option>
            <option value="sports">Sports</option>
            <option value="popup">Popup</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <select id="filter-date" onchange="loadEvents()">
            <option value="">All Dates</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
          </select>
        </div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Venue</th>
            <th>Date</th>
            <th>Category</th>
            <th>City</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody id="events-body"></tbody>
      </table>
    </div>
    <div class="pagination">
      <button class="btn btn-sm btn-primary" id="btn-prev" onclick="changePage(-1)" disabled>&larr; Prev</button>
      <span id="page-info">Page 1</span>
      <button class="btn btn-sm btn-primary" id="btn-next" onclick="changePage(1)">Next &rarr;</button>
    </div>
  </div>

  <!-- Users Section -->
  <div class="section" id="users-section">
    <div class="section-header">
      <h2>Users</h2>
    </div>
    <div class="stats-row" id="users-stats-row">
      <div class="stat-card">
        <div class="stat-value" id="user-total">-</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="user-active-today">-</div>
        <div class="stat-label">Active Today</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="user-queries">-</div>
        <div class="stat-label">Total Queries</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="user-forwards">-</div>
        <div class="stat-label">Total Forwards</div>
      </div>
    </div>
  </div>

</main>

<div class="toast" id="toast"></div>

<script>
  let currentPage = 1;
  const PAGE_SIZE = 20;
  let totalEvents = 0;

  // Toast notifications
  function showToast(message, type) {
    var el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast show ' + (type || 'success');
    clearTimeout(el._timer);
    el._timer = setTimeout(function() { el.className = 'toast'; }, 3000);
  }

  // API helper
  function api(method, url, body) {
    var opts = { method: method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || 'Request failed'); });
      return r.json();
    });
  }

  // Format date for display
  function fmtDate(d) {
    if (!d) return '-';
    var dt = new Date(d);
    var now = new Date();
    var diff = now.getTime() - dt.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: dt.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  }

  function fmtEventDate(d) {
    if (!d) return '-';
    var dt = new Date(d);
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' +
           dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Load dashboard stats
  function loadStats() {
    api('GET', '/admin/api/stats').then(function(data) {
      document.getElementById('stat-events').textContent = data.totalEvents || 0;
      document.getElementById('stat-sources').textContent = data.activeSources || 0;
      document.getElementById('stat-users').textContent = data.totalUsers || 0;
      document.getElementById('stat-today').textContent = data.eventsToday || 0;

      document.getElementById('user-total').textContent = data.totalUsers || 0;
      document.getElementById('user-active-today').textContent = data.activeToday || 0;
      document.getElementById('user-queries').textContent = data.totalQueries || 0;
      document.getElementById('user-forwards').textContent = data.totalForwards || 0;
    }).catch(function(err) {
      console.error('Failed to load stats:', err);
    });
  }

  // Load sources
  function loadSources() {
    api('GET', '/admin/api/sources').then(function(data) {
      var tbody = document.getElementById('sources-body');
      if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No sources configured</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(function(s) {
        var successPct = s.successRate != null ? Math.round(s.successRate * 100) : 100;
        return '<tr>' +
          '<td><strong>' + escapeHtml(s.name) + '</strong></td>' +
          '<td class="url-cell"><a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' + escapeHtml(s.url) + '</a></td>' +
          '<td><span class="badge">' + escapeHtml(s.type) + '</span></td>' +
          '<td><select class="priority-select" data-id="' + s.id + '" onchange="updatePriority(this)">' +
            '<option value="high"' + (s.pollPriority === 'high' ? ' selected' : '') + '>High</option>' +
            '<option value="medium"' + (s.pollPriority === 'medium' ? ' selected' : '') + '>Medium</option>' +
            '<option value="low"' + (s.pollPriority === 'low' ? ' selected' : '') + '>Low</option>' +
          '</select></td>' +
          '<td>' + fmtDate(s.lastScrapedAt) + '</td>' +
          '<td><div class="confidence-bar"><div class="fill" style="width:' + successPct + '%;background:' + (successPct > 80 ? '#4ecca3' : successPct > 50 ? '#ffb74d' : '#e94560') + '"></div></div>' + successPct + '%</td>' +
          '<td><label class="toggle"><input type="checkbox"' + (s.isActive ? ' checked' : '') + ' onchange="toggleSource(\\'' + s.id + '\\', this.checked)"><span class="slider"></span></label></td>' +
          '<td><button class="btn btn-danger btn-sm" onclick="deleteSource(\\'' + s.id + '\\')">Delete</button></td>' +
        '</tr>';
      }).join('');
    }).catch(function(err) {
      console.error('Failed to load sources:', err);
    });
  }

  // Load events
  function loadEvents() {
    currentPage = 1;
    fetchEvents();
  }

  function fetchEvents() {
    var category = document.getElementById('filter-category').value;
    var dateFilter = document.getElementById('filter-date').value;
    var params = new URLSearchParams();
    params.set('page', currentPage.toString());
    params.set('limit', PAGE_SIZE.toString());
    if (category) params.set('category', category);
    if (dateFilter) params.set('date', dateFilter);

    api('GET', '/admin/api/events?' + params.toString()).then(function(data) {
      totalEvents = data.total || 0;
      var tbody = document.getElementById('events-body');
      if (!data.events || !data.events.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No events found</td></tr>';
        updatePagination();
        return;
      }
      tbody.innerHTML = data.events.map(function(e) {
        var conf = e.confidence != null ? Math.round(e.confidence * 100) : 0;
        return '<tr class="expandable" onclick="toggleExpand(this, ' + escapeHtml(JSON.stringify(JSON.stringify(e))) + ')">' +
          '<td class="truncate"><strong>' + escapeHtml(e.title) + '</strong></td>' +
          '<td class="truncate">' + escapeHtml(e.venueName || '-') + '</td>' +
          '<td style="white-space:nowrap">' + fmtEventDate(e.eventDate) + '</td>' +
          '<td><span class="badge badge-' + (e.category || 'other') + '">' + escapeHtml(e.category || 'other') + '</span></td>' +
          '<td>' + escapeHtml(e.city || '-') + '</td>' +
          '<td><div class="confidence-bar"><div class="fill" style="width:' + conf + '%"></div></div>' + conf + '%</td>' +
        '</tr>';
      }).join('');
      updatePagination();
    }).catch(function(err) {
      console.error('Failed to load events:', err);
    });
  }

  function toggleExpand(row, jsonStr) {
    var next = row.nextElementSibling;
    if (next && next.classList.contains('expand-row')) {
      next.remove();
      return;
    }
    var e = JSON.parse(jsonStr);
    var tr = document.createElement('tr');
    tr.className = 'expand-row';
    var html = '<td colspan="6">';
    html += '<span class="label">Description</span>' + escapeHtml(e.description || 'No description');
    html += '<span class="label">Venue Address</span>' + escapeHtml(e.venueAddress || '-');
    html += '<span class="label">Neighborhood</span>' + escapeHtml(e.neighborhood || '-');
    html += '<span class="label">Source URL</span>' + (e.sourceUrl ? '<a href="' + escapeHtml(e.sourceUrl) + '" target="_blank" style="color:#4ecca3">' + escapeHtml(e.sourceUrl) + '</a>' : '-');
    html += '<span class="label">Source Type</span>' + escapeHtml(e.sourceType || '-');
    if (e.rawContent) {
      html += '<span class="label">Raw Content</span>' + escapeHtml(e.rawContent.substring(0, 500)) + (e.rawContent.length > 500 ? '...' : '');
    }
    html += '</td>';
    tr.innerHTML = html;
    row.parentNode.insertBefore(tr, row.nextSibling);
  }

  function updatePagination() {
    var totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));
    document.getElementById('page-info').textContent = 'Page ' + currentPage + ' of ' + totalPages;
    document.getElementById('btn-prev').disabled = currentPage <= 1;
    document.getElementById('btn-next').disabled = currentPage >= totalPages;
  }

  function changePage(dir) {
    var totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));
    var newPage = currentPage + dir;
    if (newPage < 1 || newPage > totalPages) return;
    currentPage = newPage;
    fetchEvents();
  }

  // Source actions
  function toggleSource(id, active) {
    api('PUT', '/admin/api/sources/' + id, { isActive: active }).then(function() {
      showToast('Source ' + (active ? 'activated' : 'deactivated'));
      loadStats();
    }).catch(function(err) {
      showToast(err.message, 'error');
      loadSources();
    });
  }

  function updatePriority(select) {
    var id = select.getAttribute('data-id');
    var priority = select.value;
    api('PUT', '/admin/api/sources/' + id, { pollPriority: priority }).then(function() {
      showToast('Priority updated to ' + priority);
    }).catch(function(err) {
      showToast(err.message, 'error');
      loadSources();
    });
  }

  function addSource() {
    var name = document.getElementById('new-source-name').value.trim();
    var url = document.getElementById('new-source-url').value.trim();
    var type = document.getElementById('new-source-type').value;
    var priority = document.getElementById('new-source-priority').value;

    if (!name || !url) {
      showToast('Name and URL are required', 'error');
      return;
    }

    api('POST', '/admin/api/sources', { name: name, url: url, type: type, pollPriority: priority }).then(function() {
      showToast('Source added');
      document.getElementById('new-source-name').value = '';
      document.getElementById('new-source-url').value = '';
      loadSources();
      loadStats();
    }).catch(function(err) {
      showToast(err.message, 'error');
    });
  }

  function deleteSource(id) {
    if (!confirm('Delete this source?')) return;
    api('DELETE', '/admin/api/sources/' + id).then(function() {
      showToast('Source deleted');
      loadSources();
      loadStats();
    }).catch(function(err) {
      showToast(err.message, 'error');
    });
  }

  function triggerScrape() {
    var btn = document.getElementById('btn-scrape');
    btn.disabled = true;
    btn.textContent = 'Scraping...';
    api('POST', '/admin/api/scrape').then(function(data) {
      showToast('Scrape done: ' + data.eventsInserted + ' events inserted, ' + data.duplicatesSkipped + ' duplicates skipped');
      loadSources();
      loadEvents();
      loadStats();
    }).catch(function(err) {
      showToast('Scrape failed: ' + err.message, 'error');
    }).finally(function() {
      btn.disabled = false;
      btn.textContent = 'Run Scraper Now';
    });
  }

  // Initial load
  loadStats();
  loadSources();
  fetchEvents();
</script>
</body>
</html>`;
}
