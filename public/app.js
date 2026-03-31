/* ── State ── */
let currentUser    = null;
let pendingFirstLogin = null; // { user_id, role } waiting for password setup
let charts = {};

/* ── Restore session from localStorage ── */
(function restoreSession() {
  const saved = localStorage.getItem('academicUser');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app-screen').classList.remove('hidden');
      document.getElementById('nav-name').textContent = currentUser.name || currentUser.user_id;
      document.getElementById('nav-sub').textContent  = currentUser.role === 'teacher' ? currentUser.subject || '' : '';
      document.getElementById('nav-role').textContent = currentUser.role;
      launchDashboard(currentUser);
    } catch { localStorage.removeItem('academicUser'); }
  }
})();

/* ── Helpers ── */
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function marksClass(m) {
  if (m >= 75) return 'marks-good';
  if (m >= 50) return 'marks-avg';
  return 'marks-low';
}
function mistakeClass(t) {
  return { logic:'mb-logic', concept:'mb-concept', careless:'mb-careless', other:'mb-other' }[t] || 'mb-other';
}
function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}
function renderInsights(data, id) {
  const el = document.getElementById(id);
  if (!data?.length) { el.innerHTML = '<p class="empty-msg">No insights yet.</p>'; return; }
  el.innerHTML = data.map(m =>
    `<div class="insight-item"><span class="insight-icon">💡</span><span>${esc(m)}</span></div>`
  ).join('');
}
function renderAlerts(alerts, id) {
  const el = document.getElementById(id);
  if (!alerts?.length) { el.innerHTML = '<p class="empty-msg" style="color:var(--green)">✓ No alerts currently.</p>'; return; }
  el.innerHTML = alerts.map(a =>
    `<div class="alert-item ${a.type==='danger'?'alert-danger':'alert-warning'}">
      <span>${a.type==='danger'?'🚨':'⚠️'}</span><span>${esc(a.message)}</span>
    </div>`
  ).join('');
}
function setTrendBadge(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;
  const map = { improving:['trend-improving','↑ Improving'], declining:['trend-declining','↓ Declining'], stable:['trend-stable','→ Stable'] };
  const [cls, label] = map[dir] || map.stable;
  el.className = `trend-badge ${cls}`;
  el.textContent = label;
  el.classList.remove('hidden');
}

/* ══════════════════════════════════════════
   LOGIN
══════════════════════════════════════════ */
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user_id  = document.getElementById('l-userid').value.trim();
  const role     = document.getElementById('l-role').value;
  const password = document.getElementById('l-pass').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  errEl.classList.add('hidden');

  if (!user_id || !role) {
    errEl.textContent = 'User ID and role are required.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    const res  = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, password, role }),
    });
    const data = await res.json();

    if (data.error) {
      errEl.textContent = data.error;
      errEl.classList.remove('hidden');
      return;
    }

    // First-time login — redirect to set password
    if (data.first_login) {
      pendingFirstLogin = { user_id: data.user_id, role: data.role };
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('set-password-screen').classList.remove('hidden');
      return;
    }

    currentUser = data;
    localStorage.setItem('academicUser', JSON.stringify(data));
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    document.getElementById('nav-name').textContent = data.name || data.user_id;
    document.getElementById('nav-sub').textContent  = data.role === 'teacher' ? data.subject || '' : '';
    document.getElementById('nav-role').textContent = data.role;

    launchDashboard(data);
  } catch {
    errEl.textContent = 'Server error. Is the server running?';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

/* ── Sign out ── */
document.getElementById('logout-btn').addEventListener('click', () => {
  currentUser = null;
  localStorage.removeItem('academicUser');
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('l-userid').value = '';
  document.getElementById('l-pass').value = '';
  Object.keys(charts).forEach(destroyChart);
});

/* ── Set Password ── */
document.getElementById('set-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPwd     = document.getElementById('sp-new').value;
  const confirmPwd = document.getElementById('sp-confirm').value;
  const errEl      = document.getElementById('sp-error');
  const successEl  = document.getElementById('sp-success');
  const btn        = document.getElementById('sp-btn');

  errEl.classList.add('hidden');
  successEl.classList.add('hidden');

  if (newPwd.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters.';
    errEl.classList.remove('hidden');
    return;
  }
  if (newPwd !== confirmPwd) {
    errEl.textContent = 'Passwords do not match.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const res  = await fetch('/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: pendingFirstLogin.user_id, role: pendingFirstLogin.role, new_password: newPwd }),
    });
    const data = await res.json();

    if (data.error) {
      errEl.textContent = data.error;
      errEl.classList.remove('hidden');
      return;
    }

    successEl.textContent = '✓ Password set! Redirecting to login…';
    successEl.classList.remove('hidden');
    setTimeout(() => {
      document.getElementById('set-password-screen').classList.add('hidden');
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('l-userid').value = pendingFirstLogin.user_id;
      document.getElementById('l-role').value   = pendingFirstLogin.role;
      pendingFirstLogin = null;
      document.getElementById('sp-new').value     = '';
      document.getElementById('sp-confirm').value = '';
    }, 1500);
  } catch {
    errEl.textContent = 'Server error. Please try again.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Set Password';
  }
});

