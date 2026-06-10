const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const electronStore = require('electron-store');
const store = new electronStore();
const { machineIdSync } = require('node-machine-id');

// ===== FIREBASE =====
const { initializeApp } = require('firebase/app');
const { 
  getDatabase, 
  ref, 
  onValue, 
  update, 
  get
} = require('firebase/database');

let mainWindow = null;
let firebaseDB = null;
let firebaseConfig = null;
let firebaseListener = null;

// ===== FIREBASE CONFIG =====
const firebaseConfigData = {
  apiKey: "AIzaSyCxMlGgNlzG0phM_658VSZnbr8V7zy1WY0",
  authDomain: "simkop-7c36c.firebaseapp.com",
  databaseURL: "https://simkop-7c36c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "simkop-7c36c",
  storageBucket: "simkop-7c36c.firebasestorage.app",
  messagingSenderId: "64233225156",
  appId: "1:64233225156:web:71d2b2be2ad4af49b98291",
  measurementId: "G-MFMEG6DCMZ"
};

// ===== HARDWARE ID =====
function getHardwareId() {
  const storedId = store.get('hardware_id', null);
  if (storedId) return storedId;
  
  const baseId = machineIdSync();
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256')
    .update('SIMKOP-' + baseId + '-2024')
    .digest('hex')
    .substring(0, 20);
  
  store.set('hardware_id', hash);
  return hash;
}

function validateLicense() {
  const storedId = store.get('registered_hardware_id', null);
  const currentId = getHardwareId();
  
  if (!storedId) {
    store.set('registered_hardware_id', currentId);
    return true;
  }
  
  return storedId === currentId;
}

// ===== INIT FIREBASE =====
function initFirebase() {
  try {
    const app = initializeApp(firebaseConfigData);
    firebaseDB = getDatabase(app);
    store.set('firebase_config', firebaseConfigData);
    
    const syncRef = ref(firebaseDB, 'simkop_data');
    firebaseListener = onValue(syncRef, (snapshot) => {
      const data = snapshot.val();
      if (data && mainWindow) {
        store.set('simkop_data', data);
        mainWindow.webContents.send('firebase-data-updated', data);
      }
    });
    return true;
  } catch (err) {
    console.error('Firebase init error:', err);
    return false;
  }
}

// ===== ELECTRON STORE =====
function getStoredData() {
  return store.get('simkop_data', null);
}

function setStoredData(data) {
  store.set('simkop_data', data);
}

// ===== WINDOW SETUP =====
function createWindow() {
  if (!validateLicense()) {
    dialog.showErrorBox('Lisensi Tidak Valid', 'Aplikasi ini terikat dengan perangkat tertentu.');
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    title: "SIMKOP - Sistem Keuangan Koperasi",
    show: false
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => { mainWindow.show(); });
  
  // ===== PERBAIKAN BUG: cleanup listener =====
  mainWindow.on('closed', function() {
    if (firebaseListener && typeof firebaseListener.off === 'function') {
      firebaseListener.off();
      firebaseListener = null;
    }
    mainWindow = null;
  });
}

// ===== APP LIFECYCLE =====
app.whenReady().then(() => {
  initFirebase();
  createWindow();
});

app.on('window-all-closed', function() {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function() {
  if (mainWindow === null) createWindow();
});

// ===== IPC HANDLERS =====
ipcMain.handle('get-store', () => getStoredData());

ipcMain.handle('set-store', (event, data) => {
  setStoredData(data);
  return { success: true };
});

ipcMain.handle('get-firebase-config', () => {
  return store.get('firebase_config', null);
});

ipcMain.handle('init-firebase', async (event, config) => {
  try {
    const db = initFirebase();
    if (db) {
      return { success: true };
    }
    return { success: false, error: 'Invalid Firebase configuration' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sync-to-firebase', async (event, data) => {
  if (!firebaseDB) return { success: false, error: 'Firebase belum diinisialisasi' };
  try {
    const syncRef = ref(firebaseDB, 'simkop_data');
    await update(syncRef, data);
    setStoredData(data);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sync-from-firebase', async () => {
  if (!firebaseDB) return { success: false, error: 'Firebase belum diinisialisasi' };
  try {
    const syncRef = ref(firebaseDB, 'simkop_data');
    const snapshot = await get(syncRef);
    const data = snapshot.val();
    if (data) setStoredData(data);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('check-password', async (event, password) => {
  const storedHash = store.get('admin_password', null);
  if (!storedHash) {
    const bcrypt = require('bcrypt');
    const hash = bcrypt.hashSync(password, 10);
    store.set('admin_password', hash);
    return { success: true, isSetup: true };
  }
  const bcrypt = require('bcrypt');
  const match = bcrypt.compareSync(password, storedHash);
  return { success: match, isSetup: false };
});

ipcMain.handle('check-first-run', () => {
  return { isFirstRun: !store.has('admin_password') };
});