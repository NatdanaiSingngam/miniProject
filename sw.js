// ไฟล์ sw.js (Service Worker)
self.addEventListener('install', (e) => {
  console.log('App Installed');
});

self.addEventListener('fetch', (e) => {
  // ปล่อยผ่าน (ไม่ต้องทำอะไร แค่ต้องมีฟังก์ชันนี้เพื่อให้ผ่านเกณฑ์ PWA)
});