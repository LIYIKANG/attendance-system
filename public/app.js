const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

const state = {
  employees: [],
  records: [],
  calendarRecords: [],
  summary: [],
  attendanceChanges: [],
  todayRecord: null,
  clockState: 'not_started',
  editingEmployeeId: null,
  editingRecordId: null,
  documentEmployeeId: null,
  employeeDocuments: [],
  calendarMonth: businessDate().slice(0, 7),
  selectedDate: businessDate(),
  user: JSON.parse(localStorage.getItem('attendance-user') || 'null')
};

const STATUS_META = {
  normal: {
    label: '正常',
    color: '#0ca30c',
    cls: 'pill-normal'
  },
  late: {
    label: '迟到',
    color: '#d03b3b',
    cls: 'pill-late'
  },
  early: {
    label: '早退',
    color: '#eda100',
    cls: 'pill-early'
  }
};

const LEVEL_META = {
  employee: {
    label: '员工',
    cls: 'level-employee'
  },
  project_manager: {
    label: '项目管理人',
    cls: 'level-project'
  },
  manager: {
    label: '管理者',
    cls: 'level-manager'
  },
  admin: {
    label: '系统管理员',
    cls: 'level-admin'
  }
};

const EMPLOYMENT_META = {
  parttime: {
    label: '兼职',
    unit: '天',
    salaryLabel: '每日工资（元/天）',
    placeholder: '请输入每日工资'
  },
  fulltime: {
    label: '全职',
    unit: '月',
    salaryLabel: '每月工资（元/月）',
    placeholder: '请输入每月工资'
  }
};

const $ = selector => document.querySelector(selector);

const elements = {
  userBadge: $('#userBadge'),
  logoutBtn: $('#logoutBtn'),
  changePasswordBtn: $('#changePasswordBtn'),
  navMenu: $('#navMenu'),
  toast: $('#toast'),
  employeeTableBody: $('#employeeTableBody'),
  employeeSelect: $('#employeeSelect'),
  adminEmployeePicker: $('#adminEmployeePicker'),
  recordTableBody: $('#recordTableBody'),
  hierarchyTableBody: $('#hierarchyTableBody'),
  changeList: $('#changeList'),
  changeBadge: $('#changeBadge'),
  clockFeedback: $('#clockFeedback'),
  liveClock: $('#liveClock'),
  workState: $('#workState'),
  todayTimeline: $('#todayTimeline'),
  clockInBtn: $('#clockInBtn'),
  clockInLabel: $('#clockInLabel'),
  breakBtn: $('#breakBtn'),
  clockOutBtn: $('#clockOutBtn'),
  summaryTableContainer: $('#summaryTableContainer'),
  statusChart: $('#statusChart'),
  deptChart: $('#deptChart'),
  summaryChart: $('#summaryChart'),
  calendarGrid: $('#calendarGrid'),
  calendarDetail: $('#calendarDetail'),
  calLabel: $('#calLabel'),
  calPrev: $('#calPrev'),
  calNext: $('#calNext'),
  name: $('#name'),
  department: $('#department'),
  position: $('#position'),
  employeeLevel: $('#employeeLevel'),
  employeeSupervisor: $('#employeeSupervisor'),
  supervisorHint: $('#supervisorHint'),
  employmentType: $('#employmentType'),
  salaryLabel: $('#salaryLabel'),
  baseSalary: $('#baseSalary'),
  phone: $('#phone'),
  hireDate: $('#hireDate'),
  username: $('#username'),
  password: $('#password'),
  todayRecords: $('#todayRecords'),
  activeEmployees: $('#activeEmployees'),
  lateCount: $('#lateCount'),
  totalSalary: $('#totalSalary'),
  monthInput: $('#monthInput'),
  refreshSummaryBtn: $('#refreshSummaryBtn'),
  exportExcelBtn: $('#exportExcelBtn'),
  addEmployeeBtn: $('#addEmployeeBtn'),
  resetEmployeeFormBtn: $('#resetEmployeeFormBtn'),
  workStart: $('#workStart'),
  workEnd: $('#workEnd'),
  deductPerAbsentDay: $('#deductPerAbsentDay'),
  saveSettingsBtn: $('#saveSettingsBtn'),
  saveHierarchyBtn: $('#saveHierarchyBtn'),
  passwordModal: $('#passwordModal'),
  closePasswordModal: $('#closePasswordModal'),
  cancelPasswordChange: $('#cancelPasswordChange'),
  savePasswordChange: $('#savePasswordChange'),
  currentPassword: $('#currentPassword'),
  newPassword: $('#newPassword'),
  confirmPassword: $('#confirmPassword'),
  documentModal: $('#documentModal'),
  documentModalTitle: $('#documentModalTitle'),
  documentEmployeeName: $('#documentEmployeeName'),
  closeDocumentModal: $('#closeDocumentModal'),
  finishDocumentManagement: $('#finishDocumentManagement'),
  documentType: $('#documentType'),
  employeeDocumentFile: $('#employeeDocumentFile'),
  uploadEmployeeDocument: $('#uploadEmployeeDocument'),
  employeeDocumentList: $('#employeeDocumentList'),
  resumeDocumentCount: $('#resumeDocumentCount'),
  contractDocumentCount: $('#contractDocumentCount'),
  editRecordModal: $('#editRecordModal'),
  closeEditModal: $('#closeEditModal'),
  cancelEditRecord: $('#cancelEditRecord'),
  editDate: $('#editDate'),
  editClockIn: $('#editClockIn'),
  editClockOut: $('#editClockOut'),
  editReason: $('#editReason'),
  breakEditor: $('#breakEditor'),
  addBreakRow: $('#addBreakRow'),
  saveRecordEdit: $('#saveRecordEdit')
};

function businessDate(date = new Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '\'': '&#39;',
    '"': '&quot;'
  }[char]));
}

