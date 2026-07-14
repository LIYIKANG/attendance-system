const { DataTypes } = require('sequelize');
const { sequelize } = require('./db');

const Employee = sequelize.define('Employee', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  department: { type: DataTypes.STRING, allowNull: false },
  position: { type: DataTypes.STRING, allowNull: false },
  baseSalary: { type: DataTypes.FLOAT, allowNull: false },
  employmentType: { type: DataTypes.STRING, defaultValue: 'parttime' },
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
  employeeId: { type: DataTypes.INTEGER, allowNull: true }
});

const AttendanceRecord = sequelize.define('AttendanceRecord', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employeeId: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  clockIn: { type: DataTypes.DATE },
  clockOut: { type: DataTypes.DATE },
  status: { type: DataTypes.STRING }
});

const SystemSetting = sequelize.define('SystemSetting', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workStart: { type: DataTypes.STRING, defaultValue: '09:00' },
  workEnd: { type: DataTypes.STRING, defaultValue: '18:00' },
  deductPerAbsentDay: { type: DataTypes.FLOAT, defaultValue: 200 },
  currency: { type: DataTypes.STRING, defaultValue: 'CNY' }
});

module.exports = { Employee, User, AttendanceRecord, SystemSetting };
