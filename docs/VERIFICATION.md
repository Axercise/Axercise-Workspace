# Axercise — สถานะการตรวจสอบ

วันที่: 24 พฤศจิกายน 2026

## ลิงก์ในเอกสารเรียน — 24 พฤศจิกายน 2026

- เพิ่มลิงก์ HTTP(S) ในเอกสารรายวิชาและเอกสารประกอบการบ้าน พร้อมชื่อ หมวด บท แท็ก โน้ต และปักหมุด มีการค้นชื่อ/URL, ตัวกรองไฟล์–ลิงก์, ปุ่มเปิดต้นทางในแท็บใหม่, คัดลอก, แก้ไข และยืนยันก่อนลบ
- รายการลิงก์ไม่มี file versions; หน้าอ่านลิงก์แจ้งว่าเก็บเฉพาะที่อยู่เว็บ ส่วนการอ่านแบบออฟไลน์และค้นเนื้อหาใช้ไฟล์ที่อัปโหลด URL จำกัดความยาว/โปรโตคอลและปฏิเสธ user/password ฝังใน URL, control characters และ backslash การบันทึกไม่เรียกเว็บไซต์ปลายทาง
- เพิ่ม optional URL โดยไม่เติม field ให้ไฟล์เก่าที่ไม่มี URL จึงรักษา fingerprint ที่ใช้ซิงก์ Notion เดิม ลิงก์รวมใน metadata sync และ ZIP แต่ใช้แทนเวอร์ชันไฟล์ที่ส่งการบ้านไม่ได้; การลบลิงก์ลบเฉพาะรายการในรายวิชา
- เพิ่ม automated tests 10 กรณี ครอบคลุม offline persistence, URL validation, legacy hashes, optimistic edits, file/link boundaries, course/assignment ownership, deletion/tombstones, mixed ZIP round-trip, Notion URL edits/unsafe remote input และ local/MCP auth รวมกับ Learning, contracts และ Daily Briefing ผ่าน 69/69 กรณี TypeScript และ production build ผ่าน
- Playwright กับหน้าเว็บจริงผ่าน: สร้างลิงก์พร้อมโน้ต/แท็ก/ปักหมุด, reload, ค้นด้วย URL, กรองไฟล์/ลิงก์, แก้ URL, คัดลอกผ่าน clipboard stub และเปิดแท็บใหม่ที่มี noopener โดยดักหน้า example.com ภายใน browser test ไม่ดาวน์โหลดเว็บจริง
- อัปโหลด TXT ทดลองร่วมกับลิงก์ เปิด viewer/ดาวน์โหลด bytes ตรงกับต้นฉบับ และค้นเนื้อหาได้ ยกเลิกการลบแล้วยังอยู่ ยืนยันลบลิงก์แล้วไฟล์อื่นยังอยู่ ตรวจ 1440×960, 1024×768 และ 390×844 ไม่ล้นแนวนอน/ขอบ modal และไม่มี JavaScript page error ลบข้อมูลทดลองและไฟล์ทดลองออกแล้ว
- MCP client ผ่านครบสามโปรไฟล์ และตรวจ Health healthy 9/9 รายการที่ตั้งค่าไว้ ภาพและหลักฐานตรวจอยู่ใน `.axercise/learning-links-*.png` / `.axercise/learning-links-verification.json` ไม่เผยแพร่ขึ้น Git

## เมนูระบบและระดับสี UI — 23 พฤศจิกายน 2026

- รวมเมนูข้ามระบบเป็น Hamburger ปุ่มเดียวด้านซ้ายล่าง ใช้ร่วมกันครบ Workspace, Learning, Library และ Daily Briefing มีสถานะหน้าปัจจุบัน จำนวนสรุปที่ยังไม่อ่าน และทางลัด Brain Dump / To-do / Calendar / ตั้งค่า บนจอเล็กใช้ปุ่มขนาดกระชับในส่วนหัว
- เพิ่มปุ่มกลับ Workspace เหนือชื่อหน้าที่แยกออกมา และเน้นปุ่มกลับรายการรายวิชา แยกสีพื้นหลัง/ข้อมูล/ส่วนที่กดได้ ปุ่มหลักพื้นขาว ปุ่มรองเทาเข้มมีขอบ และสถานะที่เลือกมองเห็นชัด ใช้สีแดงหม่นเฉพาะการลบและข้อผิดพลาด
- เมนูใช้ Radix Dropdown ที่ติดตั้งอยู่แล้ว ไม่เพิ่ม dependency ใหม่ มีลูกศร/Home/End/Enter/Escape ปิดด้วยการกดนอกเมนู และคืนโฟกัสปุ่มเปิดเมื่อปิดหน้าต่างจากเมนู ทางลัดใน Workspace เปิดหน้าต่างเดิมโดยรักษาหน้าแชทไว้ ทางลัดจากหน้าอื่นเปิดผ่าน query panel ที่ตรวจค่าก่อนใช้งาน
- TypeScript และ production build ผ่าน ตรวจจริงด้วย Playwright: เลือกระบบ/ปุ่มย้อนกลับ, ลิงก์ข้ามหน้ามายัง Brain Dump, เปิดและปิดทั้ง Brain Dump/To-do/Settings, โฟกัสกลับถูกต้องทั้งสามหน้าต่าง, โฟกัส Calendar และการนำทางด้วยคีย์บอร์ด ไม่พบ JavaScript page error
- ตรวจทั้งสี่หน้าที่ 1366×768, 1024×700 และ 390×844 รวม 12 กรณี ปุ่มเมนูและ popup อยู่ใน viewport ไม่มีเนื้อหาล้นแนวนอน; Library เลื่อนเฉพาะรายการหมวดเพื่อให้ปุ่มเมนูด้านล่างไม่หลุดจอ
- ตรวจสีที่ render จริงใน Library: อัตราส่วนข้อความ/พื้นหลังของปุ่มหลัก 16.02:1, ปุ่มกลับ 11.59:1 และหมวดที่เลือก 14.36:1 เป็นการตรวจเฉพาะจุดเหล่านี้ ภาพตรวจอยู่ใน `.axercise/ui-*.png` และไม่เผยแพร่ใน Git
- เปิดบริการกลับแล้ว Gateway ทั้งสาม connected และ Health ของบริการที่ตั้งค่าไว้ healthy 9/9 รายการ OpenRouter ยังไม่ได้ตั้งค่าตามเดิม การตรวจ UI ใช้การอ่านข้อมูล/เปิดหน้าต่าง ไม่กดบันทึก แก้ไข ลบ หรือส่งข้อความเข้า Agent

## Daily Briefing — 19 พฤศจิกายน 2026

