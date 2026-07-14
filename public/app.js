const state = {
  employees: [],
  records: [],
  calendarRecords: [],
  summary: [],
  editingEmployeeId: null,
  calendarMonth: new Date().toISOString().slice(0, 7),
  selectedDate: new Date().toISOString().slice(0, 10),
  user: JSON.parse(localStorage.getItem('attendance-user') || 'null')
};

const STATUS_META = {
  normal: { label: '正常', color: '#0ca30c', cls: 'pill-normal' },
  late: { label: '迟到', color: '#d03b3b', cls: 'pill-late' },
  early: { label: '早退', color: '#eda100', cls: 'pill-early' }
};

const EMPLOYMENT_META = {
  parttime: { label: '兼职', unit: '天', salaryLabel: '每日工资（元/天）', placeholder: '请输入每日工资' },
  fulltime: { label: '全职', unit: '月', salaryLabel: '每月工资（元/月）', placeholder: '请输入每月工资' }
};

const elements = {
  userBadge: document.querySelector('#userBadge'),
  logoutBtn: document.querySelector('#logoutBtn'),
  employeeSection: document.querySelector('#employees'),
  settingsSection: document.querySelector('#settings'),
  employeeTableBody: document.querySelector('#employeeTableBody'),
  recordTableBody: document.querySelector('#recordTableBody'),
  employeeSelect: document.querySelector('#employeeSelect'),
  clockFeedback: document.querySelector('#clockFeedback'),
  summaryTableContainer: document.querySelector('#summaryTableContainer'),
  statusChart: document.querySelector('#statusChart'),
  deptChart: document.querySelector('#deptChart'),
  deptChartTitle: document.querySelector('#deptChartTitle'),
  summaryChart: document.querySelector('#summaryChart'),
  calendarGrid: document.querySelector('#calendarGrid'),
  calendarDetail: document.querySelector('#calendarDetail'),
  calLabel: document.querySelector('#calLabel'),
  calPrev: document.querySelector('#calPrev'),
  calNext: document.querySelector('#calNext'),
  name: document.querySelector('#name'),
  department: document.querySelector('#department'),
  position: document.querySelector('#position'),
  employmentType: document.querySelector('#employmentType'),
  salaryLabel: document.querySelector('#salaryLabel'),
  baseSalary: document.querySelector('#baseSalary'),
  phone: document.querySelector('#phone'),
  hireDate: document.querySelector('#hireDate'),
  username: document.querySelector('#username'),
  password: document.querySelector('#password'),
  todayRecords: document.querySelector('#todayRecords'),
  activeEmployees: document.querySelector('#activeEmployees'),
  lateCount: document.querySelector('#lateCount'),
  totalSalary: document.querySelector('#totalSalary'),
  monthInput: document.querySelector('#monthInput'),
  refreshSummaryBtn: document.querySelector('#refreshSummaryBtn'),
  exportExcelBtn: document.querySelector('#exportExcelBtn'),
  addEmployeeBtn: document.querySelector('#addEmployeeBtn'),
  resetEmployeeFormBtn: document.querySelector('#resetEmployeeFormBtn'),
  workStart: document.querySelector('#workStart'),
  workEnd: document.querySelector('#workEnd'),
  deductPerAbsentDay: document.querySelector('#deductPerAbsentDay'),
  saveSettingsBtn: document.querySelector('#saveSettingsBtn'),
  toast: document.querySelector('#toast')
};

/* ---------- Helpers ---------- */
function authHeaders() {
  const token = localStorage.getItem('attendance-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function checkAuth() {
  if (!localStorage.getItem('attendance-token')) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

function formatCurrency(value) {
  return `¥${Number(value || 0).toLocaleString()}`;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
}

let toastTimer = null;
function showToast(message, type = 'success') {
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.className = 'toast';
  }, 2600);
}

function statusPill(status) {
  const meta = STATUS_META[status] || STATUS_META.normal;
  return `<span class="pill ${meta.cls}">${meta.label}</span>`;
}

