const XLSX = require('xlsx');

function exportAttendanceWorkbook(records, employees) {
  const sheetData = records.map((record) => {
    const employee = employees.find((item) => item.id === record.employeeId);
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
  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, '考勤表');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { exportAttendanceWorkbook };