- เพิ่มรายงานเช้า 08:00 / ก่อนนอน 21:00 เวลาไทย พร้อมประวัติ, unread, ลิงก์งานต้นทาง และการตั้งค่ารอบ/เวลา/Windows/Discord แยกกัน รายงานอ้างอิงข้อมูลจริงโดยไม่เรียกโมเดลเพิ่มหรือเปลี่ยนสถานะงาน
- รวมการบ้าน–To-do–Calendar ที่ลิงก์กัน; Completed ของการบ้านยังอยู่ในรายการรอส่ง ต่างจาก Submitted/Graded และแยกประวัติ Done เดิมออกจากความคืบหน้าที่บันทึกวันนี้ เมื่ออ่านบริการไม่ได้จะแสดงสถานะและเวลา ไม่ใช้ cache ข้ามบัญชี
- Scheduler บันทึก slot/lease ถาวร ไม่ส่งรอบเดิมซ้ำเมื่อ restart หรือเปลี่ยนเวลา ตามส่งได้ไม่เกิน 2 ชั่วโมง รองรับรอบดึกข้ามเที่ยงคืน ปิดรอบระหว่างอ่านข้อมูลแล้วไม่ส่งต่อ และย้ายรอบที่ยังไม่เคยสร้างรายงานไปเวลาใหม่ได้
- Discord ใช้ nonce และตรวจข้อความของบอทเดิมก่อนลองใหม่เมื่อคำตอบสูญหาย จำกัด mention เฉพาะเจ้าของและจำกัดความยาว Windows ใช้ native dispatcher เดิม แยก notification ID และ feedback endpoint ของ Briefing
- เพิ่ม automated tests 26 กรณี ครอบคลุมวัน/เวลาไทย, catch-up/activation, dedup/archives/submission, all-day end, นัดสอบที่แก้เวลาใน Google, progress/reopening/observed changes/focus/review, cache scope/outage, concurrent claims, disable/reschedule/expiry, Discord receipt/reconciliation/mentions, native leases, corrupt state และ local/internal/MCP auth
- ตรวจรวมรอบแรก 132/133 ผ่าน โดยกรณี Shortcut ของ Windows เดิมพบ PowerShell ETIMEDOUT ที่ขีดจำกัด 15 วินาที จึงเพิ่มเวลารอแบบมีขอบเขตเป็น 30 วินาที แล้วตรวจ Daily Briefing + Startup แยกกันผ่านครบ 29/29 รวมกรณีสิทธิ์/การรักษา Shortcut ของแอปอื่น ตรวจกรณี Calendar projection ที่ Done ขณะ Notion อ่านไม่ได้ผ่านเพิ่มเติม ชุดปัจจุบันมี 134 กรณี
- Production build และ TypeScript ผ่าน ตรวจผ่าน Playwright ทั้ง empty state, สร้างสรุปโดยยังไม่ส่ง, งานแบบขยาย, เลือกรอบก่อนนอน, ประวัติที่ไม่ถูก polling เปลี่ยนทับ, แจ้งรายงานใหม่, ตั้งเวลา/ช่องทาง และคำเตือนเมื่อ Calendar อ่านไม่ได้ เมนูมีครบ Workspace/Learning/Library
- ตรวจความกว้าง 390, 1000, 1440, 1920 และ 2560 px ไม่ล้นแนวนอนและไม่เหลือช่องว่างขวา; settings modal อยู่ภายใน viewport ภาพตรวจอยู่ใน `.axercise/briefing-*.png` ไม่เผยแพร่ขึ้น Git
- ทดสอบรายงานกับข้อมูลจริง: อ่าน Notion, Google Calendar และ Learning ได้สถานะ fresh ครบสามแหล่ง; กดลิงก์จากรายงานแล้วเปิดนัดหมายที่ถูกต้องใน Workspace โดยไม่บันทึกแก้ไขต้นทาง
- Secretary ส่งรายงานจริงเข้า Discord หนึ่งฉบับ ตรวจ receipt และสถานะ sent ถาวรแล้ว; นำรายงานเดียวกันเข้าคิวตรวจ Windows หนึ่งครั้งและได้รับ feedback ว่า native dispatch ถูกยอมรับ ไม่ได้ถือว่าเป็นการยืนยันจากผู้ใช้ว่าเห็น banner บนจอ กรณีส่งอัตโนมัติตามเวลาตรวจด้วย isolated clock fixtures โดยไม่แก้เวลาคอม/เวลาสรุปจริง
- MCP client ของ Hermes initialize/list/call briefings_list ผ่านครบสามโปรไฟล์: Hermes 28 tools, Secretary/Developer 27 tools มี briefings_list/read/generate/settings ทั้งหมด หลักฐานรายงานจริงอยู่ใน `.axercise/briefing-live-proof.json` และไม่ถูก commit
- หลังเปิดบริการกลับ ตรวจ Health กับบัญชีจริงได้ healthy 9/9 รายการที่ตั้งค่าไว้ และ Gateway Discord ทั้งสาม connected โดยไม่มีงานที่ต้องซ่อม OpenRouter ยังเป็น unconfigured ตามเดิม

## คลังบันทึก — 19 พฤศจิกายน 2026

- เพิ่ม local catalog และไฟล์ต้นฉบับแยกจาก Notion พร้อมข้อความ/ลิงก์/รูป/ไฟล์/เสียง/วิดีโอ ค้นหา แท็ก รายการโปรด pagination และถังขยะที่กู้คืนได้ ไฟล์แชร์หลายรายการไม่ถูกลบเมื่อยังมีผู้ใช้อ้างอิง
- API ตรวจ Host/Origin, revision, capture key, UUID, ขนาด upload และชนิด URL ไฟล์ active content บังคับดาวน์โหลดและมี nosniff/CSP; file route รองรับ range สำหรับ media โดยไม่ยอม path traversal
- Chat proxy คงภาพให้ vision และเพิ่ม attachment IDs ที่ตรวจจาก catalog ฝั่ง server ให้เครื่องมือ library_save เก็บต้นฉบับจริง ข้อมูลอ้างอิงนี้ไม่แสดงเป็นข้อความเทคนิคในหน้าแชท
- MCP ให้ทุก Agent ใช้ library_list/read/save/trash; การนำเข้าไฟล์จาก Discord จำกัดโฟลเดอร์ cache/attachments/downloads ภายใน Profile เดียวกันและตรวจ symlink/realpath
- ชุดทดสอบรวม 108 รายการผ่าน โดยเพิ่ม library 18 กรณี ครอบคลุม persistence/bytes, ชื่อซ้ำ, idempotency, stale edit, search/filter/pagination, URL validation, trash/restore/shared-file deletion, staging cleanup, corrupt catalog, import profile/symlink boundary, chat references/proxy, range/active-content download, local auth และเครื่องมือทั้งสาม Agent รวมการเพิ่มไฟล์ผ่าน AI โดยรักษาไฟล์เดิมไว้
- Production build/TypeScript ผ่าน และลองผ่าน Playwright กับไฟล์จริง: อัปโหลด PNG+ข้อความในรายการเดียว/หลายลิงก์, เปิดกลับหลัง reload, favorite, ค้นหาข้อความที่แก้ไข, trash/restore/permanent delete และวางภาพจาก clipboard ไฟล์ดาวน์โหลดมี bytes ตรง และข้อความ HTML แสดงเป็นข้อความโดยไม่ execute
- PDF เปิดใน viewer จริง; WAV โหลด metadata ได้ duration 1 วินาที ตรวจ Desktop 1536×960 และ Mobile 390×844 รวม editor/modal โดยไม่ล้นแนวนอน ภาพอยู่ใน test-results/library-*.png
- ทดสอบผ่าน Hermes และโมเดลที่ตั้งอยู่จริง: ส่งภาพ PNG กับไฟล์ข้อความและลิงก์ในแชท Agent เรียก mcp__axercise__library_save และ library_read บันทึกรวมหนึ่งรายการพร้อมต้นฉบับ 2 ไฟล์ ตรวจ bytes รูปเท่าต้นฉบับ แล้วลบเฉพาะรายการ/Session ทดสอบ หลักฐานใน test-results/library-live-verification.json
- MCP client ของ Hermes initialize/list/call library_list ผ่านครบสามโปรไฟล์: Hermes 24 tools, Secretary/Developer 23 tools ไม่ส่งข้อความทดสอบเข้า Discord; การนำเข้าไฟล์ cache ฝั่ง Discord มี automated profile/realpath boundary และ byte-copy tests