function authHeaders() {
  const token = localStorage.getItem('attendance-token');
  return token ? {
    Authorization: `Bearer ${token}`
  } : {};
}

let toastTimer;

function showToast(message, type = 'success') {
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.className = 'toast';
  }, 2800);
}

async function fetchJson(url, options = {}) {
  let response;
  try {
    const isFormData = options.body instanceof FormData;
    response = await fetch(url, {
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...authHeaders(),
        ...options.headers
      },
      ...options
    });
  } catch (error) {
    showToast('网络连接失败，请稍后重试', 'error');
    return null;
  }
  if (response.status === 401) {
    localStorage.removeItem('attendance-token');
    localStorage.removeItem('attendance-user');
    location.href = '/login.html';
    return null;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showToast(data.message || '操作失败，请稍后重试', 'error');
    return null;
  }
  return data;
}

function isAdmin() {
  return state.user?.role === 'admin';
}

function isLeader() {
  return isAdmin() || [ 'project_manager', 'manager' ].includes(state.user?.employeeLevel);
}

function formatCurrency(value) {
  return `¥${Number(value || 0).toLocaleString()}`;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN', {
    timeZone: BUSINESS_TIME_ZONE,
    hour12: false
  }) : '—';
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString('zh-CN', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }) : '—';
}

function toLocalInput(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(value)).replace(' ', 'T');
}

function statusPill(status) {
  const meta = STATUS_META[status] || STATUS_META.normal;
  return `<span class="pill ${meta.cls}">${meta.label}</span>`;
}

function levelPill(level) {
  const meta = LEVEL_META[level] || LEVEL_META.employee;
  return `<span class="pill ${meta.cls}">${meta.label}</span>`;
}

function employeeName(id) {
  return state.employees.find(employee => employee.id === id)?.name || (state.user?.employeeId === id ? state.user.fullName : '未知员工');
}

function breakDuration(breaks = []) {
  const minutes = breaks.reduce((sum, item) => item.start && item.end ? sum + Math.max((new Date(item.end) - new Date(item.start)) / 6e4, 0) : sum, 0);
  if (!minutes) return '无';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return `${hours ? `${hours}小时` : ''}${rest ? `${rest}分钟` : ''}`;
}

function switchView(target) {
  const link = $(`.nav-item[data-target="${target}"]:not(.hidden-by-role)`);
  if (!link) return;
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === target));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.target === target));
}

function configureRoleAccess() {
  document.querySelectorAll('.nav-item').forEach(item => {
    const access = item.dataset.access;
    const allowed = access === 'all' || access === 'admin' && isAdmin() || access === 'leaders' && isLeader();
    item.classList.toggle('hidden-by-role', !allowed);
  });
  elements.adminEmployeePicker.classList.toggle('hidden-by-role', !isAdmin());
  const preferred = location.hash.slice(1) || (isAdmin() ? 'dashboard' : 'records');
  switchView($(`.nav-item[data-target="${preferred}"]:not(.hidden-by-role)`) ? preferred : isAdmin() ? 'dashboard' : 'records');
}

function renderUserBadge() {
  const level = isAdmin() ? 'admin' : state.user?.employeeLevel || 'employee';
  elements.userBadge.innerHTML = `<strong>${escapeHtml(state.user?.fullName)}</strong><br>${levelPill(level)}`;
}

function updateSalaryLabel() {
  const meta = EMPLOYMENT_META[elements.employmentType.value] || EMPLOYMENT_META.parttime;
  elements.salaryLabel.textContent = meta.salaryLabel;
  elements.baseSalary.placeholder = meta.placeholder;
}

function requiredSupervisorLevel(level) {
  if (level === 'employee') return 'project_manager';
  if (level === 'project_manager') return 'manager';
  return null;
}

function renderEmployeeSupervisorOptions(selectedId = null) {
  const level = elements.employeeLevel.value;
  const requiredLevel = requiredSupervisorLevel(level);
  if (!requiredLevel) {
    elements.employeeSupervisor.innerHTML = '<option value="">系统管理员</option>';
    elements.employeeSupervisor.disabled = true;
    elements.supervisorHint.textContent = '管理者的考勤修改直接上报系统管理员。';
    return;
  }

  const candidates = state.employees.filter(employee => employee.id !== state.editingEmployeeId && (employee.level || 'employee') === requiredLevel);
  const requiredLabel = LEVEL_META[requiredLevel].label;
  elements.employeeSupervisor.innerHTML = `<option value="">请选择${requiredLabel}</option>${candidates.map(employee => `<option value="${employee.id}">${escapeHtml(employee.name)}（${escapeHtml(employee.department || '未分组')}）</option>`).join('')}`;
  elements.employeeSupervisor.disabled = candidates.length === 0;
  elements.employeeSupervisor.value = selectedId && candidates.some(employee => employee.id === Number(selectedId)) ? String(selectedId) : '';
  elements.supervisorHint.textContent = candidates.length ? `该员工修改考勤后，将上报给所选${requiredLabel}。` : `当前没有可选的${requiredLabel}，请先创建${requiredLabel}。`;
}

function resetEmployeeForm() {
  state.editingEmployeeId = null;
  elements.addEmployeeBtn.textContent = '添加员工';
  [ 'name', 'department', 'position', 'baseSalary', 'phone', 'hireDate', 'username', 'password' ].forEach(key => {
    elements[key].value = '';
  });
  elements.employeeLevel.value = 'employee';
  elements.employmentType.value = 'parttime';
  elements.username.disabled = false;
  elements.password.disabled = false;
  renderEmployeeSupervisorOptions();
  updateSalaryLabel();
}