/* ── Route to correct dashboard ── */
function launchDashboard(user) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));

  if (user.role === 'teacher') {
    document.getElementById('view-teacher').classList.remove('hidden');
    // Teachers see ALL classes 1–10
    buildClassDropdown('1,2,3,4,5,6,7,8,9,10');
    // Pre-select teacher's default subject if set
    const subSel = document.getElementById('r-subject-display');
    if (user.subject) subSel.value = user.subject;
    initDateField();
  }
  if (user.role === 'parent') {
    document.getElementById('view-parent').classList.remove('hidden');
    // Use linked_id (student_id) for data fetch
    loadParent(user.linked_id);
  }
  if (user.role === 'admin') {
    document.getElementById('view-admin').classList.remove('hidden');
    loadAdmin();
  }
}

/* ══════════════════════════════════════════
   TEACHER — Class selector + Student Search
══════════════════════════════════════════ */
let allStudents = [];

function buildClassDropdown(classStr) {
  // classStr is comma-separated e.g. "1,2,3,4,5,6,7,8,9,10"
  const sel = document.getElementById('r-class-select');
  sel.innerHTML = '<option value="">— Select class —</option>';
  const classes = classStr ? classStr.split(',').map(c => c.trim()).filter(Boolean) : [];
  classes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = `Class ${c}`;
    sel.appendChild(opt);
  });
}

document.getElementById('r-class-select').addEventListener('change', async function () {
  const cls = this.value;
  const searchEl = document.getElementById('r-student-search');
  const selEl    = document.getElementById('selected-student');

  // Reset student selection
  allStudents = [];
  document.getElementById('r-student-id').value   = '';
  document.getElementById('r-student-name').value = '';
  selEl.classList.add('hidden');
  document.getElementById('student-results').classList.add('hidden');
  searchEl.value = '';

  if (!cls) {
    searchEl.placeholder = 'Select a class first…';
    searchEl.disabled = true;
    return;
  }

  searchEl.placeholder = 'Loading students…';
  searchEl.disabled = true;

  try {
    const res  = await fetch(`/students?class=${encodeURIComponent(cls)}`);
    const data = await res.json();
    allStudents = data.students || [];
    console.log(`Class ${cls}: fetched ${allStudents.length} students`);

    if (!allStudents.length) {
      searchEl.placeholder = 'No students found for this class';
      searchEl.disabled = true;
    } else {
      searchEl.placeholder = `Search among ${allStudents.length} students…`;
      searchEl.disabled = false;
    }
  } catch {
    searchEl.placeholder = 'Failed to load students';
    searchEl.disabled = true;
  }
});

// Set today's date as default
function initDateField() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('r-exam-date').value = today;
}

