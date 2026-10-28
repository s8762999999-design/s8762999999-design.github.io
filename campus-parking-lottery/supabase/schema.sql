-- 校園車位抽籤 v1.0 | Supabase SQL Editor執行；不含真實名冊。
-- 需由學校在自己的專案測試後啟用。首次安裝使用，勿直接覆蓋既有正式系統。
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists parking_private;
revoke all on schema parking_private from public,anon,authenticated;

create table if not exists parking_private.admins(user_id uuid primary key references auth.users(id));
create table if not exists parking_private.events(
 id uuid primary key, title text not null check(length(title) between 1 and 100),
 starts_at timestamptz not null, ends_at timestamptz not null,
 drawn_at timestamptz, draw_id uuid, fingerprint text,
 check(ends_at>starts_at));
create table if not exists parking_private.slots(
 event_id uuid references parking_private.events(id), vehicle text check(vehicle in ('motorcycle','bicycle')),
 code text check(length(code) between 1 and 40), primary key(event_id,vehicle,code));
create table if not exists parking_private.roster(
 event_id uuid references parking_private.events(id), student_id text check(length(student_id) between 1 and 40),
 class_name text not null check(length(class_name) between 1 and 40),
 name text not null check(length(name) between 1 and 80), primary key(event_id,student_id));
create table if not exists parking_private.registrations(
 id bigint generated always as identity primary key,
 event_id uuid references parking_private.events(id), student_id text not null,
 class_name text not null,name text not null,
 vehicle text not null check(vehicle in ('motorcycle','bicycle')), registered_at timestamptz not null default clock_timestamp(),
 receipt uuid not null default gen_random_uuid(),unique(event_id,student_id));
create table if not exists parking_private.results(
 event_id uuid references parking_private.events(id), vehicle text not null,
 row_no integer not null, outcome text check(outcome in ('selected','waitlist','vacant')),
 slot_code text, wait_rank integer, registration_id bigint references parking_private.registrations(id),
 primary key(event_id,vehicle,row_no),unique(event_id,registration_id),unique(event_id,vehicle,slot_code),
 check((outcome='selected' and slot_code is not null and registration_id is not null and wait_rank is null)
 or(outcome='waitlist' and slot_code is null and registration_id is not null and wait_rank>0)
 or(outcome='vacant' and slot_code is not null and registration_id is null and wait_rank is null)));
create table if not exists parking_private.audit(
 id bigint generated always as identity primary key,event_id uuid,actor uuid,action text not null,
 at timestamptz not null default clock_timestamp(),detail jsonb not null default '{}');
create table if not exists parking_private.attempts(
 event_id uuid,student_hash text,at timestamptz not null default clock_timestamp());
create index if not exists parking_attempts_idx on parking_private.attempts(event_id,student_hash,at);
create table if not exists parking_private.snapshots(event_id uuid primary key,input_snapshot jsonb not null);

alter table parking_private.admins enable row level security;
alter table parking_private.events enable row level security;
alter table parking_private.slots enable row level security;
alter table parking_private.roster enable row level security;
alter table parking_private.registrations enable row level security;
alter table parking_private.results enable row level security;
alter table parking_private.audit enable row level security;
alter table parking_private.attempts enable row level security;
alter table parking_private.snapshots enable row level security;

create or replace function parking_private.require_admin() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from parking_private.admins a where a.user_id=auth.uid()) then
  raise exception '未授權管理員' using errcode='42501';
 end if;
end $$;
create or replace function public.parking_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from parking_private.admins where user_id=auth.uid())
$$;

-- 無偏1..n安全亂數；不能用random()或取餘數造成偏差。
create or replace function parking_private.uniform_index(n integer) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare b bytea; x bigint; lim bigint;
begin
 if n<1 then raise exception '亂數範圍錯誤'; end if;
 lim:=4294967296-(4294967296%n);
 loop
  b:=extensions.gen_random_bytes(4);
  x:=get_byte(b,0)::bigint*16777216+get_byte(b,1)::bigint*65536+get_byte(b,2)::bigint*256+get_byte(b,3);
  exit when x<lim;
 end loop;
 return (x%n)::integer+1;
