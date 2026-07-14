// Placeholder — generate ของจริงด้วย `pnpm db:types` หลัง apply migrations
// (supabase gen types typescript --project-id $SUPABASE_PROJECT_REF)
//
// ระหว่างยังไม่มี schema จริง: ใช้ type หลวมๆ ให้ query ผ่าน typecheck ได้
// (อย่าลืม regenerate ทับหลัง migrate — จะได้ type-safety จริง)
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Database = any;
