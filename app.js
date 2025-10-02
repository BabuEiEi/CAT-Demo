// app.js
import { initFirebase, getAuthState, signInGoogle, signOutNow, getDb } from './firebase-bridge.js';

// SPA Router แบบง่าย
const routes = {
  '/': renderHome,
  '/items': renderItems,
  '/import': renderImportGuard,
  '/admin': renderAdminGuard,
};

let state = {
  user: null,
  role: 'anonymous', // 'anonymous' | 'member' | 'admin'
  firebaseReady: false,
};

window.addEventListener('popstate', () => routeTo(location.pathname));
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-route]');
  if (a) {
    e.preventDefault();
    routeTo(a.getAttribute('data-route'));
  }
});

async function boot() {
  await initFirebase();          // ดึง config จาก GAS แล้ว init
  state.firebaseReady = true;

  // ติดตามสถานะ login
  getAuthState(async ({ user, role }) => {
    state.user = user;
    state.role = role || 'anonymous';
    setNavByRole();
    // ครั้งแรก: ไปตาม path ปัจจุบัน (หรือหน้าแรก)
    if (!window.__routed) {
      window.__routed = true;
      routeTo(location.pathname || '/');
    } else {
      // รีเฟรชหน้าปัจจุบันเมื่อ role เปลี่ยน
      routeTo(location.pathname);
    }
  });

  // ปุ่ม nav
  document.querySelector('#btn-login')?.addEventListener('click', signInGoogle);
  document.querySelector('#btn-logout')?.addEventListener('click', signOutNow);
}
boot();

function setNavByRole() {
  const isMember = state.role === 'member' || state.role === 'admin';
  const isAdmin  = state.role === 'admin';
  document.querySelector('#link-import')?.toggleAttribute('hidden', !isMember);
  document.querySelector('#link-admin')?.toggleAttribute('hidden', !isAdmin);
  document.querySelector('#btn-login')?.toggleAttribute('hidden', !!state.user);
  document.querySelector('#btn-logout')?.toggleAttribute('hidden', !state.user);
}

function routeTo(path) {
  const fn = routes[path] || render404;
  history.pushState({}, '', path);
  fn();
}

/* ---------- Views ---------- */
function renderHome() {
  document.querySelector('#app').innerHTML = `
    <h1 class="text-2xl font-bold mb-2">ยินดีต้อนรับสู่คลังข้อสอบ</h1>
    <p class="text-gray-600 mb-6">ค้นหาและนำเข้าข้อสอบจากไฟล์ .docx ได้ทันที — รองรับตารางและรูปภาพ</p>
    <div class="grid gap-4 md:grid-cols-2">
      <a data-route="/items" class="p-4 bg-white rounded-xl border hover:shadow">🔍 ไปที่รายการข้อสอบ</a>
      <a data-route="/import" class="p-4 bg-white rounded-xl border hover:shadow ${state.role==='anonymous'?'pointer-events-none opacity-50':''}">⬆️ นำเข้า .docx</a>
    </div>
  `;
}

async function renderItems() {
  const app = document.querySelector('#app');
  app.innerHTML = `<div>กำลังโหลดรายการ...</div>`;
  const db = getDb();
  // ตัวอย่างอ่าน 10 รายการแรก (ซ่อนรายละเอียด query/pagination เพื่อกระชับ)
  const { getDocs, collection, query, orderBy, limit } = await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js');
  const q = query(collection(db, 'items'), orderBy('createdAt','desc'), limit(10));
  const snap = await getDocs(q);
  const cards = [];
  snap.forEach(doc => {
    const d = doc.data();
    cards.push(`
      <div class="p-4 bg-white rounded-xl border">
        <div class="font-semibold">${d.title || '(ไม่มีชื่อข้อสอบ)'}</div>
        <div class="text-sm text-gray-600">${d.subject || '-'} • ${d.grade || '-'}</div>
        <div class="mt-2 text-xs text-gray-500">แท็ก: ${(d.tags||[]).join(', ') || '-'}</div>
      </div>
    `);
  });
  app.innerHTML = `
    <h2 class="text-xl font-bold mb-3">รายการข้อสอบล่าสุด</h2>
    <div class="grid gap-3">${cards.join('') || '<div class="text-gray-500">ยังไม่มีข้อมูล</div>'}</div>
  `;
}

function renderImportGuard() {
  if (state.role === 'anonymous') {
    Swal.fire('จำกัดสิทธิ์', 'หน้านี้สำหรับสมาชิกที่เข้าสู่ระบบแล้ว', 'warning');
    return routeTo('/403');
  }
  renderImport();
}

function renderAdminGuard() {
  if (state.role !== 'admin') {
    Swal.fire('จำกัดสิทธิ์', 'ต้องเป็นผู้ดูแลระบบเท่านั้น', 'warning');
    return routeTo('/403');
  }
  document.querySelector('#app').innerHTML = `
    <h2 class="text-xl font-bold mb-3">แดชบอร์ดผู้ดูแล</h2>
    <p class="text-gray-600">ใส่เครื่องมืออนุมัติ/แก้ไข/ลบ และสรุปสถิติตามต้องการได้ที่นี่</p>
  `;
}

function renderImport() {
  document.querySelector('#app').innerHTML = `
    <h2 class="text-xl font-bold mb-3">นำเข้าไฟล์ .docx</h2>
    <div class="p-4 bg-white rounded-xl border">
      <input id="docx" type="file" accept=".docx" class="block w-full mb-3"/>
      <div class="grid gap-3 md:grid-cols-3">
        <input id="subject" class="border rounded p-2" placeholder="วิชา (เช่น ภาษาไทย/คณิต/วิทย์)"/>
        <input id="grade" class="border rounded p-2" placeholder="ระดับชั้น (เช่น ม.1/ม.3)"/>
        <input id="tags" class="border rounded p-2" placeholder="แท็ก คั่นด้วย ,"/>
      </div>
      <button id="btn-parse" class="mt-3 px-4 py-2 rounded bg-black text-white">แปลงและพรีวิว</button>
      <div id="preview" class="mt-4 text-sm text-gray-700"></div>
      <button id="btn-save" class="mt-3 px-4 py-2 rounded border" disabled>บันทึกลงคลัง</button>
    </div>
  `;

  // ติดตั้งลอจิก importer
  window.setupImporter?.();
}

function render404() {
  document.querySelector('#app').innerHTML = `<div class="text-gray-500">ไม่พบหน้า</div>`;
}
function render403() {
  document.querySelector('#app').innerHTML = `<div class="text-orange-600">403 – ไม่มีสิทธิ์เข้าถึง</div>`;
}
routes['/403'] = render403;
