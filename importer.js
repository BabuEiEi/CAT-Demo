// importer.js
import { getDb, getStorage, getAuth } from './firebase-bridge.js';

window.setupImporter = function() {
  const fileInput = document.querySelector('#docx');
  const btnParse  = document.querySelector('#btn-parse');
  const btnSave   = document.querySelector('#btn-save');
  const previewEl = document.querySelector('#preview');

  let parsed = { html: '', images: [], tables: [] };

  btnParse.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) return Swal.fire('โปรดเลือกไฟล์', 'รองรับ .docx', 'info');

    btnParse.disabled = true;
    previewEl.innerHTML = 'กำลังแปลง...';

    const result = await window.mammoth.convertToHtml({ arrayBuffer: () => file.arrayBuffer() }, {
      convertImage: window.mammoth.images.inline(async (image) => {
        // อัปโหลดรูปขึ้น Firebase Storage
        const ab = await image.read('arrayBuffer');
        const { getDownloadURL, ref, uploadBytes } = await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js');
        const storage = getStorage();
        const name = `items/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
        const r = ref(storage, name);
        await uploadBytes(r, new Uint8Array(ab), { contentType: 'image/png' });
        const url = await getDownloadURL(r);
        return { src: url };
      })
    });

    // เก็บ HTML สำหรับพรีวิว
    parsed.html = result.value || '';
    // แยกตาราง
    const div = document.createElement('div');
    div.innerHTML = parsed.html;
    parsed.tables = [...div.querySelectorAll('table')].map(t => t.outerHTML);

    previewEl.innerHTML = `
      <div class="p-3 bg-white border rounded">
        <div class="font-semibold mb-2">พรีวิว HTML</div>
        <div class="prose max-w-none">${parsed.html}</div>
        <div class="mt-3 text-sm text-gray-600">ตารางที่ตรวจพบ: ${parsed.tables.length} ตาราง</div>
      </div>
    `;
    btnSave.disabled = false;
    btnParse.disabled = false;
  });

  btnSave.addEventListener('click', async () => {
    const subject = document.querySelector('#subject').value.trim();
    const grade   = document.querySelector('#grade').value.trim();
    const tags    = document.querySelector('#tags').value.split(',').map(s => s.trim()).filter(Boolean);

    const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js');
    const db = getDb();
    const auth = getAuth();
    const uid = auth.currentUser?.uid || null;

    const docData = {
      title: (subject ? `[${subject}] ` : '') + 'ข้อสอบจากไฟล์ .docx',
      subject, grade, tags,
      stemHtml: parsed.html,
      choices: [],
      answerKey: '',
      rationaleHtml: '',
      tableHtmls: parsed.tables,
      figures: [], // หมายเหตุ: mammoth แทนที่รูปเป็น URL ใน stemHtml แล้ว
      sourceDoc: {
        name: document.querySelector('#docx').files?.[0]?.name || '',
        importedBy: uid,
        importedAt: serverTimestamp()
      },
      status: 'pending', // member = pending, admin จะไปแก้ในแดชบอร์ด
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await addDoc(collection(db, 'items'), docData);

    // อ๊อปชัน: ยิง log ไป GAS → Google Sheet
    try {
      await fetch(window.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          type: 'import_log',
          origin: location.origin,
          uid,
          userEmail: auth.currentUser?.email || '',
          fileName: document.querySelector('#docx').files?.[0]?.name || '',
          fileSize: document.querySelector('#docx').files?.[0]?.size || 0,
          parsedCount: 1,
          approvedCount: 0,
          notes: `${subject}/${grade} (${tags.join(',')})`
        })
      });
    } catch(e){ /* เงียบ ๆ ได้ */ }

    Swal.fire('สำเร็จ', 'บันทึกข้อสอบเรียบร้อย (สถานะ: pending)', 'success');
  });
};
