// --- 1. Service Worker: ลงทะเบียนเพื่อให้ติดตั้งเป็นแอป PWA ได้ ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Error:', err));
}

// --- 2. ตั้งค่า Firebase: กุญแจสำหรับเชื่อมต่อฐานข้อมูล ---
const firebaseConfig = {
    apiKey: "AIzaSyCAR4FWV509bmQ2ZF6aD_1sDZaZ2vg6G4w",
    authDomain: "menu-cfddd.firebaseapp.com",
    databaseURL: "https://menu-cfddd-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "menu-cfddd",
    storageBucket: "menu-cfddd.firebasestorage.app",
    messagingSenderId: "436152823570",
    appId: "1:436152823570:web:a4a4588e5ccbe2dd624dcb",
    measurementId: "G-PGR7RHPJPL"
};

// เริ่มต้นใช้งาน Firebase
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- 3. ตัวแปร Global (เก็บค่าต่างๆ ไว้ใช้ทั้งไฟล์) ---
let recipes = []; // เก็บรายการสูตรอาหารทั้งหมด
let currentEditingId = null; // เก็บ ID ของสูตรที่กำลังแก้ไขอยู่
let currentRoomId = localStorage.getItem('nomnom_roomId') || null; // ชื่อห้องปัจจุบัน
let currentRoomPin = localStorage.getItem('nomnom_roomPin') || null; // รหัส PIN ปัจจุบัน
let roomRef = null; // ตัวเชื่อมต่อห้องใน Firebase

// --- 4. ฟังก์ชัน init: ทำงานทันทีเมื่อเปิดเว็บ ---
function init() {
    loadFromLocal(); // โหลดข้อมูลเก่าจากเครื่องมาโชว์ก่อน
    if (currentRoomId && currentRoomPin) startRealtimeSync(currentRoomId); // ถ้าเคยเข้าห้องไว้ ให้เชื่อมต่อเลย
    updateUIState(); // ปรับหน้าจอ (โชว์/ซ่อน ปุ่มเชื่อมต่อ)
    lucide.createIcons(); // แปลงไอคอนให้แสดงผล
}

// --- 5. จัดการหน้าจอ: สลับระหว่างหน้า Login กับหน้า Connected ---
function updateUIState() {
    const loginSec = document.getElementById('loginSection');
    const connectedSec = document.getElementById('connectedSection');
    const roomNameDisplay = document.getElementById('displayRoomName');
    
    if (currentRoomId && currentRoomPin) {
        // ถ้าเข้าห้องแล้ว -> ซ่อนช่อง Login, โชว์สถานะ Online
        loginSec.classList.add('hidden-force');
        connectedSec.classList.remove('hidden-force');
        roomNameDisplay.textContent = currentRoomId;
    } else {
        // ถ้ายังไม่เข้า -> โชว์ช่อง Login, ซ่อนสถานะ Online
        loginSec.classList.remove('hidden-force');
        connectedSec.classList.add('hidden-force');
    }
}

// --- 6. ฟังก์ชันเชื่อมต่อห้อง Cloud (เมื่อกดปุ่ม) ---
function connectToCloud() {
    const id = document.getElementById('cloudId').value.trim();
    const pin = document.getElementById('cloudPin').value.trim();
    
    if (!id || !pin) { alert("กรุณากรอกข้อมูลให้ครบ"); return; }
    
    // เช็คกับ Firebase ว่ามีห้องนี้ไหม
    const checkRef = db.ref('users/' + id);
    checkRef.once('value').then((snapshot) => {
        const data = snapshot.val();
        if (data === null) {
            // กรณีห้องว่าง -> สร้างห้องใหม่
            if(confirm("ห้องว่าง! ต้องการสร้างห้องใหม่ไหม?")) {
                checkRef.set({ pin: pin, recipes: recipes });
                setupSession(id, pin);
            }
        } else if (data.pin == pin) {
            // กรณีมีห้องแล้ว & รหัสถูก -> เชื่อมต่อ
            setupSession(id, pin);
            alert("✅ เชื่อมต่อสำเร็จ!");
        } else {
            // รหัสผิด
            alert("❌ รหัส PIN ไม่ถูกต้อง");
        }
    });
}