function dutyStatus(record) {
  const today = new Date().toISOString().slice(0, 10);
  if (record.clockOut) return { label: '已下班', cls: 'duty-off' };
  if (record.date === today) return { label: '在岗中', cls: 'duty-on' };
  return { label: '未打下班卡', cls: 'duty-missing' };
}

function dutyPill(record) {
  const meta = dutyStatus(record);
  const dot = meta.cls === 'duty-on' ? '<span class="duty-dot"></span>' : '';
  return `<span class="pill ${meta.cls}">${dot}${meta.label}</span>`;
}

function employeeName(id) {
  const employee = state.employees.find((item) => item.id === id);
  if (employee) return employee.name;
  if (state.user && state.user.employeeId === id) return state.user.fullName;
  return '未知员工';
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
}

/* ---------- Section switching ---------- */
function switchView(target) {
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === target);
  });
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.target === target);
  });
}

document.querySelector('#navMenu').addEventListener('click', (event) => {
  const link = event.target.closest('.nav-item');
  if (!link) return;
  event.preventDefault();
  switchView(link.dataset.target);
  history.replaceState(null, '', `#${link.dataset.target}`);
});

function applyHashView() {
  const target = location.hash.slice(1);
  const link = document.querySelector(`.nav-item[data-target="${target}"]`);
  if (link && !link.classList.contains('hidden-by-role')) {
    switchView(target);
  }
}
window.addEventListener('hashchange', applyHashView);

/* ---------- Forms ---------- */
function updateSalaryLabel() {
  const meta = EMPLOYMENT_META[elements.employmentType.value] || EMPLOYMENT_META.parttime;
  elements.salaryLabel.textContent = meta.salaryLabel;
  elements.baseSalary.placeholder = meta.placeholder;
}

function resetEmployeeForm() {
  state.editingEmployeeId = null;
  elements.addEmployeeBtn.textContent = '添加员工';
  ['name', 'department', 'position', 'baseSalary', 'phone', 'hireDate', 'username', 'password'].forEach((key) => {
    elements[key].value = '';
  });
  elements.employmentType.value = 'parttime';
  updateSalaryLabel();
  elements.username.disabled = false;
  elements.password.disabled = false;
}

function fillEmployeeForm(employee) {
  state.editingEmployeeId = employee.id;
  elements.addEmployeeBtn.textContent = '保存修改';
  elements.name.value = employee.name;
  elements.department.value = employee.department;
  elements.position.value = employee.position;
  elements.employmentType.value = employee.employmentType === 'fulltime' ? 'fulltime' : 'parttime';
  updateSalaryLabel();
  elements.baseSalary.value = employee.baseSalary;
  elements.phone.value = employee.phone;
  elements.hireDate.value = employee.hireDate;
  elements.username.value = '';
  elements.password.value = '';
  elements.username.disabled = true;
  elements.password.disabled = true;
}

/* ---------- Rendering ---------- */
function renderEmployees() {
  elements.employeeTableBody.innerHTML = state.employees
    .map((employee) => {
      const type = employee.employmentType === 'fulltime' ? 'fulltime' : 'parttime';
      const meta = EMPLOYMENT_META[type];
      const badge = `<span class="pill ${type === 'parttime' ? 'pill-early' : 'pill-normal'}">${meta.label}</span>`;
      return `
      <tr>
        <td>${employee.name}</td>
        <td>${employee.department || '-'}</td>
        <td>${employee.position || '-'}</td>
        <td>${badge}</td>
        <td>${formatCurrency(employee.baseSalary)}<span class="salary-unit">/${meta.unit}</span></td>
        <td>${employee.phone || '-'}</td>
        <td>
          <button class="action-btn" data-action="edit" data-id="${employee.id}">编辑</button>
          <button class="action-btn delete" data-action="delete" data-id="${employee.id}">删除</button>
        </td>
      </tr>`;
    })
    .join('');

  elements.employeeSelect.innerHTML = state.employees
    .map((employee) => `<option value="${employee.id}">${employee.name}（${employee.department || '—'}）</option>`)
    .join('');
}

