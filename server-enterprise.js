const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { sequelize } = require('./src/db');
const { Employee, User, AttendanceRecord, SystemSetting } = require('./src/models');
const { admin, adminRouter } = require('./src/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, 'data', 'db.json');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const TOKEN_SECRET = process.env.JWT_SECRET || 'attendance-enterprise-secret-2026';
let STORE_MODE = 'json';

function hashPassword(password) {
  return crypto.createHash('sha256').update(`attendance-enterprise-${password}`).digest('hex');
}

function buildDefaultDb() {
  return {
    settings: {
      workStart: '09:00',
      workEnd: '18:00',
      deductPerAbsentDay: 200,
      currency: 'CNY'
    },
    employees: [
      { id: 1, name: '张三', department: '研发部', position: '前端工程师', employmentType: 'fulltime', baseSalary: 8500, phone: '13800000001', hireDate: '2024-01-10', status: 'active' },
      { id: 2, name: '李四', department: '运营部', position: '运营专员', employmentType: 'fulltime', baseSalary: 7200, phone: '13800000002', hireDate: '2024-03-15', status: 'active' },
      { id: 3, name: '王五', department: '销售部', position: '销售顾问', employmentType: 'parttime', baseSalary: 300, phone: '13800000003', hireDate: '2024-05-08', status: 'active' }
    ],
    users: [
      { id: 1, username: 'admin', fullName: '系统管理员', role: 'admin', employeeId: null, passwordHash: hashPassword('Admin@123') },
      { id: 2, username: 'zhangsan', fullName: '张三', role: 'employee', employeeId: 1, passwordHash: hashPassword('123456') },
      { id: 3, username: 'lisi', fullName: '李四', role: 'employee', employeeId: 2, passwordHash: hashPassword('123456') },
      { id: 4, username: 'wangwu', fullName: '王五', role: 'employee', employeeId: 3, passwordHash: hashPassword('123456') }
    ],
    records: []
  };
}

function ensureJsonFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(buildDefaultDb(), null, 2));
}

function normalizeDbStructure(db) {
  const defaultDb = buildDefaultDb();
  const normalized = {
    ...defaultDb,
    ...db,
    settings: { ...defaultDb.settings, ...(db?.settings || {}) },
    employees: (Array.isArray(db?.employees) ? db.employees : defaultDb.employees).map((employee) => ({
      ...employee,
      employmentType: employee.employmentType === 'parttime' ? 'parttime' : 'fulltime'
    })),
    users: Array.isArray(db?.users) && db.users.length > 0 ? db.users : defaultDb.users,
    records: Array.isArray(db?.records) ? db.records : defaultDb.records
  };

  if (!normalized.users.some((user) => user.username === 'admin')) {
    normalized.users.unshift({
      id: Date.now(),
      username: 'admin',
      fullName: '系统管理员',
      role: 'admin',
      employeeId: null,
      passwordHash: hashPassword('Admin@123')
    });
  }

  return normalized;
}

function readJsonStore() {
  ensureJsonFile();
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const normalized = normalizeDbStructure(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2));
  }
  return normalized;
}

function writeJsonStore(db) {
  ensureJsonFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalizeDbStructure(db), null, 2));
}

async function seedMysqlDefaults() {
  await SystemSetting.findOrCreate({ where: { id: 1 }, defaults: { id: 1, workStart: '09:00', workEnd: '18:00', deductPerAbsentDay: 200, currency: 'CNY' } });
  const existingUsers = await User.count();
  if (!existingUsers) {
    await User.bulkCreate([
      { username: 'admin', fullName: '系统管理员', role: 'admin', passwordHash: hashPassword('Admin@123'), employeeId: null },
      { username: 'zhangsan', fullName: '张三', role: 'employee', employeeId: 1, passwordHash: hashPassword('123456') },
      { username: 'lisi', fullName: '李四', role: 'employee', employeeId: 2, passwordHash: hashPassword('123456') },
      { username: 'wangwu', fullName: '王五', role: 'employee', employeeId: 3, passwordHash: hashPassword('123456') }
    ]);
  }

  const existingEmployees = await Employee.count();
  if (!existingEmployees) {
    await Employee.bulkCreate([
      { name: '张三', department: '研发部', position: '前端工程师', baseSalary: 8500, phone: '13800000001', hireDate: '2024-01-10', status: 'active' },
      { name: '李四', department: '运营部', position: '运营专员', baseSalary: 7200, phone: '13800000002', hireDate: '2024-03-15', status: 'active' },
      { name: '王五', department: '销售部', position: '销售顾问', baseSalary: 7800, phone: '13800000003', hireDate: '2024-05-08', status: 'active' }
    ]);
  }
}