// บันทึก Session การเข้าห้อง
function setupSession(id, pin) {
    currentRoomId = id;
    currentRoomPin = pin;
    localStorage.setItem('nomnom_roomId', id);
    localStorage.setItem('nomnom_roomPin', pin);
    updateUIState();
    startRealtimeSync(id);
}

// ออกจากห้อง
function logoutCloud() {
    if(confirm("ต้องการตัดการเชื่อมต่อ?")) {
        if (roomRef) roomRef.off(); // หยุดการซิงค์
        currentRoomId = null;
        currentRoomPin = null;
        localStorage.removeItem('nomnom_roomId');
        localStorage.removeItem('nomnom_roomPin');
        updateUIState();
    }
}

// --- 7. Realtime Sync: หัวใจสำคัญของการซิงค์ข้อมูล ---
function startRealtimeSync(roomId) {
    roomRef = db.ref('users/' + roomId);
    // ฟังการเปลี่ยนแปลงข้อมูล (on value)
    roomRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // ถ้า recipes เป็น null (ลบหมด) ให้ใช้ [] (อาเรย์ว่าง)
            recipes = data.recipes || [];
            saveToLocal(); // เซฟลงเครื่อง
            renderRecipes(true); // วาดหน้าจอใหม่ + เล่น Animation
            flashStatus(); // กระพริบสถานะว่าซิงค์แล้ว
        }
    });
}

// ส่งข้อมูลขึ้น Cloud
function pushToCloud() {
    if (currentRoomId && roomRef) {
        roomRef.update({
            recipes: recipes,
            lastUpdated: new Date().toISOString()
        });
        flashStatus();
    }
}

// เอฟเฟกต์กระพริบคำว่า "กำลังซิงค์..."
function flashStatus() {
    const el = document.getElementById('syncStatus');
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 1000);
}

// --- 8. จัดการ Local Storage (เซฟข้อมูลลงเครื่องสำรองไว้) ---
function saveToLocal() {
    localStorage.setItem('myRecipes', JSON.stringify(recipes));
}

function loadFromLocal() {
    const stored = localStorage.getItem('myRecipes');
    if (stored) recipes = JSON.parse(stored);
    renderRecipes();
}

// --- 9. Render: วาดหน้าจอแสดงรายการอาหาร ---
function renderRecipes(animate = false) {
    const list = document.getElementById('recipeList');
    const emptyState = document.getElementById('emptyState');
    const searchText = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
    
    // ถ้าไม่มีข้อมูลเลย -> โชว์หน้าว่าง
    if (recipes.length === 0) {
        list.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
    }

    // กำหนด Class ของการ์ด (ถ้า animate=true ให้เพิ่ม class new-update)
    const cardClass = animate ? 'recipe-card bg-white p-6 md:p-8 rounded-[2rem] border border-orange-50 shadow-sm new-update' : 'recipe-card bg-white p-6 md:p-8 rounded-[2rem] border border-orange-50 shadow-sm';
    
    // สร้าง HTML สำหรับแต่ละเมนู
    list.innerHTML = recipes.map(item => `
        <div class="${cardClass}" data-name="${item.name.toLowerCase()}">
            <div class="flex justify-between items-start mb-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-orange-100/50 rounded-xl flex items-center justify-center text-orange-400 shrink-0">
                        <i data-lucide="chef-hat" class="w-6 h-6"></i>
                    </div>
                    <h3 class="font-semibold text-xl md:text-2xl text-gray-700 break-words max-w-[200px] md:max-w-md">${item.name}</h3>
                </div>
                <div class="flex gap-1 shrink-0">
                    <button onclick="copyRecipe(${item.id})" class="p-2 hover:bg-blue-50 rounded-full text-gray-400 hover:text-blue-400 transition-all"><i data-lucide="copy" class="w-5 h-5"></i></button>
                    <button onclick="openEditModal(${item.id})" class="p-2 hover:bg-orange-50 rounded-full text-gray-400 hover:text-orange-400 transition-all"><i data-lucide="edit-2" class="w-5 h-5"></i></button>
                    <button onclick="deleteRecipe(${item.id})" class="p-2 hover:bg-red-50 rounded-full text-gray-400 hover:text-red-400 transition-all"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                </div>
            </div>
            <div class="bg-orange-50/30 p-5 rounded-2xl">
                <h4 class="text-xs font-bold text-orange-300 uppercase tracking-widest mb-3 flex items-center gap-2">
                     <span class="w-4 h-[1px] bg-orange-200"></span> วิธีทำ
                </h4>
                <div class="method-text text-gray-600 leading-relaxed text-sm md:text-base">${item.method || '<span class="italic text-gray-300">ไม่ได้ระบุวิธีทำ</span>'}</div>
            </div>
        </div>
    `).reverse().join(''); // reverse() เพื่อให้ของใหม่ขึ้นบนสุด
    
    // ลบ class animation ออกหลังจากเล่นเสร็จ (1 วินาที)
    if(animate) setTimeout(() => document.querySelectorAll('.new-update').forEach(el => el.classList.remove('new-update')), 1000);
    
    // ถ้ามีการค้นหาค้างอยู่ ให้กรองรายการอีกรอบ
    if(searchText) searchRecipe();
    
    // สร้างไอคอนใหม่
    lucide.createIcons();
}

