const XLSX = require('xlsx');
const fs = require('fs');

const file = 'docs/launch-readiness/Launch Readiness Matrix Template.xlsx';
const buf = fs.readFileSync(file);
const wb = XLSX.read(buf, { type: 'buffer' });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log("Rows 10-30:");
rows.slice(10, 30).forEach((row, i) => console.log(`${i + 10}:`, row));