// Search input handler
document.getElementById('r-student-search').addEventListener('input', function () {
  const q       = this.value.trim().toLowerCase();
  const results = document.getElementById('student-results');

  if (!q) { results.classList.add('hidden'); return; }

  const matches = allStudents
    .filter(s => s.name.toLowerCase().includes(q) || s.user_id.toLowerCase().includes(q))
    .slice(0, 30);

  if (!matches.length) {
    results.innerHTML = '<div class="student-result-item" style="color:var(--muted)">No matches found</div>';
    results.classList.remove('hidden');
    return;
  }

  results.innerHTML = matches.map(s => `
    <div class="student-result-item" data-id="${s.user_id}" data-name="${s.name}">
      <span>${esc(s.name)} <small style="color:var(--muted)">Class ${s.class}</small></span>
      <span class="student-result-id">${s.user_id}</span>
    </div>
  `).join('');
  results.classList.remove('hidden');
});

// Click to select
document.getElementById('student-results').addEventListener('click', function (e) {
  const item = e.target.closest('.student-result-item');
  if (!item || !item.dataset.id) return;

  document.getElementById('r-student-id').value    = item.dataset.id;
  document.getElementById('r-student-name').value  = item.dataset.name;
  document.getElementById('r-student-search').value = item.dataset.name;

  const sel = document.getElementById('selected-student');
  sel.textContent = `✓ ${item.dataset.name} (${item.dataset.id})`;
  sel.classList.remove('hidden');
  this.classList.add('hidden');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.field')) {
    document.getElementById('student-results').classList.add('hidden');
  }
});
/* ══════════════════════════════════════════
   TEACHER — Add Record
══════════════════════════════════════════ */
document.getElementById('record-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const student_id   = document.getElementById('r-student-id').value.trim();
  const student_name = document.getElementById('r-student-name').value.trim();
  const subject      = document.getElementById('r-subject-display').value.trim();
  const topic        = document.getElementById('r-topic').value.trim();
  const marks        = document.getElementById('r-marks').value;
  const exam_date    = document.getElementById('r-exam-date').value;
  const exam_type    = document.getElementById('r-exam-type').value;
  const mistakeCat   = document.getElementById('r-mistake-cat').value;
  const mistakeDesc  = document.getElementById('r-mistake-desc').value.trim();
  const teacherRemark = document.getElementById('r-teacher-remark').value.trim();
  const successEl    = document.getElementById('record-success');
  const errorEl      = document.getElementById('record-error');
  const recBox       = document.getElementById('recommendation-box');

  successEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  recBox.classList.add('hidden');

  if (!student_id || !student_name) {
    errorEl.textContent = 'Please select a student from the search results.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!subject || !topic || !marks || !mistakeCat || !exam_type) {
    errorEl.textContent = 'Subject, topic, marks, exam type and mistake category are required.';
    errorEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('submit-btn') || document.querySelector('#record-form .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const res = await fetch('/add-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_name,
        student_id,
        subject,
        topic,
        marks: parseInt(marks),
        exam_date: exam_date || new Date().toISOString().slice(0, 10),
        exam_type,
        mistake_category:    mistakeCat,
        mistake_description: mistakeDesc,
        teacher_remark:      teacherRemark,
        class: document.getElementById('r-class-select').value || '',
      }),
    });
    const data = await res.json();
    if (data.error) { errorEl.textContent = data.error; errorEl.classList.remove('hidden'); return; }

    successEl.classList.remove('hidden');

    if (data.recommendation) {
      document.getElementById('rec-text').textContent = data.recommendation;
      const badge = document.getElementById('rec-cat-badge');
      badge.textContent  = data.rec_category;
      badge.className    = `rec-cat-badge ${data.rec_category}`;
      recBox.classList.remove('hidden');
    }

    // Reset form
    e.target.reset();
    const subSel = document.getElementById('r-subject-display');
    if (currentUser?.subject) subSel.value = currentUser.subject;
    document.getElementById('r-student-id').value      = '';
    document.getElementById('r-student-name').value    = '';
    document.getElementById('selected-student').classList.add('hidden');
    document.getElementById('r-student-search').disabled = true;
    document.getElementById('r-student-search').placeholder = 'Select a class first…';
    allStudents = [];
    initDateField();
  } catch { errorEl.textContent = 'Failed to save.'; errorEl.classList.remove('hidden'); }
  finally { const btn = document.querySelector('#record-form .btn-primary'); if (btn) { btn.disabled = false; btn.textContent = 'Save Record'; } }
});

/* ── Teacher — Load Records (own class only) ── */
document.getElementById('load-records-btn').addEventListener('click', loadTeacherRecords);