## ศูนย์สถานะระบบ — 19 พฤศจิกายน 2026

- ตรวจบัญชีจริงผ่าน 9 รายการที่ตั้งค่าไว้: Axercise controller/Windows heartbeat, AI Hermes/Secretary/Developer, Notion พร้อม data source ทั้งสาม, Google Calendar และ Discord ทั้งสามบอท OpenRouter แสดง unconfigured เพราะยังไม่มี Key
- AI ตรวจ catalog ของบัญชีโดยไม่สร้างข้อความหรือ Session กรณีมี OAuth credential เดียวที่ยังไม่ใกล้หมดอายุและไม่ติด cooldown จะตรวจตรงโดยไม่เปิด Python เพิ่ม ถ้า Token ใกล้หมดอายุ/ถูกปฏิเสธหรือ credential store มีหลายรายการ จะให้ Hermes เลือกและต่ออายุภายใต้โปรไฟล์นั้นตามเดิม ใช้ Accept-Encoding identity และไม่ติดตาม redirect ผลตรวจไม่รับรอง inference/โควตาทุกโมเดล
- อ่าน Gateway จาก authenticated health/detailed รวมงาน API chat/delegation/process completions สำหรับป้องกันการ restart ขณะมีงาน Controller รองรับ restart_agent เฉพาะชื่อ Agent สามตัวภายใต้ service key ไม่รับ PID/คำสั่งจาก client
- Notion ตรวจ Token/metadata/schema Tasks และ Brain Dump รวม Learning source เมื่อมี ID; Calendar ตรวจสิทธิ์อ่านและลอง refresh เมื่อ cached access token ถูกปฏิเสธ 401; Discord ตรวจ Token, Message Content intent, server membership และ Gateway พร้อมคำนวณสิทธิ์ห้องแจ้งเตือนตาม everyone/role/member overwrites
- มี engine เก็บเหตุและคิวแจ้งสถานะใน health.json ปัญหาชั่วคราวไม่ส่งแจ้งเตือนทันที รวมเหตุพร้อมกันเป็นชุดเดียว ส่ง recovery ครั้งเดียวและ supersede outage ที่ยังไม่ส่งหลังบริการฟื้นตัว มี lease/retry แยก Windows/Discord และไม่ปะปนกับรอบเตือนงาน
- ชุดทดสอบทั้งหมด 90/90 ผ่านด้วย test-concurrency=1 รวม health tests 16 กรณี, Codex light probe 4 กรณีและ controller เพิ่ม 2 กรณี ครอบคลุม transient/persistent failure, recovery/batching/restart persistence, queue/lease/retry, owner-only mention, permission overwrite, Notion access failure, Calendar refresh, Gateway disconnect, active API chat guard, post-repair fresh sampling, credential expiry/cooldown/fallback และ Host/Origin/service authentication/input validation Production build และ TypeScript ผ่าน
- บัญชีที่ต้องยืนยันตัวตนยังต้องใช้ OAuth/คำสั่งล็อกอินของผู้ใช้ ไม่เปลี่ยน Token หรือสิทธิ์ของบริการอัตโนมัติ การตรวจระบบทำงานเมื่อคอมตื่นและบริการ Axercise ยังรันอยู่
- Playwright ใน isolated context ตรวจ 10 cards/filter เหลือ 4 ปัญหาตามข้อมูลจำลอง, คำสั่งล็อกอิน Secretary ตรงโปรไฟล์, repair target เป็น Developer, Google reconnect redirect, เปิด Settings Notion ตรงหมวด และ preferences คงค่าหลัง reload ภาพ desktop 1536×960 และ mobile 390×844 อยู่ใน test-results/health-center-*.png ไม่มี horizontal overflow/console error ใน context นี้
- ทดสอบเริ่ม Developer Gateway ใหม่กับระบบจริง: Developer กลับมาเชื่อม Discord ได้ โดย PID ของ Hermes/Secretary, instance ของ controller และ web process คงเดิม ระหว่างเริ่มใหม่ UI แสดงสถานะกำลังเชื่อมและไม่แจ้ง outage จากการ restart ตามคำขอ
- การตรวจบัญชี ChatGPT เรียงทีละโปรไฟล์ โดยใช้ Python เฉพาะเมื่อจำเป็น ส่วนการตรวจ HTTP ของบริการอื่นยังทำต่อได้ รอบตรวจจริงหลังปรับใช้เวลารวมประมาณ 2.4 วินาทีและผ่านครบ 9 บริการที่ตั้งค่าไว้ ตัวตรวจที่หมดเวลาแสดงปัญหาของการตรวจโดยไม่สรุปว่าเป็นการล็อกอินผิด หลักฐานผลตรวจจริงรอบสุดท้ายเก็บใน test-results/health-verification.json และภาพจริงใน test-results/health-center-live.png

## To-do เชื่อม Calendar — 18 พฤศจิกายน 2026

