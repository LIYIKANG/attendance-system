const { AdminJS } = require('adminjs');
const { buildRouter } = require('@adminjs/express');
const { Database, Resource } = require('@adminjs/sequelize');
const { sequelize } = require('./db');
const { Employee, User, AttendanceRecord, SystemSetting } = require('./models');

AdminJS.registerAdapter({ Database, Resource });

const AdminJSOptions = {
  resources: [
    {
      resource: Employee,
      options: {
        properties: {
          id: { isVisible: { list: true, show: true, filter: true, edit: false } },
          name: { isTitle: true }
        }
      }
    },
    {
      resource: User,
      options: {
        properties: {
          passwordHash: { isVisible: false }
        }
      }
    },
    {
      resource: AttendanceRecord,
      options: {
        properties: {
          date: { isVisible: { list: true, show: true, filter: true, edit: true } }
        }
      }
    },
    {
      resource: SystemSetting
    }
  ],
  rootPath: '/admin'
};

const admin = new AdminJS(AdminJSOptions);
const adminRouter = buildRouter(admin);

module.exports = { admin, adminRouter };