function fillEmployeeForm(employee) {
  state.editingEmployeeId = employee.id;
  elements.addEmployeeBtn.textContent = '保存修改';
  elements.name.value = employee.name || '';
  elements.department.value = employee.department || '';
  elements.position.value = employee.position || '';
  elements.employeeLevel.value = employee.level || 'employee';
  renderEmployeeSupervisorOptions(employee.supervisorId);
  elements.employmentType.value = employee.employmentType === 'fulltime' ? 'fulltime' : 'parttime';
  elements.baseSalary.value = employee.baseSalary || 0;
  elements.phone.value = employee.phone || '';
  elements.hireDate.value = employee.hireDate || '';
  elements.username.value = '';
  elements.password.value = '';
  elements.username.disabled = true;
  elements.password.disabled = true;
  updateSalaryLabel();
}

function renderEmployees() {
  elements.employeeTableBody.innerHTML = state.employees.length ? state.employees.map(employee => {
    const meta = EMPLOYMENT_META[employee.employmentType] || EMPLOYMENT_META.parttime;
    const recipient = employee.level === 'manager' ? '系统管理员' : state.employees.find(item => item.id === employee.supervisorId)?.name || '未设置';
    const recipientClass = recipient === '未设置' ? 'pending' : 'complete';
    const documentCount = Number(employee.documentCount) || 0;
    return `<tr><td>${escapeHtml(employee.name)}</td><td>${escapeHtml(employee.department || '-')}</td><td>${escapeHtml(employee.position || '-')}</td><td>${levelPill(employee.level)}</td><td><span class="config-state ${recipientClass}">${escapeHtml(recipient)}</span></td><td>${escapeHtml(meta.label)}</td><td>${formatCurrency(employee.baseSalary)}<span class="salary-unit">/${meta.unit}</span></td><td>${escapeHtml(employee.phone || '-')}</td><td><button class="action-btn document-action" data-employee-action="documents" data-id="${employee.id}">资料管理${documentCount ? `<span class="document-count">${documentCount}</span>` : ''}</button></td><td><button class="action-btn" data-employee-action="edit" data-id="${employee.id}">编辑</button><button class="action-btn delete" data-employee-action="delete" data-id="${employee.id}">删除</button></td></tr>`;
  }).join('') : '<tr><td colspan="10" class="empty-cell">暂无员工</td></tr>';
  elements.employeeSelect.innerHTML = state.employees.map(employee => `<option value="${employee.id}">${escapeHtml(employee.name)}（${escapeHtml(employee.department || '—')}）</option>`).join('');
  renderEmployeeSupervisorOptions(elements.employeeSupervisor.value);
}

function renderRecords() {
  elements.recordTableBody.innerHTML = state.records.length ? state.records.map(record => {
    const breaks = Array.isArray(record.breaks) ? record.breaks : [];
    const breakText = breaks.length ? `${breaks.length} 次 / ${breakDuration(breaks)}` : '无';
    return `<tr><td>${escapeHtml(employeeName(record.employeeId))}</td><td>${escapeHtml(record.date)}</td><td>${formatDateTime(record.clockIn)}</td><td>${breakText}</td><td>${formatDateTime(record.clockOut)}</td><td>${statusPill(record.status)}</td><td><button class="action-btn" data-record-action="edit" data-id="${record.id}">修改</button></td></tr>`;
  }).join('') : '<tr><td colspan="7" class="empty-cell">暂无历史考勤记录</td></tr>';
}

function renderDonut(container, segments) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  if (!total) {
    container.innerHTML = '<span class="chart-empty">暂无打卡数据</span>';
    return;
  }
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const circles = segments.filter(item => item.value).map(item => {
    const length = item.value / total * circumference;
    const circle = `<circle cx="80" cy="80" r="${radius}" fill="none" stroke="${item.color}" stroke-width="22" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"/>`;
    offset += length;
    return circle;
  }).join('');
  container.innerHTML = `<div class="pie-wrap"><svg viewBox="0 0 160 160" width="160" height="160">${circles}<text x="80" y="76" text-anchor="middle" font-size="14" fill="#64748b">总打卡</text><text x="80" y="100" text-anchor="middle" font-size="26" font-weight="700">${total}</text></svg><div class="legend">${segments.map(item => `<div class="legend-item"><span class="legend-dot" style="background:${item.color}"></span>${item.label}<strong>${item.value}</strong></div>`).join('')}</div></div>`;
}