function renderUserBadge() {
  if (!state.user) return;
  elements.userBadge.innerHTML = `<strong>${state.user.fullName}</strong><br />${state.user.role === 'admin' ? '👑 管理员' : '👤 员工'}`;
}

function renderRecords() {
  if (!state.records.length) {
    elements.recordTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px">暂无打卡记录</td></tr>';
    return;
  }
  elements.recordTableBody.innerHTML = state.records
    .map((record) => {
      return `
        <tr>
          <td>${employeeName(record.employeeId)}</td>
          <td>${record.date}</td>
          <td>${formatDateTime(record.clockIn)}</td>
          <td>${formatDateTime(record.clockOut)}</td>
          <td>${statusPill(record.status)}</td>
        </tr>`;
    })
    .join('');
}

/* ---------- Charts (dependency-free SVG) ---------- */
function renderDonut(container, segments) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (!total) {
    container.innerHTML = '<span class="chart-empty">暂无打卡数据</span>';
    return;
  }
  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const circles = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const len = (s.value / total) * c;
      const dash = `${len} ${c - len}`;
      const circle = `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${s.color}" stroke-width="22" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)" />`;
      offset += len;
      return circle;
    })
    .join('');

  const legend = segments
    .map(
      (s) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${s.color}"></span>
        ${s.label}
        <span class="legend-val">${s.value}（${Math.round((s.value / total) * 100)}%）</span>
      </div>`
    )
    .join('');

  container.innerHTML = `
    <div class="pie-wrap">
      <svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="打卡状态分布">
        ${circles}
        <text x="80" y="76" text-anchor="middle" font-size="15" fill="#64748b">总打卡</text>
        <text x="80" y="98" text-anchor="middle" font-size="26" font-weight="700" fill="#0f172a">${total}</text>
      </svg>
      <div class="legend">${legend}</div>
    </div>`;
}

function renderBars(container, items, options = {}) {
  const { unit = '', color = '#2a78d6', max: fixedMax } = options;
  if (!items.length) {
    container.innerHTML = '<span class="chart-empty">暂无数据</span>';
    return;
  }
  const max = fixedMax || Math.max(...items.map((i) => i.value), 1);
  container.innerHTML =
    '<div style="width:100%">' +
    items
      .map(
        (item) => `
        <div class="bar-row">
          <span class="bar-name" title="${item.name}">${item.name}</span>
          <div class="bar-track"><div class="bar-fill" style="background:${item.color || color}" data-w="${(item.value / max) * 100}"></div></div>
          <span class="bar-val">${item.value}${unit}</span>
        </div>`
      )
      .join('') +
    '</div>';
  // animate widths on next frame
  requestAnimationFrame(() => {
    container.querySelectorAll('.bar-fill').forEach((el) => {
      el.style.width = `${el.dataset.w}%`;
    });
  });
}

function renderStatusChart() {
  const counts = { normal: 0, late: 0, early: 0 };
  state.records.forEach((record) => {
    const key = counts[record.status] !== undefined ? record.status : 'normal';
    counts[key] += 1;
  });
  renderDonut(elements.statusChart, [
    { label: STATUS_META.normal.label, value: counts.normal, color: STATUS_META.normal.color },
    { label: STATUS_META.late.label, value: counts.late, color: STATUS_META.late.color },
    { label: STATUS_META.early.label, value: counts.early, color: STATUS_META.early.color }
  ]);
}

function renderDeptChart() {
  const map = new Map();
  state.employees.forEach((employee) => {
    const dept = employee.department || '未分组';
    map.set(dept, (map.get(dept) || 0) + 1);
  });
  const items = [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  renderBars(elements.deptChart, items, { unit: ' 人' });
}

function renderSummaryChart() {
  const items = state.summary
    .map((row) => ({ name: row.name, value: row.attendanceRate }))
    .sort((a, b) => b.value - a.value);
  renderBars(elements.summaryChart, items, { unit: '%', max: 100 });
}

/* ---------- Calendar ---------- */
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function recordsByDate(month) {
  const map = {};
  state.calendarRecords.forEach((record) => {
    if (record.date && record.date.slice(0, 7) === month) {
      (map[record.date] = map[record.date] || []).push(record);
    }
  });
  return map;
}

function renderCalendar() {
  const month = state.calendarMonth;
  const [year, m] = month.split('-').map(Number);
  const label = `${year}年${m}月`;
  elements.calLabel.textContent = label;

  const firstWeekday = new Date(year, m - 1, 1).getDay();
  const daysInMonth = new Date(year, m, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const byDate = recordsByDate(month);

  let cells = WEEKDAYS.map((d) => `<div class="cal-weekday">${d}</div>`).join('');

  for (let i = 0; i < firstWeekday; i += 1) {
    cells += '<div class="cal-cell empty"></div>';
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const dayRecords = byDate[date] || [];
    const weekday = new Date(year, m - 1, day).getDay();
    const isWeekend = weekday === 0 || weekday === 6;

    const dots = dayRecords
      .slice(0, 8)
      .map((r) => `<span class="cal-dot" style="background:${(STATUS_META[r.status] || STATUS_META.normal).color}"></span>`)
      .join('');
    const count = dayRecords.length ? `<span class="cal-count">${dayRecords.length}人</span>` : '';

    const classes = ['cal-cell'];
    if (date === today) classes.push('today');
    if (date === state.selectedDate) classes.push('selected');
    if (isWeekend) classes.push('weekend');

    cells += `
      <div class="${classes.join(' ')}" data-date="${date}">
        <span class="cal-date">${day}</span>
        <div class="cal-dots">${dots}</div>
        ${count}
      </div>`;
  }

  elements.calendarGrid.innerHTML = cells;
  renderCalendarDetail();
}

function renderCalendarDetail() {
  if (!state.selectedDate) {
    elements.calendarDetail.innerHTML = '<p class="cal-empty">点击上方任意日期，查看当天每位员工的打卡时间与状态。</p>';
    return;
  }

  const dayRecords = state.calendarRecords.filter((record) => record.date === state.selectedDate);
  const [year, m, d] = state.selectedDate.split('-').map(Number);
  const title = `${year}年${m}月${d}日 · 考勤明细`;

  if (!dayRecords.length) {
    elements.calendarDetail.innerHTML = `<h3>${title}</h3><p class="cal-empty">当天暂无打卡记录。</p>`;
    return;
  }

  const onDutyCount = dayRecords.filter((record) => dutyStatus(record).cls === 'duty-on').length;

  const rows = dayRecords
    .sort((a, b) => new Date(a.clockIn || 0) - new Date(b.clockIn || 0))
    .map(
      (record) => `
        <tr>
          <td>${record.name || employeeName(record.employeeId)}</td>
          <td>${record.department || '-'}</td>
          <td>${formatTime(record.clockIn)}</td>
          <td>${formatTime(record.clockOut)}</td>
          <td>${dutyPill(record)}</td>
          <td>${statusPill(record.status)}</td>
        </tr>`
    )
    .join('');

  const onDutyBadge = onDutyCount ? `，<span class="on-duty-hint"><span class="duty-dot"></span>在岗 ${onDutyCount} 人</span>` : '';

  elements.calendarDetail.innerHTML = `
    <h3>${title}（共 ${dayRecords.length} 人${onDutyBadge}）</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>员工</th><th>部门</th><th>上班时间</th><th>下班时间</th><th>在岗状态</th><th>打卡状态</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ---------- Data loading ---------- */
async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    ...options
  });

  if (response.status === 401) {
    localStorage.removeItem('attendance-token');
    localStorage.removeItem('attendance-user');
    window.location.href = '/login.html';
    return null;
  }

  return response.json();
}

