-- แยก add enum value ออกมาก่อน (Postgres: add value ต้อง commit ก่อนใช้ค่านั้นใน tx อื่น)
-- promotion RPCs (000018) ใช้ 'trialing' — จึงต้องให้ enum นี้ commit จบก่อน
alter type subscription_status add value if not exists 'trialing';
