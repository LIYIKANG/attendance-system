const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, 'data', 'db.json');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'attendance-enterprise-secret-2026';

function hashPassword(password) {
  return crypto.createHash('sha256').update(`attendance-enterprise-${password}`).digest('hex');
}

function buildDefaultDb() {
  const baseEmployees = [
    {
      id: 1,
      name: '张三',
      department: '研发部',
      position: '前端工程师',
      baseSalary: 8500,
      phone: '13800000001',
      hireDate: '2024-01-10',
      status: 'active'
    },
    {
      id: 2,
      name: '李四',
      department: '运营部',
      position: '运营专员',
      baseSalary: 7200,
      phone: '13800000002',
      hireDate: '2024-03-15',
      status: 'active'
    },
    {
      id: 3,
      name: '王五',
      department: '销售部',
      position: '销售顾问',
      baseSalary: 7800,
      phone: '13800000003',
      hireDate: '2024-05-08',
      status: 'active'
    }
  ];

  return {
    settings: {
      workStart: '09:00',
      workEnd: '18:00',
      deductPerAbsentDay: 200,
      currency: 'CNY'
    },
    employees: baseEmployees,
    users: [
      {
        id: 1,
        username: 'admin',
        fullName: '系统管理员',
        role: 'admin',
        employeeId: null,
        passwordHash: hashPassword('Admin@123')
      },
      {
        id: 2,
        username: 'zhangsan',
        fullName: '张三',
        role: 'employee',
        employeeId: 1,
        passwordHash: hashPassword('123456')
      },
      {
        id: 3,
        username: 'lisi',
        fullName: '李四',
        role: 'employee',
        employeeId: 2,
        passwordHash: hashPassword('123456')
      },
      {
        id: 4,
        username: 'wangwu',
        fullName: '王五',
        role: 'employee',
        employeeId: 3,
        passwordHash: hashPassword('123456')
      }
    ],
    records: []
  };
}

function ensureDb() {
  const dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(buildDefaultDb(), null, 2));
  }
}

