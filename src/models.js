const { DataTypes } = require('sequelize');
const { sequelize } = require('./db');

const Employee = sequelize.define('Employee', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  department: { type: DataTypes.STRING, allowNull: false },
  position: { type: DataTypes.STRING, allowNull: false },
  baseSalary: { type: DataTypes.FLOAT, allowNull: false },
  employmentType: { type: DataTypes.STRING, defaultValue: 'parttime' },
  level: { type: DataTypes.STRING, defaultValue: 'employee' },
  supervisorId: { type: DataTypes.INTEGER, allowNull: true },
  phone: { type: DataTypes.STRING },
  hireDate: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.STRING, defaultValue: 'active' }
});

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  username: { type: DataTypes.STRING, unique: true, allowNull: false },
  fullName: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  employeeId: { type: DataTypes.INTEGER, allowNull: true }
});

const AttendanceRecord = sequelize.define('AttendanceRecord', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employeeId: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  clockIn: { type: DataTypes.DATE },
  clockOut: { type: DataTypes.DATE },
  breaks: { type: DataTypes.JSON, defaultValue: [] },
  status: { type: DataTypes.STRING }
});

const AttendanceChange = sequelize.define('AttendanceChange', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  recordId: { type: DataTypes.INTEGER, allowNull: false },
  subjectEmployeeId: { type: DataTypes.INTEGER, allowNull: false },
  actorUserId: { type: DataTypes.INTEGER, allowNull: true },
  actorEmployeeId: { type: DataTypes.INTEGER, allowNull: true },
  actorName: { type: DataTypes.STRING, allowNull: false },
  subjectName: { type: DataTypes.STRING, allowNull: true },
  subjectLevel: { type: DataTypes.STRING, allowNull: true },
  recipientEmployeeId: { type: DataTypes.INTEGER, allowNull: true },
  recipientRole: { type: DataTypes.STRING, defaultValue: 'admin' },
  recipientPath: { type: DataTypes.JSON, defaultValue: [] },
  readReceipts: { type: DataTypes.JSON, defaultValue: [] },
  reason: { type: DataTypes.STRING, allowNull: false },
  beforeData: { type: DataTypes.JSON, allowNull: false },
  afterData: { type: DataTypes.JSON, allowNull: false },
  changedAt: { type: DataTypes.DATE, allowNull: false },
  readAt: { type: DataTypes.DATE, allowNull: true }
});

const SystemSetting = sequelize.define('SystemSetting', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workStart: { type: DataTypes.STRING, defaultValue: '09:00' },
  workEnd: { type: DataTypes.STRING, defaultValue: '18:00' },
  deductPerAbsentDay: { type: DataTypes.FLOAT, defaultValue: 200 },
  currency: { type: DataTypes.STRING, defaultValue: 'CNY' }
});

const EmployeeDocument = sequelize.define('EmployeeDocument', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employeeId: { type: DataTypes.INTEGER, allowNull: false },
  documentType: { type: DataTypes.STRING, allowNull: false },
  originalName: { type: DataTypes.STRING, allowNull: false },
  storedName: { type: DataTypes.STRING, allowNull: false, unique: true },
  mimeType: { type: DataTypes.STRING, allowNull: false },
  size: { type: DataTypes.INTEGER, allowNull: false },
  uploadedAt: { type: DataTypes.DATE, allowNull: false }
});

module.exports = { Employee, User, AttendanceRecord, AttendanceChange, SystemSetting, EmployeeDocument };