- เพิ่ม checkbox แสดงงานใน Calendar ในฟอร์ม To-do ทั้งงานใหม่และงานเดิม ใช้วันที่ที่มีอยู่เพียงช่องเดียวและคงเวลาเดิมถ้าไม่ได้เปลี่ยนวัน งานที่มาจากการบ้านใช้ Task ID เดิม
- ใช้ To-do เป็นข้อมูลต้นทางของสำเนา Calendar แก้ชื่อ รายละเอียด วัน และสถานะจาก To-do/Tasks MCP แล้วอัปเดต event เดิม Done แสดง ✓ และไม่สร้างเตือนเพิ่มจากสำเนา Calendar เปิดรายการชนิด To-do ใน Workspace Calendar แล้วเปิด Task Editor ต้นทางโดยตรง
- การแก้ผ่านแอป Google Calendar โดยตรงไม่ได้ดึงกลับไปแก้ To-do ในรอบนี้ ให้แก้ที่งานต้นทางหรือสั่ง AI ผ่าน Tasks tools เพื่อรักษาข้อมูลให้ตรงกัน
- มีมุมมองวันเดียว/7 วัน ปฏิทิน 7 วันนับจากวันที่เลือกและขยายแผง Desktop เมื่อพื้นที่เดิมเล็กเกินไป ยังปรับขนาดด้วยตัวลากชุดเดิมได้
- เก็บคำขอเชื่อมและรหัส event ใน task-calendar.json แบบ atomic มี ownership metadata และ deterministic event IDs เมื่อคำตอบจาก Google หายจึงตรวจรายการเดิมก่อนสร้างซ้ำ การยกเลิก/ลบแตะเฉพาะ event ของ task/source ที่ตรงกัน และคง Calendar ปลายทางเดิมไว้จนผู้ใช้ยกเลิกแล้วเชื่อมใหม่
- Calendar ล้มเหลวไม่ทำให้งาน Notion ที่บันทึกแล้วถูกรายงานว่าไม่ได้บันทึก มีสถานะ error/pending บนงานและ retry เบื้องหลัง งานที่ลบจาก Notion ถูกตรวจจาก full successful read; การอ่านล้มเหลวไม่ถือเป็นการลบ
- Automated suite 68/68 ผ่าน รวม 10 กรณี To-do/Calendar ใหม่และกรณี reminder deduplication ใหม่ ครอบคลุม date-only/exclusive end, เวลาเดิม, complete/reopen, lost create response, unlink/relink/tombstone, แก้/ลบจาก Notion, source failure, ไม่มีวันที่, ownership, Calendar target และ concurrent updates Production build และ TypeScript ผ่าน
- บัญชีจริง: สร้าง Task ทดสอบใน Notion แล้วเชื่อม Google Calendar, อ่านใน 7 วัน, แก้ชื่อ/วัน/Done โดยใช้ event เดิม, ยกเลิกเชื่อมแล้ว Task ยังอยู่, เชื่อมใหม่ด้วย ID ใหม่ และ archive Task แล้วลบสำเนา Calendar สำเร็จ เก็บรายการทดสอบในถังขยะ Notionแล้ว ไม่แก้งานจริงของผู้ใช้ หลักฐานใน test-results/task-calendar-verification.json
- Playwright ใช้ isolated browser context และ API mock ตรวจวันที่มีช่องเดียว, body calendarEnabled, มุมมอง 7 วัน, Calendar เปิด Task ต้นทาง, Done และยกเลิกเชื่อมโดย Task ยังอยู่ ภาพอยู่ใน test-results/task-calendar-*.png รวมจอแคบ 390×844 ที่ไม่ล้นแนวนอน

## เปิดพร้อม Windows — 18 พฤศจิกายน 2026

- ติดตั้งและเปิดใช้ Startup shortcut สำหรับบัญชี Windows ปัจจุบันแล้ว ใช้ Windows Script Host เรียก Node.js ด้วยพาธเต็มแบบซ่อนหน้าต่าง และใช้ CLI start --no-open จึงไม่เปิด browser
- มีสวิตช์บันทึกทันทีใน Settings → Workspace กับ CLI `axercise startup on/off/status` API ตรวจ Host/Origin/client header และรับเฉพาะ boolean โดยไม่รับพาธหรือคำสั่งจาก browser
- Shortcut สร้าง/อ่านด้วย IShellLinkW เพื่อรองรับพาธ Unicode ไม่แก้สิทธิ์เครื่องหรือรายการ Startup ของโปรแกรมอื่น ตรวจรายการที่ Windows ปิดไว้แล้วแสดงวิธีเปิดจาก Windows Settings
- ชุดทดสอบรวม 57/57 ผ่าน รวม 3 กรณี Windows จริงในโฟลเดอร์แยก: เปิด launcher จากพาธภาษาไทย/ช่องว่าง/apostrophe/& ได้, เปิดซ้ำและซ่อม launcher ที่เก่าได้, ปิดเฉพาะ shortcut ตัวเองและไม่เขียนทับรายการอื่น Production build และ TypeScript ผ่าน
- ทดสอบเปิดจาก shortcut ที่ติดตั้งจริงขณะบริการหยุดอยู่ และเรียกอีกครั้งแล้วใช้ controller PID/instance เดิม ตรวจ log ว่าเริ่มสำเร็จ ไม่ได้รีบูตหรือล็อกเอาต์ Windows ของผู้ใช้ หลักฐานใน `test-results/windows-startup-verification.json`
- ทดสอบสวิตช์จากหน้า Settings จริงทั้งปิดและเปิดกลับ สถานะตรงกับ Windows และบริการปัจจุบันไม่ถูกหยุด ตอนจบตั้งไว้เปิด ตรวจ API ปฏิเสธ cross-origin/ไม่มี client header ด้วย 403 และ non-boolean/ฟิลด์คำสั่งเพิ่มเติมด้วย 400 ภาพอยู่ใน `test-results/windows-startup-settings.png`
- การสั่ง `axercise stop` หยุดรอบปัจจุบันโดยไม่ยกเลิกเปิดครั้งถัดไป ส่วน startup off ยกเลิกการเปิดครั้งถัดไปโดยไม่หยุดบริการปัจจุบัน หากย้ายโปรเจกต์หรือ Node.js ให้เปิดใช้จากตำแหน่งใหม่อีกครั้ง

## Discord — สถานะเชื่อมต่อ 18 พฤศจิกายน 2026

- สร้างบอทใหม่ Axercise Hermes, Axercise Secretary และ Axercise Developer เปิด Message Content / Server Members intents และบันทึก Token ใน config ของเครื่อง
- บอททั้งสามถูกเพิ่มเข้าเซิร์ฟเวอร์ Work with me แล้ว ตรวจผ่าน Discord Bot API ว่า application/owner ตรงกับบัญชีผู้ใช้ และจำกัดผู้สั่งงานด้วย User ID ของผู้ใช้
- Gateway state ของแต่ละโปรไฟล์รายงาน Discord connected ครบทั้งสาม ตัว API server และ MCP ใช้โปรไฟล์เดิมของ Workspace จึงใช้ Notion/Google Calendar ที่เชื่อมแล้วได้
- ตรวจแบบอ่านอย่างเดียวด้วย `node scripts/check-discord.mjs "Work with me"` ผ่านครบทั้งสาม: Token ถูกต้อง, owner ตรง, intent อ่านข้อความเปิด, อยู่ในเซิร์ฟเวอร์เป้าหมาย และ process Gateway ยังทำงาน
- ผู้ใช้ส่งข้อความจากบัญชีจริงใน Discord และยืนยันว่าทั้งสามตอบแล้ว ตรวจ Session ของแต่ละโปรไฟล์พบ user/assistant turns และ `tool_call` ที่เรียก `mcp__axercise__calendar_list` พร้อมผลลัพธ์สำเร็จ ทั้งสามสรุปปฏิทินวันที่ 18 พฤศจิกายนตรงกับข้อมูลจริง
- เปิดตัวเลือก “รวม Session จาก Discord” ใน Workspace สลับครบทั้งสาม Agent และเปิด Session จริงได้ มีป้าย Discord Session และประวัติ user/assistant API อ่าน Session ID เดียวกันได้ หลักฐาน metadata อยู่ใน `test-results/discord-connection.json`
- การส่งข้อความจาก Workspace ให้ปรากฏเป็นข้อความในช่อง Discord โดยอัตโนมัติยังไม่ได้ทดสอบ; ผลรอบนี้ยืนยันรับ/ตอบบน Discord, MCP และเปิดอ่านประวัติ Discord ในเว็บ
- เชื่อม Secretary เข้าห้อง #แจ้งเตือน ใน Work with me แล้ว ส่งรายการทดสอบจริงพร้อม Reaction controls สำเร็จ; รายละเอียดการตรวจ Windows และการเตือนอยู่ด้านล่าง

## ศูนย์แจ้งเตือน — 18 พฤศจิกายน 2026

