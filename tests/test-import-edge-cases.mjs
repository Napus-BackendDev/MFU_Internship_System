import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const xlsxPath = require.resolve('xlsx', { paths: ['./apps/api'] });
const XLSX = require(xlsxPath);

const API_BASE = 'http://localhost:8081/api/v2';

async function devLogin(email, role) {
  const res = await fetch(`${API_BASE}/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role, displayName: role })
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie');
  const cookies = [];
  if (setCookie) {
    for (const part of setCookie.split(',')) {
      const match = part.match(/(its_[a-z]+=[^;]+)/i);
      if (match) cookies.push(match[1]);
    }
  }
  return cookies.join('; ');
}

async function uploadFile(cookieHeader, fileName, buffer) {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  formData.append('file', blob, fileName);

  const res = await fetch(`${API_BASE}/students/import-preview`, {
    method: 'POST',
    headers: {
      'Cookie': cookieHeader,
      'x-requested-with': 'XMLHttpRequest'
    },
    body: formData
  });
  return res;
}

async function main() {
  console.log('--- Testing Student Import Edge Cases ---');
  const cookieHeader = await devLogin('admin@mfu.ac.th', 'systemAdmin');

  // Test 1: Corrupted / invalid file content with .xlsx extension
  console.log('\n[Edge Case 1] Uploading corrupted binary file as .xlsx...');
  const corruptBuffer = Buffer.from('this is not a valid zip or xlsx file');
  const res1 = await uploadFile(cookieHeader, 'corrupt.xlsx', corruptBuffer);
  console.log(`Status: ${res1.status}`);
  const data1 = await res1.json();
  console.log('Response:', data1);
  if (res1.status === 422 && (data1.error?.code === 'WORKBOOK_TYPE_INVALID' || data1.error?.code === 'WORKBOOK_INVALID')) {
    console.log(' PASS: Corrupted file properly rejected with 422 Unprocessable Entity');
  } else {
    throw new Error(`FAIL: Unexpected response for corrupt workbook: ${res1.status}`);
  }

  // Test 2: Mismatched School & Program
  console.log('\n[Edge Case 2] Uploading workbook with nonexistent school and mismatched program...');
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'email', 'สำนักวิชา', 'หลักสูตร'],
    ['6531501999', 'สมมุติ ทดสอบ', 'sommut@mfu.ac.th', 'NONEXISTENT_SCHOOL', 'SE'],
    ['6531501998', 'สมชาย ทดสอบ', 'somchai@mfu.ac.th', 'IT', 'MISMATCHED_PROGRAM']
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const res2 = await uploadFile(cookieHeader, 'mismatched_scope.xlsx', xlsxBuffer);
  console.log(`Status: ${res2.status}`);
  const data2 = await res2.json();
  console.log('Preview Batch ID:', data2.batchId || data2.id);
  console.log('Total items in preview:', data2.items?.length);

  for (const item of (data2.items || [])) {
    console.log(`Row ${item.rowNumber} (${item.sourcePreview?.studentId}): action=${item.action}, issues=${item.issues?.map(i => i.code).join(',')}`);
  }

  const allInvalid = (data2.items || []).every(item => item.action === 'invalid');
  const hasExpectedIssues = (data2.items || []).some(item => item.issues?.some(i => i.code === 'SCHOOL_NOT_FOUND'))
    && (data2.items || []).some(item => item.issues?.some(i => i.code === 'PROGRAM_NOT_FOUND'));

  if (res2.status === 201 && allInvalid && hasExpectedIssues) {
    console.log(' PASS: Mismatched schools/programs correctly flagged as invalid with SCHOOL_NOT_FOUND / PROGRAM_NOT_FOUND');
  } else {
    throw new Error(`FAIL: Mismatched workbook was not properly handled: ${JSON.stringify(data2)}`);
  }

  console.log('\nAll edge case checks PASSED successfully!');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