function renderBars(container, items, unit = '') {
  if (!items.length) {
    container.innerHTML = '<span class="chart-empty">暂无数据</span>';
    return;
  }
  const max = Math.max(...items.map(item => item.value), 1);
  container.innerHTML = `<div style="width:100%">${items.map(item => `<div class="bar-row"><span class="bar-name">${escapeHtml(item.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${item.value / max * 100}%"></div></div><span class="bar-val">${item.value}${unit}</span></div>`).join('')}</div>`;
}

function renderAdminCharts() {
  const counts = {
    normal: 0,
    late: 0,
    early: 0
  };
  state.records.forEach(record => {
    counts[record.status] = (counts[record.status] || 0) + 1;
  });
  renderDonut(elements.statusChart, Object.entries(STATUS_META).map(([key, meta]) => ({
    label: meta.label,
    color: meta.color,
    value: counts[key] || 0
  })));
  const departments = new Map;
  state.employees.forEach(employee => departments.set(employee.department || '未分组', (departments.get(employee.department || '未分组') || 0) + 1));
  renderBars(elements.deptChart, [ ...departments ].map(([name, value]) => ({
    name: name,
    value: value
  })), ' 人');
}

function renderSummary() {
  renderBars(elements.summaryChart, state.summary.map(item => ({
    name: item.name,
    value: item.attendanceRate
  })), '%');
  elements.summaryTableContainer.innerHTML = `<table><thead><tr><th>姓名</th><th>部门</th><th>等级</th><th>用工类型</th><th>实际出勤</th><th>应出勤工作日</th><th>迟到</th><th>早退</th><th>缺勤</th><th>出勤率</th><th>工资</th></tr></thead><tbody>${state.summary.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.department || '-')}</td><td>${levelPill(state.employees.find(employee => employee.id === item.employeeId)?.level)}</td><td>${escapeHtml((EMPLOYMENT_META[item.employmentType] || EMPLOYMENT_META.parttime).label)}</td><td>${item.daysPresent}</td><td>${item.requiredWorkDays}</td><td>${item.lateCount}</td><td>${item.earlyCount}</td><td>${item.absentDays}</td><td>${item.attendanceRate}%</td><td>${formatCurrency(item.salary)}</td></tr>`).join('')}</tbody></table>`;
}

function clockMessage(clockState, record) {
  if (clockState === 'working') return `工作中 · ${formatTime(record.clockIn)} 开始`;
  if (clockState === 'on_break') return `休息中 · ${formatTime(record.breaks[record.breaks.length - 1].start)} 开始休息`;
  if (clockState === 'finished') return `今日工作已结束 · ${formatTime(record.clockOut)} 下班`;
  return '今天尚未开始工作';
}

function renderClockPanel() {
  const record = state.todayRecord;
  const clockState = state.clockState;
  elements.workState.textContent = clockMessage(clockState, record);
  elements.clockInLabel.textContent = clockState === 'on_break' ? '继续上班' : '上班';
  elements.clockInBtn.disabled = ![ 'not_started', 'on_break' ].includes(clockState);
  elements.breakBtn.disabled = clockState !== 'working';
  elements.clockOutBtn.disabled = clockState !== 'working';
  elements.clockFeedback.textContent = clockState === 'not_started' ? '准备好后，点击“上班”开始今天的工作。' : clockState === 'on_break' ? '休息结束后点击“继续上班”。' : clockState === 'finished' ? '辛苦了，今天的打卡已经完成。' : '需要休息时点击“休息”，结束工作时点击“下班”。';
  if (!record) {
    elements.todayTimeline.innerHTML = '<span class="empty-state">暂无打卡记录</span>';
    return;
  }
  const timeline = [ {
    label: '上班',
    time: record.clockIn,
    cls: 'start'
  } ];
  (record.breaks || []).forEach(item => {
    timeline.push({
      label: '开始休息',
      time: item.start,
      cls: 'break'
    });
    if (item.end) timeline.push({
      label: '继续上班',
      time: item.end,
      cls: 'resume'
    });
  });
  if (record.clockOut) timeline.push({
    label: '下班',
    time: record.clockOut,
    cls: 'out'
  });
  elements.todayTimeline.innerHTML = timeline.map(item => `<div class="timeline-item ${item.cls}"><span class="timeline-dot"></span><div><strong>${item.label}</strong><span>${formatTime(item.time)}</span></div></div>`).join('');
}

function collectHierarchyDraft() {
  if (!elements.hierarchyTableBody.querySelector('tr[data-id]')) return state.employees.map(employee => ({
    id: employee.id,
    level: employee.level || 'employee',
    supervisorId: employee.supervisorId || null
  }));
  return [ ...elements.hierarchyTableBody.querySelectorAll('tr[data-id]') ].map(row => ({
    id: Number(row.dataset.id),
    level: row.querySelector('[data-field="level"]').value,
    supervisorId: Number(row.querySelector('[data-field="supervisor"]').value) || null
  }));
}

function renderHierarchy(draft = null) {
  const assignments = draft || state.employees.map(employee => ({
    id: employee.id,
    level: employee.level || 'employee',
    supervisorId: employee.supervisorId || null
  }));
  const byId = new Map(assignments.map(item => [ item.id, item ]));
  elements.hierarchyTableBody.innerHTML = state.employees.map(employee => {
    const current = byId.get(employee.id);
    const required = current.level === 'employee' ? 'project_manager' : current.level === 'project_manager' ? 'manager' : null;
    const candidates = required ? state.employees.filter(item => byId.get(item.id)?.level === required && item.id !== employee.id) : [];
    const options = `<option value="">${required ? '请选择直属上级' : '直接向系统管理员汇报'}</option>${candidates.map(item => `<option value="${item.id}" ${current.supervisorId === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}`;
    const complete = current.level === 'manager' || Boolean(current.supervisorId && candidates.some(item => item.id === current.supervisorId));
    return `<tr data-id="${employee.id}"><td>${escapeHtml(employee.name)}</td><td>${escapeHtml(employee.department || '-')}</td><td><select data-field="level"><option value="employee" ${current.level === 'employee' ? 'selected' : ''}>员工</option><option value="project_manager" ${current.level === 'project_manager' ? 'selected' : ''}>项目管理人</option><option value="manager" ${current.level === 'manager' ? 'selected' : ''}>管理者</option></select></td><td><select data-field="supervisor" ${required ? '' : 'disabled'}>${options}</select></td><td><span class="config-state ${complete ? 'complete' : 'pending'}">${complete ? '已配置' : '待分配'}</span></td></tr>`;
  }).join('');
}

function renderChanges() {
  if (!state.attendanceChanges.length) {
    elements.changeList.innerHTML = '<div class="empty-state large">暂无考勤修改上报</div>';
    return;
  }
  elements.changeList.innerHTML = state.attendanceChanges.map(change => {
    const before = change.beforeData || {};
    const after = change.afterData || {};
    const unread = !change.readAt && change.actorEmployeeId !== state.user.employeeId;
    return `<article class="change-card ${unread ? 'unread' : ''}"><div class="change-card-head"><div><strong>${escapeHtml(change.subjectName)}</strong> 修改了自己的考勤 ${levelPill(change.subjectLevel)}</div><span>${formatDateTime(change.changedAt)}</span></div><div class="change-diff"><div><small>修改前</small><strong>${escapeHtml(before.date || '—')} · ${formatTime(before.clockIn)}–${formatTime(before.clockOut)}</strong><span>休息：${breakDuration(before.breaks)}</span></div><span class="diff-arrow">→</span><div><small>修改后</small><strong>${escapeHtml(after.date || '—')} · ${formatTime(after.clockIn)}–${formatTime(after.clockOut)}</strong><span>休息：${breakDuration(after.breaks)}</span></div></div><div class="change-reason"><span>修改原因</span>${escapeHtml(change.reason)}</div><div class="change-foot"><span>操作人：${escapeHtml(change.actorName)} · 上报至：${escapeHtml(change.recipientName)}</span>${unread ? `<button class="action-btn" data-change-read="${change.id}">标记已读</button>` : `<span class="read-state">${change.readAt ? '已查看' : '本人修改'}</span>`}</div></article>`;
  }).join('');
}