async function initStorage() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    await seedMysqlDefaults();
    STORE_MODE = 'mysql';
    console.log('Connected to MySQL successfully.');
  } catch (error) {
    console.warn('MySQL unavailable, falling back to JSON store:', error.message);
    STORE_MODE = 'json';
  }
}

async function loadStore() {
  if (STORE_MODE === 'mysql') {
    const [employees, users, records, settings] = await Promise.all([
      Employee.findAll({ order: [['id', 'ASC']] }),
      User.findAll({ order: [['id', 'ASC']] }),
      AttendanceRecord.findAll({ order: [['date', 'DESC']] }),
      SystemSetting.findOne({ where: { id: 1 } })
    ]);

    return {
      employees: employees.map((item) => item.toJSON()),
      users: users.map((item) => item.toJSON()),
      records: records.map((item) => item.toJSON()),
      settings: settings?.toJSON() || buildDefaultDb().settings
    };
  }

  return readJsonStore();
}

async function saveStore(nextStore) {
  if (STORE_MODE === 'mysql') {
    const { employees, users, records, settings } = nextStore;
    await Promise.all([
      Promise.all(employees.map((employee) => Employee.upsert(employee))),
      Promise.all(users.map((user) => User.upsert(user))),
      Promise.all(records.map((record) => AttendanceRecord.upsert(record))),
      SystemSetting.upsert({ id: 1, ...settings })
    ]);
    return;
  }

  writeJsonStore(nextStore);
}

function getMonthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthDays(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function getAttendanceStatus(clockIn, clockOut) {
  const start = new Date(clockIn);
  const end = new Date(clockOut);
  const startHour = start.getHours();
  const endHour = end.getHours();

  if (startHour > 9 || (startHour === 9 && start.getMinutes() > 0)) {
    return 'late';
  }

  if (endHour < 18) {
    return 'early';
  }

  return 'normal';
}

function calculateMonthlySummary(employee, records, month, settings) {
  const monthRecords = records.filter((record) => record.employeeId === employee.id && getMonthKey(record.date) === month);
  const daysPresent = new Set(monthRecords.map((record) => record.date)).size;
  const lateCount = monthRecords.filter((record) => record.status === 'late').length;
  const earlyCount = monthRecords.filter((record) => record.status === 'early').length;
  const isPartTime = employee.employmentType === 'parttime';

  // 兼职：按天结算，工资 = 出勤天数 × 每日工资，无缺勤扣款；
  // 全职：按月结算，工资 = 月薪 - 缺勤天数 × 每日扣款。
  const absentDays = isPartTime ? 0 : Math.max(getMonthDays(month) - daysPresent, 0);
  const salary = isPartTime
    ? daysPresent * (employee.baseSalary || 0)
    : Math.max((employee.baseSalary || 0) - absentDays * (settings?.deductPerAbsentDay || 200), 0);

  return {
    employeeId: employee.id,
    name: employee.name,
    department: employee.department,
    employmentType: employee.employmentType || 'fulltime',
    baseSalary: employee.baseSalary,
    daysPresent,
    lateCount,
    earlyCount,
    absentDays,
    salary,
    attendanceRate: Math.round((daysPresent / getMonthDays(month)) * 100)
  };
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

function createToken(user) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    fullName: user.fullName,
    employeeId: user.employeeId || null,
    exp: Date.now() + 1000 * 60 * 60 * 8
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${body}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${body}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    if (signature !== expected) return null;
    const payload = JSON.parse(base64UrlDecode(body));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function parseAuthToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const result = verifyToken(authHeader.replace('Bearer ', '').trim());
  return result;
}

function requireAuthenticated(req, res, next) {
  const payload = parseAuthToken(req);
  if (!payload) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  req.user = payload;
  return next();
}

function requireAdmin(req, res, next) {
  const payload = parseAuthToken(req);
  if (!payload) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  if (payload.role !== 'admin') {
    return res.status(403).json({ message: 'Permission denied' });
  }
  req.user = payload;
  return next();
}

app.use(express.json());
app.use('/public', express.static(PUBLIC_DIR));
app.use(express.static(PUBLIC_DIR));
app.use(admin.options.rootPath, adminRouter);

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: STORE_MODE, timestamp: new Date().toISOString() });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const store = await loadStore();
    const user = store.users.find((item) => item.username === String(username || '').trim() && item.passwordHash === hashPassword(String(password || '')));
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    return res.json({
      token: createToken(user),
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        employeeId: user.employeeId || null
      }
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get('/api/auth/me', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  const user = store.users.find((item) => item.id === req.user.sub);
  return res.json({ user: user ? { id: user.id, username: user.username, fullName: user.fullName, role: user.role, employeeId: user.employeeId || null } : null });
});