- เชื่อม Secretary กับ Text Channel #แจ้งเตือน ที่ผู้ใช้สร้างใน Work with me แล้ว ส่งรายการทดสอบจริงและรายการ Calendar ที่ถึงกำหนดสำเร็จ API บันทึก Discord message IDs พร้อมสถานะส่งสำเร็จ และเพิ่ม Reaction ✅ / 💤 ได้
- Native Windows ลงทะเบียน Start Menu shortcut พร้อม AppUserModelID `Axercise.Workspace` แล้ว ตรวจ property ของ shortcut ตรงกัน และ WinRT ToastNotifier.Setting เป็น Enabled พบรายการทดสอบจริงใน Windows notification history การตรวจนี้ยืนยันการเข้าศูนย์แจ้งเตือน ไม่ยืนยันว่าแบนเนอร์ลอยขึ้นเหนือแอปอื่นหรือผู้ใช้กดปุ่มแล้ว
- มีปุ่มกระดิ่งทุกหน้า หน้าศูนย์แจ้งเตือนเปิด–ปิดระบบ/Windows/Discord/เสียง และเลือกความถี่ได้ ค่าเริ่มต้นก่อน 30/15/5 นาที และเมื่อถึงเวลา จากนั้นซ้ำทุก 10 นาที จับเวลาอ่านเตือนเมื่อจบรอบเท่านั้น
- รับทราบ/เลื่อนจากทุกช่องทางใช้สถานะไฟล์เดียวกัน ไม่เปลี่ยนงานเป็นเสร็จหรือส่งการบ้านแทนผู้ใช้ งานทำเสร็จแต่ยังไม่ส่งยังเตือน รอบที่ส่งแล้วไม่ยิงซ้ำทุก tick และหลัง sleep ส่งเฉพาะรอบล่าสุด
- ครอบคลุม Calendar, Notion Tasks, การบ้าน, สอบ/ประเมิน, แผนอ่าน, Flashcards, รอบอ่าน และฉบับร่างที่มีกำหนดส่ง เชื่อม ID เพื่อรวมรายการซ้ำ เก็บข้อมูลเดิมเมื่อแหล่งออนไลน์ล้มเหลว และแยก snapshot ฉบับร่างตาม browser client
- Automated tests รวม 54/54 ผ่าน รวม 15 กรณีใหม่ของ reminder engine/delivery: ช่วงเวลา/ซ้ำ, snooze, restart, เปลี่ยนกำหนดการ, แหล่งล้มเหลว, linked sources, รอส่งการบ้าน, native retry/lease, บัญชี Discord ที่มีสิทธิ์, snooze reaction ไม่ยืดเวลาเอง และรับทราบข้อความเดิมหลัง snooze ได้ Production build พร้อม TypeScript ผ่าน
- Hermes MCP client ที่ติดตั้งเรียก `reminders_list` จริงผ่านครบสาม Agent โดยไม่เรียกโมเดล Tool inventory เป็น 20 ของ Hermes และ 19 ของ Secretary/Developer
- ตรวจ HTTP จริง: GET feed สำเร็จและไม่มี credential จาก config, ปฏิเสธ cross-origin write ด้วย 403 และ internal desktop feedback ที่ไม่มี service key ด้วย 401
- Playwright ใช้ browser context แยกและ API จำลอง ตรวจรับทราบ/เลื่อน/filter/ตั้งค่าความถี่และ reload ผ่าน ไม่เขียนข้อมูลทดสอบเข้า Notion/Calendar ภาพ desktop 1536×960 และจอแคบ 390×844 อยู่ใน `test-results/reminder-center-*.png` ศูนย์แจ้งเตือนกว้างไม่เกิน viewport และเลื่อนรายการภายในได้ ไม่มี console error ใน context ทดสอบ
- บริการเบื้องหลัง tick ทุก 20 วินาที สแกนข้อมูลทุก 60 วินาที แยกการส่ง Discord ออกจาก native จึงไม่รอเครือข่าย Discord ก่อนเด้ง Windows Native ไม่ต้องเปิดแท็บหรือขอ permission ของ browser; Windows DND/banner settings ยังมีผล และระบบไม่เปลี่ยนค่าของ OS ให้เอง
- ยังรอผู้ใช้ยืนยันการเห็นแบนเนอร์และกดปุ่ม native Windows กับ Reaction จากบัญชี Discord จริง ชุดทดสอบจำลองยืนยันสัญญา API/สถานะร่วม แต่ไม่ใช้แทนการกดบนระบบจริง คอมปิด/sleep หรือ `axercise stop` จะไม่เตือน
- รับทราบรายการทดสอบที่สร้างเองหลังตรวจเพื่อหยุดการเตือนทดสอบซ้ำ ไม่เปลี่ยนสถานะกำหนดการจริงของผู้ใช้ หลักฐานสรุปไม่มี credential อยู่ใน `test-results/reminders-verification.json`

## Calendar / To-do — ลากปรับขนาดบน Desktop

- ลากขอบซ้ายเพื่อขยายความกว้างของแถบขวาทั้งชุด และลากขอบล่างของ Calendar / To-do เพื่อปรับความสูงแยกกัน บันทึกขนาดใน localStorage ของ browser; ดับเบิลคลิกขอบหรือกด Enter เมื่อ focus ขอบเพื่อคืนขนาดเดิม
- ปรับผ่านปุ่มลูกศรได้ พร้อม separator label/value; มี pointer capture และคืน cursor หลังจบการลาก
- To-do แสดงทุกงานตาม filter โดยเลื่อนในกล่องได้ ยกเลิกเพดานเดิม 8 งาน Calendar ตัดบรรทัดชื่อ/สถานที่ตามพื้นที่ที่ขยาย
- Playwright ใน browser context แยก พร้อม response จำลอง 14 งาน/8 นัด: ลากความกว้างจาก 356 เป็น 568px, Calendar จาก 422 เป็น 585px, To-do จาก 428 เป็น 548px และ reload แล้วยังคงขนาดตรงเดิม งานจำลองไม่ถูกส่งเข้า Notion/Google
- ตรวจ double-click reset, keyboard resize/reset และขอบเขตเมื่อเปลี่ยน viewport: 1038px / 1200px จำกัดให้พื้นที่แชทยังเหลือ 330px; 2560px ขยายแถบได้สูงสุด 840px ไม่มีแนวนอนล้น ที่ 390px ซ่อนตัวลากและเปิด popup Calendar/To-do ได้ตามเดิม
- TypeScript และ production build ผ่าน เปิด managed Axercise กลับแล้ว ภาพรายการจำลอง: `test-results/workspace-resizable-panels.png`

## Google Calendar — เชื่อมบัญชีจริงแล้ว

