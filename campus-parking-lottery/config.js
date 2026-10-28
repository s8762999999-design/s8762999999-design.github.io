// 只填Supabase公開Project URL與anon/publishable key；絕不可填service_role或密碼。
// 正式啟用須先執行supabase/schema.sql，設定管理員allowlist並完成DEPLOYMENT.md驗收。
window.PARKING_CONFIG = Object.freeze({
  mode: 'demo', // 'demo' 或 'production'
  supabaseUrl: '',
  publicKey: '',
  eventId: ''
});