async function loadDashboard() {
  const data = await fetchJson('/api/dashboard');
  if (!data) return;
  elements.todayRecords.textContent = data.todayRecords;
  elements.activeEmployees.textContent = data.activeEmployees;
  elements.lateCount.textContent = data.lateCount;
  elements.totalSalary.textContent = formatCurrency(data.totalSalary);
}

async function loadSettings() {
  const response = await fetchJson('/api/settings');
  if (!response) return;
  elements.workStart.value = response.settings.workStart;
  elements.workEnd.value = response.settings.workEnd;
  elements.deductPerAbsentDay.value = response.settings.deductPerAbsentDay;
}

async function loadEmployees() {
  const response = await fetchJson('/api/employees');
  if (!response) return;
  state.employees = response.employees;
  renderEmployees();
  renderDeptChart();
}

async function loadRecords() {
  const response = await fetchJson('/api/records');
  if (!response) return;
  state.records = response.records;
  renderRecords();
  renderStatusChart();
}

async function loadCalendar(month) {
  const target = month || state.calendarMonth;
  const response = await fetchJson(`/api/calendar?month=${target}`);
  if (!response) return;
  state.calendarRecords = response.records;
  renderCalendar();
}

async function loadSummary(month) {
  const response = await fetchJson(`/api/month-summary?month=${month}`);
  if (!response) return;
  state.summary = response.summary;
  renderSummaryChart();

  elements.summaryTableContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>姓名</th><th>部门</th><th>用工类型</th><th>出勤天数</th><th>迟到次数</th>
          <th>早退次数</th><th>缺勤天数</th><th>出勤率</th><th>应发工资</th>
        </tr>
      </thead>
      <tbody>
        ${state.summary
          .map((item) => {
            const type = item.employmentType === 'fulltime' ? 'fulltime' : 'parttime';
            const meta = EMPLOYMENT_META[type];
            const badge = `<span class="pill ${type === 'parttime' ? 'pill-early' : 'pill-normal'}">${meta.label}</span>`;
            return `
              <tr>
                <td>${item.name}</td>
                <td>${item.department || '-'}</td>
                <td>${badge}</td>
                <td>${item.daysPresent}</td>
                <td>${item.lateCount}</td>
                <td>${item.earlyCount}</td>
                <td>${type === 'parttime' ? '—' : item.absentDays}</td>
                <td>${item.attendanceRate}%</td>
                <td>${formatCurrency(item.salary)}</td>
              </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

/* ---------- Actions ---------- */
async function addEmployee() {
  if (!elements.name.value.trim()) {
    showToast('请填写员工姓名', 'error');
    return;
  }

  const payload = {
    name: elements.name.value.trim(),
    department: elements.department.value.trim(),
    position: elements.position.value.trim(),
    employmentType: elements.employmentType.value === 'fulltime' ? 'fulltime' : 'parttime',
    baseSalary: Number(elements.baseSalary.value),
    phone: elements.phone.value.trim(),
    hireDate: elements.hireDate.value
  };

  let response;
  if (state.editingEmployeeId) {
    response = await fetchJson(`/api/employees/${state.editingEmployeeId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  } else {
    payload.username = elements.username.value.trim();
    payload.password = elements.password.value;
    response = await fetchJson('/api/employees', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  if (!response) return;

  const isEdit = Boolean(state.editingEmployeeId);
  const account = payload.username || (payload.name || '').toLowerCase().replace(/\s+/g, '');
  resetEmployeeForm();
  await loadEmployees();
  await loadDashboard();
  await loadSummary(elements.monthInput.value || new Date().toISOString().slice(0, 7));
  showToast(isEdit ? '员工信息已更新' : `员工已添加，登录账户：${account}`);
}

async function deleteEmployee(id) {
  if (!window.confirm('确定删除该员工吗？其打卡记录与登录账户将一并删除。')) return;
  await fetchJson(`/api/employees/${id}`, { method: 'DELETE' });
  await loadEmployees();
  await loadRecords();
  await loadDashboard();
  await loadSummary(elements.monthInput.value || new Date().toISOString().slice(0, 7));
  showToast('员工已删除');
}

async function saveSettings() {
  const response = await fetchJson('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({
      workStart: elements.workStart.value,
      workEnd: elements.workEnd.value,
      deductPerAbsentDay: Number(elements.deductPerAbsentDay.value)
    })
  });
  if (!response) return;
  showToast('设置已保存');
}

async function clockEmployee(type) {
  const employeeId = elements.employeeSelect.value;
  if (!employeeId) {
    showToast('请先选择员工', 'error');
    return;
  }
  const response = await fetchJson('/api/clock', {
    method: 'POST',
    body: JSON.stringify({ employeeId, type })
  });

  if (!response) return;

  if (response.message) {
    elements.clockFeedback.textContent = response.message;
    showToast(response.message, 'error');
    return;
  }

  const text = `${response.employee.name} ${type === 'in' ? '上班' : '下班'}打卡成功`;
  elements.clockFeedback.textContent = `${text}（${formatDateTime(type === 'in' ? response.record.clockIn : response.record.clockOut)}）`;
  showToast(text);
  await loadRecords();
  await loadCalendar();
  await loadDashboard();
  await loadSummary(elements.monthInput.value || new Date().toISOString().slice(0, 7));
}

/* ---------- Events ---------- */
elements.logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('attendance-token');
  localStorage.removeItem('attendance-user');
  window.location.href = '/login.html';
});