async function loadTeacherRecords() {
  const listEl      = document.getElementById('teacher-records-list');
  const examType    = document.getElementById('filter-exam-type').value;
  const selectedCls = document.getElementById('r-class-select').value;
  listEl.innerHTML  = '<p class="empty-msg">Loading…</p>';

  const params = new URLSearchParams();
  // Filter by currently selected class (if any), otherwise show all teacher's records
  if (selectedCls)          params.set('classes',   selectedCls);
  if (currentUser?.subject) params.set('subject',   currentUser.subject);
  if (examType)             params.set('exam_type', examType);

  try {
    const res  = await fetch(`/records?${params}`);
    const data = await res.json();

    if (!data.records?.length) { listEl.innerHTML = '<p class="empty-msg">No records found.</p>'; return; }

    listEl.innerHTML = `
      <table class="h-table">
        <thead>
          <tr><th>Student</th><th>ID</th><th>Topic</th><th>Exam Type</th><th>Marks</th><th>Performance</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${data.records.map(r => {
            const d = r.exam_date ? new Date(r.exam_date) : new Date(r.createdAt);
            const dateStr = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
            return `<tr>
              <td>${esc(r.student_name)}</td>
              <td style="font-family:monospace;font-size:0.78rem">${esc(r.student_id)}</td>
              <td>${esc(r.topic)}</td>
              <td><span style="font-size:0.75rem;color:var(--sub)">${esc(r.exam_type||'—')}</span></td>
              <td><span class="marks-badge ${marksClass(r.marks)}">${r.marks}</span></td>
              <td><span class="rec-cat-badge ${esc(r.rec_category)}">${esc(r.rec_category||'—')}</span></td>
              <td>${dateStr}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch { listEl.innerHTML = '<p class="empty-msg" style="color:#dc2626">Failed to load.</p>'; }
}

/* ══════════════════════════════════════════
   PARENT — own child only
══════════════════════════════════════════ */
async function loadParent(student_id) {
  if (!student_id) return;
  console.log('Loading parent dashboard for student_id:', student_id);

  // Wire filter + download buttons (once)
  const filterBtn   = document.getElementById('parent-filter-btn');
  const downloadBtn = document.getElementById('parent-download-btn');
  if (!filterBtn._wired) {
    filterBtn._wired = true;
    filterBtn.addEventListener('click', () => loadParentRecords(student_id));
    downloadBtn.addEventListener('click', () => downloadCSV(student_id));
  }

  try {
    const [sdRes, insRes, trendRes, alertRes, infoRes, summaryRes] = await Promise.all([
      fetch(`/student-data?student_id=${encodeURIComponent(student_id)}`),
      fetch(`/insights?student_id=${encodeURIComponent(student_id)}`),
      fetch(`/trend?student_id=${encodeURIComponent(student_id)}`),
      fetch(`/alerts?student_id=${encodeURIComponent(student_id)}`),
      fetch(`/parent-info?user_id=${encodeURIComponent(currentUser.user_id)}`),
      fetch(`/student-summary?student_id=${encodeURIComponent(student_id)}`),
    ]);
    const sd      = await sdRes.json();
    const ins     = await insRes.json();
    const trend   = await trendRes.json();
    const alrt    = await alertRes.json();
    const info    = await infoRes.json();
    const summary = await summaryRes.json();

    // Parent header
    const hCard = document.getElementById('parent-header-card');
    if (!info.error) {
      hCard.innerHTML = `
        <div class="ph-label">Parent</div>
        <div class="ph-name">${esc(info.parent_name)}</div>
        <div class="ph-child">Parent of <strong>${esc(info.student_name)}</strong></div>
        <span class="ph-class">Class ${esc(info.class)}</span>
      `;
      hCard.style.display = 'block';
    }

    // Performance summary cards
    const perfStatus = summary.overall_avg >= 75 ? 'Strong' : summary.overall_avg >= 50 ? 'Moderate' : summary.overall_avg >= 40 ? 'Weak' : 'Critical';
    document.getElementById('parent-summary').innerHTML = `
      <div class="summary-card">
        <span class="sc-icon">📊</span>
        <span class="sc-val">${summary.overall_avg || 0}</span>
        <span class="sc-label">Average Marks</span>
        <span class="sc-sub"><span class="rec-cat-badge ${perfStatus}">${perfStatus}</span></span>
      </div>
      <div class="summary-card">
        <span class="sc-icon">🏆</span>
        <span class="sc-val" style="font-size:1.1rem;color:var(--green)">${esc(summary.strongest?.subject || '—')}</span>
        <span class="sc-label">Strongest Subject</span>
        <span class="sc-sub">Avg: ${summary.strongest?.avg || 0}</span>
      </div>
      <div class="summary-card">
        <span class="sc-icon">⚠️</span>
        <span class="sc-val" style="font-size:1.1rem;color:var(--red)">${esc(summary.weakest?.subject || '—')}</span>
        <span class="sc-label">Weakest Subject</span>
        <span class="sc-sub">Avg: ${summary.weakest?.avg || 0}</span>
      </div>
      <div class="summary-card">
        <span class="sc-icon">📝</span>
        <span class="sc-val">${sd.records?.length ?? 0}</span>
        <span class="sc-label">Total Tests</span>
      </div>
      <div class="summary-card">
        <span class="sc-icon">🚨</span>
        <span class="sc-val" style="color:${alrt.alerts?.length ? 'var(--red)' : 'var(--green)'}">${alrt.alerts?.length ?? 0}</span>
        <span class="sc-label">Active Alerts</span>
      </div>
    `;

    // Stats row (keep for charts)
    const total = sd.records?.length ?? 0;
    const avg   = summary.overall_avg || 0;
    const weak  = (sd.subject_avg||[]).filter(s=>s.avg<50).length;
    document.getElementById('parent-stats').innerHTML = '';  // summary cards replace this

    renderAlerts(alrt.alerts, 'parent-alerts');

    destroyChart('parent-bar');
    const barData = (sd.subject_avg||[]).map(r=>r.avg);
    charts['parent-bar'] = new Chart(document.getElementById('parent-bar'), {
      type: 'bar',
      data: { labels:(sd.subject_avg||[]).map(r=>r.subject),
        datasets:[{ label:'Avg Marks', data:barData,
          backgroundColor:barData.map(v=>v>=75?'#16a34a':v>=50?'#d97706':'#dc2626'), borderRadius:6 }] },
      options: { plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,max:100}} },
    });

    destroyChart('parent-line');
    charts['parent-line'] = new Chart(document.getElementById('parent-line'), {
      type: 'line',
      data: {
        labels: (trend.trend||[]).map(r=>r.day),
        datasets: [{ label:'Avg Marks', data:(trend.trend||[]).map(r=>r.avg),
          borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.1)', fill:true, tension:0.4, pointRadius:4 }],
      },
      options: { scales:{y:{beginAtZero:true,max:100}} },
    });
    setTrendBadge('parent-trend-badge', trend.trend_direction);

    renderInsights(ins.insights, 'parent-insights');
    loadParentRecords(student_id);
  } catch (err) { console.error('Parent load error:', err); }
}