function renderCalendar() {
  const [year, month] = state.calendarMonth.split('-').map(Number);
  elements.calLabel.textContent = `${year}年${month}月`;
  const firstDay = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const byDate = new Map;
  state.calendarRecords.forEach(record => {
    if (!byDate.has(record.date)) byDate.set(record.date, []);
    byDate.get(record.date).push(record);
  });
  const cells = [ '日', '一', '二', '三', '四', '五', '六' ].map(day => `<div class="cal-weekday">${day}</div>`);
  for (let index = 0; index < firstDay; index += 1) cells.push('<div class="cal-cell empty"></div>');
  for (let day = 1; day <= days; day += 1) {
    const date = `${state.calendarMonth}-${String(day).padStart(2, '0')}`;
    const records = byDate.get(date) || [];
    cells.push(`<button class="cal-cell ${date === businessDate() ? 'today' : ''} ${date === state.selectedDate ? 'selected' : ''}" data-date="${date}"><span class="cal-date">${day}</span><span class="cal-dots">${records.slice(0, 8).map(record => `<i class="cal-dot" style="background:${(STATUS_META[record.status] || STATUS_META.normal).color}"></i>`).join('')}</span><span class="cal-count">${records.length ? `${records.length}人` : ''}</span></button>`);
  }
  elements.calendarGrid.innerHTML = cells.join('');
  renderCalendarDetail();
}

