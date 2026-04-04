export function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WhatsApp Local - Admin Dashboard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    line-height: 1.6;
    min-height: 100vh;
  }

  /* ─── Header ─────────────────────────────────────── */
  header {
    background: #16213e;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid #0f3460;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  header h1 {
    font-size: 1.15rem;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
  }

  header h1 span { color: #4ecca3; }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.75rem;
    color: #8899aa;
  }

  #refresh-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4ecca3;
    display: inline-block;
  }

  /* ─── Navigation Tabs ────────────────────────────── */
  nav {
    background: #16213e;
    border-bottom: 1px solid #0f3460;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    white-space: nowrap;
    scrollbar-width: none;
  }

  nav::-webkit-scrollbar { display: none; }

  .nav-tabs {
    display: inline-flex;
    padding: 0 1rem;
    min-width: 100%;
  }

  .nav-tab {
    padding: 0.65rem 1rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: #8899aa;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    white-space: nowrap;
    background: none;
    border-top: none;
    border-left: none;
    border-right: none;
    font-family: inherit;
  }

  .nav-tab:hover { color: #e0e0e0; }
  .nav-tab.active { color: #4ecca3; border-bottom-color: #4ecca3; }

  /* ─── Main ───────────────────────────────────────── */
  main { max-width: 1280px; margin: 0 auto; padding: 1.25rem; }

  .tab-content { display: none; }
  .tab-content.active { display: block; }

  /* ─── Cards Grid ─────────────────────────────────── */
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .stat-card {
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    padding: 0.85rem;
    text-align: center;
  }

  .stat-card .stat-value {
    font-size: 1.4rem;
    font-weight: 700;
    color: #4ecca3;
    line-height: 1.2;
  }

  .stat-card .stat-label {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #8899aa;
    margin-top: 0.15rem;
  }

  .stat-card.warn .stat-value { color: #ffb74d; }
  .stat-card.danger .stat-value { color: #e94560; }

  /* ─── Section ────────────────────────────────────── */
  .section {
    background: #16213e;
    border-radius: 10px;
    padding: 1.25rem;
    margin-bottom: 1.25rem;
    border: 1px solid #0f3460;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .section-header h2 {
    font-size: 1rem;
    font-weight: 600;
    color: #fff;
  }

  .section-header h3 {
    font-size: 0.85rem;
    font-weight: 600;
    color: #ccc;
  }

  /* ─── Buttons ────────────────────────────────────── */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.4rem 0.85rem;
    border-radius: 6px;
    border: none;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    font-family: inherit;
  }

  .btn:hover { opacity: 0.85; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-primary { background: #4ecca3; color: #1a1a2e; }
  .btn-danger { background: #e94560; color: #fff; }
  .btn-secondary { background: #0f3460; color: #e0e0e0; }
  .btn-sm { padding: 0.25rem 0.55rem; font-size: 0.7rem; }
  .btn-xs { padding: 0.2rem 0.4rem; font-size: 0.65rem; }

  /* ─── Tables ─────────────────────────────────────── */
  .table-wrap { overflow-x: auto; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  th {
    text-align: left;
    padding: 0.5rem 0.6rem;
    font-weight: 600;
    color: #8899aa;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid #0f3460;
    white-space: nowrap;
    cursor: pointer;
  }

  th:hover { color: #4ecca3; }

  td {
    padding: 0.5rem 0.6rem;
    border-bottom: 1px solid rgba(15, 52, 96, 0.5);
    vertical-align: middle;
  }

  tr:hover td { background: rgba(78, 204, 163, 0.04); }

  /* ─── Badges ─────────────────────────────────────── */
  .badge {
    display: inline-block;
    padding: 0.12rem 0.45rem;
    border-radius: 10px;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-green { background: rgba(78, 204, 163, 0.15); color: #4ecca3; }
  .badge-yellow { background: rgba(255, 183, 77, 0.15); color: #ffb74d; }
  .badge-red { background: rgba(233, 69, 96, 0.15); color: #e94560; }
  .badge-blue { background: rgba(100, 181, 246, 0.15); color: #64b5f6; }
  .badge-purple { background: rgba(206, 147, 216, 0.15); color: #ce93d8; }

  /* ─── Toggle ─────────────────────────────────────── */
  .toggle {
    position: relative;
    width: 36px;
    height: 20px;
    cursor: pointer;
    display: inline-block;
  }

  .toggle input { opacity: 0; width: 0; height: 0; }

  .toggle .slider {
    position: absolute;
    inset: 0;
    background: #333;
    border-radius: 20px;
    transition: 0.2s;
  }

  .toggle .slider::before {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    left: 3px;
    bottom: 3px;
    background: #fff;
    border-radius: 50%;
    transition: 0.2s;
  }

  .toggle input:checked + .slider { background: #4ecca3; }
  .toggle input:checked + .slider::before { transform: translateX(16px); }

  /* ─── Forms ──────────────────────────────────────── */
  select, input[type="text"], input[type="url"], input[type="date"], input[type="datetime-local"], textarea {
    background: #1a1a2e;
    color: #e0e0e0;
    border: 1px solid #0f3460;
    border-radius: 6px;
    padding: 0.38rem 0.55rem;
    font-size: 0.78rem;
    font-family: inherit;
  }

  select:focus, input:focus, textarea:focus { outline: none; border-color: #4ecca3; }

  textarea { resize: vertical; min-height: 60px; }

  .form-row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    align-items: flex-end;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #0f3460;
  }

  .form-group { display: flex; flex-direction: column; gap: 0.2rem; }
  .form-group label { font-size: 0.65rem; color: #8899aa; text-transform: uppercase; letter-spacing: 0.04em; }
  .form-group input, .form-group select, .form-group textarea { min-width: 120px; }

  .filters {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  /* ─── Pagination ─────────────────────────────────── */
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    margin-top: 0.75rem;
    font-size: 0.8rem;
  }

  /* ─── Bar Charts ─────────────────────────────────── */
  .bar-chart {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 100px;
    padding-top: 0.5rem;
  }

  .bar-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }

  .bar {
    width: 100%;
    min-width: 4px;
    background: #4ecca3;
    border-radius: 2px 2px 0 0;
    transition: height 0.3s;
  }

  .bar-label {
    font-size: 0.5rem;
    color: #8899aa;
    margin-top: 0.2rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  /* ─── Horizontal Bars ────────────────────────────── */
  .hbar-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.35rem;
    font-size: 0.75rem;
  }

  .hbar-label {
    min-width: 90px;
    text-align: right;
    color: #8899aa;
    font-size: 0.7rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hbar-track {
    flex: 1;
    height: 7px;
    background: #333;
    border-radius: 4px;
    overflow: hidden;
  }

  .hbar-fill {
    height: 100%;
    border-radius: 4px;
    background: #4ecca3;
    transition: width 0.3s;
  }

  .hbar-count {
    min-width: 35px;
    text-align: right;
    color: #e0e0e0;
    font-weight: 600;
    font-size: 0.75rem;
  }

  /* ─── Confidence/Quality Bars ────────────────────── */
  .mini-bar {
    width: 50px;
    height: 5px;
    background: #333;
    border-radius: 3px;
    overflow: hidden;
    display: inline-block;
    vertical-align: middle;
    margin-right: 0.3rem;
  }

  .mini-bar .fill {
    height: 100%;
    border-radius: 3px;
  }

  /* ─── Completeness Indicators ────────────────────── */
  .check { color: #4ecca3; }
  .cross { color: #e94560; }

  /* ─── Expand Row ─────────────────────────────────── */
  .expandable { cursor: pointer; }
  .expand-row td {
    padding: 0.75rem;
    background: #1a1a2e;
    font-size: 0.78rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .expand-row .field-label {
    font-weight: 600;
    color: #4ecca3;
    margin-top: 0.4rem;
    display: block;
  }

  .expand-row .field-label:first-child { margin-top: 0; }

  /* ─── Truncate ───────────────────────────────────── */
  .truncate {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .url-cell {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .url-cell a { color: #4ecca3; text-decoration: none; }
  .url-cell a:hover { text-decoration: underline; }

  /* ─── Grid Layouts ───────────────────────────────── */
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .panel {
    background: #1a1a2e;
    border-radius: 8px;
    padding: 0.85rem;
  }

  .panel h3 {
    font-size: 0.75rem;
    font-weight: 600;
    color: #8899aa;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.6rem;
  }

  /* ─── Toast ──────────────────────────────────────── */
  .toast {
    position: fixed;
    bottom: 1.25rem;
    right: 1.25rem;
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    padding: 0.65rem 1.1rem;
    font-size: 0.8rem;
    z-index: 1000;
    opacity: 0;
    transform: translateY(10px);
    transition: all 0.25s;
    pointer-events: none;
    max-width: 320px;
  }

  .toast.show { opacity: 1; transform: translateY(0); pointer-events: auto; }
  .toast.error { border-color: #e94560; color: #e94560; }
  .toast.success { border-color: #4ecca3; color: #4ecca3; }

  /* ─── Query List ─────────────────────────────────── */
  .query-list {
    list-style: none;
    max-height: 280px;
    overflow-y: auto;
  }

  .query-list li {
    display: flex;
    justify-content: space-between;
    padding: 0.3rem 0;
    border-bottom: 1px solid rgba(15, 52, 96, 0.4);
    font-size: 0.78rem;
  }

  .query-list .q-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 0.5rem; }
  .query-list .q-intent { font-size: 0.65rem; color: #8899aa; margin-left: 0.4rem; }
  .query-list .q-count { font-weight: 600; color: #4ecca3; white-space: nowrap; }

  /* ─── Unknown highlight ──────────────────────────── */
  .intent-unknown { color: #e94560; font-weight: 600; }

  /* ─── Settings grid ──────────────────────────────── */
  .settings-grid {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 0.5rem 1rem;
    font-size: 0.85rem;
    align-items: center;
  }

  .settings-grid .s-label { color: #8899aa; font-weight: 600; }
  .settings-grid .s-value { color: #e0e0e0; }

  /* ─── Heatmap ────────────────────────────────────── */
  .heatmap {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  .heatmap-cell {
    width: calc(25% - 2px);
    aspect-ratio: 1;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.55rem;
    color: #e0e0e0;
  }

  /* ─── Empty State ────────────────────────────────── */
  .empty-state {
    text-align: center;
    padding: 1.5rem;
    color: #8899aa;
    font-size: 0.85rem;
  }

  .loading { opacity: 0.5; pointer-events: none; }

  /* ─── Checkbox ───────────────────────────────────── */
  .cb { width: 14px; height: 14px; accent-color: #4ecca3; cursor: pointer; }

  /* ─── Mobile ─────────────────────────────────────── */
  @media (max-width: 768px) {
    header { padding: 0.5rem 0.75rem; }
    header h1 { font-size: 1rem; }
    main { padding: 0.75rem; }
    .section { padding: 0.85rem; }
    .cards-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.5rem; }
    .stat-card { padding: 0.6rem; }
    .stat-card .stat-value { font-size: 1.15rem; }
    .grid-2 { grid-template-columns: 1fr; }
    .form-group input, .form-group select, .form-group textarea { min-width: 100px; }
    .nav-tab { padding: 0.55rem 0.75rem; font-size: 0.72rem; }
    .settings-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

<header>
  <h1>WhatsApp <span>Local</span> Admin</h1>
  <div class="header-right">
    <span id="refresh-indicator"></span>
    <span id="last-refresh">--</span>
  </div>
</header>

<nav>
  <div class="nav-tabs">
    <button class="nav-tab active" data-tab="overview">Overview</button>
    <button class="nav-tab" data-tab="users">Users</button>
    <button class="nav-tab" data-tab="messages">Messages</button>
    <button class="nav-tab" data-tab="events">Events</button>
    <button class="nav-tab" data-tab="sources">Sources</button>
    <button class="nav-tab" data-tab="scraping">Scraping</button>
    <button class="nav-tab" data-tab="analytics">Analytics</button>
    <button class="nav-tab" data-tab="alerts">Alerts</button>
    <button class="nav-tab" data-tab="settings">Settings</button>
    <button class="nav-tab" data-tab="quality">Quality</button>
  </div>
</nav>

<main>

<!-- ═══════════════════ OVERVIEW TAB ═══════════════════ -->
<div class="tab-content active" id="tab-overview">
  <div class="cards-grid" id="overview-cards">
    <div class="stat-card"><div class="stat-value" id="ov-total-users">-</div><div class="stat-label">Total Users</div></div>
    <div class="stat-card"><div class="stat-value" id="ov-active-today">-</div><div class="stat-label">Active Today</div></div>
    <div class="stat-card"><div class="stat-value" id="ov-active-week">-</div><div class="stat-label">Active This Week</div></div>
    <div class="stat-card"><div class="stat-value" id="ov-events-total">-</div><div class="stat-label">Total Events</div></div>
    <div class="stat-card"><div class="stat-value" id="ov-events-today">-</div><div class="stat-label">Events Today</div></div>
    <div class="stat-card"><div class="stat-value" id="ov-events-week">-</div><div class="stat-label">Events This Week</div></div>
    <div class="stat-card"><div class="stat-value" id="ov-msgs-today">-</div><div class="stat-label">Messages Today</div></div>
    <div class="stat-card"><div class="stat-value" id="ov-msgs-total">-</div><div class="stat-label">Total Messages</div></div>
    <div class="stat-card"><div class="stat-value" id="ov-response-rate">-</div><div class="stat-label">Bot Response Rate</div></div>
    <div class="stat-card"><div class="stat-value" id="ov-avg-response">-</div><div class="stat-label">Avg Response Time</div></div>
    <div class="stat-card"><div class="stat-value" id="ov-subscribers">-</div><div class="stat-label">Digest Subscribers</div></div>
    <div class="stat-card"><div class="stat-value" id="ov-sources">-</div><div class="stat-label">Active Sources</div></div>
  </div>

  <div class="section">
    <div class="section-header"><h2>Category Breakdown</h2></div>
    <div id="ov-category-bars"></div>
  </div>
</div>

<!-- ═══════════════════ USERS TAB ═══════════════════ -->
<div class="tab-content" id="tab-users">
  <div class="section">
    <div class="section-header">
      <h2>Users</h2>
      <div class="filters">
        <select id="user-filter-lang" onchange="loadUsers()">
          <option value="">All Languages</option>
          <option value="es">Spanish</option>
          <option value="en">English</option>
        </select>
        <select id="user-filter-tourist" onchange="loadUsers()">
          <option value="">All Types</option>
          <option value="true">Tourist</option>
          <option value="false">Local</option>
        </select>
        <select id="user-filter-onboarding" onchange="loadUsers()">
          <option value="">All Onboarding</option>
          <option value="true">Complete</option>
          <option value="false">Incomplete</option>
        </select>
        <select id="user-sort" onchange="loadUsers()">
          <option value="last_active">Last Active</option>
          <option value="queries">Most Queries</option>
          <option value="first_seen">Newest</option>
        </select>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Phone (last 4)</th>
            <th>Language</th>
            <th>Interests</th>
            <th>Type</th>
            <th>Onboarding</th>
            <th>First Seen</th>
            <th>Last Active</th>
            <th>Queries</th>
            <th>Forwards</th>
            <th>Digest</th>
          </tr>
        </thead>
        <tbody id="users-body"></tbody>
      </table>
    </div>
    <div class="pagination">
      <button class="btn btn-sm btn-secondary" id="users-prev" onclick="changeUsersPage(-1)" disabled>&larr; Prev</button>
      <span id="users-page-info">Page 1</span>
      <button class="btn btn-sm btn-secondary" id="users-next" onclick="changeUsersPage(1)">Next &rarr;</button>
    </div>
  </div>
</div>

<!-- ═══════════════════ MESSAGES TAB ═══════════════════ -->
<div class="tab-content" id="tab-messages">
  <div class="section">
    <div class="section-header">
      <h2>Recent Conversations</h2>
      <div class="filters">
        <select id="msg-filter-intent" onchange="loadRecentMessages()">
          <option value="">All Intents</option>
          <option value="event_query">Event Query</option>
          <option value="venue_query">Venue Query</option>
          <option value="local_info">Local Info</option>
          <option value="forward_content">Forward</option>
          <option value="onboarding">Onboarding</option>
          <option value="feedback">Feedback</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Message</th>
            <th>Bot Response</th>
            <th>Intent</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody id="messages-body"></tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <h2 style="color:#e94560">Unanswered Questions (Bot Gaps)</h2>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Question</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody id="unanswered-body"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- ═══════════════════ EVENTS TAB ═══════════════════ -->
<div class="tab-content" id="tab-events">
  <div class="section">
    <div class="section-header">
      <h2>Events</h2>
      <div class="filters">
        <select id="event-filter-category" onchange="loadEvents()">
          <option value="">All Categories</option>
          <option value="music">Music</option>
          <option value="food">Food</option>
          <option value="nightlife">Nightlife</option>
          <option value="culture">Culture</option>
          <option value="sports">Sports</option>
          <option value="popup">Popup</option>
          <option value="wellness">Wellness</option>
          <option value="tour">Tour</option>
          <option value="class">Class</option>
          <option value="adventure">Adventure</option>
          <option value="wine">Wine</option>
          <option value="other">Other</option>
        </select>
        <select id="event-filter-type" onchange="loadEvents()">
          <option value="">All Types</option>
          <option value="event">Event</option>
          <option value="recurring">Recurring</option>
          <option value="workshop">Workshop</option>
          <option value="activity">Activity</option>
        </select>
        <select id="event-filter-date" onchange="loadEvents()">
          <option value="">All Dates</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
        </select>
        <button class="btn btn-danger btn-sm" onclick="bulkDeleteEvents()">Delete Selected</button>
        <select id="bulk-category-select" style="display:inline-block">
          <option value="">Change Category...</option>
          <option value="music">Music</option>
          <option value="food">Food</option>
          <option value="nightlife">Nightlife</option>
          <option value="culture">Culture</option>
          <option value="sports">Sports</option>
          <option value="popup">Popup</option>
          <option value="other">Other</option>
        </select>
        <button class="btn btn-secondary btn-sm" onclick="bulkChangeCategory()">Apply</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th><input type="checkbox" class="cb" id="select-all-events" onchange="toggleAllEvents(this)"></th>
            <th>Title</th>
            <th>Venue</th>
            <th>Date</th>
            <th>Category</th>
            <th>Type</th>
            <th>Img</th>
            <th>Price</th>
            <th>Desc</th>
            <th>Venue Addr</th>
            <th>Freshness</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody id="events-body"></tbody>
      </table>
    </div>
    <div class="pagination">
      <button class="btn btn-sm btn-secondary" id="events-prev" onclick="changeEventsPage(-1)" disabled>&larr; Prev</button>
      <span id="events-page-info">Page 1</span>
      <button class="btn btn-sm btn-secondary" id="events-next" onclick="changeEventsPage(1)">Next &rarr;</button>
    </div>
  </div>

  <!-- Add Event Manually -->
  <div class="section">
    <div class="section-header"><h2>Add Event Manually</h2></div>
    <div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:flex-end">
      <div class="form-group"><label>Title *</label><input type="text" id="me-title" style="min-width:200px"></div>
      <div class="form-group"><label>City *</label><input type="text" id="me-city" value="San Miguel de Allende"></div>
      <div class="form-group"><label>Venue</label><input type="text" id="me-venue"></div>
      <div class="form-group"><label>Address</label><input type="text" id="me-address"></div>
      <div class="form-group"><label>Date</label><input type="datetime-local" id="me-date"></div>
      <div class="form-group"><label>Category</label>
        <select id="me-category">
          <option value="other">Other</option>
          <option value="music">Music</option>
          <option value="food">Food</option>
          <option value="nightlife">Nightlife</option>
          <option value="culture">Culture</option>
          <option value="sports">Sports</option>
          <option value="popup">Popup</option>
        </select>
      </div>
      <div class="form-group"><label>Price</label><input type="text" id="me-price" placeholder="$100"></div>
      <div class="form-group"><label>Description</label><textarea id="me-desc" style="min-width:200px"></textarea></div>
      <button class="btn btn-primary" onclick="addManualEvent()">Add Event</button>
    </div>
  </div>
</div>

<!-- ═══════════════════ SOURCES TAB ═══════════════════ -->
<div class="tab-content" id="tab-sources">
  <div class="section">
    <div class="section-header">
      <h2>Sources</h2>
      <button class="btn btn-primary" id="btn-scrape-sources" onclick="triggerScrape()">Run Scraper Now</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>URL</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Quality</th>
            <th>Events Found</th>
            <th>From Images</th>
            <th>Total Scrapes</th>
            <th>Last Scraped</th>
            <th>Success</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="sources-body"></tbody>
      </table>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Name</label><input type="text" id="new-source-name" placeholder="Source name"></div>
      <div class="form-group"><label>URL</label><input type="url" id="new-source-url" placeholder="https://..." style="min-width:200px"></div>
      <div class="form-group"><label>Type</label>
        <select id="new-source-type">
          <option value="facebook_page">Facebook Page</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="website">Website</option>
          <option value="platform">Platform</option>
          <option value="user_forwarded">User Forwarded</option>
        </select>
      </div>
      <div class="form-group"><label>Priority</label>
        <select id="new-source-priority">
          <option value="medium" selected>Medium</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
      </div>
      <button class="btn btn-primary" onclick="addSource()">Add Source</button>
    </div>
  </div>
</div>

<!-- ═══════════════════ SCRAPING TAB ═══════════════════ -->
<div class="tab-content" id="tab-scraping">
  <div class="section">
    <div class="section-header">
      <h2>Scrape Log</h2>
      <div style="display:flex;gap:0.5rem">
        <button class="btn btn-primary" id="btn-full-scrape" onclick="triggerFullScrape()">Run Full Scrape Now</button>
        <button class="btn btn-secondary" id="btn-quality-check" onclick="triggerQualityCheck()">Run Quality Check</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Started</th>
            <th>Completed</th>
            <th>Duration</th>
            <th>Trigger</th>
            <th>Sources</th>
            <th>Inserted</th>
            <th>Rejected</th>
            <th>Merged</th>
            <th>Errors</th>
          </tr>
        </thead>
        <tbody id="scrape-log-body"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- ═══════════════════ ANALYTICS TAB ═══════════════════ -->
<div class="tab-content" id="tab-analytics">
  <div class="grid-2">
    <div class="section">
      <div class="section-header"><h2>Top 20 Questions</h2></div>
      <ul class="query-list" id="top-queries-list">
        <li class="empty-state">Loading...</li>
      </ul>
    </div>
    <div class="section">
      <div class="section-header"><h2>Intent Distribution</h2></div>
      <div id="intent-chart"></div>
    </div>
  </div>
  <div class="grid-2">
    <div class="section">
      <div class="section-header"><h2>Queries per Hour (7 days)</h2></div>
      <div class="heatmap" id="hours-heatmap"></div>
    </div>
    <div class="section">
      <div class="section-header"><h2>Most Searched Categories</h2></div>
      <div id="category-chart"></div>
    </div>
  </div>
  <div class="section">
    <div class="section-header"><h2>Daily Volume (30 days)</h2></div>
    <div class="bar-chart" id="daily-chart"></div>
  </div>
  <div class="section">
    <div class="section-header"><h2>Unknown Queries (Opportunities)</h2></div>
    <ul class="query-list" id="unknown-queries-list">
      <li class="empty-state">Loading...</li>
    </ul>
  </div>

  <!-- Retention & Engagement -->
  <div class="cards-grid" style="margin-top:1rem">
    <div class="stat-card"><div class="stat-value" id="metric-dau">-</div><div class="stat-label">DAU</div></div>
    <div class="stat-card"><div class="stat-value" id="metric-wau">-</div><div class="stat-label">WAU</div></div>
    <div class="stat-card"><div class="stat-value" id="metric-mau">-</div><div class="stat-label">MAU</div></div>
    <div class="stat-card"><div class="stat-value" id="metric-retention">-</div><div class="stat-label">Retention Rate</div></div>
  </div>
  <div class="grid-2">
    <div class="section">
      <div class="section-header"><h2>Retention Trend (7d)</h2></div>
      <div class="bar-chart" id="retention-chart"></div>
    </div>
    <div class="section">
      <div class="section-header"><h2>Response Time</h2></div>
      <div id="response-time-stats" style="font-size:0.8rem;margin-bottom:0.5rem">
        <span><strong>Avg:</strong> <span id="rt-avg">-</span></span> &nbsp;
        <span><strong>P50:</strong> <span id="rt-p50">-</span></span> &nbsp;
        <span><strong>P95:</strong> <span id="rt-p95">-</span></span>
      </div>
      <div class="bar-chart" id="rt-trend-chart" style="height:80px"></div>
    </div>
  </div>
</div>

<!-- ═══════════════════ ALERTS TAB ═══════════════════ -->
<div class="tab-content" id="tab-alerts">
  <div class="cards-grid" id="alerts-cards">
    <div class="stat-card"><div class="stat-value" id="alert-total-active">-</div><div class="stat-label">Active Alerts</div></div>
    <div class="stat-card"><div class="stat-value" id="alert-sent-today">-</div><div class="stat-label">Sent Today</div></div>
    <div class="stat-card"><div class="stat-value" id="alert-sent-week">-</div><div class="stat-label">Sent This Week</div></div>
  </div>
  <div class="section">
    <div class="section-header"><h2>User Alerts</h2></div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>User (last 4)</th>
            <th>Category</th>
            <th>Query</th>
            <th>Active</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody id="alerts-body"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- ═══════════════════ SETTINGS TAB ═══════════════════ -->
<div class="tab-content" id="tab-settings">
  <div class="section">
    <div class="section-header"><h2>Configuration</h2></div>
    <div class="settings-grid" id="settings-grid">
      <span class="s-label">DEFAULT_CITY</span><span class="s-value" id="s-city">-</span>
      <span class="s-label">NODE_ENV</span><span class="s-value" id="s-env">-</span>
      <span class="s-label">LOG_LEVEL</span><span class="s-value" id="s-log">-</span>
      <span class="s-label">PORT</span><span class="s-value" id="s-port">-</span>
    </div>
  </div>
  <div class="section">
    <div class="section-header"><h2>Scrape Schedules</h2></div>
    <div class="settings-grid">
      <span class="s-label">Smart Scrape</span><span class="s-value">Every 6 hours (0 */6 * * *)</span>
      <span class="s-label">Full Scrape</span><span class="s-value">Manual / On-demand</span>
      <span class="s-label">Freshness Recalc</span><span class="s-value">Every 3 hours</span>
    </div>
  </div>
  <div class="section">
    <div class="section-header"><h2>Bot Parameters</h2></div>
    <div class="settings-grid">
      <span class="s-label">Max Events per Response</span><span class="s-value">8</span>
      <span class="s-label">Daily Digest Time</span><span class="s-value">10:00 AM (SMA timezone, CST)</span>
      <span class="s-label">Confidence Threshold</span><span class="s-value">0.4</span>
      <span class="s-label">Max Images per FB Page</span><span class="s-value">3</span>
    </div>
  </div>
</div>

<!-- ═══════════════════ QUALITY TAB ═══════════════════ -->
<div class="tab-content" id="tab-quality">
  <div class="cards-grid" id="quality-cards">
    <div class="stat-card"><div class="stat-value" id="q-future">-</div><div class="stat-label">Future Events</div></div>
    <div class="stat-card"><div class="stat-value" id="q-stale">-</div><div class="stat-label">Stale Events</div></div>
    <div class="stat-card"><div class="stat-value" id="q-merged">-</div><div class="stat-label">Merged Today</div></div>
    <div class="stat-card"><div class="stat-value" id="q-completeness">-</div><div class="stat-label">Avg Completeness</div></div>
  </div>
  <div class="grid-2">
    <div class="section">
      <div class="section-header"><h2>Events per Day (Next 7 Days)</h2></div>
      <div class="bar-chart" id="q-events-chart"></div>
    </div>
    <div class="section">
      <div class="section-header"><h2>Completeness</h2></div>
      <div id="q-completeness-bars"></div>
    </div>
  </div>
  <div class="grid-2">
    <div class="section">
      <div class="section-header"><h2>Top Sources by Quality</h2></div>
      <div id="q-source-ranking"></div>
    </div>
    <div class="section">
      <div class="section-header"><h2>Coverage Gaps</h2></div>
      <div id="q-coverage-gaps" style="font-size:0.8rem"></div>
    </div>
  </div>
</div>

</main>

<div class="toast" id="toast"></div>

<script>
  // ═══════════════════════════════════════════════════════
  // GLOBAL STATE
  // ═══════════════════════════════════════════════════════
  var usersPage = 1, usersTotal = 0;
  var eventsPage = 1, eventsTotal = 0;
  var PAGE_SIZE = 20;
  var selectedEventIds = [];
  var refreshTimer = null;

  // ═══════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════
  function showToast(message, type) {
    var el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast show ' + (type || 'success');
    clearTimeout(el._timer);
    el._timer = setTimeout(function() { el.className = 'toast'; }, 3500);
  }

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

  function esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function last4(hash) {
    if (!hash) return '----';
    return '...' + hash.slice(-4);
  }

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

  function fmtDuration(startStr, endStr) {
    if (!startStr || !endStr) return '-';
    var ms = new Date(endStr).getTime() - new Date(startStr).getTime();
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return Math.round(ms / 1000) + 's';
    return Math.round(ms / 60000) + 'min';
  }

  function qualityBadge(score) {
    if (score == null) return '<span class="badge badge-yellow">N/A</span>';
    if (score > 0.7) return '<span class="badge badge-green">' + score.toFixed(2) + '</span>';
    if (score > 0.3) return '<span class="badge badge-yellow">' + score.toFixed(2) + '</span>';
    return '<span class="badge badge-red">' + score.toFixed(2) + '</span>';
  }

  function checkMark(val) {
    return val ? '<span class="check">Y</span>' : '<span class="cross">N</span>';
  }

  function miniBar(pct, color) {
    return '<div class="mini-bar"><div class="fill" style="width:' + pct + '%;background:' + (color || '#4ecca3') + '"></div></div>' + pct + '%';
  }

  function barColor(pct) {
    if (pct > 70) return '#4ecca3';
    if (pct > 40) return '#ffb74d';
    return '#e94560';
  }

  // ═══════════════════════════════════════════════════════
  // TAB NAVIGATION
  // ═══════════════════════════════════════════════════════
  document.querySelectorAll('.nav-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
      tab.classList.add('active');
      var target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
      loadTabData(tab.dataset.tab);
    });
  });

  var loadedTabs = {};
  function loadTabData(tab) {
    if (loadedTabs[tab]) return;
    loadedTabs[tab] = true;
    switch (tab) {
      case 'overview': loadOverview(); break;
      case 'users': loadUsers(); break;
      case 'messages': loadRecentMessages(); loadUnanswered(); break;
      case 'events': loadEvents(); break;
      case 'sources': loadSources(); break;
      case 'scraping': loadScrapeLog(); break;
      case 'analytics': loadAnalytics(); break;
      case 'alerts': loadAlerts(); break;
      case 'settings': loadSettings(); break;
      case 'quality': loadQuality(); break;
    }
  }

  // ═══════════════════════════════════════════════════════
  // OVERVIEW
  // ═══════════════════════════════════════════════════════
  function loadOverview() {
    api('GET', '/admin/api/stats').then(function(d) {
      document.getElementById('ov-total-users').textContent = d.totalUsers || 0;
      document.getElementById('ov-active-today').textContent = d.activeToday || 0;
      document.getElementById('ov-active-week').textContent = d.activeWeek || 0;
      document.getElementById('ov-events-total').textContent = d.totalEvents || 0;
      document.getElementById('ov-events-today').textContent = d.eventsToday || 0;
      document.getElementById('ov-events-week').textContent = d.eventsWeek || 0;
      document.getElementById('ov-msgs-today').textContent = d.messagesToday || 0;
      document.getElementById('ov-msgs-total').textContent = d.totalMessages || 0;
      document.getElementById('ov-response-rate').textContent = d.responseRate + '%';
      document.getElementById('ov-avg-response').textContent = d.avgResponseMs + 'ms';
      document.getElementById('ov-subscribers').textContent = d.subscribers || 0;
      document.getElementById('ov-sources').textContent = d.activeSources || 0;

      // Category bars
      var cats = d.eventsByCategory || [];
      var container = document.getElementById('ov-category-bars');
      if (cats.length === 0) {
        container.innerHTML = '<div class="empty-state">No events yet</div>';
        return;
      }
      var maxC = Math.max.apply(null, cats.map(function(c) { return c.count; }));
      container.innerHTML = cats.map(function(c) {
        var pct = maxC > 0 ? Math.round((c.count / maxC) * 100) : 0;
        return '<div class="hbar-row">' +
          '<span class="hbar-label">' + esc(c.category || 'other') + '</span>' +
          '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="hbar-count">' + c.count + '</span></div>';
      }).join('');

      document.getElementById('last-refresh').textContent = new Date().toLocaleTimeString();
    }).catch(function(err) { console.error('Overview load failed:', err); });
  }

  // ═══════════════════════════════════════════════════════
  // USERS
  // ═══════════════════════════════════════════════════════
  function loadUsers() {
    usersPage = 1;
    fetchUsers();
  }

  function fetchUsers() {
    var params = new URLSearchParams();
    params.set('page', usersPage.toString());
    params.set('limit', PAGE_SIZE.toString());
    var lang = document.getElementById('user-filter-lang').value;
    var tourist = document.getElementById('user-filter-tourist').value;
    var onboarding = document.getElementById('user-filter-onboarding').value;
    var sort = document.getElementById('user-sort').value;
    if (lang) params.set('language', lang);
    if (tourist) params.set('tourist', tourist);
    if (onboarding) params.set('onboarding', onboarding);
    if (sort) params.set('sort', sort);

    api('GET', '/admin/api/users?' + params.toString()).then(function(data) {
      usersTotal = data.total || 0;
      var tbody = document.getElementById('users-body');
      if (!data.users || !data.users.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No users found</td></tr>';
        updateUsersPagination();
        return;
      }
      tbody.innerHTML = data.users.map(function(u) {
        var interests = (u.interests || []).join(', ') || '-';
        return '<tr class="expandable" onclick="toggleUserConvos(this, \\'' + esc(u.phoneHash) + '\\')">' +
          '<td><strong>' + esc(last4(u.phoneHash)) + '</strong></td>' +
          '<td>' + esc(u.language || '-') + '</td>' +
          '<td class="truncate">' + esc(interests) + '</td>' +
          '<td>' + (u.isTourist === true ? '<span class="badge badge-blue">Tourist</span>' : u.isTourist === false ? '<span class="badge badge-green">Local</span>' : '<span class="badge badge-yellow">?</span>') + '</td>' +
          '<td>' + (u.onboardingComplete ? '<span class="badge badge-green">Done</span>' : '<span class="badge badge-yellow">Pending</span>') + '</td>' +
          '<td style="white-space:nowrap">' + fmtDate(u.firstSeenAt) + '</td>' +
          '<td style="white-space:nowrap">' + fmtDate(u.lastActiveAt) + '</td>' +
          '<td>' + (u.queryCount || 0) + '</td>' +
          '<td>' + (u.forwardCount || 0) + '</td>' +
          '<td>' + (u.digestEnabled ? '<span class="check">On</span>' : '<span class="cross">Off</span>') + '</td>' +
        '</tr>';
      }).join('');
      updateUsersPagination();
    }).catch(function(err) { console.error('Users load failed:', err); });
  }

  function toggleUserConvos(row, phoneHash) {
    var next = row.nextElementSibling;
    if (next && next.classList.contains('expand-row')) {
      next.remove();
      return;
    }
    var tr = document.createElement('tr');
    tr.className = 'expand-row';
    tr.innerHTML = '<td colspan="10" style="padding:0.75rem"><em>Loading conversations...</em></td>';
    row.parentNode.insertBefore(tr, row.nextSibling);

    api('GET', '/admin/api/users/' + encodeURIComponent(phoneHash) + '/conversations').then(function(convos) {
      if (!convos || !convos.length) {
        tr.innerHTML = '<td colspan="10" class="empty-state">No conversations found</td>';
        return;
      }
      var html = '<td colspan="10"><div style="max-height:250px;overflow-y:auto;font-size:0.78rem">';
      convos.forEach(function(c) {
        var isUser = c.role === 'user';
        var intentBadge = c.intent ? (c.intent === 'unknown' ? '<span class="intent-unknown">[' + c.intent + ']</span>' : '<span style="color:#8899aa">[' + esc(c.intent) + ']</span>') : '';
        html += '<div style="margin-bottom:0.4rem;padding:0.3rem 0.5rem;border-radius:6px;background:' + (isUser ? 'rgba(78,204,163,0.08)' : 'rgba(100,181,246,0.08)') + '">' +
          '<strong style="color:' + (isUser ? '#4ecca3' : '#64b5f6') + '">' + (isUser ? 'User' : 'Bot') + '</strong> ' +
          intentBadge + ' <span style="color:#8899aa;font-size:0.7rem">' + fmtDate(c.createdAt) + '</span><br>' +
          '<span>' + esc(c.content) + '</span></div>';
      });
      html += '</div></td>';
      tr.innerHTML = html;
    }).catch(function() {
      tr.innerHTML = '<td colspan="10" class="empty-state" style="color:#e94560">Failed to load conversations</td>';
    });
  }

  function updateUsersPagination() {
    var tp = Math.max(1, Math.ceil(usersTotal / PAGE_SIZE));
    document.getElementById('users-page-info').textContent = 'Page ' + usersPage + ' of ' + tp + ' (' + usersTotal + ' users)';
    document.getElementById('users-prev').disabled = usersPage <= 1;
    document.getElementById('users-next').disabled = usersPage >= tp;
  }

  function changeUsersPage(dir) {
    var tp = Math.max(1, Math.ceil(usersTotal / PAGE_SIZE));
    var np = usersPage + dir;
    if (np < 1 || np > tp) return;
    usersPage = np;
    fetchUsers();
  }

  // ═══════════════════════════════════════════════════════
  // MESSAGES
  // ═══════════════════════════════════════════════════════
  function loadRecentMessages() {
    var intent = document.getElementById('msg-filter-intent').value;
    var params = intent ? '?intent=' + intent : '';
    api('GET', '/admin/api/conversations/recent' + params).then(function(data) {
      var tbody = document.getElementById('messages-body');
      if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No messages found</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(function(m) {
        var intentClass = m.intent === 'unknown' ? ' class="intent-unknown"' : '';
        return '<tr>' +
          '<td>' + esc(last4(m.phoneHash)) + '</td>' +
          '<td class="truncate" style="max-width:250px">' + esc(m.content) + '</td>' +
          '<td class="truncate" style="max-width:250px">' + esc(m.botResponse || '-') + '</td>' +
          '<td' + intentClass + '>' + esc(m.intent || '-') + '</td>' +
          '<td style="white-space:nowrap">' + fmtDate(m.createdAt) + '</td>' +
        '</tr>';
      }).join('');
    }).catch(function(err) { console.error('Messages load failed:', err); });
  }

  function loadUnanswered() {
    api('GET', '/admin/api/conversations/unanswered').then(function(data) {
      var tbody = document.getElementById('unanswered-body');
      if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No unanswered questions - great!</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(function(m) {
        return '<tr style="background:rgba(233,69,96,0.05)">' +
          '<td>' + esc(last4(m.phoneHash)) + '</td>' +
          '<td>' + esc(m.content) + '</td>' +
          '<td style="white-space:nowrap">' + fmtDate(m.createdAt) + '</td>' +
        '</tr>';
      }).join('');
    }).catch(function(err) { console.error('Unanswered load failed:', err); });
  }

  // ═══════════════════════════════════════════════════════
  // EVENTS
  // ═══════════════════════════════════════════════════════
  function loadEvents() {
    eventsPage = 1;
    selectedEventIds = [];
    fetchEventsData();
  }

  function fetchEventsData() {
    var params = new URLSearchParams();
    params.set('page', eventsPage.toString());
    params.set('limit', PAGE_SIZE.toString());
    var cat = document.getElementById('event-filter-category').value;
    var cType = document.getElementById('event-filter-type').value;
    var dateF = document.getElementById('event-filter-date').value;
    if (cat) params.set('category', cat);
    if (cType) params.set('content_type', cType);
    if (dateF) params.set('date', dateF);

    api('GET', '/admin/api/events?' + params.toString()).then(function(data) {
      eventsTotal = data.total || 0;
      var tbody = document.getElementById('events-body');
      if (!data.events || !data.events.length) {
        tbody.innerHTML = '<tr><td colspan="12" class="empty-state">No events found</td></tr>';
        updateEventsPagination();
        return;
      }
      tbody.innerHTML = data.events.map(function(e) {
        var conf = e.confidence != null ? Math.round(e.confidence * 100) : 0;
        var fresh = e.freshnessScore != null ? Math.round(e.freshnessScore * 100) : 0;
        return '<tr class="expandable" onclick="toggleEventExpand(this, ' + esc(JSON.stringify(JSON.stringify(e))) + ')">' +
          '<td onclick="event.stopPropagation()"><input type="checkbox" class="cb event-cb" value="' + e.id + '" onchange="updateSelectedEvents()"></td>' +
          '<td class="truncate"><strong>' + esc(e.title) + '</strong></td>' +
          '<td class="truncate">' + esc(e.venueName || '-') + '</td>' +
          '<td style="white-space:nowrap">' + fmtEventDate(e.eventDate) + '</td>' +
          '<td><span class="badge badge-blue">' + esc(e.category || 'other') + '</span></td>' +
          '<td><span class="badge badge-purple">' + esc(e.contentType || 'event') + '</span></td>' +
          '<td>' + checkMark(e.imageUrl) + '</td>' +
          '<td>' + checkMark(e.price) + '</td>' +
          '<td>' + checkMark(e.description && e.description.length > 10) + '</td>' +
          '<td>' + checkMark(e.venueAddress) + '</td>' +
          '<td>' + miniBar(fresh, barColor(fresh)) + '</td>' +
          '<td>' + miniBar(conf, barColor(conf)) + '</td>' +
        '</tr>';
      }).join('');
      updateEventsPagination();
    }).catch(function(err) { console.error('Events load failed:', err); });
  }

  function toggleEventExpand(row, jsonStr) {
    var next = row.nextElementSibling;
    if (next && next.classList.contains('expand-row')) { next.remove(); return; }
    var e = JSON.parse(jsonStr);
    var tr = document.createElement('tr');
    tr.className = 'expand-row';
    var html = '<td colspan="12">';
    html += '<span class="field-label">Description</span>' + esc(e.description || 'No description');
    html += '<span class="field-label">Venue Address</span>' + esc(e.venueAddress || '-');
    html += '<span class="field-label">Neighborhood</span>' + esc(e.neighborhood || '-');
    html += '<span class="field-label">Price</span>' + esc(e.price || '-');
    html += '<span class="field-label">Source URL</span>' + (e.sourceUrl ? '<a href="' + esc(e.sourceUrl) + '" target="_blank" style="color:#4ecca3">' + esc(e.sourceUrl) + '</a>' : '-');
    html += '<span class="field-label">Source Type</span>' + esc(e.sourceType || '-');
    html += '<span class="field-label">Image</span>' + (e.imageUrl ? '<a href="' + esc(e.imageUrl) + '" target="_blank" style="color:#4ecca3">View Image</a>' : '-');
    if (e.rawContent) {
      html += '<span class="field-label">Raw Content</span>' + esc(e.rawContent.substring(0, 500)) + (e.rawContent.length > 500 ? '...' : '');
    }
    html += '</td>';
    tr.innerHTML = html;
    row.parentNode.insertBefore(tr, row.nextSibling);
  }

  function toggleAllEvents(cb) {
    document.querySelectorAll('.event-cb').forEach(function(c) { c.checked = cb.checked; });
    updateSelectedEvents();
  }

  function updateSelectedEvents() {
    selectedEventIds = [];
    document.querySelectorAll('.event-cb:checked').forEach(function(c) { selectedEventIds.push(c.value); });
  }

  function bulkDeleteEvents() {
    if (selectedEventIds.length === 0) { showToast('No events selected', 'error'); return; }
    if (!confirm('Delete ' + selectedEventIds.length + ' events?')) return;
    api('DELETE', '/admin/api/events', { ids: selectedEventIds }).then(function(data) {
      showToast(data.deleted + ' events deleted');
      selectedEventIds = [];
      fetchEventsData();
    }).catch(function(err) { showToast(err.message, 'error'); });
  }

  function bulkChangeCategory() {
    var cat = document.getElementById('bulk-category-select').value;
    if (!cat) { showToast('Select a category first', 'error'); return; }
    if (selectedEventIds.length === 0) { showToast('No events selected', 'error'); return; }
    api('PUT', '/admin/api/events/category', { ids: selectedEventIds, category: cat }).then(function(data) {
      showToast(data.updated + ' events updated');
      selectedEventIds = [];
      fetchEventsData();
    }).catch(function(err) { showToast(err.message, 'error'); });
  }

  function addManualEvent() {
    var title = document.getElementById('me-title').value.trim();
    var city = document.getElementById('me-city').value.trim();
    if (!title || !city) { showToast('Title and City are required', 'error'); return; }

    api('POST', '/admin/api/events/manual', {
      title: title,
      city: city,
      venueName: document.getElementById('me-venue').value.trim() || null,
      venueAddress: document.getElementById('me-address').value.trim() || null,
      eventDate: document.getElementById('me-date').value || null,
      category: document.getElementById('me-category').value,
      price: document.getElementById('me-price').value.trim() || null,
      description: document.getElementById('me-desc').value.trim() || null
    }).then(function() {
      showToast('Event added');
      document.getElementById('me-title').value = '';
      document.getElementById('me-venue').value = '';
      document.getElementById('me-address').value = '';
      document.getElementById('me-date').value = '';
      document.getElementById('me-price').value = '';
      document.getElementById('me-desc').value = '';
      loadedTabs['events'] = false;
      fetchEventsData();
    }).catch(function(err) { showToast(err.message, 'error'); });
  }

  function updateEventsPagination() {
    var tp = Math.max(1, Math.ceil(eventsTotal / PAGE_SIZE));
    document.getElementById('events-page-info').textContent = 'Page ' + eventsPage + ' of ' + tp + ' (' + eventsTotal + ' events)';
    document.getElementById('events-prev').disabled = eventsPage <= 1;
    document.getElementById('events-next').disabled = eventsPage >= tp;
  }

  function changeEventsPage(dir) {
    var tp = Math.max(1, Math.ceil(eventsTotal / PAGE_SIZE));
    var np = eventsPage + dir;
    if (np < 1 || np > tp) return;
    eventsPage = np;
    fetchEventsData();
  }

  // ═══════════════════════════════════════════════════════
  // SOURCES
  // ═══════════════════════════════════════════════════════
  function loadSources() {
    api('GET', '/admin/api/sources').then(function(data) {
      var tbody = document.getElementById('sources-body');
      if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="12" class="empty-state">No sources configured</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(function(s) {
        var successPct = s.successRate != null ? Math.round(s.successRate * 100) : 100;
        return '<tr>' +
          '<td><strong>' + esc(s.name) + '</strong></td>' +
          '<td class="url-cell"><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url) + '</a></td>' +
          '<td><span class="badge badge-blue">' + esc(s.type) + '</span></td>' +
          '<td><select class="priority-select" data-id="' + s.id + '" onchange="updatePriority(this)" style="background:#1a1a2e;color:#e0e0e0;border:1px solid #0f3460;border-radius:4px;padding:0.2rem;font-size:0.72rem">' +
            '<option value="high"' + (s.pollPriority === 'high' ? ' selected' : '') + '>High</option>' +
            '<option value="medium"' + (s.pollPriority === 'medium' ? ' selected' : '') + '>Medium</option>' +
            '<option value="low"' + (s.pollPriority === 'low' ? ' selected' : '') + '>Low</option>' +
          '</select></td>' +
          '<td>' + qualityBadge(s.qualityScore) + '</td>' +
          '<td>' + (s.eventsFound || 0) + '</td>' +
          '<td>' + (s.eventsFromImages || 0) + '</td>' +
          '<td>' + (s.totalScrapes || 0) + '</td>' +
          '<td>' + fmtDate(s.lastScrapedAt) + '</td>' +
          '<td>' + miniBar(successPct, barColor(successPct)) + '</td>' +
          '<td><label class="toggle"><input type="checkbox"' + (s.isActive ? ' checked' : '') + ' onchange="toggleSource(\\'' + s.id + '\\', this.checked)"><span class="slider"></span></label></td>' +
          '<td style="white-space:nowrap">' +
            '<a class="btn btn-secondary btn-xs" href="/admin/qr/' + encodeURIComponent(s.name) + '" target="_blank" style="text-decoration:none;margin-right:0.2rem">QR</a>' +
            '<button class="btn btn-danger btn-xs" onclick="deleteSource(\\'' + s.id + '\\')">Del</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }).catch(function(err) { console.error('Sources load failed:', err); });
  }

  function toggleSource(id, active) {
    api('PUT', '/admin/api/sources/' + id, { isActive: active }).then(function() {
      showToast('Source ' + (active ? 'activated' : 'deactivated'));
    }).catch(function(err) {
      showToast(err.message, 'error');
      loadSources();
    });
  }

  function updatePriority(select) {
    var id = select.getAttribute('data-id');
    api('PUT', '/admin/api/sources/' + id, { pollPriority: select.value }).then(function() {
      showToast('Priority updated');
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
    if (!name || !url) { showToast('Name and URL are required', 'error'); return; }

    api('POST', '/admin/api/sources', { name: name, url: url, type: type, pollPriority: priority }).then(function() {
      showToast('Source added');
      document.getElementById('new-source-name').value = '';
      document.getElementById('new-source-url').value = '';
      loadSources();
    }).catch(function(err) { showToast(err.message, 'error'); });
  }

  function deleteSource(id) {
    if (!confirm('Delete this source?')) return;
    api('DELETE', '/admin/api/sources/' + id).then(function() {
      showToast('Source deleted');
      loadSources();
    }).catch(function(err) { showToast(err.message, 'error'); });
  }

  function triggerScrape() {
    var btn = document.getElementById('btn-scrape-sources');
    btn.disabled = true;
    btn.textContent = 'Scraping...';
    api('POST', '/admin/api/scrape').then(function(data) {
      showToast('Scrape done: ' + (data.eventsInserted || 0) + ' inserted, ' + (data.duplicatesSkipped || 0) + ' duplicates');
      loadSources();
    }).catch(function(err) {
      showToast('Scrape failed: ' + err.message, 'error');
    }).finally(function() {
      btn.disabled = false;
      btn.textContent = 'Run Scraper Now';
    });
  }

  // ═══════════════════════════════════════════════════════
  // SCRAPING LOG
  // ═══════════════════════════════════════════════════════
  function loadScrapeLog() {
    api('GET', '/admin/api/scrape-log').then(function(data) {
      var tbody = document.getElementById('scrape-log-body');
      if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No scrape runs yet</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(function(log) {
        var hasErrors = (log.errors || 0) > 0;
        return '<tr' + (hasErrors ? ' style="background:rgba(233,69,96,0.05)"' : '') + '>' +
          '<td style="white-space:nowrap">' + fmtDate(log.startedAt) + '</td>' +
          '<td style="white-space:nowrap">' + fmtDate(log.completedAt) + '</td>' +
          '<td>' + fmtDuration(log.startedAt, log.completedAt) + '</td>' +
          '<td><span class="badge badge-blue">' + esc(log.trigger || 'unknown') + '</span></td>' +
          '<td>' + (log.sourcesProcessed || 0) + '</td>' +
          '<td style="color:#4ecca3;font-weight:600">' + (log.eventsInserted || 0) + '</td>' +
          '<td>' + (log.eventsRejected || 0) + '</td>' +
          '<td>' + (log.duplicatesMerged || 0) + '</td>' +
          '<td' + (hasErrors ? ' style="color:#e94560;font-weight:600"' : '') + '>' + (log.errors || 0) + '</td>' +
        '</tr>';
      }).join('');
    }).catch(function(err) { console.error('Scrape log load failed:', err); });
  }

  function triggerFullScrape() {
    var btn = document.getElementById('btn-full-scrape');
    btn.disabled = true;
    btn.textContent = 'Running...';
    api('POST', '/admin/api/scrape/run').then(function(data) {
      showToast('Full scrape done: ' + (data.eventsInserted || 0) + ' inserted');
      loadedTabs['scraping'] = false;
      loadScrapeLog();
    }).catch(function(err) {
      showToast('Failed: ' + err.message, 'error');
    }).finally(function() {
      btn.disabled = false;
      btn.textContent = 'Run Full Scrape Now';
    });
  }

  function triggerQualityCheck() {
    var btn = document.getElementById('btn-quality-check');
    btn.disabled = true;
    btn.textContent = 'Running...';
    api('POST', '/admin/api/quality/run').then(function() {
      showToast('Quality check complete');
    }).catch(function(err) {
      showToast('Failed: ' + err.message, 'error');
    }).finally(function() {
      btn.disabled = false;
      btn.textContent = 'Run Quality Check';
    });
  }

  // ═══════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════
  var INTENT_COLORS = {
    event_query: '#4ecca3',
    venue_query: '#64b5f6',
    local_info: '#ffb74d',
    forward_content: '#ce93d8',
    onboarding: '#4dd0e1',
    feedback: '#aed581',
    unknown: '#e94560'
  };

  function loadAnalytics() {
    loadTopQueries();
    loadIntentChart();
    loadHourlyHeatmap();
    loadCategoryChart();
    loadDailyChart();
    loadUnknownQueries();
    loadRetention();
    loadEngagement();
  }

  function loadTopQueries() {
    api('GET', '/admin/api/analytics/top-queries').then(function(data) {
      var list = document.getElementById('top-queries-list');
      if (!data || !data.length) { list.innerHTML = '<li class="empty-state">No queries yet</li>'; return; }
      list.innerHTML = data.map(function(d) {
        var intentClass = d.intent === 'unknown' ? ' intent-unknown' : '';
        return '<li><span class="q-text">' + esc(d.query || '(empty)') + '</span>' +
          '<span class="q-intent' + intentClass + '">' + esc(d.intent) + '</span>' +
          '<span class="q-count">' + d.count + '</span></li>';
      }).join('');
    }).catch(function(err) { console.error('Top queries failed:', err); });
  }

  function loadIntentChart() {
    api('GET', '/admin/api/analytics/intents').then(function(data) {
      var container = document.getElementById('intent-chart');
      if (!data || !data.length) { container.innerHTML = '<div class="empty-state">No data</div>'; return; }
      var maxC = Math.max.apply(null, data.map(function(d) { return d.count; }));
      container.innerHTML = data.map(function(d) {
        var pct = maxC > 0 ? Math.round((d.count / maxC) * 100) : 0;
        var color = INTENT_COLORS[d.intent] || '#4ecca3';
        return '<div class="hbar-row"><span class="hbar-label">' + esc(d.intent) + '</span>' +
          '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
          '<span class="hbar-count">' + d.count + '</span></div>';
      }).join('');
    }).catch(function(err) { console.error('Intent chart failed:', err); });
  }

  function loadHourlyHeatmap() {
    api('GET', '/admin/api/analytics/hourly').then(function(data) {
      var container = document.getElementById('hours-heatmap');
      if (!data || !data.length) { container.innerHTML = '<div class="empty-state">No data</div>'; return; }
      var maxH = Math.max.apply(null, data.map(function(h) { return h.count; }));
      container.innerHTML = data.map(function(h) {
        var intensity = maxH > 0 ? h.count / maxH : 0;
        var r = Math.round(26 + intensity * (78 - 26));
        var g = Math.round(26 + intensity * (204 - 26));
        var b = Math.round(46 + intensity * (163 - 46));
        var bg = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.2 + intensity * 0.8) + ')';
        return '<div class="heatmap-cell" title="' + h.hour + ':00 - ' + h.count + ' queries" style="background:' + bg + '">' + h.hour + '</div>';
      }).join('');
    }).catch(function(err) { console.error('Hourly heatmap failed:', err); });
  }

  function loadCategoryChart() {
    api('GET', '/admin/api/analytics/categories').then(function(data) {
      var container = document.getElementById('category-chart');
      if (!data || !data.length) { container.innerHTML = '<div class="empty-state">No data</div>'; return; }
      var maxC = Math.max.apply(null, data.map(function(d) { return d.count; }));
      container.innerHTML = data.map(function(d) {
        var pct = maxC > 0 ? Math.round((d.count / maxC) * 100) : 0;
        return '<div class="hbar-row"><span class="hbar-label">' + esc(d.category || 'none') + '</span>' +
          '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%;background:#ce93d8"></div></div>' +
          '<span class="hbar-count">' + d.count + '</span></div>';
      }).join('');
    }).catch(function(err) { console.error('Category chart failed:', err); });
  }

  function loadDailyChart() {
    api('GET', '/admin/api/analytics/daily').then(function(data) {
      var container = document.getElementById('daily-chart');
      if (!data || !data.length) {
        container.innerHTML = '<div class="empty-state" style="width:100%;display:flex;align-items:center;justify-content:center;">No daily data</div>';
        return;
      }
      var maxC = Math.max.apply(null, data.map(function(d) { return d.count; }));
      container.innerHTML = data.map(function(d) {
        var pct = maxC > 0 ? Math.round((d.count / maxC) * 100) : 0;
        var dt = new Date(d.date + 'T00:00:00');
        var label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return '<div class="bar-wrap" title="' + label + ': ' + d.count + ' queries">' +
          '<div class="bar" style="height:' + Math.max(pct, 2) + '%"></div>' +
          '<span class="bar-label">' + label + '</span></div>';
      }).join('');
    }).catch(function(err) { console.error('Daily chart failed:', err); });
  }

  function loadUnknownQueries() {
    api('GET', '/admin/api/analytics/top-queries').then(function(data) {
      var list = document.getElementById('unknown-queries-list');
      var unknowns = (data || []).filter(function(d) { return d.intent === 'unknown'; });
      if (!unknowns.length) { list.innerHTML = '<li class="empty-state">No unknown queries - the bot handles everything!</li>'; return; }
      list.innerHTML = unknowns.map(function(d) {
        return '<li style="color:#e94560"><span class="q-text">' + esc(d.query || '(empty)') + '</span>' +
          '<span class="q-count">' + d.count + 'x</span></li>';
      }).join('');
    }).catch(function(err) { console.error('Unknown queries failed:', err); });
  }

  function loadRetention() {
    api('GET', '/admin/api/metrics/retention').then(function(data) {
      document.getElementById('metric-dau').textContent = data.dau || 0;
      document.getElementById('metric-wau').textContent = data.wau || 0;
      document.getElementById('metric-mau').textContent = data.mau || 0;
      document.getElementById('metric-retention').textContent = (data.retentionRate || 0) + '%';

      var container = document.getElementById('retention-chart');
      if (data.retentionTrend && data.retentionTrend.length > 0) {
        var maxC = Math.max.apply(null, data.retentionTrend.map(function(d) { return Number(d.uniqueUsers) || 0; }));
        container.innerHTML = data.retentionTrend.map(function(d) {
          var cnt = Number(d.uniqueUsers) || 0;
          var pct = maxC > 0 ? Math.round((cnt / maxC) * 100) : 0;
          var dt = new Date(d.date + 'T00:00:00');
          var label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return '<div class="bar-wrap" title="' + label + ': ' + cnt + ' users">' +
            '<div class="bar" style="height:' + Math.max(pct, 2) + '%;background:#ce93d8"></div>' +
            '<span class="bar-label">' + label + '</span></div>';
        }).join('');
      } else {
        container.innerHTML = '<div class="empty-state" style="width:100%;display:flex;align-items:center;justify-content:center">No data</div>';
      }
    }).catch(function(err) { console.error('Retention failed:', err); });
  }

  function loadEngagement() {
    api('GET', '/admin/api/metrics/engagement').then(function(data) {
      if (data.responseTime) {
        document.getElementById('rt-avg').textContent = data.responseTime.avgMs + 'ms';
        document.getElementById('rt-p50').textContent = data.responseTime.p50Ms + 'ms';
        document.getElementById('rt-p95').textContent = data.responseTime.p95Ms + 'ms';
      }

      var rtContainer = document.getElementById('rt-trend-chart');
      if (data.responseTimeTrend && data.responseTimeTrend.length > 0) {
        var maxMs = Math.max.apply(null, data.responseTimeTrend.map(function(d) { return Number(d.avgMs) || 0; }));
        rtContainer.innerHTML = data.responseTimeTrend.map(function(d) {
          var ms = Math.round(Number(d.avgMs) || 0);
          var pct = maxMs > 0 ? Math.round((ms / maxMs) * 100) : 0;
          var dt = new Date(d.date + 'T00:00:00');
          var label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return '<div class="bar-wrap" title="' + label + ': ' + ms + 'ms">' +
            '<div class="bar" style="height:' + Math.max(pct, 2) + '%;background:#64b5f6"></div>' +
            '<span class="bar-label">' + label + '</span></div>';
        }).join('');
      }
    }).catch(function(err) { console.error('Engagement failed:', err); });
  }

  // ═══════════════════════════════════════════════════════
  // ALERTS
  // ═══════════════════════════════════════════════════════
  function loadAlerts() {
    api('GET', '/admin/api/alerts').then(function(data) {
      document.getElementById('alert-total-active').textContent = data.totalActive || 0;
      document.getElementById('alert-sent-today').textContent = data.sentToday || 0;
      document.getElementById('alert-sent-week').textContent = data.sentWeek || 0;

      var tbody = document.getElementById('alerts-body');
      if (!data.alerts || !data.alerts.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No alerts configured</td></tr>';
        return;
      }
      tbody.innerHTML = data.alerts.map(function(a) {
        return '<tr>' +
          '<td>' + esc(last4(a.phoneHash)) + '</td>' +
          '<td><span class="badge badge-blue">' + esc(a.category) + '</span></td>' +
          '<td class="truncate">' + esc(a.query || '-') + '</td>' +
          '<td>' + (a.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>') + '</td>' +
          '<td style="white-space:nowrap">' + fmtDate(a.createdAt) + '</td>' +
        '</tr>';
      }).join('');
    }).catch(function(err) { console.error('Alerts load failed:', err); });
  }

  // ═══════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════
  function loadSettings() {
    api('GET', '/admin/api/settings').then(function(data) {
      document.getElementById('s-city').textContent = data.DEFAULT_CITY || '-';
      document.getElementById('s-env').textContent = data.NODE_ENV || '-';
      document.getElementById('s-log').textContent = data.LOG_LEVEL || '-';
      document.getElementById('s-port').textContent = data.PORT || '-';
    }).catch(function(err) { console.error('Settings load failed:', err); });
  }

  // ═══════════════════════════════════════════════════════
  // DATA QUALITY
  // ═══════════════════════════════════════════════════════
  function loadQuality() {
    api('GET', '/admin/api/quality').then(function(data) {
      document.getElementById('q-future').textContent = data.completeness.total || 0;
      document.getElementById('q-stale').textContent = data.staleEvents || 0;
      document.getElementById('q-merged').textContent = data.duplicatesMergedToday || 0;

      var total = data.completeness.total || 1;
      var avgComp = Math.round(
        ((data.completeness.withImage + data.completeness.withPrice +
          data.completeness.withDescription + data.completeness.withVenue) / (total * 4)) * 100
      );
      document.getElementById('q-completeness').textContent = avgComp + '%';

      // Events per day chart
      var chartEl = document.getElementById('q-events-chart');
      if (data.eventsPerDay && data.eventsPerDay.length > 0) {
        var maxC = Math.max.apply(null, data.eventsPerDay.map(function(d) { return d.count; }));
        if (maxC === 0) maxC = 1;
        chartEl.innerHTML = data.eventsPerDay.map(function(d) {
          var pct = Math.round((d.count / maxC) * 100);
          var dt = new Date(d.date + 'T00:00:00');
          var label = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          var bc = d.count < 3 ? '#e94560' : d.count < 5 ? '#ffb74d' : '#4ecca3';
          return '<div class="bar-wrap" title="' + label + ': ' + d.count + ' events">' +
            '<div class="bar" style="height:' + Math.max(pct, 4) + '%;background:' + bc + '"></div>' +
            '<span class="bar-label">' + label + '</span></div>';
        }).join('');
      } else {
        chartEl.innerHTML = '<div class="empty-state">No data</div>';
      }

      // Completeness bars
      var compEl = document.getElementById('q-completeness-bars');
      var metrics = [
        { label: 'Image', value: data.completeness.withImage, color: '#4ecca3' },
        { label: 'Description', value: data.completeness.withDescription, color: '#64b5f6' },
        { label: 'Price', value: data.completeness.withPrice, color: '#ffb74d' },
        { label: 'Venue Addr', value: data.completeness.withVenue, color: '#ce93d8' }
      ];
      compEl.innerHTML = metrics.map(function(m) {
        var pct = total > 0 ? Math.round((m.value / total) * 100) : 0;
        return '<div class="hbar-row"><span class="hbar-label">' + m.label + '</span>' +
          '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%;background:' + m.color + '"></div></div>' +
          '<span class="hbar-count">' + pct + '% (' + m.value + ')</span></div>';
      }).join('');

      // Source ranking
      var rankEl = document.getElementById('q-source-ranking');
      if (data.sourceRanking && data.sourceRanking.length > 0) {
        var maxQ = Math.max.apply(null, data.sourceRanking.map(function(s) { return s.qualityScore || 0; }));
        if (maxQ === 0) maxQ = 1;
        rankEl.innerHTML = data.sourceRanking.map(function(s) {
          var score = s.qualityScore || 0;
          var pct = Math.round((score / maxQ) * 100);
          var color = score > 0.7 ? '#4ecca3' : score > 0.3 ? '#ffb74d' : '#e94560';
          return '<div class="hbar-row"><span class="hbar-label" style="min-width:110px">' + esc(s.name) + '</span>' +
            '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
            '<span class="hbar-count">' + score.toFixed(2) + '</span></div>';
        }).join('');
      } else {
        rankEl.innerHTML = '<div class="empty-state">No source data</div>';
      }

      // Coverage gaps
      var gapsEl = document.getElementById('q-coverage-gaps');
      var lowDays = data.eventsPerDay.filter(function(d) { return d.count < 3; });
      if (lowDays.length > 0) {
        gapsEl.innerHTML = '<div style="color:#e94560;margin-bottom:0.4rem;font-weight:600">Low Coverage Days (&lt;3 events):</div>' +
          lowDays.map(function(d) {
            var dt = new Date(d.date + 'T00:00:00');
            var label = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            return '<div style="margin-bottom:0.2rem">' + label + ': <strong>' + d.count + '</strong> events</div>';
          }).join('');
      } else {
        gapsEl.innerHTML = '<div style="color:#4ecca3;font-weight:600">All days have good coverage (3+ events)</div>';
      }
    }).catch(function(err) { console.error('Quality load failed:', err); });
  }

  // ═══════════════════════════════════════════════════════
  // INIT & AUTO-REFRESH
  // ═══════════════════════════════════════════════════════
  loadOverview();

  // Auto-refresh overview every 60 seconds
  refreshTimer = setInterval(function() {
    var activeTab = document.querySelector('.nav-tab.active');
    if (activeTab && activeTab.dataset.tab === 'overview') {
      loadOverview();
    }
  }, 60000);

  // Clean up timer when page is hidden
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    } else {
      if (!refreshTimer) {
        refreshTimer = setInterval(function() {
          var activeTab = document.querySelector('.nav-tab.active');
          if (activeTab && activeTab.dataset.tab === 'overview') {
            loadOverview();
          }
        }, 60000);
      }
    }
  }, { passive: true });
</script>
</body>
</html>`;
}
