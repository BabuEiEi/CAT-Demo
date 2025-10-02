// firebase-bridge.js
let app, auth, db, storage;
let userRole = 'anonymous';

export async function initFirebase() {
  // ดึง config จาก GAS
  const res = await fetch(`${window.GAS_URL}?action=config`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (!data.ok) throw new Error('โหลด config ไม่สำเร็จ');

  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js');
  const { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } = await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js');
  const { getFirestore, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js');
  const { getStorage } = await import('https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js');

  app = initializeApp(data.firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);

  // ผูก helper ไว้
  window.__fb = { app, auth, db, storage, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, doc, getDoc };
}

export function getDb(){ return db; }
export function getAuth(){ return auth; }
export function getStorage(){ return storage; }

export function getAuthState(callback) {
  const { onAuthStateChanged, doc, getDoc } = window.__fb;
  onAuthStateChanged(auth, async (user) => {
    userRole = 'anonymous';
    if (user) {
      // อ่านบทบาทจาก Firestore: users/{uid}.role
      try {
        const snap = await getDoc(doc(getDb(), 'users', user.uid));
        if (snap.exists()) userRole = snap.data().role || 'member';
        else userRole = 'member'; // ดีฟอลต์
      } catch(e) { userRole = 'member'; }
    }
    callback({ user, role: userRole });
  });
}

export async function signInGoogle() {
  const { GoogleAuthProvider, signInWithPopup } = window.__fb;
  const prov = new GoogleAuthProvider();
  await signInWithPopup(auth, prov);
}

export async function signOutNow() {
  const { signOut } = window.__fb;
  await signOut(auth);
}