function renderCalendarDetail() {
  if (!state.selectedDate) {
    elements.calendarDetail.innerHTML = '<p class="cal-empty">点击日期查看明细</p>';
    return;
  }
  const records = state.calendarRecords.filter(record => record.date === state.selectedDate);
  elements.calendarDetail.innerHTML = `<h3>${state.selectedDate} 考勤明细</h3>${records.length ? `<div class="table-wrap"><table><thead><tr><th>员工</th><th>部门</th><th>上班</th><th>下班</th><th>状态</th></tr></thead><tbody>${records.map(record => `<tr><td>${escapeHtml(record.name)}</td><td>${escapeHtml(record.department || '-')}</td><td>${formatTime(record.clockIn)}</td><td>${formatTime(record.clockOut)}</td><td>${statusPill(record.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="cal-empty">当天暂无考勤记录</p>'}`;
}

async function loadEmployees() {
  const data = await fetchJson('/api/employees');
  if (!data) return;
  state.employees = data.employees;
  renderEmployees();
  renderHierarchy();
}

async function loadRecords() {
  const data = await fetchJson('/api/records');
  if (!data) return;
  state.records = data.records;
  renderRecords();
  if (isAdmin()) renderAdminCharts();
}

async function loadClockPanel() {
  const employeeId = isAdmin() ? Number(elements.employeeSelect.value) : state.user.employeeId;
  if (!employeeId) {
    state.todayRecord = null;
    state.clockState = 'not_started';
    renderClockPanel();
    return;
  }
  const data = await fetchJson(`/api/clock/today?employeeId=${employeeId}`);
  if (!data) return;
  state.todayRecord = data.record;
  state.clockState = data.clockState;
  renderClockPanel();
}

async function loadSettings() {
  const data = await fetchJson('/api/settings');
  if (!data) return;
  elements.workStart.value = data.settings.workStart;
  elements.workEnd.value = data.settings.workEnd;
  elements.deductPerAbsentDay.value = data.settings.deductPerAbsentDay;
}

async function loadDashboard() {
  const data = await fetchJson('/api/dashboard');
  if (!data) return;
  elements.todayRecords.textContent = data.todayRecords;
  elements.activeEmployees.textContent = data.activeEmployees;
  elements.lateCount.textContent = data.lateCount;
  elements.totalSalary.textContent = formatCurrency(data.totalSalary);
}

async function loadSummary() {
  const month = elements.monthInput.value || businessDate().slice(0, 7);
  const data = await fetchJson(`/api/month-summary?month=${month}`);
  if (!data) return;
  state.summary = data.summary;
  renderSummary();
}

async function loadCalendar() {
  const data = await fetchJson(`/api/calendar?month=${state.calendarMonth}`);
  if (!data) return;
  state.calendarRecords = data.records;
  renderCalendar();
}

async function loadChanges() {
  const data = await fetchJson('/api/attendance-changes');
  if (!data) return;
  state.attendanceChanges = data.changes;
  elements.changeBadge.textContent = data.unreadCount;
  elements.changeBadge.classList.toggle('hidden-by-role', !data.unreadCount);
  renderChanges();
}

async function addEmployee() {
  if (!elements.name.value.trim()) return showToast('请填写员工姓名', 'error');
  const baseSalary = Number(elements.baseSalary.value);
  if (!Number.isFinite(baseSalary) || baseSalary < 0) return showToast('请填写大于或等于 0 的工资', 'error');
  if (elements.hireDate.value && elements.hireDate.value > businessDate()) return showToast('入职日期不能晚于今天', 'error');
  const level = elements.employeeLevel.value;
  const supervisorId = Number(elements.employeeSupervisor.value) || null;
  if (level !== 'manager' && !supervisorId) return showToast(`请选择该${LEVEL_META[level].label}的直属上级`, 'error');
  const payload = {
    name: elements.name.value.trim(),
    department: elements.department.value.trim(),
    position: elements.position.value.trim(),
    level: level,
    supervisorId: supervisorId,
    employmentType: elements.employmentType.value,
    baseSalary: baseSalary,
    phone: elements.phone.value.trim(),
    hireDate: elements.hireDate.value
  };
  const editing = Boolean(state.editingEmployeeId);
  if (!editing) {
    payload.username = elements.username.value.trim();
    payload.password = elements.password.value;
    if (payload.password.length < 8 || !/[A-Za-z]/.test(payload.password) || !/\d/.test(payload.password)) {
      return showToast('登录密码至少 8 位，并同时包含字母和数字', 'error');
    }
  }
  const data = await fetchJson(editing ? `/api/employees/${state.editingEmployeeId}` : '/api/employees', {
    method: editing ? 'PUT' : 'POST',
    body: JSON.stringify(payload)
  });
  if (!data) return;
  resetEmployeeForm();
  await loadEmployees();
  await Promise.all([ loadDashboard(), loadSummary() ]);
  showToast(editing ? '员工信息与汇报关系已更新' : '员工已添加，汇报关系已生效');
}

async function deleteEmployee(id) {
  if (!confirm('确定删除该员工吗？其登录账户、原始考勤、简历和合同将被删除，修改审计会继续保留。若仍有下属，需先完成转移。')) return;
  const data = await fetchJson(`/api/employees/${id}`, {
    method: 'DELETE'
  });
  if (!data) return;
  if (state.editingEmployeeId === id) resetEmployeeForm();
  await loadEmployees();
  await Promise.all([ loadRecords(), loadDashboard(), loadSummary(), loadCalendar() ]);
  showToast('员工已删除');
}

function formatFileSize(size) {
  const bytes = Number(size) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderEmployeeDocuments() {
  const resumeCount = state.employeeDocuments.filter(document => document.documentType === 'resume').length;
  const contractCount = state.employeeDocuments.filter(document => document.documentType === 'contract').length;
  elements.resumeDocumentCount.textContent = resumeCount;
  elements.contractDocumentCount.textContent = contractCount;
  elements.employeeDocumentList.innerHTML = state.employeeDocuments.length ? state.employeeDocuments.map(document => {
    const typeLabel = document.documentType === 'contract' ? '劳动合同' : '个人简历';
    const typeIcon = document.documentType === 'contract' ? '📄' : '🪪';
    return `<article class="document-item"><div class="document-icon" aria-hidden="true">${typeIcon}</div><div class="document-info"><div><span class="document-type ${document.documentType}">${typeLabel}</span><strong title="${escapeHtml(document.originalName)}">${escapeHtml(document.originalName)}</strong></div><small>${formatFileSize(document.size)} · 上传于 ${formatDateTime(document.uploadedAt)}</small></div><div class="document-actions"><button class="action-btn" data-document-action="download" data-id="${document.id}">下载</button><button class="action-btn delete" data-document-action="delete" data-id="${document.id}">删除</button></div></article>`;
  }).join('') : '<div class="document-empty"><span>📁</span><strong>暂未上传人员资料</strong><p>选择“个人简历”或“劳动合同”后上传文件。</p></div>';
}

async function loadEmployeeDocuments(employeeId = state.documentEmployeeId) {
  const data = await fetchJson(`/api/employees/${employeeId}/documents`);
  if (!data) return;
  state.employeeDocuments = data.documents;
  renderEmployeeDocuments();
}

async function openDocumentManager(employeeId) {
  const employee = state.employees.find(item => item.id === employeeId);
  if (!employee) return;
  state.documentEmployeeId = employeeId;
  state.employeeDocuments = [];
  elements.documentModalTitle.textContent = `${employee.name} · 人员档案`;
  elements.documentEmployeeName.textContent = '管理员可上传、下载和删除该员工的简历与合同。';
  elements.documentType.value = 'resume';
  elements.employeeDocumentFile.value = '';
  renderEmployeeDocuments();
  elements.documentModal.classList.add('show');
  elements.documentModal.setAttribute('aria-hidden', 'false');
  await loadEmployeeDocuments(employeeId);
}

function closeDocumentManager() {
  elements.documentModal.classList.remove('show');
  elements.documentModal.setAttribute('aria-hidden', 'true');
  elements.employeeDocumentFile.value = '';
  state.documentEmployeeId = null;
  state.employeeDocuments = [];
}

async function uploadEmployeeDocument() {
  const file = elements.employeeDocumentFile.files[0];
  if (!state.documentEmployeeId) return showToast('请先选择员工', 'error');
  if (!file) return showToast('请选择要上传的文件', 'error');
  if (file.size > 15 * 1024 * 1024) return showToast('文件不能超过 15MB', 'error');
  const formData = new FormData();
  formData.append('file', file);
  elements.uploadEmployeeDocument.disabled = true;
  elements.uploadEmployeeDocument.textContent = '上传中…';
  const data = await fetchJson(`/api/employees/${state.documentEmployeeId}/documents?type=${encodeURIComponent(elements.documentType.value)}`, {
    method: 'POST',
    body: formData
  });
  elements.uploadEmployeeDocument.disabled = false;
  elements.uploadEmployeeDocument.textContent = '上传资料';
  if (!data) return;
  elements.employeeDocumentFile.value = '';
  await Promise.all([ loadEmployeeDocuments(), loadEmployees() ]);
  showToast('人员资料已安全上传');
}

async function downloadEmployeeDocument(documentId) {
  const documentInfo = state.employeeDocuments.find(document => document.id === documentId);
  if (!documentInfo) return;
  let response;
  try {
    response = await fetch(`/api/employee-documents/${documentId}/download`, { headers: authHeaders() });
  } catch (error) {
    return showToast('文件下载失败，请稍后重试', 'error');
  }
  if (response.status === 401) {
    localStorage.removeItem('attendance-token');
    localStorage.removeItem('attendance-user');
    location.href = '/login.html';
    return;
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return showToast(data.message || '文件下载失败', 'error');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = documentInfo.originalName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function deleteEmployeeDocument(documentId) {
  const documentInfo = state.employeeDocuments.find(document => document.id === documentId);
  if (!documentInfo || !confirm(`确定删除“${documentInfo.originalName}”吗？删除后无法恢复。`)) return;
  const data = await fetchJson(`/api/employee-documents/${documentId}`, { method: 'DELETE' });
  if (!data) return;
  await Promise.all([ loadEmployeeDocuments(), loadEmployees() ]);
  showToast('人员资料已删除');
}

async function clockAction(type) {
  const employeeId = isAdmin() ? Number(elements.employeeSelect.value) : state.user.employeeId;
  if (!employeeId) return showToast('请选择员工', 'error');
  const data = await fetchJson('/api/clock', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: employeeId,
      type: type
    })
  });
  if (!data) return;
  state.todayRecord = data.record;
  state.clockState = data.clockState;
  renderClockPanel();
  await loadRecords();
  if (isAdmin()) await Promise.all([ loadDashboard(), loadCalendar(), loadSummary() ]);
  showToast({
    in: '上班打卡成功',
    break: '已开始休息',
    resume: '已继续上班',
    out: '下班打卡成功'
  }[type]);
}

function addBreakEditorRow(item = {}) {
  elements.breakEditor.insertAdjacentHTML('beforeend', `<div class="break-editor-row"><div class="form-group"><label>休息开始</label><input data-break-start type="datetime-local" value="${escapeHtml(toLocalInput(item.start))}"></div><div class="form-group"><label>继续上班</label><input data-break-end type="datetime-local" value="${escapeHtml(toLocalInput(item.end))}"></div><button class="action-btn delete" data-remove-break type="button">删除</button></div>`);
}

function openRecordEditor(id) {
  const record = state.records.find(item => item.id === id);
  if (!record) return;
  state.editingRecordId = id;
  elements.editDate.value = record.date;
  elements.editClockIn.value = toLocalInput(record.clockIn);
  elements.editClockOut.value = toLocalInput(record.clockOut);
  elements.editReason.value = '';
  elements.breakEditor.innerHTML = '';
  (record.breaks || []).forEach(addBreakEditorRow);
  elements.editRecordModal.classList.add('show');
  elements.editRecordModal.setAttribute('aria-hidden', 'false');
}

function closeRecordEditor() {
  state.editingRecordId = null;
  elements.editRecordModal.classList.remove('show');
  elements.editRecordModal.setAttribute('aria-hidden', 'true');
}

async function saveRecordEdit() {
  const breaks = [ ...elements.breakEditor.querySelectorAll('.break-editor-row') ].map(row => ({
    start: row.querySelector('[data-break-start]').value,
    end: row.querySelector('[data-break-end]').value
  }));
  const payload = {
    date: elements.editDate.value,
    clockIn: elements.editClockIn.value,
    clockOut: elements.editClockOut.value,
    breaks: breaks,
    reason: elements.editReason.value.trim()
  };
  const data = await fetchJson(`/api/records/${state.editingRecordId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  if (!data) return;
  closeRecordEditor();
  await loadRecords();
  if (isLeader()) await loadChanges();
  if (isAdmin()) await Promise.all([ loadDashboard(), loadCalendar(), loadSummary() ]);
  showToast('考勤已修改，并完成上报');
}

async function saveSettings() {
  const data = await fetchJson('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({
      workStart: elements.workStart.value,
      workEnd: elements.workEnd.value,
      deductPerAbsentDay: Number(elements.deductPerAbsentDay.value)
    })
  });
  if (data) showToast('考勤设置已保存');
}

async function saveHierarchy() {
  const data = await fetchJson('/api/hierarchy', {
    method: 'PUT',
    body: JSON.stringify({
      assignments: collectHierarchyDraft()
    })
  });
  if (!data) return;
  state.employees = data.employees;
  renderEmployees();
  renderHierarchy();
  showToast('员工等级与汇报关系已保存');
}

function openPasswordModal() {
  elements.currentPassword.value = '';
  elements.newPassword.value = '';
  elements.confirmPassword.value = '';
  elements.passwordModal.classList.add('show');
  elements.passwordModal.setAttribute('aria-hidden', 'false');
  elements.currentPassword.focus();
}

function closePasswordModal() {
  elements.passwordModal.classList.remove('show');
  elements.passwordModal.setAttribute('aria-hidden', 'true');
}

async function savePasswordChange() {
  const currentPassword = elements.currentPassword.value;
  const newPassword = elements.newPassword.value;
  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return showToast('新密码至少 8 位，并同时包含字母和数字', 'error');
  }
  if (newPassword !== elements.confirmPassword.value) return showToast('两次输入的新密码不一致', 'error');
  const data = await fetchJson('/api/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword })
  });
  if (!data) return;
  localStorage.setItem('attendance-token', data.token);
  localStorage.setItem('attendance-user', JSON.stringify(data.user));
  state.user = data.user;
  renderUserBadge();
  closePasswordModal();
  showToast('密码已更新，其他旧登录已失效');
}

elements.navMenu.addEventListener('click', event => {
  const link = event.target.closest('.nav-item');
  if (!link || link.classList.contains('hidden-by-role')) return;
  event.preventDefault();
  switchView(link.dataset.target);
  history.replaceState(null, '', `#${link.dataset.target}`);
  if (link.dataset.target === 'changes') loadChanges();
});

window.addEventListener('hashchange', () => switchView(location.hash.slice(1)));

elements.logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('attendance-token');
  localStorage.removeItem('attendance-user');
  location.href = '/login.html';
});

