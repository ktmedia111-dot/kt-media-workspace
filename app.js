(() => {
  const cfg = window.KT_SUPABASE_CONFIG || {};
  const configured = cfg.url && !cfg.url.includes("YOUR_PROJECT_ID") && cfg.publishableKey && !cfg.publishableKey.includes("YOUR_SUPABASE");
  const client = configured && window.supabase ? window.supabase.createClient(cfg.url, cfg.publishableKey) : null;
  const $ = (s) => document.querySelector(s);
  let authMode = "login", user = null, profile = null, jobs = [];
  const titles = {dashboard:"Genel Bakış",calendar:"Takvim",jobs:"Çekim İşleri",editing:"Montaj Süreci",delivery:"Teslim Takibi",archive:"Arşiv",team:"Ekip Yönetimi",finance:"Finans"};
  const toast = (m) => { const t=$("#toast"); t.textContent=m; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2800); };
  const esc = (v="") => String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const isAdmin = () => profile?.role === "admin" && profile?.approved === true;
  const statusClass = s => s==="Teslim Edildi"?"green":s==="Montajda"?"blue":"";
  function setAuthMode(mode){authMode=mode;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.auth===mode));$("#nameField").classList.toggle("hidden",mode!=="signup");$("#authSubmit").textContent=mode==="login"?"Giriş yap":"Kayıt talebi gönder";$("#authMessage").textContent="";}
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setAuthMode(b.dataset.auth)));
  async function authSubmit(e){
    e.preventDefault(); if(!client){$("#authMessage").textContent="Önce supabase-config.js dosyasına proje URL'si ve Publishable Key ekleyin.";return;}
    const email=$("#email").value.trim(), password=$("#password").value;
    try{
      if(authMode==="login"){const {error}=await client.auth.signInWithPassword({email,password});if(error)throw error;}
      else {const display_name=$("#displayName").value.trim();if(!display_name)throw new Error("Ad soyad girin.");const {data,error}=await client.auth.signUp({email,password,options:{data:{display_name}}});if(error)throw error;if(data.user){$("#authMessage").textContent="Kayıt alındı. Yönetici onayı sonrası erişim açılacaktır.";}}
    }catch(err){$("#authMessage").textContent=err.message;}
  }
  async function loadProfile(){
    const {data,error}=await client.from("profiles").select("id,display_name,role,approved").eq("id",user.id).maybeSingle();
    if(error)throw error; profile=data;
    if(!profile){const display_name=user.user_metadata?.display_name||user.email.split("@")[0];const {data:created,error:insertError}=await client.from("profiles").insert({id:user.id,display_name,role:"member",approved:false}).select().single();if(insertError)throw insertError;profile=created;}
    if(profile.approved!==true){await client.auth.signOut();$("#authMessage").textContent="Hesabınız yönetici onayı bekliyor.";throw new Error("APPROVAL_PENDING");}
  }
  async function loadJobs(){
    const {data,error}=await client.from("jobs").select("*").order("shoot_date",{ascending:true});
    if(error)throw error;jobs=data||[];
  }
  async function startApp(){
    $("#authScreen").classList.add("hidden");$("#app").classList.remove("hidden");
    $("#userName").textContent=profile.display_name||user.email;$("#userRole").textContent=isAdmin()?"Yönetici":"Ekip üyesi";$("#avatar").textContent=(profile.display_name||"KT").split(" ").map(x=>x[0]).slice(0,2).join("").toUpperCase();
    document.querySelectorAll(".admin-only").forEach(x=>x.classList.toggle("hidden",!isAdmin()));
    await loadJobs(); render("dashboard");
  }
  function stat(label,value,note,icon){return `<div class="stat"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><strong>${value}</strong><small>${note}</small></div>`;}
  function jobRows(list){if(!list.length)return `<div class="empty">Henüz kayıtlı iş yok. İlk çekim işini oluşturabilirsiniz.</div>`;return list.map(j=>`<div class="job-row"><div><b>${esc(j.title||j.customer_name||"İsimsiz iş")}</b><small>${esc(j.job_type||"Çekim")} · ${esc(j.location||"Lokasyon belirtilmedi")}</small></div><span class="pill ${statusClass(j.status)}">${esc(j.status||"Planlandı")}</span><small>${j.shoot_date?new Date(j.shoot_date+"T12:00:00").toLocaleDateString("tr-TR"):"Tarih yok"}</small></div>`).join("");}
  function dashboard(){
    const today=new Date().toISOString().slice(0,10), active=jobs.filter(j=>j.status!=="Teslim Edildi"), shoots=jobs.filter(j=>j.shoot_date===today).length, editing=jobs.filter(j=>j.status==="Montajda").length, delivered=jobs.filter(j=>j.status==="Teslim Edildi").length;
    return `<div class="welcome"><div><p class="eyebrow">KT MEDIA PRODÜKSİYON</p><h1>Merhaba, ${esc(profile.display_name||"ekip")} 👋</h1><p>Bugünün iş akışına genel bakış.</p></div><button class="btn primary" onclick="document.querySelector('#jobDialog').showModal()">＋ Yeni iş oluştur</button></div><div class="stats">${stat("Toplam iş",jobs.length,"Tüm kayıtlar","▣")}${stat("Aktif işler",active.length,"Devam eden süreçler","◷")}${stat("Bugünkü çekim",shoots,"Bugün planlanan","▦")}${stat("Montajda",editing,"Kurgu aşamasındaki işler","◫")}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><h3>Son iş hareketleri</h3><span class="subtle">${jobs.length} kayıt</span></div>${jobRows(jobs.slice(0,6))}</section><section class="panel"><div class="panel-head"><h3>Hızlı erişim</h3><span class="subtle">İş akışı</span></div><div class="quick-grid"><div class="quick"><b>▦ Takvim</b><small>Çekim tarihlerini görüntüle</small></div><div class="quick"><b>◫ Montaj</b><small>${editing} iş montaj aşamasında</small></div><div class="quick"><b>⇧ Teslim</b><small>${delivered} iş teslim edildi</small></div><div class="quick"><b>▤ Arşiv</b><small>Tamamlanan işleri incele</small></div></div></section></div>`;
  }
  function jobsPage(filter){const list=filter?jobs.filter(j=>[j.title,j.job_type,j.location,j.status].join(" ").toLowerCase().includes(filter.toLowerCase())):jobs;return `<div class="section-title"><div><p class="eyebrow">OPERASYON</p><h1>Çekim İşleri</h1></div><button class="btn primary" onclick="document.querySelector('#jobDialog').showModal()">＋ Yeni İş</button></div><div class="table-panel"><table class="table"><thead><tr><th>İŞ / MÜŞTERİ</th><th>TÜR</th><th>ÇEKİM TARİHİ</th><th>LOKASYON</th><th>SORUMLU</th><th>DURUM</th></tr></thead><tbody>${list.length?list.map(j=>`<tr><td><b>${esc(j.title||j.customer_name||"—")}</b></td><td>${esc(j.job_type||"—")}</td><td>${j.shoot_date?new Date(j.shoot_date+"T12:00:00").toLocaleDateString("tr-TR"):"—"}</td><td>${esc(j.location||"—")}</td><td>${esc(j.assigned_to||"—")}</td><td><span class="pill ${statusClass(j.status)}">${esc(j.status||"Planlandı")}</span></td></tr>`).join(""):`<tr><td colspan="6" class="empty">Henüz iş kaydı bulunmuyor.</td></tr>`}</tbody></table></div>`;}
  function simplePage(page){let list=jobs;if(page==="editing")list=jobs.filter(j=>j.status==="Montajda");if(page==="delivery")list=jobs.filter(j=>["Teslime Hazır","Teslim Edildi"].includes(j.status));if(page==="archive")list=jobs.filter(j=>j.status==="Teslim Edildi");if(page==="calendar")return `<div class="section-title"><div><p class="eyebrow">PLANLAMA</p><h1>Çekim Takvimi</h1></div></div><div class="panel"><p class="subtle">Yaklaşan çekimler</p>${jobRows(jobs.filter(j=>j.shoot_date).slice(0,20))}</div>`;if(page==="team")return `<div class="section-title"><div><p class="eyebrow">EKİP</p><h1>Ekip Yönetimi</h1></div></div><div class="panel"><h3>Onay ve erişim</h3><p class="subtle">Yeni ekip üyeleri kayıt olduktan sonra profiles tablosunda approved=true yapılarak etkinleştirilir. Rol alanı admin veya member olabilir.</p></div>`;if(page==="finance")return `<div class="section-title"><div><p class="eyebrow">YÖNETİCİ ALANI</p><h1>Finans</h1></div></div><div class="panel"><h3>Finans modülü bağlantı aşamasında</h3><p class="subtle">finance_entries tablosunun mevcut kolonları doğrulanmadan finans kayıtlarını değiştirmiyoruz. Finans ekranı yalnızca yöneticiye açıktır.</p></div>`;return `<div class="section-title"><div><p class="eyebrow">İŞ AKIŞI</p><h1>${titles[page]}</h1></div></div><div class="panel">${jobRows(list)}</div>`;}
  function render(page){if(page==="finance"&&!isAdmin())page="dashboard";$("#pageTitle").textContent=titles[page]||"Genel Bakış";document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));$("#content").innerHTML=page==="dashboard"?dashboard():page==="jobs"?jobsPage($("#globalSearch").value):simplePage(page);}
  document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>render(b.dataset.page)));
  $("#globalSearch").addEventListener("input",()=>{if($("#pageTitle").textContent==="Çekim İşleri")render("jobs");});
  $("#newJobBtn").addEventListener("click",()=>$("#jobDialog").showModal());
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$("#jobDialog").close()));
  $("#jobForm").addEventListener("submit",async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target).entries());values.created_by=user.id;try{const {error}=await client.from("jobs").insert(values);if(error)throw error;$("#jobDialog").close();e.target.reset();await loadJobs();render("jobs");toast("İş kaydedildi.");}catch(err){toast("Kayıt hatası: "+err.message);}});
  $("#logoutBtn").addEventListener("click",()=>client?.auth.signOut());
  $("#authForm").addEventListener("submit",authSubmit);
  if(!client){$("#authMessage").textContent="Kurulum bekleniyor: supabase-config.js dosyasına Supabase URL ve Publishable Key ekleyin.";}
  else client.auth.onAuthStateChange(async(_event,session)=>{if(!session){user=null;profile=null;$("#app").classList.add("hidden");$("#authScreen").classList.remove("hidden");return;}user=session.user;try{await loadProfile();await startApp();}catch(err){if(err.message!=="APPROVAL_PENDING")toast(err.message);}});
  if(client)client.auth.getSession().then(async({data})=>{if(data.session){user=data.session.user;try{await loadProfile();await startApp();}catch(err){if(err.message!=="APPROVAL_PENDING")toast(err.message);}}});
})();