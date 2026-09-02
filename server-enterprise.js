const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const multer = require('multer');
const { sequelize } = require('./src/db');
const { Employee, User, AttendanceRecord, AttendanceChange, SystemSetting, EmployeeDocument } = require('./src/models');

const app = express();
if (String(process.env.TRUST_PROXY).toLowerCase() === 'true') app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, 'data', 'db.json');
const UPLOAD_DIR = path.join(ROOT_DIR, 'data', 'uploads');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const TOKEN_SECRET = process.env.JWT_SECRET || 'attendance-enterprise-secret-2026';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';
const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
const EMPLOYEE_LEVELS = ['employee', 'project_manager', 'manager'];
const DOCUMENT_TYPES = ['resume', 'contract'];
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg']);
const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg'
]);
let STORE_MODE = 'json';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const documentStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${extension}`);
  }
});

const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!DOCUMENT_EXTENSIONS.has(extension) || !DOCUMENT_MIME_TYPES.has(file.mimetype)) {
      return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    }
    return callback(null, true);
  }
});

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

function legacyPasswordHash(password) {
  return crypto.createHash('sha256').update(`attendance-enterprise-${password}`).digest('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') return false;
  if (!storedHash.startsWith('scrypt$')) {
    const legacy = legacyPasswordHash(String(password));
    return storedHash.length === legacy.length && crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(legacy));
  }
  const [scheme, salt, expected] = storedHash.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function isStrongPassword(password) {
  return String(password).length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

const DEFAULT_ADMIN_PASSWORD_HASH = hashPassword(DEFAULT_ADMIN_PASSWORD);
const DEFAULT_EMPLOYEE_PASSWORD_HASH = hashPassword('Employee@123');

function recipientPathFor(employees, subjectEmployeeId) {
  const byId = new Map(employees.map((employee) => [Number(employee.id), employee]));
  const pathItems = [];
  const visited = new Set();
  let current = byId.get(Number(subjectEmployeeId));
  while (current?.supervisorId) {
    const supervisor = byId.get(Number(current.supervisorId));
    if (!supervisor || visited.has(supervisor.id)) break;
    visited.add(supervisor.id);
    pathItems.push({ employeeId: supervisor.id, name: supervisor.name, level: employeeLevel(supervisor) });
    current = supervisor;
  }
  return pathItems;
}

function recipientPathFromRecipient(employees, recipientEmployeeId) {
  const recipient = employees.find((employee) => employee.id === Number(recipientEmployeeId));
  return recipient
    ? [{ employeeId: recipient.id, name: recipient.name, level: employeeLevel(recipient) }, ...recipientPathFor(employees, recipient.id)]
    : [];
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
      { id: 1, name: '张三', department: '研发部', position: '前端工程师', employmentType: 'fulltime', level: 'employee', supervisorId: null, baseSalary: 8500, phone: '13800000001', hireDate: '2024-01-10', status: 'active' },
      { id: 2, name: '李四', department: '运营部', position: '运营专员', employmentType: 'fulltime', level: 'employee', supervisorId: null, baseSalary: 7200, phone: '13800000002', hireDate: '2024-03-15', status: 'active' },
      { id: 3, name: '王五', department: '销售部', position: '销售顾问', employmentType: 'parttime', level: 'employee', supervisorId: null, baseSalary: 300, phone: '13800000003', hireDate: '2024-05-08', status: 'active' }
    ],
    users: [
      { id: 1, username: 'admin', fullName: '系统管理员', role: 'admin', employeeId: null, tokenVersion: 0, passwordHash: DEFAULT_ADMIN_PASSWORD_HASH },
      { id: 2, username: 'zhangsan', fullName: '张三', role: 'employee', employeeId: 1, tokenVersion: 0, passwordHash: DEFAULT_EMPLOYEE_PASSWORD_HASH },
      { id: 3, username: 'lisi', fullName: '李四', role: 'employee', employeeId: 2, tokenVersion: 0, passwordHash: DEFAULT_EMPLOYEE_PASSWORD_HASH },
      { id: 4, username: 'wangwu', fullName: '王五', role: 'employee', employeeId: 3, tokenVersion: 0, passwordHash: DEFAULT_EMPLOYEE_PASSWORD_HASH }
    ],
    records: [],
    attendanceChanges: [],
    employeeDocuments: []
  };
}

function ensureJsonFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(buildDefaultDb(), null, 2));
}

function normalizeDbStructure(db) {
  const defaultDb = buildDefaultDb();
  const employees = (Array.isArray(db?.employees) ? db.employees : defaultDb.employees).map((employee) => ({
    ...employee,
    employmentType: employee.employmentType === 'parttime' ? 'parttime' : 'fulltime',
    level: EMPLOYEE_LEVELS.includes(employee.level) ? employee.level : 'employee',
    supervisorId: Number.isSafeInteger(Number(employee.supervisorId)) && Number(employee.supervisorId) > 0 ? Number(employee.supervisorId) : null
  }));
  const users = (Array.isArray(db?.users) && db.users.length > 0 ? db.users : defaultDb.users).map((user) => ({
    ...user,
    tokenVersion: Number.isSafeInteger(Number(user.tokenVersion)) ? Number(user.tokenVersion) : 0
  }));
  const attendanceChanges = (Array.isArray(db?.attendanceChanges) ? db.attendanceChanges : []).map((change) => {
    const subject = employees.find((employee) => employee.id === Number(change.subjectEmployeeId));
    const recipientPath = Array.isArray(change.recipientPath) && change.recipientPath.length
      ? change.recipientPath
      : subject ? recipientPathFor(employees, change.subjectEmployeeId) : recipientPathFromRecipient(employees, change.recipientEmployeeId);
    const readReceipts = Array.isArray(change.readReceipts) && change.readReceipts.length
      ? change.readReceipts
      : change.readAt ? [{ readerKey: change.recipientEmployeeId ? `employee:${change.recipientEmployeeId}` : 'admin:1', readAt: change.readAt }] : [];
    return {
      ...change,
      subjectName: change.subjectName || subject?.name || '已删除员工',
      subjectLevel: EMPLOYEE_LEVELS.includes(change.subjectLevel) ? change.subjectLevel : employeeLevel(subject),
      recipientPath,
      readReceipts
    };
  });
  const employeeDocuments = (Array.isArray(db?.employeeDocuments) ? db.employeeDocuments : [])
    .filter((document) => employees.some((employee) => employee.id === Number(document.employeeId)))
    .map((document) => ({
      ...document,
      employeeId: Number(document.employeeId),
      documentType: DOCUMENT_TYPES.includes(document.documentType) ? document.documentType : 'resume',
      originalName: String(document.originalName || '未命名文件'),
      storedName: path.basename(String(document.storedName || '')),
      mimeType: String(document.mimeType || 'application/octet-stream'),
      size: Math.max(Number(document.size) || 0, 0),
      uploadedAt: document.uploadedAt || new Date().toISOString()
    }))
    .filter((document) => document.storedName);
  const normalized = {
    ...defaultDb,
    ...db,
    settings: { ...defaultDb.settings, ...(db?.settings || {}) },
    employees,
    users,
    records: (Array.isArray(db?.records) ? db.records : defaultDb.records).map((record) => ({
      ...record,
      breaks: Array.isArray(record.breaks) ? record.breaks : []
    })),
    attendanceChanges,
    employeeDocuments
  };

  if (!normalized.users.some((user) => user.username === 'admin')) {
    normalized.users.unshift({
      id: Date.now(),
      username: 'admin',
      fullName: '系统管理员',
      role: 'admin',
      employeeId: null,
      tokenVersion: 0,
      passwordHash: DEFAULT_ADMIN_PASSWORD_HASH
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
  const existingEmployees = await Employee.count();
  if (!existingEmployees) {
    await Employee.bulkCreate([
      { name: '张三', department: '研发部', position: '前端工程师', employmentType: 'fulltime', level: 'employee', baseSalary: 8500, phone: '13800000001', hireDate: '2024-01-10', status: 'active' },
      { name: '李四', department: '运营部', position: '运营专员', employmentType: 'fulltime', level: 'employee', baseSalary: 7200, phone: '13800000002', hireDate: '2024-03-15', status: 'active' },
      { name: '王五', department: '销售部', position: '销售顾问', employmentType: 'parttime', level: 'employee', baseSalary: 300, phone: '13800000003', hireDate: '2024-05-08', status: 'active' }
    ]);
  }

  const existingUsers = await User.count();
  if (!existingUsers) {
    const seededEmployees = await Employee.findAll({ order: [['id', 'ASC']] });
    const employeeIdByName = new Map(seededEmployees.map((employee) => [employee.name, employee.id]));
    const defaultUsers = [
      { username: 'admin', fullName: '系统管理员', role: 'admin', tokenVersion: 0, passwordHash: DEFAULT_ADMIN_PASSWORD_HASH, employeeId: null },
      { username: 'zhangsan', fullName: '张三', role: 'employee', tokenVersion: 0, passwordHash: DEFAULT_EMPLOYEE_PASSWORD_HASH, employeeId: employeeIdByName.get('张三') || null },
      { username: 'lisi', fullName: '李四', role: 'employee', tokenVersion: 0, passwordHash: DEFAULT_EMPLOYEE_PASSWORD_HASH, employeeId: employeeIdByName.get('李四') || null },
      { username: 'wangwu', fullName: '王五', role: 'employee', tokenVersion: 0, passwordHash: DEFAULT_EMPLOYEE_PASSWORD_HASH, employeeId: employeeIdByName.get('王五') || null }
    ];
    await User.bulkCreate(defaultUsers.filter((user) => user.role === 'admin' || user.employeeId));
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
    if (String(process.env.REQUIRE_DATABASE).toLowerCase() === 'true') throw error;
    console.warn('MySQL unavailable, falling back to JSON store:', error.message);
    STORE_MODE = 'json';
  }
}

async function loadStore() {
  if (STORE_MODE === 'mysql') {
    const [employees, users, records, attendanceChanges, employeeDocuments, settings] = await Promise.all([
      Employee.findAll({ order: [['id', 'ASC']] }),
      User.findAll({ order: [['id', 'ASC']] }),
      AttendanceRecord.findAll({ order: [['date', 'DESC']] }),
      AttendanceChange.findAll({ order: [['changedAt', 'DESC']] }),
      EmployeeDocument.findAll({ order: [['uploadedAt', 'DESC']] }),
      SystemSetting.findOne({ where: { id: 1 } })
    ]);

    return normalizeDbStructure({
      employees: employees.map((item) => item.toJSON()),
      users: users.map((item) => item.toJSON()),
      records: records.map((item) => item.toJSON()),
      attendanceChanges: attendanceChanges.map((item) => item.toJSON()),
      employeeDocuments: employeeDocuments.map((item) => item.toJSON()),
      settings: settings?.toJSON() || buildDefaultDb().settings
    });
  }

  return readJsonStore();
}

async function saveStore(nextStore) {
  if (STORE_MODE === 'mysql') {
    const { employees, users, records, attendanceChanges, employeeDocuments, settings } = nextStore;
    await sequelize.transaction(async (transaction) => {
      await Promise.all([
        Promise.all(employees.map((employee) => Employee.upsert(employee, { transaction }))),
        Promise.all(users.map((user) => User.upsert(user, { transaction }))),
        Promise.all(records.map((record) => AttendanceRecord.upsert(record, { transaction }))),
        Promise.all((attendanceChanges || []).map((change) => AttendanceChange.upsert(change, { transaction }))),
        Promise.all((employeeDocuments || []).map((document) => EmployeeDocument.upsert(document, { transaction }))),
        SystemSetting.upsert({ id: 1, ...settings }, { transaction })
      ]);
    });
    return;
  }

  writeJsonStore(nextStore);
}

async function deleteEmployeeFromStore(employeeId) {
  if (STORE_MODE === 'mysql') {
    return sequelize.transaction(async (transaction) => {
      const employee = await Employee.findByPk(employeeId, { transaction });
      if (!employee) return null;
      const reports = await Employee.findAll({ where: { supervisorId: employeeId }, transaction });
      if (reports.length) return { blocked: true, reportNames: reports.map((item) => item.name) };
      const documents = await EmployeeDocument.findAll({ where: { employeeId }, transaction });

      await AttendanceRecord.destroy({ where: { employeeId }, transaction });
      await AttendanceChange.update({ subjectName: employee.name, subjectLevel: employeeLevel(employee) }, { where: { subjectEmployeeId: employeeId }, transaction });
      await EmployeeDocument.destroy({ where: { employeeId }, transaction });
      await User.destroy({ where: { employeeId }, transaction });
      await employee.destroy({ transaction });
      return { deleted: true, storedNames: documents.map((document) => document.storedName) };
    });
  }

  const store = readJsonStore();
  const employeeIndex = store.employees.findIndex((employee) => employee.id === employeeId);
  if (employeeIndex === -1) return null;
  const reports = store.employees.filter((employee) => employee.supervisorId === employeeId);
  if (reports.length) return { blocked: true, reportNames: reports.map((employee) => employee.name) };
  const storedNames = store.employeeDocuments.filter((document) => document.employeeId === employeeId).map((document) => document.storedName);

  store.employees.splice(employeeIndex, 1);
  store.records = store.records.filter((record) => record.employeeId !== employeeId);
  store.users = store.users.filter((user) => user.employeeId !== employeeId);
  store.employeeDocuments = store.employeeDocuments.filter((document) => document.employeeId !== employeeId);
  writeJsonStore(store);
  return { deleted: true, storedNames };
}

function removeStoredDocument(storedName) {
  if (!storedName) return;
  const safeName = path.basename(String(storedName));
  const filePath = path.join(UPLOAD_DIR, safeName);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn(`Unable to remove employee document ${safeName}:`, error.message);
  }
}

function publicEmployeeDocument(document) {
  return {
    id: document.id,
    employeeId: document.employeeId,
    documentType: document.documentType,
    originalName: document.originalName,
    mimeType: document.mimeType,
    size: document.size,
    uploadedAt: document.uploadedAt
  };
}

async function deleteEmployeeDocumentFromStore(documentId) {
  if (STORE_MODE === 'mysql') {
    const document = await EmployeeDocument.findByPk(documentId);
    if (!document) return null;
    const storedName = document.storedName;
    await document.destroy();
    return { storedName };
  }

  const store = readJsonStore();
  const index = store.employeeDocuments.findIndex((document) => document.id === documentId);
  if (index === -1) return null;
  const [document] = store.employeeDocuments.splice(index, 1);
  writeJsonStore(store);
  return { storedName: document.storedName };
}

function uploadSingleDocument(req, res, next) {
  documentUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: '文件不能超过 15MB' });
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: '仅支持 PDF、Word、PNG 和 JPG 文件' });
    }
    return res.status(400).json({ message: '文件上传失败，请重新选择文件' });
  });
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

function getBusinessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getBusinessTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

function employeeLevel(employee) {
  return EMPLOYEE_LEVELS.includes(employee?.level) ? employee.level : 'employee';
}

function isValidMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

function isValidDate(value) {
  const normalized = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function publicUser(user, store) {
  const employee = store.employees.find((item) => item.id === user?.employeeId);
  return user ? {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    employeeId: user.employeeId || null,
    employeeLevel: user.role === 'admin' ? 'admin' : employeeLevel(employee),
    supervisorId: employee?.supervisorId || null
  } : null;
}

function getClockState(record) {
  if (!record?.clockIn) return 'not_started';
  if (record.clockOut) return 'finished';
  const breaks = Array.isArray(record.breaks) ? record.breaks : [];
  return breaks.length && !breaks[breaks.length - 1].end ? 'on_break' : 'working';
}

function getAttendanceStatus(clockIn, clockOut, settings = {}) {
  const startTime = getBusinessTime(new Date(clockIn));
  const endTime = clockOut ? getBusinessTime(new Date(clockOut)) : null;
  if (startTime > (settings.workStart || '09:00')) return 'late';
  if (endTime && endTime < (settings.workEnd || '18:00')) return 'early';
  return 'normal';
}

function validateHierarchy(employees) {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  for (const employee of employees) {
    const level = employeeLevel(employee);
    const supervisorId = employee.supervisorId ? Number(employee.supervisorId) : null;
    if (level === 'manager' && supervisorId) return '管理者不能再指定员工上级';
    if (!supervisorId) continue;
    if (supervisorId === employee.id) return '员工不能选择自己作为上级';
    const supervisor = byId.get(supervisorId);
    if (!supervisor) return `${employee.name} 选择的上级不存在`;
    const requiredLevel = level === 'employee' ? 'project_manager' : 'manager';
    if (employeeLevel(supervisor) !== requiredLevel) {
      return level === 'employee' ? `${employee.name} 的上级必须是项目管理人` : `${employee.name} 的上级必须是管理者`;
    }
  }
  return null;
}

function normalizeEditableRecord(payload) {
  const date = String(payload.date || '');
  if (!isValidDate(date)) throw new Error('请选择有效日期');
  if (date > getBusinessDate()) throw new Error('不能把考勤修改到未来日期');

  const parseDateTime = (value, label, optional = false) => {
    if (!value && optional) return null;
    const normalized = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized) || !normalized.startsWith(`${date}T`)) {
      throw new Error(`${label}必须是所选日期内的有效时间`);
    }
    const parsed = new Date(`${normalized}:00+08:00`);
    if (Number.isNaN(parsed.getTime())) throw new Error(`${label}无效`);
    if (getBusinessDate(parsed) !== date) throw new Error(`${label}包含无效日期`);
    if (parsed.getTime() > Date.now() + 60 * 1000) throw new Error(`${label}不能晚于当前时间`);
    return parsed.toISOString();
  };

  const clockIn = parseDateTime(payload.clockIn, '上班时间');
  const clockOut = parseDateTime(payload.clockOut, '下班时间', true);
  if (clockOut && new Date(clockOut) <= new Date(clockIn)) throw new Error('下班时间必须晚于上班时间');

  const breaks = (Array.isArray(payload.breaks) ? payload.breaks : []).map((item, index) => {
    const start = parseDateTime(item.start, `第 ${index + 1} 次休息开始时间`);
    const end = parseDateTime(item.end, `第 ${index + 1} 次继续上班时间`);
    if (new Date(end) <= new Date(start)) throw new Error(`第 ${index + 1} 次休息结束时间必须晚于开始时间`);
    return { start, end };
  }).sort((a, b) => new Date(a.start) - new Date(b.start));

  let cursor = new Date(clockIn);
  for (const item of breaks) {
    if (new Date(item.start) < cursor) throw new Error('休息时段不能重叠或早于上班时间');
    if (clockOut && new Date(item.end) > new Date(clockOut)) throw new Error('休息结束时间不能晚于下班时间');
    cursor = new Date(item.end);
  }

  return { date, clockIn, clockOut, breaks };
}

function attendanceSnapshot(record) {
  return {
    date: record.date,
    clockIn: record.clockIn || null,
    clockOut: record.clockOut || null,
    breaks: Array.isArray(record.breaks) ? record.breaks : []
  };
}

function canViewAttendanceChange(user, change, store) {
  if (user.role === 'admin') return true;
  const employeeId = Number(user.employeeId);
  if (!employeeId) return false;
  if (change.subjectEmployeeId === employeeId) return true;
  return (Array.isArray(change.recipientPath) ? change.recipientPath : []).some((item) => Number(item.employeeId) === employeeId);
}

function changeReaderKey(user) {
  return user.role === 'admin' ? `admin:${user.sub}` : `employee:${user.employeeId}`;
}

function isChangeActor(user, change) {
  if (change.actorUserId) return Number(change.actorUserId) === Number(user.sub);
  return user.role !== 'admin' && Number(change.actorEmployeeId) === Number(user.employeeId);
}

function decorateAttendanceChange(change, store, viewer = null) {
  const subject = store.employees.find((employee) => employee.id === change.subjectEmployeeId);
  const recipient = store.employees.find((employee) => employee.id === change.recipientEmployeeId);
  const readReceipt = viewer ? (change.readReceipts || []).find((item) => item.readerKey === changeReaderKey(viewer)) : null;
  return {
    ...change,
    subjectName: change.subjectName || subject?.name || '已删除员工',
    subjectLevel: change.subjectLevel || employeeLevel(subject),
    recipientName: change.recipientPath?.[0]?.name || recipient?.name || (change.recipientRole === 'admin' ? '系统管理员' : '—'),
    readAt: readReceipt?.readAt || null
  };
}

function getMonthKey(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}/.test(date)) return date.slice(0, 7);
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthDays(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function requiredWorkDates(month, hireDate) {
  if (!isValidMonth(month)) return [];
  const today = getBusinessDate();
  const currentMonth = today.slice(0, 7);
  if (month > currentMonth) return [];
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = getMonthDays(month);
  const cutoffDay = month === currentMonth ? Number(today.slice(8, 10)) : lastDay;
  if (hireDate && hireDate.slice(0, 7) > month) return [];
  const startDay = hireDate?.slice(0, 7) === month ? Number(hireDate.slice(8, 10)) : 1;
  const result = [];
  for (let day = Math.max(startDay, 1); day <= cutoffDay; day += 1) {
    const weekday = new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay();
    if (weekday >= 1 && weekday <= 5) result.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  return result;
}

function calculateMonthlySummary(employee, records, month, settings) {
  const monthRecords = records.filter((record) => record.employeeId === employee.id && getMonthKey(record.date) === month);
  const presentDates = new Set(monthRecords.map((record) => record.date));
  const daysPresent = presentDates.size;
  const lateCount = monthRecords.filter((record) => record.status === 'late').length;
  const earlyCount = monthRecords.filter((record) => record.status === 'early').length;
  const isPartTime = employee.employmentType === 'parttime';
  const workDates = requiredWorkDates(month, employee.hireDate);
  const requiredWorkDays = workDates.length;
  const presentWorkDays = workDates.filter((date) => presentDates.has(date)).length;

  // 兼职：按天结算，工资 = 出勤天数 × 每日工资，无缺勤扣款；
  // 全职：仅按已发生的周一至周五计算缺勤，不扣未来日期与周末。
  const absentDays = isPartTime ? 0 : Math.max(requiredWorkDays - presentWorkDays, 0);
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
    requiredWorkDays,
    lateCount,
    earlyCount,
    absentDays,
    salary,
    attendanceRate: requiredWorkDays ? Math.round((presentWorkDays / requiredWorkDays) * 100) : 0
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
    tokenVersion: Number(user.tokenVersion) || 0,
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

async function currentRequestUser(req) {
  const payload = parseAuthToken(req);
  if (!payload) return null;
  const store = await loadStore();
  const user = store.users.find((item) => Number(item.id) === Number(payload.sub));
  if (!user || Number(user.tokenVersion || 0) !== Number(payload.tokenVersion || 0)) return null;
  const employee = user.role === 'admin' ? null : store.employees.find((item) => item.id === Number(user.employeeId));
  if (user.role !== 'admin' && (!employee || employee.status !== 'active')) return null;
  return {
    ...payload,
    username: user.username,
    role: user.role,
    fullName: user.fullName,
    employeeId: user.employeeId || null,
    tokenVersion: Number(user.tokenVersion) || 0
  };
}

async function requireAuthenticated(req, res, next) {
  const user = await currentRequestUser(req);
  if (!user) return res.status(401).json({ message: '登录已失效，请重新登录' });
  req.user = user;
  return next();
}

async function requireAdmin(req, res, next) {
  const user = await currentRequestUser(req);
  if (!user) return res.status(401).json({ message: '登录已失效，请重新登录' });
  if (user.role !== 'admin') return res.status(403).json({ message: 'Permission denied' });
  req.user = user;
  return next();
}

app.use(express.json({ limit: '100kb' }));
app.use('/public', express.static(PUBLIC_DIR));
app.use(express.static(PUBLIC_DIR));

app.get(['/admin', '/admin/'], (req, res) => res.redirect('/login.html'));

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

app.get('/api/health', async (req, res) => {
  try {
    if (STORE_MODE === 'mysql') await sequelize.authenticate();
    res.json({ status: 'ok', mode: STORE_MODE, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'error', mode: STORE_MODE, message: '数据库连接不可用' });
  }
});

const loginAttempts = new Map();

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const loginKey = `${req.ip}:${String(username || '').trim().toLowerCase()}`;
    const now = Date.now();
    if (loginAttempts.size > 1000) {
      for (const [key, value] of loginAttempts) {
        if (value.resetAt <= now) loginAttempts.delete(key);
      }
    }
    const attempt = loginAttempts.get(loginKey);
    if (attempt && attempt.resetAt > now && attempt.count >= 5) {
      return res.status(429).json({ message: '登录失败次数过多，请 15 分钟后再试' });
    }
    if (attempt?.resetAt <= now) loginAttempts.delete(loginKey);
    const store = await loadStore();
    const user = store.users.find((item) => item.username === String(username || '').trim());
    const employee = user?.role === 'admin' ? null : store.employees.find((item) => item.id === Number(user?.employeeId));
    if (!user || !verifyPassword(password, user.passwordHash) || (user.role !== 'admin' && (!employee || employee.status !== 'active'))) {
      const current = loginAttempts.get(loginKey);
      loginAttempts.set(loginKey, { count: (current?.count || 0) + 1, resetAt: current?.resetAt || now + 15 * 60 * 1000 });
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    loginAttempts.delete(loginKey);

    if (!user.passwordHash.startsWith('scrypt$')) {
      user.passwordHash = hashPassword(password);
      await saveStore(store);
    }

    return res.json({
      token: createToken(user),
      user: publicUser(user, store)
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get('/api/auth/me', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  const user = store.users.find((item) => item.id === req.user.sub);
  return res.json({ user: publicUser(user, store) });
});

app.put('/api/auth/password', requireAuthenticated, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ message: '新密码至少 8 位，并同时包含字母和数字' });
  }
  if (currentPassword === newPassword) return res.status(400).json({ message: '新密码不能与当前密码相同' });
  const store = await loadStore();
  const user = store.users.find((item) => Number(item.id) === Number(req.user.sub));
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(400).json({ message: '当前密码不正确' });
  }
  user.passwordHash = hashPassword(newPassword);
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  await saveStore(store);
  return res.json({ token: createToken(user), user: publicUser(user, store) });
});

app.get('/api/settings', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  return res.json({ settings: store.settings });
});

app.put('/api/settings', requireAdmin, async (req, res) => {
  const store = await loadStore();
  const workStart = String(req.body.workStart || '');
  const workEnd = String(req.body.workEnd || '');
  const deductPerAbsentDay = Number(req.body.deductPerAbsentDay);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(workStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(workEnd) || workStart >= workEnd) {
    return res.status(400).json({ message: '请设置有效的上下班时间，且下班时间必须晚于上班时间' });
  }
  if (!Number.isFinite(deductPerAbsentDay) || deductPerAbsentDay < 0) {
    return res.status(400).json({ message: '缺勤扣款不能小于 0' });
  }
  store.settings = {
    ...store.settings,
    workStart,
    workEnd,
    deductPerAbsentDay,
    currency: req.body.currency || store.settings.currency
  };
  await saveStore(store);
  return res.json({ settings: store.settings });
});

app.get('/api/employees', requireAdmin, async (req, res) => {
  const store = await loadStore();
  const counts = new Map();
  store.employeeDocuments.forEach((document) => counts.set(document.employeeId, (counts.get(document.employeeId) || 0) + 1));
  return res.json({ employees: store.employees.map((employee) => ({ ...employee, documentCount: counts.get(employee.id) || 0 })) });
});

app.get('/api/employees/:id/documents', requireAdmin, async (req, res) => {
  const employeeId = Number(req.params.id);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) return res.status(400).json({ message: '员工编号无效' });
  const store = await loadStore();
  const employee = store.employees.find((item) => item.id === employeeId);
  if (!employee) return res.status(404).json({ message: '未找到该员工' });
  const documents = store.employeeDocuments
    .filter((document) => document.employeeId === employeeId)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .map(publicEmployeeDocument);
  return res.json({ employee: { id: employee.id, name: employee.name }, documents });
});

app.post('/api/employees/:id/documents', requireAdmin, async (req, res, next) => {
  const employeeId = Number(req.params.id);
  const documentType = String(req.query.type || '');
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) return res.status(400).json({ message: '员工编号无效' });
  if (!DOCUMENT_TYPES.includes(documentType)) return res.status(400).json({ message: '请选择简历或合同类型' });
  const store = await loadStore();
  const employee = store.employees.find((item) => item.id === employeeId);
  if (!employee) return res.status(404).json({ message: '未找到该员工' });
  req.employeeDocumentContext = { employeeId, documentType };
  return uploadSingleDocument(req, res, next);
}, async (req, res, next) => {
  if (!req.file) return res.status(400).json({ message: '请选择要上传的文件' });
  const { employeeId, documentType } = req.employeeDocumentContext;
  try {
    const store = await loadStore();
    if (!store.employees.some((employee) => employee.id === employeeId)) {
      removeStoredDocument(req.file.filename);
      return res.status(404).json({ message: '未找到该员工' });
    }
    const document = {
      id: nextId(store.employeeDocuments),
      employeeId,
      documentType,
      originalName: path.basename(String(req.file.originalname || '未命名文件')).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || '未命名文件',
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    };
    store.employeeDocuments.push(document);
    await saveStore(store);
    return res.status(201).json({ document: publicEmployeeDocument(document) });
  } catch (error) {
    removeStoredDocument(req.file.filename);
    return next(error);
  }
});

app.get('/api/employee-documents/:id/download', requireAdmin, async (req, res) => {
  const documentId = Number(req.params.id);
  if (!Number.isSafeInteger(documentId) || documentId <= 0) return res.status(400).json({ message: '文件编号无效' });
  const store = await loadStore();
  const document = store.employeeDocuments.find((item) => item.id === documentId);
  if (!document) return res.status(404).json({ message: '未找到该文件' });
  const filePath = path.join(UPLOAD_DIR, path.basename(document.storedName));
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: '文件内容不存在，请重新上传' });
  return res.download(filePath, document.originalName);
});

app.delete('/api/employee-documents/:id', requireAdmin, async (req, res) => {
  const documentId = Number(req.params.id);
  if (!Number.isSafeInteger(documentId) || documentId <= 0) return res.status(400).json({ message: '文件编号无效' });
  const result = await deleteEmployeeDocumentFromStore(documentId);
  if (!result) return res.status(404).json({ message: '未找到该文件' });
  removeStoredDocument(result.storedName);
  return res.json({ message: '文件已删除' });
});

app.put('/api/hierarchy', requireAdmin, async (req, res) => {
  const store = await loadStore();
  const assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];
  const assignmentMap = new Map(assignments.map((item) => [Number(item.id), item]));
  if (!assignments.length || assignmentMap.size !== assignments.length) {
    return res.status(400).json({ message: '请提交完整且不重复的员工等级设置' });
  }

  const updated = store.employees.map((employee) => {
    const assignment = assignmentMap.get(employee.id);
    if (!assignment) return employee;
    return {
      ...employee,
      level: EMPLOYEE_LEVELS.includes(assignment.level) ? assignment.level : 'employee',
      supervisorId: assignment.supervisorId ? Number(assignment.supervisorId) : null
    };
  });

  if (assignmentMap.size !== store.employees.length) {
    return res.status(400).json({ message: '必须为每一位员工设置等级与汇报关系' });
  }
  const hierarchyError = validateHierarchy(updated);
  if (hierarchyError) return res.status(400).json({ message: hierarchyError });

  const unassigned = updated.find((employee) => employeeLevel(employee) !== 'manager' && !employee.supervisorId);
  if (unassigned) return res.status(400).json({ message: `${unassigned.name} 尚未选择直属上级` });

  store.employees = updated;
  await saveStore(store);
  return res.json({ employees: store.employees });
});

app.post('/api/employees', requireAdmin, async (req, res) => {
  const store = await loadStore();
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: '员工姓名不能为空' });
  if (name.length > 100) return res.status(400).json({ message: '员工姓名不能超过 100 个字符' });
  const department = String(req.body.department || '').trim();
  const position = String(req.body.position || '').trim();
  if (!department || !position) return res.status(400).json({ message: '部门和岗位不能为空' });
  if (department.length > 100 || position.length > 100) return res.status(400).json({ message: '部门和岗位不能超过 100 个字符' });
  const username = String(req.body.username || name.toLowerCase().replace(/\s+/g, '')).trim();
  if (!username) return res.status(400).json({ message: '登录用户名不能为空' });
  if (username.length > 64) return res.status(400).json({ message: '登录用户名不能超过 64 个字符' });
  if (store.users.some((user) => user.username === username)) return res.status(409).json({ message: '登录用户名已存在' });
  const password = String(req.body.password || '');
  if (!isStrongPassword(password)) return res.status(400).json({ message: '登录密码至少 8 位，并同时包含字母和数字' });
  const baseSalary = Number(req.body.baseSalary);
  if (!Number.isFinite(baseSalary) || baseSalary < 0) return res.status(400).json({ message: '工资必须是大于或等于 0 的数字' });
  const hireDate = String(req.body.hireDate || getBusinessDate());
  if (!isValidDate(hireDate) || hireDate > getBusinessDate()) return res.status(400).json({ message: '请选择有效且不晚于今天的入职日期' });
  if (req.body.employmentType && !['fulltime', 'parttime'].includes(req.body.employmentType)) {
    return res.status(400).json({ message: '用工类型无效' });
  }
  const phone = String(req.body.phone || '').trim();
  if (phone.length > 30) return res.status(400).json({ message: '电话号码不能超过 30 个字符' });
  const level = EMPLOYEE_LEVELS.includes(req.body.level) ? req.body.level : 'employee';
  const supervisorId = req.body.supervisorId ? Number(req.body.supervisorId) : null;
  if (supervisorId && (!Number.isSafeInteger(supervisorId) || supervisorId <= 0)) {
    return res.status(400).json({ message: '直属上级无效' });
  }
  const employee = {
    id: nextId(store.employees),
    name,
    department,
    position,
    employmentType: req.body.employmentType === 'fulltime' ? 'fulltime' : 'parttime',
    level,
    supervisorId,
    baseSalary,
    phone,
    hireDate,
    status: 'active'
  };
  const hierarchyError = validateHierarchy([ ...store.employees, employee ]);
  if (hierarchyError) return res.status(400).json({ message: hierarchyError });
  if (level !== 'manager' && !supervisorId) {
    return res.status(400).json({ message: `${employee.name} 尚未选择直属上级` });
  }
  store.employees.push(employee);
  store.users.push({
    id: nextId(store.users),
    username,
    fullName: employee.name,
    role: 'employee',
    employeeId: employee.id,
    tokenVersion: 0,
    passwordHash: hashPassword(password)
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
  const current = store.employees[employeeIndex];
  const name = req.body.name === undefined ? current.name : String(req.body.name).trim();
  const department = req.body.department === undefined ? current.department : String(req.body.department).trim();
  const position = req.body.position === undefined ? current.position : String(req.body.position).trim();
  if (!name || !department || !position) return res.status(400).json({ message: '姓名、部门和岗位不能为空' });
  if (name.length > 100 || department.length > 100 || position.length > 100) return res.status(400).json({ message: '姓名、部门和岗位不能超过 100 个字符' });
  const baseSalary = req.body.baseSalary === undefined ? Number(current.baseSalary) : Number(req.body.baseSalary);
  if (!Number.isFinite(baseSalary) || baseSalary < 0) return res.status(400).json({ message: '工资必须是大于或等于 0 的数字' });
  const hireDate = String(req.body.hireDate || current.hireDate || '');
  if (!isValidDate(hireDate) || hireDate > getBusinessDate()) return res.status(400).json({ message: '请选择有效且不晚于今天的入职日期' });
  if (req.body.employmentType !== undefined && !['fulltime', 'parttime'].includes(req.body.employmentType)) {
    return res.status(400).json({ message: '用工类型无效' });
  }
  const phone = req.body.phone === undefined ? current.phone : String(req.body.phone || '').trim();
  if (String(phone || '').length > 30) return res.status(400).json({ message: '电话号码不能超过 30 个字符' });
  const level = req.body.level === undefined ? employeeLevel(current) : req.body.level;
  if (!EMPLOYEE_LEVELS.includes(level)) return res.status(400).json({ message: '员工等级无效' });
  const supervisorId = req.body.supervisorId === undefined
    ? current.supervisorId || null
    : req.body.supervisorId ? Number(req.body.supervisorId) : null;
  if (supervisorId && (!Number.isSafeInteger(supervisorId) || supervisorId <= 0)) {
    return res.status(400).json({ message: '直属上级无效' });
  }
  const updatedEmployee = {
    ...current,
    name,
    department,
    position,
    level,
    supervisorId,
    employmentType: req.body.employmentType === undefined ? current.employmentType : req.body.employmentType === 'fulltime' ? 'fulltime' : 'parttime',
    baseSalary,
    phone,
    hireDate
  };
  const updatedEmployees = store.employees.map((employee, index) => index === employeeIndex ? updatedEmployee : employee);
  const hierarchyError = validateHierarchy(updatedEmployees);
  if (hierarchyError) return res.status(400).json({ message: hierarchyError });
  if (level !== 'manager' && !supervisorId) {
    return res.status(400).json({ message: `${updatedEmployee.name} 尚未选择直属上级` });
  }
  store.employees[employeeIndex] = updatedEmployee;
  const linkedUser = store.users.find((user) => user.employeeId === current.id);
  if (linkedUser) linkedUser.fullName = store.employees[employeeIndex].name;
  await saveStore(store);
  return res.json({ employee: store.employees[employeeIndex] });
});

app.delete('/api/employees/:id', requireAdmin, async (req, res) => {
  const employeeId = Number(req.params.id);

  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
    return res.status(400).json({ message: 'Invalid employee id' });
  }

  const result = await deleteEmployeeFromStore(employeeId);
  if (!result) {
    return res.status(404).json({ message: 'Employee not found' });
  }
  if (result.blocked) {
    return res.status(409).json({ message: `请先为以下下属重新指定直属上级：${result.reportNames.join('、')}` });
  }

  (result.storedNames || []).forEach(removeStoredDocument);

  return res.json({ message: 'Employee deleted' });
});

app.get('/api/dashboard', requireAdmin, async (req, res) => {
  const store = await loadStore();
  const today = getBusinessDate();
  const month = today.slice(0, 7);
  const todayRecords = store.records.filter((record) => record.date === today);
  const totalSalary = store.employees.reduce(
    (sum, employee) => sum + calculateMonthlySummary(employee, store.records, month, store.settings).salary,
    0
  );

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

app.put('/api/records/:id', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  const record = store.records.find((item) => item.id === Number(req.params.id));
  if (!record) return res.status(404).json({ message: '未找到该考勤记录' });
  if (req.user.role !== 'admin' && record.employeeId !== Number(req.user.employeeId)) {
    return res.status(403).json({ message: '只能修改自己的考勤记录' });
  }
  if (record.date === getBusinessDate() && getClockState(record) !== 'finished') {
    return res.status(400).json({ message: '当天尚未下班，不能从历史记录修改' });
  }

  const reason = String(req.body.reason || '').trim();
  if (reason.length < 2) return res.status(400).json({ message: '请填写至少 2 个字的修改原因' });

  let updated;
  try {
    updated = normalizeEditableRecord(req.body);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  const duplicate = store.records.find((item) => item.id !== record.id && item.employeeId === record.employeeId && item.date === updated.date);
  if (duplicate) return res.status(409).json({ message: '该员工在目标日期已经有考勤记录' });

  const beforeData = attendanceSnapshot(record);
  if (JSON.stringify(beforeData) === JSON.stringify(updated)) {
    return res.status(400).json({ message: '修改后的内容与原记录相同' });
  }

  Object.assign(record, updated, { status: getAttendanceStatus(updated.clockIn, updated.clockOut, store.settings) });
  const subject = store.employees.find((employee) => employee.id === record.employeeId);
  const actorEmployeeId = req.user.role === 'admin' ? null : Number(req.user.employeeId);
  const recipientEmployeeId = subject?.supervisorId || null;
  const recipientPath = recipientPathFor(store.employees, record.employeeId);
  const change = {
    id: nextId(store.attendanceChanges),
    recordId: record.id,
    subjectEmployeeId: record.employeeId,
    actorUserId: req.user.sub,
    actorEmployeeId,
    actorName: req.user.fullName,
    subjectName: subject?.name || '已删除员工',
    subjectLevel: employeeLevel(subject),
    recipientEmployeeId,
    recipientRole: recipientEmployeeId ? employeeLevel(store.employees.find((employee) => employee.id === recipientEmployeeId)) : 'admin',
    recipientPath,
    readReceipts: [],
    reason,
    beforeData,
    afterData: attendanceSnapshot(record),
    changedAt: new Date().toISOString(),
    readAt: null
  };
  store.attendanceChanges.push(change);
  await saveStore(store);
  return res.json({ record, change: decorateAttendanceChange(change, store, req.user) });
});

app.get('/api/attendance-changes', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  const changes = store.attendanceChanges
    .filter((change) => canViewAttendanceChange(req.user, change, store))
    .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
    .map((change) => decorateAttendanceChange(change, store, req.user));
  return res.json({ changes, unreadCount: changes.filter((change) => !change.readAt && !isChangeActor(req.user, change)).length });
});

app.put('/api/attendance-changes/:id/read', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  const change = store.attendanceChanges.find((item) => item.id === Number(req.params.id));
  if (!change) return res.status(404).json({ message: '未找到修改记录' });
  if (!canViewAttendanceChange(req.user, change, store)) return res.status(403).json({ message: '无权查看该修改记录' });
  if (isChangeActor(req.user, change)) return res.status(400).json({ message: '不能把自己的修改标记为上级已读' });
  change.readReceipts = Array.isArray(change.readReceipts) ? change.readReceipts : [];
  const readerKey = changeReaderKey(req.user);
  if (!change.readReceipts.some((item) => item.readerKey === readerKey)) {
    change.readReceipts.push({ readerKey, readAt: new Date().toISOString() });
  }
  await saveStore(store);
  return res.json({ change: decorateAttendanceChange(change, store, req.user) });
});

app.get('/api/calendar', requireAdmin, async (req, res) => {
  const store = await loadStore();
  const month = req.query.month || getBusinessDate().slice(0, 7);
  if (!isValidMonth(month)) return res.status(400).json({ message: '月份格式无效' });
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

app.get('/api/clock/today', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  const requestedEmployeeId = Number(req.query.employeeId || req.user.employeeId);
  const employeeId = req.user.role === 'admin' ? requestedEmployeeId : Number(req.user.employeeId);
  const employee = store.employees.find((item) => item.id === employeeId);
  if (!employee) return res.status(404).json({ message: '未找到员工信息' });
  const record = store.records.find((item) => item.employeeId === employeeId && item.date === getBusinessDate()) || null;
  return res.json({ employee, record, clockState: getClockState(record), serverTime: new Date().toISOString() });
});

app.post('/api/clock', requireAuthenticated, async (req, res) => {
  const store = await loadStore();
  const requestedEmployeeId = Number(req.body.employeeId || req.user.employeeId);
  const employeeId = req.user.role === 'admin' ? requestedEmployeeId : Number(req.user.employeeId);
  const employee = store.employees.find((item) => item.id === employeeId);
  if (!employee) return res.status(404).json({ message: '未找到员工信息' });

  const today = getBusinessDate();
  const now = new Date().toISOString();
  let record = store.records.find((item) => item.employeeId === employee.id && item.date === today);
  const action = req.body.type;
  const state = getClockState(record);

  if (action === 'in') {
    if (state !== 'not_started') return res.status(400).json({ message: '今天已经上班打卡' });
    record = {
      id: nextId(store.records),
      employeeId: employee.id,
      date: today,
      clockIn: now,
      clockOut: null,
      breaks: [],
      status: getAttendanceStatus(now, null, store.settings)
    };
    store.records.push(record);
  } else if (action === 'break') {
    if (state !== 'working') return res.status(400).json({ message: '只有工作中才能开始休息' });
    record.breaks = Array.isArray(record.breaks) ? record.breaks : [];
    record.breaks.push({ start: now, end: null });
  } else if (action === 'resume') {
    if (state !== 'on_break') return res.status(400).json({ message: '当前不在休息状态' });
    record.breaks[record.breaks.length - 1].end = now;
  } else if (action === 'out') {
    if (state === 'not_started') return res.status(400).json({ message: '请先上班打卡' });
    if (state === 'on_break') return res.status(400).json({ message: '请先点击继续上班，再进行下班打卡' });
    if (state === 'finished') return res.status(400).json({ message: '今天已经完成下班打卡' });
    record.clockOut = now;
    record.status = getAttendanceStatus(record.clockIn, now, store.settings);
  } else {
    return res.status(400).json({ message: '无效的打卡操作' });
  }

  await saveStore(store);
  return res.json({ employee, record, clockState: getClockState(record), serverTime: now });
});

app.get('/api/month-summary', requireAdmin, async (req, res) => {
  const store = await loadStore();
  const month = req.query.month || getBusinessDate().slice(0, 7);
  if (!isValidMonth(month)) return res.status(400).json({ message: '月份格式无效' });
  const settings = store.settings;
  const summary = store.employees.map((employee) => calculateMonthlySummary(employee, store.records, month, settings));
  return res.json({ month, summary, role: req.user.role });
});

app.get('/api/export', requireAdmin, async (req, res) => {
  const store = await loadStore();

  const rows = store.records.map((record) => {
    const employee = store.employees.find((item) => item.id === record.employeeId);
    const breaks = Array.isArray(record.breaks) ? record.breaks : [];
    const breakMinutes = breaks.reduce((sum, item) => item.start && item.end ? sum + Math.max((new Date(item.end) - new Date(item.start)) / 60000, 0) : sum, 0);
    return {
      员工: employee?.name || '未知员工',
      部门: employee?.department || '-',
      员工等级: employeeLevel(employee),
      日期: record.date,
      上班时间: record.clockIn || '-',
      下班时间: record.clockOut || '-',
      休息次数: breaks.length,
      休息分钟: Math.round(breakMinutes),
      修改次数: store.attendanceChanges.filter((change) => change.recordId === record.id).length,
      状态: record.status || 'normal'
    };
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '企业打卡系统';
  workbook.created = new Date();
  const addObjectSheet = (name, sourceRows, emptyRow) => {
    const dataRows = sourceRows.length ? sourceRows : [emptyRow];
    const worksheet = workbook.addWorksheet(name);
    const keys = Object.keys(dataRows[0]);
    worksheet.columns = keys.map((key) => ({ header: key, key, width: Math.min(Math.max(key.length * 2 + 4, 14), 36) }));
    worksheet.addRows(dataRows);
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle' };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: keys.length } };
    return worksheet;
  };
  addObjectSheet('Attendance', rows, { 员工: '', 部门: '', 日期: '', 上班时间: '', 下班时间: '', 状态: '暂无考勤记录' });
  const changeRows = store.attendanceChanges.map((change) => ({
    员工: change.subjectName || store.employees.find((employee) => employee.id === change.subjectEmployeeId)?.name || '已删除员工',
    操作人: change.actorName,
    修改前日期: change.beforeData?.date || '-',
    修改后日期: change.afterData?.date || '-',
    修改前上班: change.beforeData?.clockIn || '-',
    修改后上班: change.afterData?.clockIn || '-',
    修改前下班: change.beforeData?.clockOut || '-',
    修改后下班: change.afterData?.clockOut || '-',
    修改原因: change.reason,
    修改时间: change.changedAt,
    上报链路: (change.recipientPath || []).map((item) => item.name).join(' → ') || '系统管理员',
    查看记录: (change.readReceipts || []).map((item) => `${item.readerKey}: ${item.readAt}`).join('；') || '未查看'
  }));
  addObjectSheet('Change audit', changeRows, { 修改记录: '暂无修改记录' });
  const data = await workbook.xlsx.writeBuffer();

  res.setHeader('Content-Disposition', 'attachment; filename="attendance-report.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return res.send(Buffer.from(data));
});

app.use('/api', (req, res) => {
  res.status(404).json({ message: '接口不存在' });
});

app.use((error, req, res, next) => {
  console.error('Request failed:', error);
  if (req.path.startsWith('/api/')) return res.status(500).json({ message: '服务器处理请求失败，请稍后重试' });
  return next(error);
});

app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === 'attendance-enterprise-secret-2026') {
      throw new Error('生产环境必须设置至少 32 位的随机 JWT_SECRET');
    }
    if (!process.env.ADMIN_PASSWORD || !isStrongPassword(process.env.ADMIN_PASSWORD)) {
      throw new Error('生产环境必须设置至少 8 位且包含字母和数字的 ADMIN_PASSWORD');
    }
    if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === '123456') {
      throw new Error('生产环境必须设置非默认的强 DB_PASSWORD');
    }
  }
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