elements.changePasswordBtn.addEventListener('click', openPasswordModal);
elements.closePasswordModal.addEventListener('click', closePasswordModal);
elements.cancelPasswordChange.addEventListener('click', closePasswordModal);
elements.savePasswordChange.addEventListener('click', savePasswordChange);
elements.passwordModal.addEventListener('click', event => {
  if (event.target === elements.passwordModal) closePasswordModal();
});

elements.closeDocumentModal.addEventListener('click', closeDocumentManager);
elements.finishDocumentManagement.addEventListener('click', closeDocumentManager);
elements.uploadEmployeeDocument.addEventListener('click', uploadEmployeeDocument);
elements.documentModal.addEventListener('click', event => {
  if (event.target === elements.documentModal) closeDocumentManager();
});
elements.employeeDocumentList.addEventListener('click', event => {
  const button = event.target.closest('[data-document-action]');
  if (!button) return;
  const documentId = Number(button.dataset.id);
  if (button.dataset.documentAction === 'download') downloadEmployeeDocument(documentId);
  else deleteEmployeeDocument(documentId);
});

elements.employmentType.addEventListener('change', updateSalaryLabel);

elements.employeeLevel.addEventListener('change', () => renderEmployeeSupervisorOptions());

elements.addEmployeeBtn.addEventListener('click', addEmployee);