function normalizeDbStructure(db) {
  const defaultDb = buildDefaultDb();
  const normalized = {
    ...defaultDb,
    ...db,
    settings: {
      ...defaultDb.settings,
      ...(db?.settings || {})
    },
    employees: Array.isArray(db?.employees) ? db.employees : defaultDb.employees,
    records: Array.isArray(db?.records) ? db.records : defaultDb.records,
    users: Array.isArray(db?.users) && db.users.length > 0
      ? db.users
      : defaultDb.users
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

function loadDb() {
  ensureDb();
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const normalized = normalizeDbStructure(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    saveDb(normalized);
  }
  return normalized;
}

function saveDb(db) {
  ensureDb();
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalizeDbStructure(db), null, 2));
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

function calculateMonthlySalary(employee, records, month, settings) {
  const monthRecords = records.filter((record) => record.employeeId === employee.id && getMonthKey(record.date) === month);
  const daysPresent = new Set(monthRecords.map((record) => record.date)).size;
  const lateCount = monthRecords.filter((record) => record.status === 'late').length;
  const earlyCount = monthRecords.filter((record) => record.status === 'early').length;
  const absentDays = getMonthDays(month) - daysPresent;
  const salary = Math.max(employee.baseSalary - absentDays * settings.deductPerAbsentDay, 0);

  return {
    employeeId: employee.id,
    name: employee.name,
    department: employee.department,
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
    if (parts.length !== 3) {
      return null;
    }
    const [header, body, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${body}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(body));
    if (!payload.exp || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

function getAuthenticatedUser(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  return {
    id: payload.sub,
    username: payload.username,
    role: payload.role,
    fullName: payload.fullName,
    employeeId: payload.employeeId
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serveStatic(res, filePath) {
  const safePath = path.normalize(filePath);
  const fullPath = path.join(PUBLIC_DIR, safePath.replace(/^\/+/, ''));

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { message: 'Forbidden' });
    return;
  }

  fs.readFile(fullPath, (error, content) => {
    if (error) {
      sendJson(res, 404, { message: 'Not found' });
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function requireAdmin(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    sendJson(res, 401, { message: 'Unauthorized' });
    return null;
  }
  if (user.role !== 'admin') {
    sendJson(res, 403, { message: 'Permission denied' });
    return null;
  }
  return user;
}

function requireAuthenticated(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    sendJson(res, 401, { message: 'Unauthorized' });
    return null;
  }
  return user;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/') {
    serveStatic(res, 'index.html');
    return;
  }

  if (url.pathname.endsWith('.html')) {
    serveStatic(res, url.pathname.replace(/^\/+/, ''));
    return;
  }

  if (url.pathname.startsWith('/public/')) {
    serveStatic(res, url.pathname.replace('/public/', ''));
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
    return;
  }

  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const db = loadDb();
      const passwordHash = hashPassword(String(body.password || ''));
      const user = db.users.find((item) => item.username === String(body.username || '').trim() && item.passwordHash === passwordHash);

      if (!user) {
        sendJson(res, 401, { message: 'Invalid username or password' });
        return;
      }

      sendJson(res, 200, {
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
      sendJson(res, 400, { message: error.message });
    }
    return;
  }

  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const user = requireAuthenticated(req, res);
    if (!user) {
      return;
    }
    sendJson(res, 200, { user });
    return;
  }

  if (url.pathname === '/api/settings' && req.method === 'GET') {
    const user = requireAuthenticated(req, res);
    if (!user) {
      return;
    }
    const db = loadDb();
    sendJson(res, 200, { settings: db.settings });
    return;
  }

  if (url.pathname === '/api/employees/me' && req.method === 'GET') {
    const user = requireAuthenticated(req, res);
    if (!user) {
      return;
    }

    const db = loadDb();
    const employee = db.employees.find((item) => item.id === user.employeeId);
    if (!employee) {
      sendJson(res, 404, { message: 'Employee profile not found' });
      return;
    }

    sendJson(res, 200, { employee });
    return;
  }

  if (url.pathname === '/api/settings' && req.method === 'PUT') {
    const admin = requireAdmin(req, res);
    if (!admin) {
      return;
    }

    try {
      const body = await parseBody(req);
      const db = loadDb();
      db.settings = {
        ...db.settings,
        workStart: body.workStart || db.settings.workStart,
        workEnd: body.workEnd || db.settings.workEnd,
        deductPerAbsentDay: Number(body.deductPerAbsentDay) || db.settings.deductPerAbsentDay,
        currency: body.currency || db.settings.currency
      };
      saveDb(db);
      sendJson(res, 200, { settings: db.settings });
    } catch (error) {
      sendJson(res, 400, { message: error.message });
    }
    return;
  }

  if (url.pathname === '/api/employees' && req.method === 'GET') {
    const admin = requireAdmin(req, res);
    if (!admin) {
      return;
    }

    const db = loadDb();
    sendJson(res, 200, { employees: db.employees });
    return;
  }

  if (url.pathname === '/api/employees' && req.method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) {
      return;
    }

    try {
      const body = await parseBody(req);
      const db = loadDb();
      const newEmployee = {
        id: Date.now(),
        name: body.name,
        department: body.department,
        position: body.position,
        baseSalary: Number(body.baseSalary) || 0,
        phone: body.phone || '',
        hireDate: body.hireDate || new Date().toISOString().slice(0, 10),
        status: body.status || 'active'
      };
      db.employees.push(newEmployee);
      db.users.push({
        id: Date.now() + 1,
        username: body.username || `${body.name.toLowerCase().replace(/\s+/g, '')}`,
        fullName: body.name,
        role: 'employee',
        employeeId: newEmployee.id,
        passwordHash: hashPassword(body.password || '123456')
      });
      saveDb(db);
      sendJson(res, 201, { employee: newEmployee });
    } catch (error) {
      sendJson(res, 400, { message: error.message });
    }
    return;
  }

  if (url.pathname.startsWith('/api/employees/') && req.method === 'PUT') {
    const admin = requireAdmin(req, res);
    if (!admin) {
      return;
    }

    try {
      const id = Number(url.pathname.split('/').pop());
      const body = await parseBody(req);
      const db = loadDb();
      const employeeIndex = db.employees.findIndex((employee) => employee.id === id);
      if (employeeIndex === -1) {
        sendJson(res, 404, { message: 'Employee not found' });
        return;
      }
      db.employees[employeeIndex] = {
        ...db.employees[employeeIndex],
        ...body,
        baseSalary: Number(body.baseSalary) || db.employees[employeeIndex].baseSalary
      };
      saveDb(db);
      sendJson(res, 200, { employee: db.employees[employeeIndex] });
    } catch (error) {
      sendJson(res, 400, { message: error.message });
    }
    return;
  }

  if (url.pathname.startsWith('/api/employees/') && req.method === 'DELETE') {
    const admin = requireAdmin(req, res);
    if (!admin) {
      return;
    }

    const id = Number(url.pathname.split('/').pop());
    const db = loadDb();
    const employeeIndex = db.employees.findIndex((employee) => employee.id === id);
    if (employeeIndex === -1) {
      sendJson(res, 404, { message: 'Employee not found' });
      return;
    }

    db.employees.splice(employeeIndex, 1);
    db.records = db.records.filter((record) => record.employeeId !== id);
    db.users = db.users.filter((user) => user.employeeId !== id);
    saveDb(db);
    sendJson(res, 200, { message: 'Employee deleted' });
    return;
  }

  if (url.pathname === '/api/dashboard' && req.method === 'GET') {
    const user = requireAuthenticated(req, res);
    if (!user) {
      return;
    }

    const db = loadDb();
    const today = new Date().toISOString().slice(0, 10);
    const todayRecords = db.records.filter((record) => record.date === today);
    const activeEmployees = db.employees.length;
    const lateCount = todayRecords.filter((record) => record.status === 'late').length;
    const totalSalary = db.employees.reduce((sum, employee) => sum + (employee.baseSalary || 0), 0);

    if (user.role !== 'admin') {
      const records = db.records.filter((record) => record.employeeId === user.employeeId);
      sendJson(res, 200, {
        activeEmployees,
        todayRecords: records.filter((record) => record.date === today).length,
        lateCount,
        totalSalary,
        role: user.role,
        myRecords: records
      });
      return;
    }

    sendJson(res, 200, {
      activeEmployees,
      todayRecords: todayRecords.length,
      lateCount,
      totalSalary,
      role: user.role
    });
    return;
  }

  if (url.pathname === '/api/records' && req.method === 'GET') {
    const user = requireAuthenticated(req, res);
    if (!user) {
      return;
    }

    const db = loadDb();
    const employeeId = Number(url.searchParams.get('employeeId'));
    let records = db.records;

    if (user.role !== 'admin') {
      records = records.filter((record) => record.employeeId === user.employeeId);
    } else if (employeeId) {
      records = records.filter((record) => record.employeeId === employeeId);
    }

    sendJson(res, 200, { records: records.sort((a, b) => new Date(b.date) - new Date(a.date)) });
    return;
  }

  if (url.pathname === '/api/clock' && req.method === 'POST') {
    const user = requireAuthenticated(req, res);
    if (!user) {
      return;
    }

    try {
      const body = await parseBody(req);
      const db = loadDb();
      const targetEmployeeId = Number(body.employeeId || user.employeeId);
      const employee = db.employees.find((item) => item.id === targetEmployeeId);
      if (!employee) {
        sendJson(res, 404, { message: 'Employee not found' });
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const now = new Date().toISOString();
      const currentRecord = db.records.find((record) => record.employeeId === employee.id && record.date === today);

      if (body.type === 'in') {
        if (currentRecord?.clockIn) {
          sendJson(res, 400, { message: 'Today has already occupied clock in' });
          return;
        }

        const record = {
          id: Date.now(),
          employeeId: employee.id,
          date: today,
          clockIn: now,
          clockOut: null,
          status: 'normal'
        };
        if (new Date(now).getHours() > 9 || (new Date(now).getHours() === 9 && new Date(now).getMinutes() > 0)) {
          record.status = 'late';
        }

        if (currentRecord) {
          currentRecord.clockIn = now;
          currentRecord.status = record.status;
        } else {
          db.records.push(record);
        }
      } else if (body.type === 'out') {
        if (!currentRecord || !currentRecord.clockIn) {
          sendJson(res, 400, { message: 'Please clock in first' });
          return;
        }
        if (currentRecord.clockOut) {
          sendJson(res, 400, { message: 'Clock out already completed' });
          return;
        }

        currentRecord.clockOut = now;
        currentRecord.status = getAttendanceStatus(currentRecord.clockIn, now);
      } else {
        sendJson(res, 400, { message: 'Invalid type' });
        return;
      }

      saveDb(db);
      const responseRecord = db.records.find((record) => record.employeeId === employee.id && record.date === today);
      sendJson(res, 200, { employee, record: responseRecord, role: user.role });
    } catch (error) {
      sendJson(res, 400, { message: error.message });
    }
    return;
  }

  if (url.pathname === '/api/month-summary' && req.method === 'GET') {
    const user = requireAuthenticated(req, res);
    if (!user) {
      return;
    }

    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const db = loadDb();
    const settings = db.settings;
    const summary = db.employees
      .filter((employee) => user.role === 'admin' || employee.id === user.employeeId)
      .map((employee) => calculateMonthlySalary(employee, db.records, month, settings));

    sendJson(res, 200, { month, summary, role: user.role });
    return;
  }

  sendJson(res, 404, { message: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Attendance enterprise system started on http://localhost:${PORT}`);
});