- โปรเจกต์ Google Cloud `axercise-workspace` เปิด Calendar API และ Web OAuth client พร้อม redirect กลับ loopback ของ Axercise บัญชีผู้ใช้เพิ่มเป็น Test user และอนุญาตสิทธิ์แล้ว
- Callback บันทึก refresh token ใน config ฝั่งเครื่อง; หน้า Settings โหลดรายการปฏิทินได้ และเลือกใช้ `primary`
- ทดสอบ API จริง: เพิ่มกิจกรรมชั่วคราวในวันที่ผ่านมา อ่านกลับ แก้ชื่อโดยใช้ ID เดิม ลบ และอ่านยืนยันว่าไม่เหลือกิจกรรมทดสอบ ผ่านทั้งหมด
- ทำให้ access-token cache หมดอายุแล้วอ่าน Calendar อีกครั้งสำเร็จ ยืนยันว่าระบบใช้ refresh token และบันทึก access token ใหม่ได้
- MCP client ของ Hermes ที่ติดตั้งเรียก `calendar_list` สำเร็จครบ Hermes, Secretary และ Developer โดยไม่เรียกโมเดล
- ลบสำเนา Client Secret ในไฟล์ดาวน์โหลด/ภาพสถานะ debug ที่สร้างระหว่างตั้งค่าแล้ว เก็บค่าที่ใช้งานใน config ของแอป
- OAuth app ยังอยู่ External / Testing: [Google กำหนด refresh token อายุ 7 วันสำหรับ scope Calendar](https://developers.google.com/identity/protocols/oauth2/#expiration) เมื่อหมดอายุให้กดเชื่อมบัญชี Google ใหม่ใน Settings; การเปลี่ยนสถานะ OAuth เป็น Production ยังไม่ได้ทำ
- Discord Gateway เชื่อมทั้งสามโปรไฟล์แล้ววันที่ 18 พฤศจิกายน; การคุยจริง/Calendar ผ่าน Discord และอ่านประวัติใน Workspace ผ่านแล้วตามหัวข้อ Discord ด้านบน ส่วนการแจ้งเตือนเชื่อมห้อง #แจ้งเตือน และส่งจริงแล้ว

## ปุ่มลบเอกสาร และการบ้านเชื่อม Eisenhower

- เพิ่มปุ่มลบบนการ์ดเอกสาร หน้าอ่าน และรายการเก็บย้อนหลัง มีหน้าตรวจจำนวนเวอร์ชัน/โน้ต/ชุดทบทวน/ฉบับส่งก่อนยืนยัน ลบต้นฉบับทุกเวอร์ชันและดัชนีจริง เก็บ metadata ที่จำเป็นสำหรับอ้างอิงและกันซิงก์ดึงกลับ
- Browser กับพื้นที่ทดสอบแยก: ยืนยันลบเอกสารสองเวอร์ชันแล้วรายการเหลือ 0, API ไฟล์ทั้งสองคืน 404 และโน้ตเดิมยังอยู่ ภาพ `test-results/document-delete.png`
- ทดสอบการลบที่ชน revision, ไฟล์ถูกล็อกแล้วลองลบซ้ำ, Notion ส่งข้อมูลเก่ากลับมา และ ZIP คืนไฟล์เฉพาะเมื่อเลือกใช้ชุดสำรองผ่าน
- การบ้านมีตัวเลือกแสดงใน To-do List และเลือก Eisenhower สี่ช่อง ทั้งฟอร์มเพิ่ม/แก้และการบ้านเดิม การแก้ชื่อ กำหนดส่ง สถานะ และช่องเชื่อมสองทาง พร้อมลิงก์กลับรายวิชา
- กับ Notion จริง: เพิ่มการบ้านจากเว็บโดยเลือกทำทันที อัปเดตจาก Task Editor เป็นวางแผน/เสร็จแล้ว กลับมาที่รายวิชาเป็น Completed (รอส่ง) และยังเป็น 09:30 ตามกำหนดเดิม ใช้ Task ID เดิม
- MCP รองรับ `learning_save` ที่ระบุ taskRequested/taskImportant/taskUrgent และ `learning_link` ที่เลือก quadrant 0–3 เครื่องมือใช้ตัวเชื่อมเดียวกับ UI
- ชุดทดสอบล่าสุด **39/39 ผ่าน** รวมการวางทั้งสี่ช่อง ไม่สร้างซ้ำ การเชื่อมกลับวิชา ความเข้ากันได้กับข้อมูลเดิม และคำขอซิงก์ที่เข้าพร้อมกัน TypeScript และ production build ผ่าน
- ตรวจและลบข้อมูลทดสอบโดยใช้ ID ของรายวิชา/การบ้านที่สร้างในพื้นที่ทดสอบเท่านั้น ข้อมูลผู้ใช้เดิมยังอยู่

## ระบบการเรียน — ผลตรวจเพิ่มเติม

พัฒนาหน้า `/learning` ตาม Project_Plan ระยะ 5–10 แล้ว โดยตรวจด้วยแคตตาล็อก/ไฟล์ทดสอบแยกจากข้อมูลจริงของผู้ใช้ เว็บหลักยังเริ่มด้วยรายวิชาว่างพร้อมให้เพิ่มเอง

| การตรวจ | หลักฐานและผล |
| --- | --- |
| Automated tests | ผ่าน 31/31: สัญญาเดิม 10, controller 6, การเรียน 15 |
| การเก็บข้อมูล | เทอม/วิชาซ้ำคนละเทอม, Archive, revision ป้องกันทับข้อมูลเก่า, แหล่งอ้างอิงและไฟล์ของวิชาต่างกันถูกปฏิเสธ |
| ไฟล์จริงผ่าน API | PDF ไทย/อังกฤษอ่านข้อความได้; PDF สแกนและ PNG ระบุว่าต้องอ่านภาพ; TXT, DOCX, PPTX, XLSX สกัดข้อความผ่าน รวมค่าเซลล์ตัวเลข; HTTP Range คืน 206 และช่วงไบต์ตรง |
| เวอร์ชัน/ส่งงาน | ชื่อไฟล์ซ้ำไม่ทับข้อมูล, เพิ่มเวอร์ชันพร้อมหมายเหตุผ่านหน้าจอจริง, เก็บไบต์ฉบับแรกและฉบับที่ส่งไว้, reading/bookmark แยกเวอร์ชัน; checksum ตรวจต้นฉบับเมื่อเปิดไฟล์ |
| สำรอง/นำกลับ | ZIP ผ่าน API พร้อม preview/apply; unit tests คืนข้อมูลและไฟล์จากแคตตาล็อกว่าง ตรวจ checksum/เส้นทางอันตราย/ไฟล์หาย และป้องกันนำเข้าทับข้อมูลที่แก้หลัง preview; กู้ไฟล์หาย/เสียหายได้โดยเก็บสำเนาเสียแยกไว้ |
| คะแนน | หลายงานในกลุ่ม, คะแนนศูนย์, รอผล, น้ำหนักและคะแนนเป้าหมายผ่านตัวอย่างที่ทราบผล |
| Notion บัญชีจริง | สร้าง/จดจำ Learning database, ส่งรายละเอียด, กดซ้ำเมื่อข้อมูลคงที่ไม่ส่งใหม่, แก้ข้อมูลใน Notion แล้วดึงกลับได้; เชื่อมงานเดียวกับ Tasks ซ้ำแล้วไม่สร้างงานเพิ่ม; ย้ายแถวทดสอบที่ติดตาม ID ไว้ 11 แถวเข้าถังขยะแล้ว |
| การซิงก์แบบจำลอง | การแก้สองฝั่งแสดง conflict, response หายหลังสร้าง Task กู้ ID กลับได้, การแปลงแผนเป็นงานอ่านกดซ้ำไม่เพิ่มงาน; Google event ID คงที่เมื่อส่งซ้ำ |
| AI บัญชี ChatGPT จริง | ถาม/สรุปจาก PDF พร้อม S1 ที่ชี้ไฟล์–เวอร์ชัน–หน้า, cards, checklist, แผนสอบ และ OCR PDF สแกนผ่าน; ถามเบอร์โทรที่ไม่มีในเอกสารตอบว่าไม่มีและไม่แต่งเบอร์; ตรวจ rubric กับไฟล์งานจริงได้ 4 เกณฑ์ และไม่มีไฟล์งานบังคับผลเป็นยังยืนยันไม่ได้ |
| AI tools | ตัวสร้างคำตอบเรียนใช้ Hermes runtime แบบปิด tools และไม่โหลด memory/ไฟล์บริบทของ Agent; โน้ต/ชุดคำถาม/แผนจะเก็บเมื่อผู้ใช้บันทึก |
| MCP จริง | learning_list/read/search อ่านวิชาและข้อความ PDF จากชุดทดสอบได้ มีเครื่องมือเรียน 5 ตัว รวม learning_link ที่ใช้ connector เดียวกับ UI; check-mcp.py ตรวจ learning_list และ tool inventory จากเว็บหลักด้วย |
| Browser flow | สร้างการบ้าน → อัปโหลดไฟล์จาก file chooser → เลือกฉบับที่ส่ง → บันทึกส่ง/เวลา; คั่นหน้า PDF; พลิก Flashcard/ให้คะแนนตนเอง; จับเวลา/พัก/จบรอบ |
| Reload/restart | เปิดบริการทดสอบใหม่จากข้อมูลเดิม: วิชา/ไฟล์/ประวัติทบทวนยังอยู่ รอบอ่านคืน 24:36 ขณะหยุดพักและโน้ตจุดที่อ่านตรงเดิม |
| UI | ตรวจ 1536×960, 1280×800, 768×900 และ 390×844 ไม่ล้นแนวนอน; แก้ปุ่มทุกเทอมที่ขยายเต็ม sidebar; flow ปกติไม่มี console error การทดสอบไฟล์เสียตั้งใจคืน HTTP 409 พร้อมแสดงวิธีกู้; preview ZIP ระบุไฟล์เสีย 1 ไฟล์แล้วกู้ผ่านหน้าจอสำเร็จ |

ภาพตัวอย่าง: `test-results/learning-overview.png`, `learning-pdf.png`, `learning-grades.png`, `learning-narrow.png` ภาพใช้วิชาและไฟล์ทดสอบ

ติดตั้ง PyMuPDF 1.28.2 แยกจากไฟล์ข้อมูลผู้ใช้ และอัปเดต Next จาก 16.4.3 เป็น 16.4.5 ซึ่งแก้ [GHSA-mfr8-8qww-v76h](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h) Production build ไม่ติด security-version gate แล้ว และยกเว้น `.axercise/` จาก output tracing

ขอบเขตที่ยังต้องเชื่อม/ตรวจรับ: Discord Gateway เชื่อมและบอททั้งสามคุยจริง/เรียก Calendar ผ่าน MCP/เปิดอ่านประวัติใน Workspace ได้แล้ว reminders ส่งจริงแล้ว แต่การยืนยันแบนเนอร์/ปุ่ม Windows จากผู้ใช้ และการสะท้อนคำตอบจากเว็บไปช่อง Discord อัตโนมัติยังรอตรวจ; Google OAuth/Calendar ผ่านบัญชีจริงแล้วตามผลด้านบน แต่การส่งแผนอ่าน/วันสอบจากการเรียนยังต้องตรวจรับกับวิชาจริง OpenRouter ยังไม่มี key การคำนวณคะแนนอิงรายการประเมินที่ผู้ใช้เพิ่มไว้; PDF/Image preview ทำงานในเว็บ ส่วน Office เป็นข้อความสกัด/ดาวน์โหลด; AI ใช้ข้อความสูงสุด 10 หน้า/ส่วนต่อคำขอและอ่านภาพทีละหน้า ไม่ได้อ่านทั้งเล่มทุกครั้ง ผู้ใช้ยังต้องตรวจคำตอบ/แผน/checklist และทดลอง flow ด้วยวิชาจริง

## สิ่งที่ทำแล้ว

- แอป Next.js App Router, TypeScript, Tailwind CSS และ Radix/shadcn-style components พร้อมเลย์เอาต์ดำ–เทาตามภาพอ้างอิง
- แถบ Agent 3 ตัว, Session picker, แชท streaming, progress ของเครื่องมือ, หยุดงานผ่าน Runs API และแนบ/วางภาพ
- ตัวเลือก provider/model จาก Hermes model inventory และรองรับใส่ model ID
- Calendar รายวัน/รายสัปดาห์และฟอร์มเพิ่ม/แก้/ลบนัดหมาย
- Tasks แบบ Eisenhower พร้อมรายละเอียด สถานะ Deadline และหน้าดูทั้งหมด
- Brain Dump drawer พร้อมฉบับร่างใน browser และส่งเข้า Notion ด้วยตัวเอง
- API สำหรับ Notion, Google OAuth/Calendar และ MCP tools ที่ใช้ connector ชุดเดียวกับหน้าเว็บ
- เครื่องมือให้ Hermes มอบหมายงานจริงไปยัง Secretary/Developer พร้อม Session และความจำแยกกัน
- Profile home ใหม่แยกตัวใต้ `.axercise/hermes/` และตัวจัดการ process ที่ฟังบน loopback
- หน้าตั้งค่า credential โดย API ไม่ส่งค่า token กลับไปยัง browser
- คำสั่ง start/stop/restart/status/login, process เบื้องหลัง และตัวจัดการแจ้งเตือน Windows/Discord แบบเตือนซ้ำ พร้อมรับทราบ/เลื่อนเวลาร่วมกัน

## ผลตรวจที่ยืนยันแล้ว

| การตรวจ | ผล |
| --- | --- |
| TypeScript | ผ่าน |
| Production build | ผ่าน และรันทวนหลังการเก็บรายละเอียดรอบท้าย |
| Automated contracts | ผ่าน 10 รายการ |
| Automated controller tests | ผ่าน 6 รายการ |
| Notion กับบัญชีจริง | สร้าง Tasks และ Brain Dump ใหม่ใต้หน้า Axercise สำเร็จ; เพิ่ม อ่าน แก้ไข และย้ายรายการทดสอบเข้าถังขยะผ่านทั้งสองชุด รวมข้อความภาษาไทย |
| Notion ผ่าน MCP ของแต่ละ Agent | `tasks_list` และ `notes_list` ผ่านครบ Hermes, Secretary และ Developer |
| Hermes config loader ของโปรแกรมที่ติดตั้ง | ผ่านครบ Hermes, Secretary และ Developer |
| MCP client ของ Hermes ที่ติดตั้ง | initialize/list_tools และ learning_list ผ่านครบ 3 ตัว: Hermes 18 tools, Secretary/Developer ตัวละ 17 tools โดยไม่เรียกโมเดล |
| การเริ่มเว็บผ่าน launcher | เปิด localhost ได้และคืนข้อความพร้อมใช้งาน |
| คำสั่ง `axercise` แบบ global | ลงทะเบียนด้วย npm link และเรียกผ่าน CMD จากโฟลเดอร์อื่นได้แล้ว |
| การเริ่มซ้ำ | ใช้ managed process ตัวเดิม ไม่สร้าง daemon ซ้ำ |
| การหยุดผ่าน launcher | หยุด process ที่เปิด, status แสดงว่าหยุดแล้ว และตรวจว่า port 3210 ปิดจริง |
| ภาพและ responsive UI | ปรับ typography/palette/motion แล้วตรวจ desktop, จอเตี้ย, tablet และมือถือ รวม Settings กับ Brain Dump; ภาพโทนเทา–ดำ–ขาวล่าสุดอยู่ใน `test-results/ui-monochrome-*.png` |
| Console ในสถานะยังไม่ได้เชื่อมบัญชี | หลังปรับ flow ไม่พบ error จากการเรียก connector ที่ยังไม่ได้ตั้งค่า |

ชุดทดสอบ 10 รายการครอบคลุม:

1. ปฏิเสธคำขอเขียนข้าม Origin และ Host ที่ไม่ใช่ loopback
2. บังคับ service token สำหรับเครื่องมือภายใน
3. ไม่ส่ง provider/bot/Google/service secrets กลับใน PublicSettings
4. ตรวจ Deadline และช่วงเวลานัดหมาย
5. ป้องกันการแก้หน้า Notion ที่อยู่นอกฐานข้อมูล Axercise
6. แบ่งข้อความยาวให้ตรงข้อจำกัด rich-text ของ Notion และเลือก data source ถูกต้อง
7. MCP tool discovery และขอบเขต delegate ของ coordinator/specialist
8. SSE ที่แบ่ง UTF-8 และ CRLF ข้าม network chunks
9. ฉบับร่างหลัง reload, ข้อมูลเสีย และ storage quota เต็ม
10. Model inventory รูปแบบจริงของ Hermes ที่ใช้ string lists และ provider slug

## สิ่งที่ยังไม่ได้ยืนยันกับบัญชีจริง

- OpenRouter inference, tool calling และ Vision ของโมเดลที่ผู้ใช้เลือก
- การเพิ่มช่วงอ่าน/การสอบจากวิชาจริงลง Calendar (connector CRUD และ refresh ผ่านบัญชีจริงแล้ว)
- การยืนยันแบนเนอร์/ปุ่ม Windows จากผู้ใช้, การกด Reaction ใน Discord จากบัญชีจริง และการสะท้อนคำตอบที่พิมพ์จากเว็บไปช่อง Discord อัตโนมัติ (การคุย Discord/Calendar ผ่าน MCP/เปิดอ่าน Session เดียวกันในเว็บผ่านแล้ว)

## ผลตรวจสถานะล่าสุด

สถานะล่าสุด: ChatGPT OAuth เชื่อมแล้วครบสามโปรไฟล์, Notion token พร้อม data source IDs ของ Tasks/Brain Dump บันทึกแล้ว และ Google OAuth/Calendar เชื่อมพร้อมทดสอบ CRUD/refresh/MCP ครบสาม Agent แล้ว Discord bot tokens ใหม่ครบทั้งสามและ Gateway เชื่อม Work with me แล้ววันที่ 18 พฤศจิกายน ส่วน OpenRouter key ยังไม่ได้ตั้งค่า

การตรวจล่าสุดพบว่า Hermes CLI ที่ติดตั้งมี entrypoint ปัจจุบันเป็น `hermes_cli.main` แต่ launcher รุ่นก่อนเรียก `cli.py` ซึ่งเป็น interface เก่า จึงทำให้คำสั่ง auth และ gateway ไม่ทำงานตามที่คาด แก้ให้ใช้ entrypoint ปัจจุบันและรหัส controller แบบ authenticated loopback TCP แล้ว ทดสอบ `axercise status` จากโฟลเดอร์นอก workspace, stop และ start ใหม่ได้ โดย status ยืนยันว่าเว็บและ controller เป็น instance เดียวกัน

ยืนยันคำสั่ง `hermes gateway run --help` ผ่าน entrypoint ปัจจุบันและ automated controller tests 6 กรณีผ่าน Hermes, Secretary และ Developer เชื่อม OAuth ของ ChatGPT แยกโปรไฟล์สำเร็จ; Gateway ทั้งสามรายงานพร้อมใช้งาน ทดสอบแชตผ่าน streaming API ของ workspace กับทั้งสาม agent และทดสอบการมอบหมายจาก Hermes ไป Developer ได้ผลตรงตามข้อความที่กำหนดไว้ ลบ session ที่สร้างเพื่อทดสอบแล้ว

ผู้ใช้สร้าง Notion connection ใหม่และเพิ่มสิทธิ์เข้าถึงหน้า Axercise แล้ว การตรวจด้วยบัญชีจริงยืนยันว่า API ของ Workspace บันทึกและดึงข้อมูลภาษาไทยได้ และ MCP ที่ใช้การตั้งค่าของแต่ละโปรไฟล์อ่านฐานข้อมูลเดียวกันได้ทั้งสาม Agent รายการทดสอบถูกย้ายเข้าถังขยะแล้ว; Tasks และ Brain Dump ยังว่าง พร้อมเริ่มเก็บข้อมูลจริง

## ข้อจำกัดการตรวจ UI

รอบแรกของการตรวจ เครื่องมือ browser ปฏิเสธการกรอกข้อความ, evaluate และการปรับ viewport ด้วยข้อความ `MCP tool call requires approval, but approval policy is never`

รอบปรับ UI วันที่ 17 พฤศจิกายน 2026 ใช้ browser resize/evaluate ได้แล้ว ตรวจเลย์เอาต์ 1440×1000, 1038×650, 768×900, 390×844 และ 320×740 รวมการเปิด–ปิด Settings และ Brain Dump ตรวจว่าไม่มีการล้นแนวนอน และปุ่ม widget บนมือถือไม่ซ้อนช่องพิมพ์ ช่องพิมพ์/ฟอร์มใช้ฟอนต์ 16px และ Noto Sans Thai โหลดผ่าน self-hosted asset ได้จริง

หลังผู้ใช้ยืนยันโทนเทา–ดำ–ขาว ได้ปรับพื้นผิว accent และ glow เป็น grayscale ทั้งระบบ ตรวจภาพ desktop/mobile และ production build ผ่าน โดยยังใช้ฟอนต์ ขนาดตัวอักษร และ motion ชุดเดิม

แก้ช่องว่างด้านขวาด้วยการยกเลิก container max-width และลดขอบขวา desktop เหลือ 12px วัดใน browser ที่ความกว้าง 1536, 2560 และ 3440px ได้ขอบขวา 12px ตรงกัน ทวน tablet 768px และมือถือ 390px แล้วไม่พบการล้นแนวนอน; ภาพอยู่ใน `test-results/right-gap-fixed.png`

ยังไม่ได้ยืนยันการกรอกฟอร์มและการคงฉบับร่างผ่าน browser จริงครบทุก flow; การทดสอบ storage แบบอัตโนมัติยังเป็นหลักฐานส่วนนี้

การเชื่อมต่อจริงให้เริ่มจาก [README.md](../README.md) และหน้าตั้งค่าของแอป