elements.resetEmployeeFormBtn.addEventListener('click', resetEmployeeForm);

elements.employeeTableBody.addEventListener('click', event => {
  const button = event.target.closest('[data-employee-action]');
  if (!button) return;
  const id = Number(button.dataset.id);
  if (button.dataset.employeeAction === 'edit') {
    fillEmployeeForm(state.employees.find(employee => employee.id === id));
    scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  } else if (button.dataset.employeeAction === 'documents') {
    openDocumentManager(id);
  } else deleteEmployee(id);
});

elements.clockInBtn.addEventListener('click', () => clockAction(state.clockState === 'on_break' ? 'resume' : 'in'));

elements.breakBtn.addEventListener('click', () => clockAction('break'));

elements.clockOutBtn.addEventListener('click', () => {
  if (confirm('确认结束今天的工作并下班吗？')) clockAction('out');
});

elements.employeeSelect.addEventListener('change', loadClockPanel);

elements.recordTableBody.addEventListener('click', event => {
  const button = event.target.closest('[data-record-action="edit"]');
  if (button) openRecordEditor(Number(button.dataset.id));
});

elements.closeEditModal.addEventListener('click', closeRecordEditor);

elements.cancelEditRecord.addEventListener('click', closeRecordEditor);

elements.editRecordModal.addEventListener('click', event => {
  if (event.target === elements.editRecordModal) closeRecordEditor();
});

elements.addBreakRow.addEventListener('click', () => addBreakEditorRow());

elements.breakEditor.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-break]');
  if (button) button.closest('.break-editor-row').remove();
});

elements.saveRecordEdit.addEventListener('click', saveRecordEdit);

elements.saveSettingsBtn.addEventListener('click', saveSettings);

elements.saveHierarchyBtn.addEventListener('click', saveHierarchy);

elements.hierarchyTableBody.addEventListener('change', event => {
  if (event.target.dataset.field === 'level') renderHierarchy(collectHierarchyDraft());
});

elements.changeList.addEventListener('click', async event => {
  const button = event.target.closest('[data-change-read]');
  if (!button) return;
  const data = await fetchJson(`/api/attendance-changes/${button.dataset.changeRead}/read`, {
    method: 'PUT'
  });
  if (data) loadChanges();
});

elements.calPrev.addEventListener('click', () => {
  const [year, month] = state.calendarMonth.split('-').map(Number);
  const next = new Date(year, month - 2, 1);
  state.calendarMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  state.selectedDate = null;
  loadCalendar();
});

elements.calNext.addEventListener('click', () => {
  const [year, month] = state.calendarMonth.split('-').map(Number);
  const next = new Date(year, month, 1);
  state.calendarMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  state.selectedDate = null;
  loadCalendar();
});

elements.calendarGrid.addEventListener('click', event => {
  const cell = event.target.closest('[data-date]');
  if (!cell) return;
  state.selectedDate = cell.dataset.date;
  renderCalendar();
});

elements.refreshSummaryBtn.addEventListener('click', async () => {
  await Promise.all([ loadDashboard(), loadSummary(), loadRecords() ]);
  showToast('数据已刷新');
});

elements.monthInput.addEventListener('change', loadSummary);

elements.exportExcelBtn.addEventListener('click', async () => {
  const response = await fetch('/api/export', {
    headers: authHeaders()
  });
  if (!response.ok) return showToast('导出失败', 'error');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'attendance-report.xlsx';
  link.click();
  URL.revokeObjectURL(url);
  showToast('报表已导出');
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeRecordEditor();
});

setInterval(() => {
  elements.liveClock.textContent = (new Date).toLocaleTimeString('zh-CN', {
    timeZone: BUSINESS_TIME_ZONE,
    hour12: false
  });
}, 1e3);

elements.liveClock.textContent = (new Date).toLocaleTimeString('zh-CN', {
  timeZone: BUSINESS_TIME_ZONE,
  hour12: false
});

elements.monthInput.value = businessDate().slice(0, 7);
elements.hireDate.max = businessDate();

resetEmployeeForm();

(async function init() {
  if (!localStorage.getItem('attendance-token')) {
    location.href = '/login.html';
    return;
  }
  const me = await fetchJson('/api/auth/me');
  if (!me?.user) return;
  state.user = me.user;
  localStorage.setItem('attendance-user', JSON.stringify(state.user));
  renderUserBadge();
  configureRoleAccess();
  await loadSettings();
  if (isAdmin()) {
    await loadEmployees();
    await Promise.all([ loadDashboard(), loadSummary(), loadCalendar() ]);
  }
  await Promise.all([ loadRecords(), loadClockPanel() ]);
  if (isLeader()) await loadChanges();
})();