async function loadParentRecords(student_id) {
  const subject   = document.getElementById('parent-filter-subject').value;
  const exam_type = document.getElementById('parent-filter-exam').value;
  const histEl    = document.getElementById('parent-history');
  histEl.innerHTML = '<p class="empty-msg">Loading…</p>';

  const params = new URLSearchParams({ student_id });
  if (subject)   params.set('subject',   subject);
  if (exam_type) params.set('exam_type', exam_type);

  try {
    const res  = await fetch(`/student-data?${params}`);
    const sd   = await res.json();

    if (!sd.records?.length) {
      histEl.innerHTML = '<p class="empty-msg">No records available.</p>';
      return;
    }

    histEl.innerHTML = `
      <table class="h-table">
        <thead><tr><th>Subject</th><th>Topic</th><th>Exam Type</th><th>Marks</th><th>Performance</th><th>Recommendation</th><th>Date</th></tr></thead>
        <tbody>
          ${sd.records.slice(0,30).map(r => {
            const d = r.exam_date ? new Date(r.exam_date) : new Date(r.createdAt);
            const dateStr = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
            return `<tr>
              <td>${esc(r.subject)}</td>
              <td>${esc(r.topic)}</td>
              <td><span style="font-size:0.75rem;color:var(--sub)">${esc(r.exam_type||'—')}</span></td>
              <td><span class="marks-badge ${marksClass(r.marks)}">${r.marks}</span></td>
              <td><span class="rec-cat-badge ${esc(r.rec_category)}">${esc(r.rec_category||'—')}</span></td>
              <td class="desc-cell">${esc(r.recommendation||'—')}</td>
              <td>${dateStr}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch { histEl.innerHTML = '<p class="empty-msg" style="color:#dc2626">Failed to load records.</p>'; }
}

function downloadCSV(student_id) {
  const subject   = document.getElementById('parent-filter-subject').value;
  const exam_type = document.getElementById('parent-filter-exam').value;
  const params    = new URLSearchParams({ student_id });
  if (subject)   params.set('subject',   subject);
  if (exam_type) params.set('exam_type', exam_type);

  fetch(`/student-data?${params}`)
    .then(r => r.json())
    .then(sd => {
      if (!sd.records?.length) { alert('No records to download.'); return; }
      const header = 'Student Name,Subject,Topic,Exam Type,Marks,Date,Performance,Recommendation';
      const rows   = sd.records.map(r => {
        const d = r.exam_date ? new Date(r.exam_date) : new Date(r.createdAt);
        const dateStr = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
        return [
          `"${r.student_name}"`, `"${r.subject}"`, `"${r.topic}"`,
          `"${r.exam_type||''}"`, r.marks, dateStr,
          `"${r.rec_category||''}"`, `"${(r.recommendation||'').replace(/"/g,"'")}"`
        ].join(',');
      });
      const csv  = [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `report_${student_id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => alert('Failed to download.'));
}

/* ══════════════════════════════════════════
   ADMIN — full access
══════════════════════════════════════════ */
async function loadAdmin() {
  try {
    const [anaRes, insRes, trendRes] = await Promise.all([
      fetch('/analytics'), fetch('/insights'), fetch('/trend'),
    ]);
    const ana   = await anaRes.json();
    const ins   = await insRes.json();
    const trend = await trendRes.json();

    document.getElementById('admin-stats').innerHTML = `
      <div class="stat-card"><span class="stat-num">${ana.total_students??0}</span><span class="stat-label">Students</span></div>
      <div class="stat-card"><span class="stat-num">${ana.total_records??0}</span><span class="stat-label">Records</span></div>
      <div class="stat-card"><span class="stat-num">${ana.class_average??0}</span><span class="stat-label">Class Avg</span></div>
      <div class="stat-card"><span class="stat-num">${esc(ana.weakest_subject)}</span><span class="stat-label">Weakest Subject</span></div>
      <div class="stat-card"><span class="stat-num" style="font-size:1rem">${esc(ana.top_mistake)}</span><span class="stat-label">Top Mistake</span></div>
    `;

    destroyChart('admin-bar');
    const barData = (ana.subject_avg||[]).map(r=>r.avg_marks);
    charts['admin-bar'] = new Chart(document.getElementById('admin-bar'), {
      type: 'bar',
      data: { labels:(ana.subject_avg||[]).map(r=>r.subject),
        datasets:[{ label:'Avg Marks', data:barData,
          backgroundColor:barData.map(v=>v>=75?'#16a34a':v>=50?'#d97706':'#dc2626'), borderRadius:6 }] },
      options: { plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,max:100}} },
    });

    destroyChart('admin-pie');
    const pieLabels = (ana.mistake_distribution||[]).map(r=>r.mistake_category);
    charts['admin-pie'] = new Chart(document.getElementById('admin-pie'), {
      type: 'doughnut',
      data: { labels:pieLabels,
        datasets:[{ data:(ana.mistake_distribution||[]).map(r=>r.count),
          backgroundColor:pieLabels.map(l=>({logic:'#dc2626',concept:'#d97706',careless:'#94a3b8',other:'#7c3aed'}[l]||'#3b82f6')),
          borderWidth:2 }] },
      options: { plugins:{legend:{position:'bottom'}}, cutout:'60%' },
    });

    destroyChart('admin-line');
    charts['admin-line'] = new Chart(document.getElementById('admin-line'), {
      type: 'line',
      data: {
        labels: (trend.trend||[]).map(r=>r.day),
        datasets: [{ label:'Class Avg', data:(trend.trend||[]).map(r=>r.avg),
          borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.1)', fill:true, tension:0.4, pointRadius:4 }],
      },
      options: { scales:{y:{beginAtZero:true,max:100}} },
    });
    setTrendBadge('admin-trend-badge', trend.trend_direction);

    // Exam type avg
    const etEl = document.getElementById('exam-type-avg');
    if (ana.exam_type_avg?.length) {
      etEl.innerHTML = ana.exam_type_avg.map(e =>
        `<div class="exam-type-row">
          <span class="exam-type-name">${esc(e.exam_type)}</span>
          <div class="exam-type-bar-wrap">
            <div class="exam-type-bar" style="width:${e.avg}%"></div>
          </div>
          <span class="exam-type-val">Avg: <strong>${e.avg}</strong></span>
        </div>`
      ).join('');
    } else {
      etEl.innerHTML = '<p class="empty-msg">No exam data yet.</p>';
    }

    renderInsights(ins.insights, 'admin-insights');

    // Wire up user search + reset (only once)
    if (!document.getElementById('admin-search-btn')._wired) {
      document.getElementById('admin-search-btn')._wired = true;
      document.getElementById('admin-search-btn').addEventListener('click', adminSearchUser);
    }
  } catch (err) { console.error('Admin load error:', err); }
}

async function adminSearchUser() {
  const user_id = document.getElementById('admin-search-id').value.trim();
  const role    = document.getElementById('admin-search-role').value;
  const resEl   = document.getElementById('admin-user-results');
  const succEl  = document.getElementById('admin-reset-success');
  const errEl   = document.getElementById('admin-reset-error');

  succEl.classList.add('hidden');
  errEl.classList.add('hidden');

  if (!user_id) { errEl.textContent = 'Enter a User ID to search.'; errEl.classList.remove('hidden'); return; }

  resEl.innerHTML = '<p class="empty-msg">Searching…</p>';
  try {
    const params = new URLSearchParams({ user_id });
    if (role) params.set('role', role);
    const res  = await fetch(`/admin/search-user?${params}`);
    const data = await res.json();

    if (!data.users?.length) { resEl.innerHTML = '<p class="empty-msg">No users found.</p>'; return; }

    resEl.innerHTML = `
      <table class="h-table">
        <thead><tr><th>User ID</th><th>Name</th><th>Role</th><th>Class</th><th>Action</th></tr></thead>
        <tbody>
          ${data.users.map(u => `
            <tr>
              <td style="font-family:monospace;font-size:0.78rem">${esc(u.user_id)}</td>
              <td>${esc(u.name)}</td>
              <td><span class="role-chip ${u.role}">${esc(u.role)}</span></td>
              <td>${esc(u.class||'—')}</td>
              <td>
                <button class="btn-ghost" style="color:var(--red);border-color:var(--red)"
                  onclick="adminResetPassword('${esc(u.user_id)}','${esc(u.role)}','${esc(u.name)}')">
                  Reset Password
                </button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch { resEl.innerHTML = '<p class="empty-msg" style="color:#dc2626">Search failed.</p>'; }
}

async function adminResetPassword(target_user_id, target_role, name) {
  if (!confirm(`Reset password for ${name} (${target_user_id})?\nThey will need to set a new password on next login.`)) return;

  const succEl = document.getElementById('admin-reset-success');
  const errEl  = document.getElementById('admin-reset-error');
  succEl.classList.add('hidden');
  errEl.classList.add('hidden');

  try {
    const res  = await fetch('/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_id: currentUser.user_id, target_user_id, target_role }),
    });
    const data = await res.json();
    if (data.error) { errEl.textContent = data.error; errEl.classList.remove('hidden'); return; }
    succEl.textContent = `✓ ${data.message}`;
    succEl.classList.remove('hidden');
  } catch { errEl.textContent = 'Reset failed. Try again.'; errEl.classList.remove('hidden'); }
}