end $$;
create or replace function parking_private.shuffle_ids(a bigint[]) returns bigint[]
language plpgsql volatile security definer set search_path='' as $$
declare i integer;j integer;t bigint;
begin
 i:=coalesce(array_length(a,1),0);
 while i>1 loop j:=parking_private.uniform_index(i);t:=a[i];a[i]:=a[j];a[j]:=t;i:=i-1;end loop;
 return a;
end $$;
create or replace function parking_private.shuffle_slots(a text[]) returns text[]
language plpgsql volatile security definer set search_path='' as $$
declare i integer;j integer;t text;
begin
 i:=coalesce(array_length(a,1),0);
 while i>1 loop j:=parking_private.uniform_index(i);t:=a[i];a[i]:=a[j];a[j]:=t;i:=i-1;end loop;
 return a;
end $$;

create or replace function public.parking_public_event(p_event uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'title',e.title,'starts_at',e.starts_at,'ends_at',e.ends_at,
 'drawn_at',e.drawn_at,'server_now',now(),
 'slots',coalesce((select jsonb_agg(jsonb_build_object('vehicle',vehicle,'code',code) order by vehicle,code)
 from parking_private.slots where event_id=e.id),'[]'::jsonb))
 from parking_private.events e where e.id=p_event
$$;

create or replace function public.parking_register(p_event uuid,p_class text,p_student_id text,p_name text,p_vehicle text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e parking_private.events%rowtype;r parking_private.roster%rowtype;sid text;cn text;nm text;h text;ticket uuid;
begin
 sid:=normalize(btrim(coalesce(p_student_id,'')),NFC);
 cn:=normalize(btrim(coalesce(p_class,'')),NFC);nm:=normalize(btrim(coalesce(p_name,'')),NFC);
 if length(sid) not between 1 and 40 or length(cn) not between 1 and 40 or length(nm) not between 1 and 80
 or p_vehicle not in ('motorcycle','bicycle') or p_vehicle is null then
  return jsonb_build_object('ok',false,'message','無法受理，請核對資料、登記時間或洽管理單位。');end if;
 -- SHARE與抽籤的UPDATE鎖互斥，避免截止邊界與抽籤快照競態。
 select * into e from parking_private.events where id=p_event for share;
 if not found or e.drawn_at is not null or clock_timestamp()<e.starts_at or clock_timestamp()>=e.ends_at then
  return jsonb_build_object('ok',false,'message','無法受理，請核對資料、登記時間或洽管理單位。');end if;
 h:=encode(extensions.digest(sid,'sha256'),'hex');
 -- 每學號的基礎限次。正式公開仍應加閘道/IP限流與防自動化，不宣稱能防所有攻擊。
 perform pg_advisory_xact_lock(hashtextextended(p_event::text||h,0));
 if(select count(*) from parking_private.attempts where event_id=p_event and student_hash=h and at>clock_timestamp()-interval '10 minutes')>=20 then
  return jsonb_build_object('ok',false,'message','請稍後再試或洽管理單位。');end if;
 insert into parking_private.attempts(event_id,student_hash) values(p_event,h);
 select * into r from parking_private.roster where event_id=p_event and student_id=sid and class_name=cn and name=nm;
 if not found or not exists(select 1 from parking_private.slots where event_id=p_event and vehicle=p_vehicle) then
  return jsonb_build_object('ok',false,'message','無法受理，請核對資料、登記時間或洽管理單位。');end if;
 if clock_timestamp()>=e.ends_at then return jsonb_build_object('ok',false,'message','無法受理，請核對資料、登記時間或洽管理單位。');end if;
 begin
  insert into parking_private.registrations(event_id,student_id,class_name,name,vehicle)
  values(p_event,r.student_id,r.class_name,r.name,p_vehicle) returning receipt into ticket;
 exception when unique_violation then
  return jsonb_build_object('ok',false,'message','無法受理，請核對資料、登記時間或洽管理單位。');
 end;
 return jsonb_build_object('ok',true,'message','已完成登記，請保存回條。','receipt',ticket);
end $$;

create or replace function public.parking_admin_snapshot(p_event uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare outdata jsonb;
begin
 perform parking_private.require_admin();
 select jsonb_build_object('event',public.parking_public_event(p_event),
 'roster',coalesce((select jsonb_agg(jsonb_build_object('student_id',student_id,'class_name',class_name,'name',name) order by student_id) from parking_private.roster where event_id=p_event),'[]'),
 'registrations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'student_id',student_id,'class_name',class_name,'name',name,'vehicle',vehicle,'registered_at',registered_at) order by id) from parking_private.registrations where event_id=p_event),'[]'),
 'results',coalesce((select jsonb_agg(jsonb_build_object('vehicle',q.vehicle,'row_no',q.row_no,'outcome',q.outcome,'slot_code',q.slot_code,'wait_rank',q.wait_rank,'student_id',r.student_id,'class_name',r.class_name,'name',r.name) order by q.vehicle,q.row_no)
 from parking_private.results q left join parking_private.registrations r on r.id=q.registration_id where q.event_id=p_event),'[]'),
 'audit',coalesce((select jsonb_agg(jsonb_build_object('at',at,'action',action,'detail',detail) order by id) from parking_private.audit where event_id=p_event),'[]'),
 'draw_id',(select draw_id from parking_private.events where id=p_event),
 'fingerprint',(select fingerprint from parking_private.events where id=p_event)) into outdata;
 return outdata;
end $$;

create or replace function public.parking_admin_save(p_event uuid,p_title text,p_starts_at timestamptz,p_ends_at timestamptz,p_motor_slots text[],p_bicycle_slots text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e parking_private.events%rowtype;a text[];v text;
begin
 perform parking_private.require_admin();
 if p_event is null or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or length(btrim(p_title)) not between 1 and 100 then raise exception '活動設定不完整';end if;
 select * into e from parking_private.events where id=p_event for update;
 if found and (e.drawn_at is not null or exists(select 1 from parking_private.registrations where event_id=p_event)) then raise exception '已有登記或抽籤結果，設定已鎖定；請建立新活動';end if;
 -- 分組檢查車格；同組不能重複，不接受空白。
 for v in select unnest(array['motorcycle','bicycle']) loop
  a:=case when v='motorcycle' then coalesce(p_motor_slots,'{}') else coalesce(p_bicycle_slots,'{}') end;
  if cardinality(a)>5000 or exists(select 1 from unnest(a) s where length(btrim(s)) not between 1 and 40)
   or cardinality(a)<>(select count(distinct btrim(s)) from unnest(a) s) then raise exception '車格重複、空白或數量超過上限';end if;
 end loop;
 insert into parking_private.events(id,title,starts_at,ends_at) values(p_event,btrim(p_title),p_starts_at,p_ends_at)
 on conflict(id) do update set title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at;
 delete from parking_private.slots where event_id=p_event;
 insert into parking_private.slots select p_event,'motorcycle',btrim(s) from unnest(coalesce(p_motor_slots,'{}')) s;
 insert into parking_private.slots select p_event,'bicycle',btrim(s) from unnest(coalesce(p_bicycle_slots,'{}')) s;
 insert into parking_private.audit(event_id,actor,action) values(p_event,auth.uid(),'save_event');
 return public.parking_admin_snapshot(p_event);
end $$;

create or replace function public.parking_admin_roster(p_event uuid,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e parking_private.events%rowtype;
begin
 perform parking_private.require_admin();
 select * into e from parking_private.events where id=p_event for update;
 if not found or e.drawn_at is not null or exists(select 1 from parking_private.registrations where event_id=p_event) then raise exception '活動不存在或已有登記，不能更換名冊';end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception '名冊須為JSON陣列';end if;
 if jsonb_array_length(p_rows) not between 1 and 10000 then raise exception '名冊筆數須為1–10000';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x where length(normalize(btrim(coalesce(x->>'student_id','')),NFC)) not between 1 and 40 or length(normalize(btrim(coalesce(x->>'class_name','')),NFC)) not between 1 and 40 or length(normalize(btrim(coalesce(x->>'name','')),NFC)) not between 1 and 80)
 or jsonb_array_length(p_rows)<>(select count(distinct normalize(btrim(x->>'student_id'),NFC)) from jsonb_array_elements(p_rows) x) then raise exception '名冊有空白、不符長度或重複學號';end if;
 delete from parking_private.roster where event_id=p_event;
 insert into parking_private.roster(event_id,student_id,class_name,name)
 select p_event,normalize(btrim(x->>'student_id'),NFC),normalize(btrim(x->>'class_name'),NFC),normalize(btrim(x->>'name'),NFC) from jsonb_array_elements(p_rows) x;
 insert into parking_private.audit(event_id,actor,action,detail) values(p_event,auth.uid(),'import_roster',jsonb_build_object('count',jsonb_array_length(p_rows)));
 return public.parking_admin_snapshot(p_event);
end $$;

create or replace function public.parking_draw(p_event uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e parking_private.events%rowtype;v text;ids bigint[];codes text[];n integer;m integer;k integer;i integer;snap jsonb;stamp timestamptz;
begin
 perform parking_private.require_admin();
 select * into e from parking_private.events where id=p_event for update;
 if not found then raise exception '活動不存在';end if;
 if e.drawn_at is not null then return public.parking_admin_snapshot(p_event);end if;
 if clock_timestamp()<e.ends_at then raise exception '登記截止後才能抽籤';end if;
 if not exists(select 1 from parking_private.slots where event_id=p_event) then raise exception '尚未設定車格';end if;
 select jsonb_build_object('registrations',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from parking_private.registrations r where event_id=p_event),'[]'),
 'slots',coalesce((select jsonb_agg(to_jsonb(s) order by vehicle,code) from parking_private.slots s where event_id=p_event),'[]')) into snap;
 insert into parking_private.snapshots values(p_event,snap);
 for v in select unnest(array['motorcycle','bicycle']) loop
  select parking_private.shuffle_ids(coalesce(array_agg(id order by id),'{}')) into ids from parking_private.registrations where event_id=p_event and vehicle=v;
  select parking_private.shuffle_slots(coalesce(array_agg(code order by code),'{}')) into codes from parking_private.slots where event_id=p_event and vehicle=v;
  n:=cardinality(ids);m:=cardinality(codes);k:=least(n,m);
  if k>0 then for i in 1..k loop insert into parking_private.results values(p_event,v,i,'selected',codes[i],null,ids[i]);end loop;end if;
  if n>k then for i in k+1..n loop insert into parking_private.results values(p_event,v,i,'waitlist',null,i-k,ids[i]);end loop;end if;
  if m>k then for i in k+1..m loop insert into parking_private.results values(p_event,v,n+i-k,'vacant',codes[i],null,null);end loop;end if;
 end loop;
 stamp:=clock_timestamp();
 update parking_private.events set drawn_at=stamp,draw_id=gen_random_uuid(),fingerprint=encode(extensions.digest(snap::text,'sha256'),'hex') where id=p_event;
 insert into parking_private.audit(event_id,actor,action,detail) values(p_event,auth.uid(),'draw',jsonb_build_object('algorithm','CSPRNG rejection sampling + Fisher-Yates v1','participants',(select count(*) from parking_private.registrations where event_id=p_event)));
 return public.parking_admin_snapshot(p_event);
end $$;

revoke all on all tables in schema parking_private from public,anon,authenticated;
revoke all on all sequences in schema parking_private from public,anon,authenticated;
revoke all on all functions in schema parking_private from public,anon,authenticated;
revoke all on function public.parking_public_event(uuid),public.parking_register(uuid,text,text,text,text),public.parking_is_admin(),public.parking_admin_snapshot(uuid),public.parking_admin_save(uuid,text,timestamptz,timestamptz,text[],text[]),public.parking_admin_roster(uuid,jsonb),public.parking_draw(uuid) from public,anon,authenticated;
grant execute on function public.parking_public_event(uuid),public.parking_register(uuid,text,text,text,text) to anon,authenticated;
grant execute on function public.parking_is_admin(),public.parking_admin_snapshot(uuid),public.parking_admin_save(uuid,text,timestamptz,timestamptz,text[],text[]),public.parking_admin_roster(uuid,jsonb),public.parking_draw(uuid) to authenticated;
commit;

-- 由SQL Editor手動設定管理員（用Auth頁面真正的user UUID，勿公開帳密）：
-- insert into parking_private.admins(user_id) values ('填入管理員Auth UUID');
-- 定期由受信任排程刪除過期attempts；依校方保存政策處理活動/名冊/結果。
-- fingerprint核對輸入快照是否一致，不等於外部可驗證亂數或第三方公平性認證。
