import { Hono } from "hono";
import { html } from "hono/html";

const dashboard = new Hono();

/**
 * Dashboard served as inline HTML. No separate build step.
 * Uses CSS custom properties from the design system.
 * Vanilla JS + fetch for interactivity. Preact can be layered in later.
 *
 * This approach ships faster and avoids a build pipeline for the dashboard.
 * When the component count grows past ~10, we migrate to Preact + esbuild.
 */

dashboard.get("/", (c) => {
  return c.html(DASHBOARD_HTML);
});

const DASHBOARD_HTML = html`<!DOCTYPE html>
<html data-theme="dark" lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>CPK — Codepakt Dashboard</title>
<style>
/* ===== THEME — CSS Custom Properties ===== */
:root, [data-theme="dark"] {
  color-scheme: dark;
  --bg: #10141a; --surface: #181c22; --card: #1c2026;
  --card-hover: #262a31; --border: #414752; --border-subtle: rgba(65,71,82,0.15);
  --text: #dfe2eb; --text-secondary: #c0c7d4; --text-muted: #8b919d;
  --primary: #a2c9ff; --primary-container: #58a6ff;
  --status-open: #58a6ff; --status-wip: #d29922; --status-review: #a371f7;
  --status-blocked: #f85149; --status-done: #3fb950; --status-backlog: #484f58;
  --priority-p0: #f85149; --priority-p1: #d29922; --priority-p2: #8b949e;
  --agent-working: #3fb950; --agent-idle: #8b949e; --agent-offline: #f85149;
  --shadow: 0 4px 12px rgba(0,0,0,0.3);
}
[data-theme="light"] {
  color-scheme: light;
  --bg: #f8f9fb; --surface: #f0f4f7; --card: #ffffff;
  --card-hover: #e8eff3; --border: #a9b4b9; --border-subtle: rgba(169,180,185,0.2);
  --text: #2a3439; --text-secondary: #57606a; --text-muted: #717c82;
  --primary: #005bc0; --primary-container: #005bc0;
  --status-open: #0969da; --status-wip: #9a6700; --status-review: #8250df;
  --status-blocked: #cf222e; --status-done: #1a7f37; --status-backlog: #57606a;
  --priority-p0: #cf222e; --priority-p1: #9a6700; --priority-p2: #57606a;
  --agent-working: #1a7f37; --agent-idle: #57606a; --agent-offline: #cf222e;
  --shadow: 0 2px 8px rgba(42,52,57,0.06);
}

/* ===== BASE ===== */
* { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; -webkit-font-smoothing: antialiased; }
body { font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg); color: var(--text); height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
.mono { font-family: "Fira Code", "SF Mono", "Cascadia Code", Menlo, Consolas, monospace; }
::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }

/* ===== TOP BAR ===== */
.topbar { display: flex; align-items: center; justify-content: space-between; height: 48px;
  padding: 0 20px; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0; }
.topbar-left { display: flex; align-items: center; gap: 16px; }
.logo { font-weight: 800; font-size: 15px; letter-spacing: -0.5px; }
.logo span { color: var(--primary); }
.stats { display: flex; gap: 12px; font-size: 11px; }
.stats .stat { display: flex; align-items: center; gap: 4px; }
.stats .dot { width: 6px; height: 6px; border-radius: 50%; }
.topbar-right { display: flex; align-items: center; gap: 12px; }
.theme-toggle { background: none; border: 1px solid var(--border-subtle); color: var(--text-muted);
  padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; }
.theme-toggle:hover { color: var(--text); border-color: var(--border); }
.refresh-indicator { font-size: 10px; color: var(--text-muted); }
.add-btn { background: var(--primary-container); color: #fff; border: none; padding: 6px 14px;
  border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; }
.add-btn:hover { opacity: 0.9; }
[data-theme="light"] .add-btn { color: #fff; }

/* ===== LAYOUT ===== */
.main { display: flex; flex: 1; overflow: hidden; }
.board-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 16px; gap: 12px; }
.columns { display: flex; flex: 1; gap: 16px; overflow-x: auto; min-height: 0; }

/* ===== COLUMN ===== */
.column { min-width: 260px; flex: 1; display: flex; flex-direction: column; max-height: 100%; }
.column-header { display: flex; align-items: center; justify-content: space-between;
  padding: 0 4px 10px; }
.column-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; }
.column-count { font-size: 10px; padding: 1px 6px; border-radius: 4px; margin-left: 6px; }
.column-cards { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }

/* ===== TASK CARD ===== */
.card { background: var(--card); padding: 10px; border-radius: 2px; cursor: pointer;
  border-left: 2px solid var(--border); transition: background 0.15s; min-height: 60px;
  display: flex; flex-direction: column; justify-content: space-between; }
.card:hover { background: var(--card-hover); }
.card-top { display: flex; justify-content: space-between; align-items: flex-start; }
.card-title { font-size: 12px; font-weight: 500; line-height: 1.3; flex: 1;
  overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.card-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.card-id { font-size: 10px; color: var(--text-muted); }
.card-assignee { font-size: 10px; color: var(--text-secondary); display: flex; align-items: center; gap: 4px; }
.card-assignee .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--agent-working); }
.priority-badge { font-size: 9px; padding: 1px 5px; border-radius: 2px; font-weight: 600; }

/* ===== BLOCKED SECTION ===== */
.blocked-section { border-left: 3px solid var(--status-blocked); padding: 8px 12px;
  background: rgba(248,81,73,0.05); border-radius: 2px; display: flex; flex-direction: column; gap: 6px; }
.blocked-section.empty { display: none; }
.blocked-header { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--status-blocked); }
.blocked-item { display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer; }
.blocked-item .reason { color: var(--status-blocked); opacity: 0.8; }


/* ===== AGENT SIDEBAR ===== */
.sidebar { width: 240px; border-right: 1px solid var(--border-subtle); display: flex; flex-direction: column;
  padding: 16px; overflow-y: auto; flex-shrink: 0; order: -1; }
.sidebar-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;
  color: var(--text-muted); margin-bottom: 12px; }
.agent-card { background: var(--surface); padding: 10px; border-radius: 4px; margin-bottom: 8px; }
.agent-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.agent-name { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.agent-name .dot { width: 6px; height: 6px; border-radius: 50%; }
.agent-status { font-size: 10px; }
.agent-task { font-size: 10px; padding: 4px 6px; background: var(--bg); border-radius: 2px;
  display: flex; justify-content: space-between; color: var(--text-muted); }

/* ===== DETAIL PANEL ===== */
.detail-overlay { position: fixed; top: 0; right: 0; bottom: 0; width: 45%; min-width: 380px; max-width: 560px;
  background: var(--bg); border-left: 1px solid var(--border-subtle); z-index: 100;
  display: none; flex-direction: column; overflow-y: auto; padding: 20px; box-shadow: var(--shadow); }
.detail-overlay.open { display: flex; }
.detail-close { position: absolute; top: 12px; right: 12px; background: none; border: none;
  color: var(--text-muted); font-size: 18px; cursor: pointer; padding: 4px 8px; }
.detail-close:hover { color: var(--text); }
.detail-id { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
.detail-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
.detail-row { margin-bottom: 14px; }
.detail-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-muted); margin-bottom: 4px; }
.detail-value { font-size: 13px; line-height: 1.5; }
.detail-code { background: var(--surface); padding: 8px 10px; border-radius: 4px; font-size: 12px;
  white-space: pre-wrap; word-break: break-all; position: relative; }
.detail-code .copy-btn { position: absolute; top: 4px; right: 4px; background: var(--card);
  border: 1px solid var(--border-subtle); color: var(--text-muted); font-size: 10px;
  padding: 2px 6px; border-radius: 3px; cursor: pointer; }
.dep-chip { display: inline-block; padding: 2px 8px; background: var(--surface); border-radius: 3px;
  font-size: 11px; margin-right: 4px; cursor: pointer; color: var(--primary); }
.note-item { padding: 6px 0; border-bottom: 1px solid var(--border-subtle); font-size: 12px; }
.detail-actions { display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
.btn { padding: 8px 16px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; }
.btn-primary { background: var(--primary-container); color: #fff; }
.btn-danger { background: rgba(248,81,73,0.1); color: var(--status-blocked); border: 1px solid rgba(248,81,73,0.2); }
.btn-secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border-subtle); }
.status-select, .priority-select { background: var(--surface); color: var(--text); border: 1px solid var(--border-subtle);
  padding: 4px 8px; border-radius: 4px; font-size: 12px; }

/* ===== CREATE MODAL ===== */
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
  z-index: 200; display: none; align-items: center; justify-content: center; }
.modal-backdrop.open { display: flex; }
.modal { background: var(--bg); border: 1px solid var(--border-subtle); border-radius: 8px;
  width: 90%; max-width: 540px; padding: 24px; box-shadow: var(--shadow); }
.modal h2 { font-size: 16px; font-weight: 700; margin-bottom: 20px; }
.form-group { margin-bottom: 14px; }
.form-label { display: block; font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 4px; }
.form-input, .form-select, .form-textarea { width: 100%; background: var(--surface);
  color: var(--text); border: 1px solid var(--border-subtle); padding: 8px 10px;
  border-radius: 4px; font-size: 13px; font-family: inherit; }
.form-input:focus, .form-textarea:focus { outline: none; border-color: var(--primary); }
.form-textarea { min-height: 80px; resize: vertical; }
.form-row { display: flex; gap: 12px; }
.form-row > * { flex: 1; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

/* ===== EMPTY STATE ===== */
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; color: var(--text-muted); text-align: center; padding: 40px; }
.empty-state h3 { font-size: 16px; margin-bottom: 8px; color: var(--text-secondary); }
.empty-state p { font-size: 12px; max-width: 300px; }
.empty-state code { background: var(--surface); padding: 2px 6px; border-radius: 3px; font-size: 11px; }

/* ===== STATUS COLORS ===== */
.status-backlog .column-title, .status-backlog .column-count { color: var(--status-backlog); }
.status-backlog .column-count { background: rgba(72,79,88,0.15); }
.status-open .column-title, .status-open .column-count { color: var(--status-open); }
.status-open .column-count { background: rgba(88,166,255,0.15); }
.status-wip .column-title, .status-wip .column-count { color: var(--status-wip); }
.status-wip .column-count { background: rgba(210,153,34,0.15); }
.status-review .column-title, .status-review .column-count { color: var(--status-review); }
.status-review .column-count { background: rgba(163,113,247,0.15); }

.status-done .column-title, .status-done .column-count { color: var(--status-done); }
.status-done .column-count { background: rgba(63,185,80,0.15); }

.card.backlog { border-left-color: var(--status-backlog); }
.card.open { border-left-color: var(--status-open); }
.card.in-progress { border-left-color: var(--status-wip); }
.card.review { border-left-color: var(--status-review); }
.card.done { border-left-color: var(--status-done); opacity: 0.7; }
</style>
</head>
<body>

<!-- TOP BAR -->
<div class="topbar">
  <div class="topbar-left">
    <div class="logo"><span>CPK</span></div>
    <select id="project-switcher" class="form-select" style="font-size:12px;max-width:200px;padding:4px 8px" onchange="switchProject(this.value)">
      <option value="">Loading...</option>
    </select>
    <div class="stats" id="stats"></div>
  </div>
  <div class="topbar-right">
    <span class="refresh-indicator" id="refresh-indicator">Updated just now</span>
    <button class="theme-toggle" onclick="toggleTheme()">Theme</button>
    <button class="add-btn" id="add-task-btn" style="display:none" onclick="openCreateModal()">+ Add Task</button>
  </div>
</div>

<!-- MAIN LAYOUT -->
<div class="main">
  <div class="board-area">
    <!-- KANBAN COLUMNS -->
    <div class="columns" id="columns"></div>
    <!-- BLOCKED SECTION -->
    <div class="blocked-section" id="blocked-section">
      <div class="blocked-header">Blocked Issues</div>
      <div id="blocked-list"></div>
    </div>
  </div>

  <!-- AGENT SIDEBAR -->
  <div class="sidebar">
    <div class="sidebar-title">Agents</div>
    <div id="agent-list"></div>
  </div>
</div>

<!-- DETAIL PANEL -->
<div class="detail-overlay" id="detail-panel">
  <button class="detail-close" onclick="closeDetail()">&#x2715;</button>
  <div id="detail-content"></div>
</div>

<!-- CREATE MODAL -->
<div class="modal-backdrop" id="create-modal">
  <div class="modal">
    <h2>Create Task</h2>
    <form id="create-form" onsubmit="handleCreateTask(event)">
      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" name="title" required placeholder="Task title" />
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" name="description" placeholder="Optional description"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Priority</label>
          <select class="form-select" name="priority">
            <option value="P0">P0 — Critical</option>
            <option value="P1" selected>P1 — High</option>
            <option value="P2">P2 — Standard</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" name="status">
            <option value="open" selected>Open</option>
            <option value="backlog">Backlog</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Epic</label>
        <input class="form-input" name="epic" placeholder="Feature area (optional)" />
      </div>
      <div class="form-group">
        <label class="form-label">Depends On</label>
        <input class="form-input" name="depends_on" placeholder="T-001, T-002 (comma-separated)" />
      </div>
      <div class="form-group">
        <label class="form-label">Verify Command</label>
        <textarea class="form-textarea mono" name="verify" placeholder="pnpm test" style="min-height:50px;font-size:12px"></textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick="closeCreateModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Create Task</button>
      </div>
    </form>
  </div>
</div>

<script>
// ===== STATE =====
let projectId = null;
let allTasks = [];
let allAgents = [];
let selectedTask = null;
let lastFetch = Date.now();

const API = '/api';

let refreshInterval = null;

// ===== INIT =====
async function init() {
  try {
    const projects = await api('/projects');
    const switcher = document.getElementById('project-switcher');
    const addBtn = document.getElementById('add-task-btn');

    if (projects.length > 0) {
      // Show active workspace controls
      switcher.style.display = '';
      addBtn.style.display = '';

      // Populate project switcher
      switcher.innerHTML = projects.map(p =>
        '<option value="' + p.id + '">' + esc(p.name || p.id.slice(0,8)) + '</option>'
      ).join('');

      // Select first project
      projectId = projects[0].id;
      switcher.value = projectId;

      await refresh();
      refreshInterval = setInterval(refresh, 30000);
    } else {
      // No projects — show intro screen, hide workspace controls
      switcher.style.display = 'none';
      addBtn.style.display = 'none';
      document.getElementById('stats').style.display = 'none';
      showIntro();
    }
  } catch(e) {
    showIntro('Cannot connect to the Codepakt server.');
  }
}

function switchProject(id) {
  if (!id || id === projectId) return;
  projectId = id;
  if (refreshInterval) clearInterval(refreshInterval);
  closeDetail();
  refresh().then(() => {
    refreshInterval = setInterval(refresh, 30000);
  });
}

async function api(path, opts) {
  const sep = path.includes('?') ? '&' : '?';
  const url = projectId ? API + path + sep + 'project_id=' + projectId : API + path;
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const json = await res.json();
  if (!res.ok) throw json;
  return json.data;
}

// ===== DATA REFRESH =====
async function refresh() {
  try {
    const [tasks, agents, board] = await Promise.all([
      api('/tasks'), api('/agents'), api('/board/status')
    ]);
    allTasks = tasks;
    allAgents = agents;
    renderBoard(tasks, board);
    renderAgents(agents);
    renderStats(board);
    lastFetch = Date.now();
    updateRefreshIndicator();
    if (selectedTask) {
      const updated = tasks.find(t => t.id === selectedTask.id);
      if (updated) { selectedTask = updated; renderDetail(updated); }
    }
  } catch(e) {
    // Stale project ID — reload project list and switch
    if (e && e.error === 'project_not_found') {
      console.warn('Project not found, reloading project list...');
      await loadProjects();
      return;
    }
    console.error('Refresh failed:', e);
  }
}

function updateRefreshIndicator() {
  const el = document.getElementById('refresh-indicator');
  const ago = Math.floor((Date.now() - lastFetch) / 1000);
  el.textContent = ago < 3 ? 'Updated just now' : 'Updated ' + ago + 's ago';
}
setInterval(updateRefreshIndicator, 1000);

// ===== RENDER BOARD =====
function renderBoard(tasks, board) {
  const columns = document.getElementById('columns');

  // No tasks at all — show empty state
  if (tasks.length === 0) {
    showEmpty();
    document.getElementById('blocked-section').classList.add('empty');
    document.getElementById('done-section').style.display = 'none';
    return;
  }

  // All known statuses in display order. Blocked and done are rendered separately below.
  const knownColumns = [
    { key: 'backlog', label: 'Backlog', cls: 'status-backlog' },
    { key: 'open', label: 'Open', cls: 'status-open' },
    { key: 'in-progress', label: 'In Progress', cls: 'status-wip' },
    { key: 'review', label: 'Review', cls: 'status-review' },
    { key: 'done', label: 'Done', cls: 'status-done' },
  ];
  const excludeFromColumns = new Set(['blocked']);
  const knownKeys = new Set(knownColumns.map(s => s.key).concat([...excludeFromColumns]));

  // Catch any unknown statuses so no task disappears silently
  const unknownStatuses = [...new Set(tasks.map(t => t.status).filter(s => !knownKeys.has(s)))];
  const allColumns = [...knownColumns, ...unknownStatuses.map(s => ({ key: s, label: s, cls: '' }))];

  columns.innerHTML = allColumns.map(s => {
    const items = tasks.filter(t => t.status === s.key);
    const count = items.length;
    return '<div class="column ' + s.cls + '">' +
      '<div class="column-header"><div><span class="column-title">' + s.label + '</span>' +
      '<span class="column-count">' + count + '</span></div></div>' +
      '<div class="column-cards">' +
      (count === 0 ? '<div style="color:var(--text-muted);font-size:11px;text-align:center;padding:20px;opacity:0.5">No tasks</div>' :
        items.map(t => renderCard(t)).join('')) +
      '</div></div>';
  }).join('');

  // Blocked
  const blocked = tasks.filter(t => t.status === 'blocked');
  const blockedEl = document.getElementById('blocked-section');
  const blockedList = document.getElementById('blocked-list');
  if (blocked.length === 0) { blockedEl.classList.add('empty'); }
  else {
    blockedEl.classList.remove('empty');
    blockedList.innerHTML = blocked.map(t =>
      '<div class="blocked-item" onclick="openDetail(\\'' + t.id + '\\')">' +
      '<span class="mono" style="color:var(--status-blocked);font-weight:600">' + t.task_number + '</span>' +
      '<span>' + esc(t.title) + '</span>' +
      '<span class="reason">— ' + esc(t.blocker_reason || 'No reason') + '</span></div>'
    ).join('');
  }

}

function renderCard(t) {
  const pColor = t.priority === 'P0' ? 'var(--priority-p0)' : t.priority === 'P1' ? 'var(--priority-p1)' : 'var(--priority-p2)';
  const pBg = t.priority === 'P0' ? 'rgba(248,81,73,0.1)' : t.priority === 'P1' ? 'rgba(210,153,34,0.1)' : 'rgba(139,149,158,0.1)';
  return '<div class="card ' + t.status + '" onclick="openDetail(\\'' + t.id + '\\')">' +
    '<div class="card-top"><span class="card-title">' + esc(t.title) + '</span>' +
    '<span class="priority-badge mono" style="color:' + pColor + ';background:' + pBg + '">' + t.priority + '</span></div>' +
    '<div class="card-bottom"><span class="card-id mono">' + t.task_number + '</span>' +
    (t.assignee ? '<span class="card-assignee"><span class="dot"></span>' + esc(t.assignee) + '</span>' :
      '<span class="card-assignee" style="opacity:0.4">unassigned</span>') +
    '</div></div>';
}

// ===== RENDER AGENTS =====
function renderAgents(agents) {
  const list = document.getElementById('agent-list');
  if (agents.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:11px;text-align:center;padding:20px">No agents yet.<br>Agents appear when they pick up tasks.</div>';
    return;
  }
  list.innerHTML = agents.map(a => {
    const dotColor = a.status === 'working' ? 'var(--agent-working)' :
                     a.status === 'offline' ? 'var(--agent-offline)' : 'var(--agent-idle)';
    const glow = a.status === 'working' ? ';box-shadow:0 0 6px ' + dotColor : '';
    const task = a.current_task_id ? allTasks.find(t => t.id === a.current_task_id) : null;
    return '<div class="agent-card">' +
      '<div class="agent-header"><span class="agent-name"><span class="dot" style="background:' + dotColor + glow + '"></span>' +
      esc(a.name) + '</span><span class="agent-status mono" style="color:' + dotColor + '">' + a.status + '</span></div>' +
      (task ? '<div class="agent-task mono"><span style="color:var(--primary)">' + task.task_number + '</span><span>' + esc(task.title).substring(0, 20) + '</span></div>' : '') +
      '</div>';
  }).join('');
}

// ===== RENDER STATS =====
function renderStats(board) {
  const s = board.by_status;
  const stats = document.getElementById('stats');
  const items = [
    { label: 'backlog', count: s.backlog || 0, color: 'var(--status-backlog)' },
    { label: 'open', count: s.open || 0, color: 'var(--status-open)' },
    { label: 'wip', count: s['in-progress'] || 0, color: 'var(--status-wip)' },
    { label: 'review', count: s.review || 0, color: 'var(--status-review)' },
    { label: 'blocked', count: s.blocked || 0, color: 'var(--status-blocked)' },
    { label: 'done', count: s.done || 0, color: 'var(--status-done)' },
  ];
  stats.innerHTML = items.map(i =>
    '<span class="stat"><span class="dot" style="background:' + i.color + '"></span>' + i.count + ' ' + i.label + '</span>'
  ).join('');
}

// ===== DETAIL PANEL =====
function openDetail(id) {
  const t = allTasks.find(t => t.id === id);
  if (!t) return;
  selectedTask = t;
  renderDetail(t);
  document.getElementById('detail-panel').classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-panel').classList.remove('open');
  selectedTask = null;
}

function renderDetail(t) {
  const pColor = t.priority === 'P0' ? 'var(--priority-p0)' : t.priority === 'P1' ? 'var(--priority-p1)' : 'var(--priority-p2)';
  const sColor = { open: 'var(--status-open)', 'in-progress': 'var(--status-wip)',
    review: 'var(--status-review)', blocked: 'var(--status-blocked)',
    done: 'var(--status-done)', backlog: 'var(--status-backlog)' }[t.status];

  let html = '<div class="detail-id mono">' + t.task_number + '</div>';
  html += '<div class="detail-title">' + esc(t.title) + '</div>';

  // Status + Priority row
  html += '<div style="display:flex;gap:12px;margin-bottom:16px">';
  html += '<div><span class="detail-label">Status</span><br><span style="color:' + sColor + ';font-weight:600;font-size:12px">' + t.status.toUpperCase() + '</span></div>';
  html += '<div><span class="detail-label">Priority</span><br><span style="color:' + pColor + ';font-weight:600;font-size:12px">' + t.priority + '</span></div>';
  if (t.assignee) html += '<div><span class="detail-label">Assignee</span><br><span style="font-size:12px">' + esc(t.assignee) + '</span></div>';
  if (t.epic) html += '<div><span class="detail-label">Epic</span><br><span style="font-size:12px">' + esc(t.epic) + '</span></div>';
  html += '</div>';

  if (t.description) {
    html += '<div class="detail-row"><div class="detail-label">Description</div><div class="detail-value">' + esc(t.description) + '</div></div>';
  }

  if (t.verify) {
    html += '<div class="detail-row"><div class="detail-label">Verify Command</div><div class="detail-code mono">' +
      esc(t.verify) + '<button class="copy-btn" onclick="navigator.clipboard.writeText(\\'' + esc(t.verify).replace(/'/g, "\\\\'") + '\\')">copy</button></div></div>';
  }

  if (t.depends_on && t.depends_on.length > 0) {
    html += '<div class="detail-row"><div class="detail-label">Dependencies</div><div>' +
      t.depends_on.map(d => '<span class="dep-chip mono">' + d + '</span>').join('') + '</div></div>';
  }

  if (t.context_refs && t.context_refs.length > 0) {
    html += '<div class="detail-row"><div class="detail-label">Context Refs</div><div>' +
      t.context_refs.map(r => '<span class="dep-chip mono">' + esc(r) + '</span>').join('') + '</div></div>';
  }

  if (t.acceptance_criteria && t.acceptance_criteria.length > 0) {
    html += '<div class="detail-row"><div class="detail-label">Acceptance Criteria</div><ul style="font-size:12px;padding-left:16px">' +
      t.acceptance_criteria.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul></div>';
  }

  if (t.notes && t.notes.length > 0) {
    html += '<div class="detail-row"><div class="detail-label">Notes</div>' +
      t.notes.map(n => '<div class="note-item">' + esc(n) + '</div>').join('') + '</div>';
  }

  if (t.blocker_reason) {
    html += '<div class="detail-row"><div class="detail-label" style="color:var(--status-blocked)">Blocker Reason</div><div class="detail-value" style="color:var(--status-blocked)">' + esc(t.blocker_reason) + '</div></div>';
  }

  // Actions
  html += '<div class="detail-actions">';
  if (t.status === 'in-progress') html += '<button class="btn btn-primary" onclick="markDone(\\'' + t.id + '\\')">Mark Done</button>';
  if (t.status === 'review') html += '<button class="btn btn-primary" onclick="markDone(\\'' + t.id + '\\')">Approve</button>';
  if (t.status === 'in-progress' || t.status === 'open') html += '<button class="btn btn-danger" onclick="markBlocked(\\'' + t.id + '\\')">Block</button>';
  if (t.status === 'blocked') html += '<button class="btn btn-primary" onclick="markUnblocked(\\'' + t.id + '\\')">Unblock</button>';
  html += '</div>';

  document.getElementById('detail-content').innerHTML = html;
}

// ===== ACTIONS =====
async function markDone(id) {
  try { await api('/tasks/' + id + '/done', { method: 'POST', body: '{}' }); await refresh(); } catch(e) { alert(e.message); }
}
async function markBlocked(id) {
  const reason = prompt('Blocker reason:');
  if (!reason) return;
  try { await api('/tasks/' + id + '/block', { method: 'POST', body: JSON.stringify({ reason }) }); await refresh(); } catch(e) { alert(e.message); }
}
async function markUnblocked(id) {
  try { await api('/tasks/' + id + '/unblock', { method: 'POST', body: '{}' }); await refresh(); } catch(e) { alert(e.message); }
}

// ===== CREATE TASK =====
function openCreateModal() { document.getElementById('create-modal').classList.add('open'); }
function closeCreateModal() { document.getElementById('create-modal').classList.remove('open'); document.getElementById('create-form').reset(); }

async function handleCreateTask(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {
    title: fd.get('title'),
    description: fd.get('description') || undefined,
    priority: fd.get('priority'),
    status: fd.get('status'),
    epic: fd.get('epic') || undefined,
    depends_on: fd.get('depends_on') ? fd.get('depends_on').split(',').map(s => s.trim()).filter(Boolean) : [],
    verify: fd.get('verify') || undefined,
  };
  try {
    await api('/tasks', { method: 'POST', body: JSON.stringify(body) });
    closeCreateModal();
    await refresh();
  } catch(e) { alert(e.message || 'Failed to create task'); }
}

// ===== THEME =====
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
  localStorage.setItem('cpk-theme', html.getAttribute('data-theme'));
}
// Restore saved theme
const saved = localStorage.getItem('cpk-theme');
if (saved) document.documentElement.setAttribute('data-theme', saved);

// ===== EMPTY / INTRO STATES =====
function showEmpty() {
  document.getElementById('columns').innerHTML =
    '<div class="empty-state">' +
    '<div style="font-size:32px;margin-bottom:12px;opacity:0.3">&#9744;</div>' +
    '<h3>No tasks yet</h3>' +
    '<p>Create one with the button above, or from the CLI:</p>' +
    '<pre class="mono" style="background:var(--surface);padding:8px 12px;border-radius:4px;margin-top:8px;font-size:11px">cpk task add --title &quot;First task&quot; --priority P0</pre>' +
    '<p style="margin-top:12px;opacity:0.6">Or batch import from a JSON file:</p>' +
    '<pre class="mono" style="background:var(--surface);padding:8px 12px;border-radius:4px;margin-top:4px;font-size:11px">cpk task add --batch tasks.json</pre>' +
    '</div>';
}

function showIntro(errorMsg) {
  // Hide the board area entirely and show intro
  document.querySelector('.main').innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;flex:1;padding:40px">' +
    '<div style="max-width:480px;text-align:center">' +
    '<div style="font-size:48px;margin-bottom:16px;letter-spacing:-2px;font-weight:800"><span style="color:var(--primary)">CPK</span></div>' +
    '<h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Welcome to Codepakt</h2>' +
    '<p style="color:var(--text-secondary);font-size:13px;line-height:1.6;margin-bottom:24px">' +
    (errorMsg || 'CLI-first coordination layer for AI coding agents. Set up your first project to get started.') +
    '</p>' +
    '<div style="background:var(--surface);border-radius:8px;padding:20px;text-align:left">' +
    '<p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:12px">Quick Start</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' +
    stepHtml('1', 'Start the server', 'cpk server start') +
    stepHtml('2', 'Initialize a project', 'cd your-project && cpk init') +
    stepHtml('3', 'Add tasks', 'cpk task add --title &quot;Build auth&quot; --priority P0') +
    stepHtml('4', 'Pick up work', 'cpk task pickup --agent dev') +
    '</div>' +
    '</div>' +
    '<p style="color:var(--text-muted);font-size:11px;margin-top:16px">' +
    'Docs: <span style="color:var(--primary)">codepakt.com</span> &middot; ' +
    'This dashboard refreshes automatically when projects are created.' +
    '</p>' +
    '</div></div>';

  // Keep polling for projects to appear
  setInterval(async () => {
    try {
      const projects = await fetch(API + '/projects').then(r => r.json()).then(j => j.data);
      if (projects && projects.length > 0) {
        location.reload();
      }
    } catch(e) {}
  }, 3000);
}

function stepHtml(num, label, cmd) {
  return '<div style="display:flex;gap:10px;align-items:flex-start">' +
    '<span style="background:var(--primary);color:var(--bg);width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">' + num + '</span>' +
    '<div style="flex:1">' +
    '<span style="font-size:12px;font-weight:500">' + label + '</span>' +
    '<pre class="mono" style="background:var(--card);padding:4px 8px;border-radius:3px;margin-top:3px;font-size:10px;color:var(--text-secondary);overflow-x:auto">' + cmd + '</pre>' +
    '</div></div>';
}

// ===== HELPERS =====
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ===== GO =====
init();
</script>
</body>
</html>`;

export default dashboard;