elements.exportExcelBtn.addEventListener('click', async () => {
  const response = await fetch('/api/export', { headers: { ...authHeaders() } });
  if (!response.ok) {
    showToast('导出失败', 'error');
    return;
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'attendance-report.xlsx';
  link.click();
  window.URL.revokeObjectURL(url);
  showToast('报表已导出');
});

elements.employmentType.addEventListener('change', updateSalaryLabel);

function shiftCalendarMonth(delta) {
  const [year, m] = state.calendarMonth.split('-').map(Number);
  const next = new Date(year, m - 1 + delta, 1);
  state.calendarMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  state.selectedDate = null;
  loadCalendar();
}

elements.calPrev.addEventListener('click', () => shiftCalendarMonth(-1));
elements.calNext.addEventListener('click', () => shiftCalendarMonth(1));
elements.calendarGrid.addEventListener('click', (event) => {
  const cell = event.target.closest('.cal-cell[data-date]');
  if (!cell) return;
  state.selectedDate = state.selectedDate === cell.dataset.date ? null : cell.dataset.date;
  renderCalendar();
});
elements.saveSettingsBtn.addEventListener('click', saveSettings);
elements.addEmployeeBtn.addEventListener('click', addEmployee);
elements.resetEmployeeFormBtn.addEventListener('click', resetEmployeeForm);
document.querySelector('#clockInBtn').addEventListener('click', () => clockEmployee('in'));
document.querySelector('#clockOutBtn').addEventListener('click', () => clockEmployee('out'));
elements.refreshSummaryBtn.addEventListener('click', () => {
  const month = elements.monthInput.value || new Date().toISOString().slice(0, 7);
  loadDashboard();
  loadSummary(month);
  showToast('数据已刷新');
});
elements.monthInput.addEventListener('change', () => {
  loadSummary(elements.monthInput.value || new Date().toISOString().slice(0, 7));
});

document.querySelector('#employeeTableBody').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = Number(button.dataset.id);
  if (action === 'edit') {
    const employee = state.employees.find((item) => item.id === id);
    if (employee) {
      fillEmployeeForm(employee);
      switchView('employees');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }
  if (action === 'delete') {
    await deleteEmployee(id);
  }
});

/* ---------- Init ---------- */
elements.monthInput.value = new Date().toISOString().slice(0, 7);
resetEmployeeForm();

(async function init() {
  if (!checkAuth()) return;

  renderUserBadge();
  const isAdmin = state.user?.role === 'admin';

  if (!isAdmin) {
    elements.employeeSection.classList.add('hidden-by-role');
    elements.settingsSection.classList.add('hidden-by-role');
    document.querySelectorAll('.nav-item[data-target="employees"], .nav-item[data-target="settings"]').forEach((el) => {
      el.classList.add('hidden-by-role');
    });
    elements.deptChartTitle.textContent = '我的信息';
  } else {
    await loadEmployees();
  }

  await loadSettings();
  await loadRecords();
  await loadCalendar();
  await loadDashboard();
  await loadSummary(elements.monthInput.value || new Date().toISOString().slice(0, 7));
  applyHashView();
})();
