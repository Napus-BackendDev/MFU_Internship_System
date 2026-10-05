import fs from 'node:fs';

const API_BASE = 'http://localhost:8081/api/v2';
const WORKBOOK_PATH = 'C:/Users/asus/Downloads/สร้างไฟล์ Cer PDF + ส่งเมล. .xlsx';

async function devLogin() {
  const res = await fetch(`${API_BASE}/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@mfu.ac.th', role: 'systemAdmin' })
  });
  const cookies = res.headers.getSetCookie();
  return cookies.find(c => c.startsWith('its_access=')).split(';')[0];
}

async function testImport() {
  console.log('Logging in as Admin...');
  const cookie = await devLogin();

  console.log('Reading Excel file:', WORKBOOK_PATH);
  const fileBuffer = fs.readFileSync(WORKBOOK_PATH);
  const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const formData = new FormData();
  formData.append('file', blob, 'sample_students.xlsx');

  console.log('Sending POST /students/import-preview...');
  const previewRes = await fetch(`${API_BASE}/students/import-preview`, {
    method: 'POST',
    headers: {
      'Cookie': cookie,
      'x-requested-with': 'XMLHttpRequest'
    },
    body: formData
  });

  console.log('Preview Response status:', previewRes.status);
  const text = await previewRes.text();
  console.log('Preview Response preview:', text.slice(0, 500));

  if (!previewRes.ok) {
    throw new Error(`Preview failed with status ${previewRes.status}: ${text}`);
  }

  const previewData = JSON.parse(text);
  const batchId = previewData.batchId || previewData.id;
  console.log('Batch ID:', batchId);
  console.log('Summary:', previewData.summary);

  const getBatchRes = await fetch(`${API_BASE}/students/imports/${batchId}`, {
    headers: {
      'Cookie': cookie,
      'x-requested-with': 'XMLHttpRequest'
    }
  });
  console.log('Get Batch status:', getBatchRes.status);
  const batch = await getBatchRes.json();
  console.log('Total items loaded:', batch.items?.length);
  if (batch.items?.length > 0) {
    console.log('First item sample:', JSON.stringify(batch.items[0], null, 2));
    const validRows = batch.items.filter(r => r.status === 'pending' && (r.action === 'create' || r.action === 'update'));
    console.log(`Found ${validRows.length} valid rows to commit`);
    if (validRows.length > 0) {
      const decisions = validRows.slice(0, 5).map(r => ({ rowId: r.id, action: r.action }));
      console.log('Testing commit of first 5 decisions...');
      const commitRes = await fetch(`${API_BASE}/students/imports/${batchId}/commit`, {
        method: 'POST',
        headers: {
          'Cookie': cookie,
          'Content-Type': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
          'idempotency-key': crypto.randomUUID()
        },
        body: JSON.stringify({ decisions })
      });
      console.log('Commit status:', commitRes.status);
      const commitText = await commitRes.text();
      console.log('Commit response:', commitText.slice(0, 300));
    }
  }

  console.log('Import test completed successfully!');
}

testImport().catch(console.error);
