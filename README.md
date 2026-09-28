# ChowHuay Pro — สต็อก & ขาย สำหรับร้านโชว์ห่วย

Web app จัดการสต็อกสินค้า ขายหน้าร้าน (POS) และซื้อสินค้าแบบต้นทุน (bulk cost) สำหรับร้านโชว์ห่วยไทย
- ฐานข้อมูล: **Google Sheets + Google Drive** (ผ่าน Apps Script) — ฟรี ไม่ต้องเซิร์ฟเวอร์
- โฮสต์: **GitHub Pages** — ฟรี, HTTPS, install เป็น App ได้ (PWA)
- รองรับสแกนบาร์โค้ด (กล้องหรือเครื่องสแกน USB), ส่งออก Excel/PDF และระบบ PIN 4 หลัก
- API ทุกคำสั่งที่อ่านหรือแก้ไขข้อมูลต้องผ่าน session token; PIN จัดเก็บเป็น salted hash และไม่ส่งกลับมาที่หน้าเว็บ

## หน้าจอ
| เมนู | ฟังก์ชัน |
|------|----------|
| ภาพรวม | ยอดขาย/กำไร/ต้นทุนวันนี้, กราฟรายสัปดาห์, สินค้าขายดี, สินค้าใกล้หมด, สินค้าไม่ขาย |
| ขาย (POS) | ค้นหา/สแกนสินค้า, เพิ่มเข้าตะกร้า, คิดเงินสด/ทอนเงิน, พิมพ์ใบเสร็จ, ตัดสต็อกอัตโนมัติ |
| สต็อก | เพิ่ม/แก้ไข/ลบสินค้า, อัปโหลดรูป, สแกนบาร์โค้ด, ปรับสต็อก (เพิ่ม/ลด), บันทึกซื้อสินค้าลงทุน |
| รายงาน | ยอดตามช่วงเวลา, สินค้าขายดี, ประวัติการขาย, Export Excel (.xlsx) / PDF |
| ตั้งค่า | ใส่ URL Apps Script, เปลี่ยนรหัสผ่าน, ธีมสี/โหมดมืด, ติดตั้ง App, ล้างแคช |

## โครงสร้างโปรเจกต์
```
├── index.html            # SPA shell (หน้าจอ + ล็อก PIN)
├── css/app.css           # Material Design 3, 5 ธีม + โหมดมืด
├── js/                   # config, utils, api, store, ui
│   └── views/            # dashboard, pos, inventory, reports, settings
├── appscript/            # Code.gs + appsscript.json (ตัว backend)
├── vendor/               # Chart.js, SheetJS (xlsx), html5-qrcode (local)
├── icons/                # PWA icons + favicon
├── manifest.webmanifest  # PWA manifest
└── sw.js                 # Service Worker (ใช้งานแบบออฟไลน์)
```

## ขั้นตอนติดตั้ง (ครั้งเดียว)

### 1. สร้าง Apps Script (ตัวฐานข้อมูล)
1. เปิด https://script.google.com → **สร้างโปรเจกต์ใหม่**
2. ลบโค้ดเดิม แล้ววางโค้ดจาก `appscript/Code.gs` ลงไปทั้งหมด
3. ตั้งค่าไฟล์ `appscript.json`: **ตั้งค่า → แสดงไฟล์ Project manifest** → วางเนื้อหาจาก `appscript/appsscript.json`
4. ด้านซ้าย **บริการ (Services)** → เพิ่ม **Drive API** (เวอร์ชัน v3) → บันทึก
5. กด **ติดตั้งใช้งาน → ติดตั้งใหม่** → เลือก *Execute as: Me* → เลือก *Who has access: Anyone (anonymous users)* → อนุญาตสิทธิ์
6. คัดลอก URL `/exec` (แบบ `https://script.google.com/macros/s/xxxxx/exec`)

Template for copy : https://docs.google.com/spreadsheets/d/1se8fTv5T27TS1r2kmex_U4WXun4T7aSe6fKHn0WoXtw/copy

### 2. เชื่อม URL กับแอป
1. เปิดแอป (GitHub Pages) → ไปเมนู **ตั้งค่า**
2. วาง URL `/exec` ในช่อง **Apps Script URL** → กด **ทดสอบการเชื่อมต่อ**
3. ถ้าขึ้น *เชื่อมต่อสำเร็จ* → กด **บันทึก** → ใส่ PIN เพื่อโหลดข้อมูล แอปจะสร้างชีตที่จำเป็นให้อัตโนมัติ

> Apps Script สร้างอัตโนมัติ: ชีต `Products, Sales, Purchases, Settings, Categories` และโฟลเดอร์ Drive `ChowHuay Pro Images`

### 3. เริ่มใช้งาน
- รหัสผ่านเริ่มต้น: **1234** (เปลี่ยนได้ที่เมนูตั้งค่า)
- บันทึกสินค้าแรกที่หน้า **สต็อก** → เริ่มขายได้ที่หน้า **ขาย**
- กดปุ่ม **ติดตั้ง** ในเมนูตั้งค่า เพื่อติดตั้งเป็น App บนหน้าจอ (PWA)

## ทดสอบบนเครื่อง (Local)
```bash
python3 -m http.server 8000
# เปิด http://localhost:8000
```

## Deploy ใหม่
```bash
clasp login
clasp push
# อัปเดต Web App deployment เดิมผ่าน Apps Script หรือ clasp deploy -i <DEPLOYMENT_ID>

git add -A && git commit -m "update" && git push
# GitHub Pages ใช้ branch หลัก auto-deploy (ดู GitHub Pages settings)
```

ไฟล์ `.clasp.json` มี Script ID ของระบบจริง จึงถูก ignore และไม่ควร commit ขึ้น repository

## หมายเหตุ
- ภาพสินค้าถูกบีบอัดอัตโนมัติ (JPEG ~600px) ก่อนอัปโหลดขึ้น Drive
- ข้อมูลแคชในเครื่อง (localStorage) ใช้เพื่อเปิดดูข้อมูลล่าสุดเมื่อออฟไลน์; ปุ่ม **ล้างแคช** อยู่ในหน้าตั้งค่า
- ฟีเจอร์แจ้งเตือนสินค้าใกล้หมดใช้ระบบแจ้งเตือนเบราว์เซอร์ (Notification)