app.get('/api/settings', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  return res.json({ settings: store.settings });
});

app.put('/api/settings', requireAdmin, async (req, res) => {
  const store = await loadStore();
  store.settings = {
    ...store.settings,
    workStart: req.body.workStart || store.settings.workStart,
    workEnd: req.body.workEnd || store.settings.workEnd,
    deductPerAbsentDay: Number(req.body.deductPerAbsentDay) || store.settings.deductPerAbsentDay,
    currency: req.body.currency || store.settings.currency
  };
  await saveStore(store);
  return res.json({ settings: store.settings });
});

app.get('/api/employees', requireAdmin, async (req, res) => {
  const store = await loadStore();
  return res.json({ employees: store.employees });
});

app.post('/api/employees', requireAdmin, async (req, res) => {
  const store = await loadStore();
  const employee = {
    id: Date.now(),
    name: req.body.name,
    department: req.body.department,
    position: req.body.position,
    employmentType: req.body.employmentType === 'fulltime' ? 'fulltime' : 'parttime',
    baseSalary: Number(req.body.baseSalary) || 0,
    phone: req.body.phone || '',
    hireDate: req.body.hireDate || new Date().toISOString().slice(0, 10),
    status: req.body.status || 'active'
  };
  store.employees.push(employee);
  store.users.push({
    id: Date.now() + 1,
    username: req.body.username || `${employee.name.toLowerCase().replace(/\s+/g, '')}`,
    fullName: employee.name,
    role: 'employee',
    employeeId: employee.id,
    passwordHash: hashPassword(req.body.password || '123456')
  });
  await saveStore(store);
  return res.status(201).json({ employee });
});

app.put('/api/employees/:id', requireAdmin, async (req, res) => {
  const store = await loadStore();
  const employeeIndex = store.employees.findIndex((item) => item.id === Number(req.params.id));
  if (employeeIndex === -1) {
    return res.status(404).json({ message: 'Employee not found' });
  }
  store.employees[employeeIndex] = {
    ...store.employees[employeeIndex],
    ...req.body,
    baseSalary: Number(req.body.baseSalary) || store.employees[employeeIndex].baseSalary
  };
  await saveStore(store);
  return res.json({ employee: store.employees[employeeIndex] });
});

app.delete('/api/employees/:id', requireAdmin, async (req, res) => {
  const store = await loadStore();
  const employeeId = Number(req.params.id);
  store.employees = store.employees.filter((item) => item.id !== employeeId);
  store.records = store.records.filter((record) => record.employeeId !== employeeId);
  store.users = store.users.filter((user) => user.employeeId !== employeeId);
  await saveStore(store);
  return res.json({ message: 'Employee deleted' });
});

