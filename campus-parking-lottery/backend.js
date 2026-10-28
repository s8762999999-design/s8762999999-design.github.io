/* Codex: Supabase REST adapter. No production PII or session is saved to localStorage. */
window.ParkingBackend = class ParkingBackend {
  constructor(config) {
    this.config = config; this.session = null;
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl || '')) throw new Error('請設定有效的Supabase Project URL。');
    this.url = config.supabaseUrl.replace(/\/$/, '');
    if (!config.publicKey || config.publicKey.startsWith('sb_secret_')) throw new Error('只可使用公開anon/publishable key。');
    if (config.publicKey.startsWith('eyJ')) {
      try { const claim = JSON.parse(atob(config.publicKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); if (claim.role !== 'anon') throw new Error(); }
      catch { throw new Error('設定金鑰不是公開anon key。'); }
    } else if (!config.publicKey.startsWith('sb_publishable_')) throw new Error('公開金鑰格式不符。');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.eventId || '')) throw new Error('請設定活動UUID。');
  }
  async request(path, body, authenticated = false) {
    if (authenticated && !this.session) throw new Error('請先以授權管理員登入。');
    if (authenticated && this.session.expires_at <= Date.now()/1000 + 30) await this.refresh();
    const headers = {'Content-Type':'application/json', apikey:this.config.publicKey};
    if (this.session?.access_token) headers.Authorization = `Bearer ${this.session.access_token}`;
    else if (this.config.publicKey.startsWith('eyJ')) headers.Authorization = `Bearer ${this.config.publicKey}`;
    let response;
    try { response = await fetch(this.url + path, {method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)}); }
    catch { throw new Error('連線失敗或逾時；抽籤時請重新登入讀取既有結果，勿建立另一輪。'); }
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(response.status===401 || response.status===403 ? '未授權或登入已過期。' : (data.message || data.error_description || '後端拒絕請求，請確認部署設定。'));
    return data;
  }
  async refresh() {
    const token=this.session?.refresh_token; if(!token) throw new Error('請重新登入。');
    const r=await fetch(this.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:this.config.publicKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:token})});
    if(!r.ok){this.session=null;throw new Error('登入已過期，請重新登入。');}
    const data=await r.json();this.session={...data,expires_at:Date.now()/1000+data.expires_in};
  }
  async login(email,password) {
    try {
      const data=await this.request('/auth/v1/token?grant_type=password',{email,password});
      this.session={...data,expires_at:Date.now()/1000+data.expires_in};
      if(!await this.rpc('parking_is_admin',{},true)){this.session=null;throw new Error('此帳號未獲管理權限。');}
    } catch(error){this.session=null;throw error;}
  }
  async logout(){try{if(this.session)await this.request('/auth/v1/logout',{},true);}finally{this.session=null;}}
  rpc(name,args={},admin=false){return this.request('/rest/v1/rpc/'+name,args,admin);}
  publicEvent(){return this.rpc('parking_public_event',{p_event:this.config.eventId});}
  snapshot(){return this.rpc('parking_admin_snapshot',{p_event:this.config.eventId},true);}
  register(row){return this.rpc('parking_register',{p_event:this.config.eventId,p_class:row.class_name,p_student_id:row.student_id,p_name:row.name,p_vehicle:row.vehicle});}
  saveEvent(event){return this.rpc('parking_admin_save',{p_event:this.config.eventId,p_title:event.title,p_starts_at:event.starts_at,p_ends_at:event.ends_at,p_motor_slots:event.motorSlots,p_bicycle_slots:event.bicycleSlots},true);}
  importRoster(rows){return this.rpc('parking_admin_roster',{p_event:this.config.eventId,p_rows:rows},true);}
  draw(){return this.rpc('parking_draw',{p_event:this.config.eventId},true);}
};