// --- 10. ฟังก์ชันใช้งานทั่วไป (Search, Copy, Add, Delete) ---

// ค้นหา
function searchRecipe() {
    const searchText = document.getElementById('searchInput').value.toLowerCase();
    const cards = document.querySelectorAll('.recipe-card');
    cards.forEach(card => {
        const title = card.getAttribute('data-name');
        // ถ้าชื่อตรงกับคำค้นหา -> โชว์, ถ้าไม่ตรง -> ซ่อน
        card.style.display = title.includes(searchText) ? "block" : "none";
    });
}

// ก๊อปปี้สูตร
function copyRecipe(id) {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;
    const text = `🍳 เมนู: ${recipe.name}\n\n📝 วิธีทำ:\n${recipe.method}\n\n(จากแอป Pinto Note)`;
    navigator.clipboard.writeText(text).then(() => alert("คัดลอกสูตรแล้ว!")).catch(err => alert("คัดลอกไม่ได้ (ต้องใช้ผ่าน https หรือ localhost)"));
}

// เพิ่มสูตร
function addRecipe() {
    const nameInput = document.getElementById('recipeName');
    const methodInput = document.getElementById('recipeMethod');
    if (!nameInput.value.trim()) { nameInput.focus(); return; }
    
    recipes.push({ id: Date.now(), name: nameInput.value, method: methodInput.value });
    saveToLocal();
    pushToCloud();
    
    nameInput.value = '';
    methodInput.value = '';
    renderRecipes();
}

// ลบสูตร
function deleteRecipe(id) {
    if (confirm('ลบสูตรนี้?')) {
        recipes = recipes.filter(r => r.id !== id);
        saveToLocal();
        pushToCloud();
        renderRecipes();
    }
}

// --- 11. จัดการ Modal (หน้าต่างเด้ง) แก้ไข และ วิธีใช้ ---

function openEditModal(id) {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;
    currentEditingId = id;
    document.getElementById('editName').value = recipe.name;
    document.getElementById('editMethod').value = recipe.method;
    document.getElementById('editModal').classList.remove('hidden');
    document.getElementById('editModal').classList.add('flex');
}

function closeModal() {
    document.getElementById('editModal').classList.add('hidden');
    document.getElementById('editModal').classList.remove('flex');
    currentEditingId = null;
}

function saveEdit() {
    if (currentEditingId === null) return;
    const newName = document.getElementById('editName').value;
    const newMethod = document.getElementById('editMethod').value;
    // อัปเดตข้อมูลในอาเรย์
    recipes = recipes.map(r => r.id === currentEditingId ? { ...r, name: newName, method: newMethod } : r);
    saveToLocal();
    pushToCloud();
    closeModal();
    renderRecipes();
}

function openHelp() {
    document.getElementById('helpModal').classList.remove('hidden');
    document.getElementById('helpModal').classList.add('flex');
}

function closeHelp() {
    document.getElementById('helpModal').classList.add('hidden');
    document.getElementById('helpModal').classList.remove('flex');
}

// ตรวจจับการคลิกพื้นหลังเพื่อปิด Modal
window.onclick = function(e) { 
    if(e.target == document.getElementById('editModal')) closeModal(); 
    if(e.target == document.getElementById('helpModal')) closeHelp();
}

// เริ่มทำงานเมื่อโหลดหน้าเว็บเสร็จ
window.onload = init;