app.get('/api/dashboard', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const todayRecords = store.records.filter((record) => record.date === today);
  const totalSalary = store.employees.reduce(
    (sum, employee) => sum + calculateMonthlySummary(employee, store.records, month, store.settings).salary,
    0
  );

  if (req.user.role !== 'admin') {
    const myRecords = store.records.filter((record) => record.employeeId === req.user.employeeId);
    return res.json({ activeEmployees: store.employees.length, todayRecords: myRecords.filter((record) => record.date === today).length, lateCount: todayRecords.filter((record) => record.status === 'late').length, totalSalary, role: req.user.role });
  }

  return res.json({ activeEmployees: store.employees.length, todayRecords: todayRecords.length, lateCount: todayRecords.filter((record) => record.status === 'late').length, totalSalary, role: req.user.role });
});

app.get('/api/records', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  let records = store.records;
  const employeeId = Number(req.query.employeeId);
  if (req.user.role !== 'admin') {
    records = records.filter((record) => record.employeeId === req.user.employeeId);
  } else if (employeeId) {
    records = records.filter((record) => record.employeeId === employeeId);
  }
  records.sort((a, b) => new Date(b.date) - new Date(a.date));
  return res.json({ records });
});

// 考勤日历：所有登录用户都可查看全体员工的打卡时间与状态
app.get('/api/calendar', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const records = store.records
    .filter((record) => record.date && record.date.slice(0, 7) === month)
    .map((record) => {
      const employee = store.employees.find((item) => item.id === record.employeeId);
      return {
        id: record.id,
        employeeId: record.employeeId,
        name: employee ? employee.name : '未知员工',
        department: employee ? employee.department : '',
        date: record.date,
        clockIn: record.clockIn,
        clockOut: record.clockOut,
        status: record.status || 'normal'
      };
    });
  return res.json({ month, records });
});

app.post('/api/clock', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  const employeeId = Number(req.body.employeeId || req.user.employeeId);
  const employee = store.employees.find((item) => item.id === employeeId);
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  let record = store.records.find((item) => item.employeeId === employee.id && item.date === today);

  if (req.body.type === 'in') {
    if (record?.clockIn) {
      return res.status(400).json({ message: 'Today has already occupied clock in' });
    }

    const newRecord = {
      id: Date.now(),
      employeeId: employee.id,
      date: today,
      clockIn: now,
      clockOut: null,
      status: 'normal'
    };

    if (new Date(now).getHours() > 9 || (new Date(now).getHours() === 9 && new Date(now).getMinutes() > 0)) {
      newRecord.status = 'late';
    }

    if (record) {
      record.clockIn = now;
      record.status = newRecord.status;
    } else {
      store.records.push(newRecord);
      record = newRecord;
    }
  } else if (req.body.type === 'out') {
    if (!record || !record.clockIn) {
      return res.status(400).json({ message: 'Please clock in first' });
    }
    if (record.clockOut) {
      return res.status(400).json({ message: 'Clock out already completed' });
    }
    record.clockOut = now;
    record.status = getAttendanceStatus(record.clockIn, now);
  } else {
    return res.status(400).json({ message: 'Invalid type' });
  }

  await saveStore(store);
  return res.json({ employee, record });
});

app.get('/api/month-summary', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const settings = store.settings;
  const summary = store.employees
    .filter((employee) => req.user.role === 'admin' || employee.id === req.user.employeeId)
    .map((employee) => calculateMonthlySummary(employee, store.records, month, settings));
  return res.json({ month, summary, role: req.user.role });
});

app.get('/api/export', requireAdmin, async (req, res) => {
  const store = await loadStore();

  const rows = store.records.map((record) => {
    const employee = store.employees.find((item) => item.id === record.employeeId);
    return {
      员工: employee?.name || '未知员工',
      部门: employee?.department || '-',
      日期: record.date,
      上班时间: record.clockIn || '-',
      下班时间: record.clockOut || '-',
      状态: record.status || 'normal'
    };
  });

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(
    rows.length
      ? rows
      : [{ 员工: '', 部门: '', 日期: '', 上班时间: '', 下班时间: '', 状态: '暂无考勤记录' }]
  );
  XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance');
  const data = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return res.send(data);
});

app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

async function startServer() {
  await initStorage();
  app.listen(PORT, () => {
    console.log(`Enterprise attendance system started on http://localhost:${PORT}`);
    console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
