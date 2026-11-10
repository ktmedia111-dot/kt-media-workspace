
(() => {
  "use strict";

  const config = window.KT_SUPABASE_CONFIG || {};
  const client = window.supabase?.createClient(
    config.url,
    config.publishableKey
  );

  const $ = (selector) => document.querySelector(selector);

  let user = null;
  let profile = null;
  let jobs = [];
  let financeEntries = [];
  let financeJobFees = {};
  let teamMembers = [];
  let archiveDrives = [];
  let jobArchives = [];
  let notifications = [];
  let notificationChannel = null;
  let page = "dashboard";
  let authMode = "login";
  let calendarDate = new Date();


  // Web Push bildirimleri
  const VAPID_PUBLIC_KEY = "BNIDnBKxPqkTTmVODBfKUWS5Nr4sMM4uCCFz_Xd4kAHh2v-2vwTE9XJ-RXnLH8-9fKPvIsqjAfIsKcNpmBxWDQ8";

  function urlBase64ToUint8Array(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
  }

  async function enablePushNotifications() {
    if (!user) return toast("Önce giriş yapmalısınız.");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return toast("Bu tarayıcı Web Push desteklemiyor.");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return toast("Bildirim izni verilmedi.");
      const registration = await navigator.serviceWorker.register("./service-worker.js");
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
      const { error } = await client.from("push_subscriptions").upsert({ user_id: user.id, endpoint: subscription.endpoint, subscription: subscription.toJSON(), updated_at: new Date().toISOString() }, { onConflict: "user_id,endpoint" });
      if (error) throw error;
      toast("Bu cihazda bildirimler etkinleştirildi.");
    } catch (error) { console.error("Push kurulumu:", error); toast("Bildirim kurulamadı: " + error.message); }
  }

  async function sendPushForJob(jobId) {
    try { const { error } = await client.functions.invoke("send-job-push", { body: { job_id: jobId } }); if (error) console.error("Push gönderimi:", error); }
    catch (error) { console.error("Push gönderimi:", error); }
  }

  const pageTitles = {
    dashboard: "Genel Bakış",
    calendar: "Takvim",
    jobs: "Çekim İşleri",
    editing: "Montaj Süreci",
    delivery: "Teslim Takibi",
    archive: "Arşiv",
    harddisks: "Harddisk Yönetimi",
    team: "Ekip Yönetimi",
    finance: "Finans"
  };

  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);

  const isAdmin = () =>
    profile?.role === "admin" && profile?.approved === true;

  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3500);
  }


  function mountNotificationUI() {
    if ($("#notificationArea")) return;
    const logout = $("#logoutBtn");
    if (!logout) return;

    logout.insertAdjacentHTML("beforebegin", `
      <div id="notificationArea" style="position:relative;display:inline-flex;align-items:center;margin-right:12px;z-index:1000">
        <button id="notificationToggle" type="button" aria-label="Bildirimler" title="Bildirimler" style="position:relative;width:42px;height:42px;border:1px solid #e8e5df;border-radius:12px;background:#fff;color:#282828;font-size:21px;cursor:pointer">
          ♧<span id="notificationBadge" style="display:none;position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:12px;background:#d94b42;color:#fff;font-size:11px;line-height:18px;font-weight:700"></span>
        </button>
        <div id="notificationPanel" style="display:none;position:absolute;right:0;top:50px;width:min(360px,calc(100vw - 32px));max-height:440px;overflow:auto;background:#fff;border:1px solid #e8e5df;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.14);padding:14px;color:#282828">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
            <strong style="font-size:15px">Bildirimler</strong>
            <button id="notificationMarkAll" type="button" style="border:0;background:transparent;color:#92733f;font-size:12px;cursor:pointer">Tümünü okundu yap</button>
          </div>
          <button id="enablePushButton" type="button" style="width:100%;padding:10px;margin:0 0 10px;border:1px solid #e8e5df;border-radius:9px;background:#faf9f6;color:#282828;font-weight:700;cursor:pointer">Bu cihazda bildirimleri aç</button>
          <div id="notificationList"><div style="padding:18px 4px;color:#858585;font-size:13px">Bildirimler yükleniyor...</div></div>
          ${isAdmin() ? `
            <div style="border-top:1px solid #eee;margin-top:12px;padding-top:12px">
              <button id="notificationTrackingToggle" type="button" style="width:100%;padding:9px 10px;border:1px solid #e8e5df;border-radius:9px;background:#faf9f6;color:#282828;font-weight:700;cursor:pointer">Personel okundu takibi</button>
              <div id="notificationTracking" style="display:none;margin-top:10px"><div style="color:#888;font-size:12px">Takip bilgileri yükleniyor...</div></div>
            </div>
          ` : ""}
        </div>
      </div>
    `);

    $("#enablePushButton").addEventListener("click", enablePushNotifications);

    $("#notificationToggle").addEventListener("click", async () => {
      const panel = $("#notificationPanel");
      const opening = panel.style.display === "none";
      panel.style.display = opening ? "block" : "none";
      if (opening) await loadNotifications();
    });

    $("#notificationList").addEventListener("click", async event => {
      const item = event.target.closest("[data-notification-id]");
      if (!item) return;
      await markNotificationRead(item.dataset.notificationId);
      $("#notificationPanel").style.display = "none";
      page = "jobs";
      await render();
      focusJob(item.dataset.jobId);
    });

    $("#notificationMarkAll").addEventListener("click", markAllNotificationsRead);
    const trackingToggle = $("#notificationTrackingToggle");
    if (trackingToggle) trackingToggle.addEventListener("click", async () => {
      const panel = $("#notificationTracking");
      const opening = panel.style.display === "none";
      panel.style.display = opening ? "block" : "none";
      if (opening) await loadAdminNotificationTracking();
    });
    document.addEventListener("click", event => {
      const area = $("#notificationArea");
      if (area && !area.contains(event.target)) $("#notificationPanel").style.display = "none";
    });
  }

  function renderNotifications() {
    const unread = notifications.filter(item => !item.read_at).length;
    const badge = $("#notificationBadge");
    if (badge) {
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.style.display = unread ? "block" : "none";
    }

    const list = $("#notificationList");
    if (!list) return;
    if (!notifications.length) {
      list.innerHTML = `<div style="padding:18px 4px;color:#858585;font-size:13px">Henüz bildirimin yok.</div>`;
      return;
    }

    list.innerHTML = notifications.map(item => `
      <button type="button" data-notification-id="${escapeHTML(item.id)}" data-job-id="${escapeHTML(item.job_id || "")}" style="display:block;width:100%;text-align:left;padding:12px 10px;margin:0 0 7px;border:1px solid ${item.read_at ? '#eee' : '#e7d8b8'};border-radius:10px;background:${item.read_at ? '#fff' : '#fbf7ef'};cursor:pointer">
        <span style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:#282828">
          ${item.read_at ? '' : '<span style="width:7px;height:7px;border-radius:50%;background:#c59a50;display:inline-block"></span>'}
          ${escapeHTML(item.title)}
        </span>
        <span style="display:block;margin-top:5px;color:#656565;font-size:12px;line-height:1.45">${escapeHTML(item.body)}</span>
        <span style="display:block;margin-top:6px;color:#999;font-size:10px">${new Date(item.created_at).toLocaleString('tr-TR')}</span>
      </button>
    `).join("");
  }

  async function loadNotifications() {
    if (!user) return;
    const { data, error } = await client
      .from("notifications")
      .select("id,title,body,created_at,read_at,job_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) {
      const list = $("#notificationList");
      if (list) list.innerHTML = `<div style="padding:12px 4px;color:#b33;font-size:12px">Bildirimler alınamadı. Supabase SQL adımını kontrol edin.</div>`;
      console.error("Bildirimler alınamadı:", error.message);
      return;
    }
    notifications = data || [];
    renderNotifications();
  }

  async function loadAdminNotificationTracking() {
    const panel = $("#notificationTracking");
    if (!panel || !isAdmin()) return;
    panel.innerHTML = `<div style="padding:8px 2px;color:#888;font-size:12px">Takip bilgileri yükleniyor...</div>`;

    const { data: rows, error } = await client
      .from("notifications")
      .select("id,user_id,job_id,title,body,created_at,read_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      panel.innerHTML = `<div style="padding:8px 2px;color:#b33;font-size:12px">Takip bilgileri alınamadı. Supabase yönetici okuma iznini kontrol edin: ${escapeHTML(error.message)}</div>`;
      console.error("Yönetici bildirim takibi:", error.message);
      return;
    }

    const ids = [...new Set((rows || []).map(row => row.user_id))];
    let people = [];
    if (ids.length) {
      const result = await client.from("profiles").select("id,display_name").in("id", ids);
      if (result.error) {
        panel.innerHTML = `<div style="padding:8px 2px;color:#b33;font-size:12px">Personel adları alınamadı: ${escapeHTML(result.error.message)}</div>`;
        return;
      }
      people = result.data || [];
    }
    const names = Object.fromEntries(people.map(person => [person.id, person.display_name || "İsimsiz personel"]));

    if (!rows || !rows.length) {
      panel.innerHTML = `<div style="padding:10px 2px;color:#888;font-size:12px">Henüz personele gönderilmiş bildirim yok.</div>`;
      return;
    }

    panel.innerHTML = rows.map(row => `
      <div style="padding:10px 2px;border-bottom:1px solid #f0eee9">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <strong style="font-size:12px;color:#292929">${escapeHTML(names[row.user_id] || "Bilinmeyen personel")}</strong>
          <span style="white-space:nowrap;font-size:10px;font-weight:700;color:${row.read_at ? '#23845b' : '#b7791f'}">${row.read_at ? '✓ OKUNDU' : '● BEKLİYOR'}</span>
        </div>
        <div style="margin-top:4px;font-size:11px;color:#555">${escapeHTML(row.title)}</div>
        <div style="margin-top:3px;font-size:10px;color:#999">Gönderim: ${new Date(row.created_at).toLocaleString('tr-TR')}${row.read_at ? ` · Okunma: ${new Date(row.read_at).toLocaleString('tr-TR')}` : ''}</div>
      </div>
    `).join("");
  }

  async function markNotificationRead(id) {
    const { error } = await client.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) {
      toast("Bildirim okunamadı: " + error.message);
      return;
    }
    await loadNotifications();
  }

  async function markAllNotificationsRead() {
    const { error } = await client.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) {
      toast("Bildirimler güncellenemedi: " + error.message);
      return;
    }
    await loadNotifications();
    toast("Tüm bildirimler okundu.");
  }

  function subscribeToNotifications() {
    if (notificationChannel || !user) return;
    notificationChannel = client.channel(`notifications-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`
      }, async payload => {
        await loadNotifications();
        toast(payload.new?.title || "Yeni iş atandı.");
      })
      .subscribe();
  }

  function showAuthMessage(message) {
    $("#authMessage").textContent = message;
  }

  function formatDate(date) {
    if (!date) return "Tarih yok";
    return new Date(date + "T12:00:00").toLocaleDateString("tr-TR");
  }

  function todayString() {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000)
      .toISOString().slice(0, 10);
  }

  function statusClass(status) {
    if (status === "Teslim Edildi") return "green";
    if (status === "Montajda") return "blue";
    if (status === "Teslime Hazır") return "orange";
    return "neutral";
  }

  function focusJob(jobId) {
    if (!jobId) return;
    const job = jobs.find(item => String(item.id) === String(jobId));
    const row = document.querySelector(`[data-job-row="${CSS.escape(String(jobId))}"]`);
    if (!job) {
      toast("Bildirime ait iş bulunamadı. İş numarası: " + jobId);
      return;
    }
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.style.outline = "3px solid #c59a50";
      row.style.background = "#fff8e8";
      setTimeout(() => { row.style.outline = ""; row.style.background = ""; }, 5000);
    }
    let dialog = document.getElementById("assignedJobDetailDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "assignedJobDetailDialog";
      dialog.style.cssText = "width:min(560px,calc(100vw - 28px));max-width:560px;border:1px solid #e8e1d5;border-radius:18px;padding:0;box-shadow:0 24px 80px rgba(0,0,0,.25);color:#282828";
      document.body.appendChild(dialog);
    }
    dialog.innerHTML = `
      <div style="padding:22px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
          <div><p style="margin:0 0 7px;color:#b08b4e;font-size:11px;font-weight:800;letter-spacing:2px">KT MEDIA · İŞ DETAYI</p><h2 style="margin:0;font-size:23px;line-height:1.25">${escapeHTML(job.title || "İsimsiz iş")}</h2></div>
          <button type="button" id="closeAssignedJobDetail" aria-label="Kapat" style="width:36px;height:36px;border:1px solid #e8e5df;border-radius:10px;background:#fff;font-size:20px;cursor:pointer">×</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:22px">
          <div style="padding:12px;background:#faf8f4;border-radius:10px"><small style="display:block;color:#888;margin-bottom:5px">İş türü</small><b>${escapeHTML(job.job_type || "-")}</b></div>
          <div style="padding:12px;background:#faf8f4;border-radius:10px"><small style="display:block;color:#888;margin-bottom:5px">Durum</small><b>${escapeHTML(job.status || "-")}</b></div>
          <div style="padding:12px;background:#faf8f4;border-radius:10px"><small style="display:block;color:#888;margin-bottom:5px">Çekim tarihi</small><b>${escapeHTML(formatDate(job.work_date))}</b></div>
          <div style="padding:12px;background:#faf8f4;border-radius:10px"><small style="display:block;color:#888;margin-bottom:5px">Teslim tarihi</small><b>${escapeHTML(formatDate(job.delivery_date))}</b></div>
          <div style="padding:12px;background:#faf8f4;border-radius:10px;grid-column:1/-1"><small style="display:block;color:#888;margin-bottom:5px">Lokasyon</small><b>${escapeHTML(job.location || "-")}</b></div>
          <div style="padding:12px;background:#faf8f4;border-radius:10px;grid-column:1/-1"><small style="display:block;color:#888;margin-bottom:5px">Operasyon ataması</small><b>${escapeHTML(job.assigned_to || "-")}</b></div>
          <div style="padding:12px;background:#faf8f4;border-radius:10px;grid-column:1/-1"><small style="display:block;color:#888;margin-bottom:5px">Notlar</small><div style="white-space:pre-wrap;line-height:1.5">${escapeHTML(job.notes || "Not eklenmemiş.")}</div></div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:18px"><button type="button" id="goToAssignedJobList" style="padding:11px 16px;border:0;border-radius:10px;background:#262626;color:#fff;font-weight:700;cursor:pointer">İş listesine dön</button></div>
      </div>`;
    const closeDialog = () => dialog.close();
    dialog.querySelector("#closeAssignedJobDetail").addEventListener("click", closeDialog);
    dialog.querySelector("#goToAssignedJobList").addEventListener("click", closeDialog);
    if (!dialog.open) dialog.showModal();
  }

  function jobRows(list) {
    if (!list.length) {
      return `<div class="empty">Henüz kayıtlı iş bulunmuyor.</div>`;
    }

    return `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>İş / Müşteri</th>
              <th>Tür</th>
              <th>Çekim Tarihi</th>
              <th>Teslim Tarihi</th>
              <th>Lokasyon</th>
              <th>Operasyon Ataması</th>
              <th>Durum</th>
              <th>Detay</th>
              ${isAdmin() ? "<th>İşlem</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${list.map(job => `
              <tr id="job-row-${escapeHTML(job.id)}" data-job-row="${escapeHTML(job.id)}">
                <td><b>${escapeHTML(job.title)}</b></td>
                <td>${escapeHTML(job.job_type)}</td>
                <td>${formatDate(job.work_date)}</td>
                <td>${formatDate(job.delivery_date)}</td>
                <td>${escapeHTML(job.location || "-")}</td>
                <td>${job.assigned_to ? job.assigned_to.split(",").map(name => `<span class="assignment-chip">${escapeHTML(name.trim())}</span>`).join(" ") : `<span class="muted">Atanmadı</span>`}</td>
                <td>
                  <span class="status ${statusClass(job.status)}">
                    ${escapeHTML(job.status)}
                  </span>
                </td>
                <td><button class="btn ghost" type="button" data-job-detail="${escapeHTML(job.id)}">İş detayları</button></td>
                ${isAdmin() ? `
                  <td>
                    <button class="btn ghost" data-status="${job.id}">
                      Durum değiştir
                    </button>
                    <button class="btn ghost" data-delete-job="${job.id}">
                      İşi sil
                    </button>
                  </td>` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }


  const moneyTR = value => new Intl.NumberFormat("tr-TR", {
    style: "currency", currency: "TRY", maximumFractionDigits: 2
  }).format(Number(value || 0));

  async function openJobDetails(id) {
    const job = jobs.find(item => String(item.id) === String(id));
    if (!job) return toast("İş kaydı bulunamadı.");

    let financeHTML = "";
    if (isAdmin()) {
      try {
        const [{ data: feeRow, error: feeError }, { data: payments, error: paymentError }] = await Promise.all([
          client.from("finance_job_values").select("job_fee").eq("job_id", job.id).maybeSingle(),
          client.from("finance_entries").select("id,amount,entry_date,category,note").eq("job_id", job.id).eq("entry_type", "income").order("entry_date", { ascending: true })
        ]);
        if (feeError) throw feeError;
        if (paymentError) throw paymentError;
        const fee = Number(feeRow?.job_fee || 0);
        const paid = (payments || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
        financeHTML = `
          <section class="panel" style="margin-top:16px">
            <h3>Finans özeti <small class="muted">· Yalnızca yetkili yönetici</small></h3>
            <div class="stats-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px">
              <div class="stat"><small>İş bedeli · KDV hariç</small><strong>${moneyTR(fee)}</strong></div>
              <div class="stat"><small>Kapora ve ara ödemeler</small><strong>${moneyTR(paid)}</strong></div>
              <div class="stat"><small>Kalan ödeme</small><strong>${moneyTR(Math.max(0, fee-paid))}</strong></div>
            </div>
            <h4 style="margin:16px 0 8px">Ödeme geçmişi</h4>
            ${(payments || []).length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tarih</th><th>Tür</th><th>Açıklama</th><th>Tutar</th></tr></thead><tbody>
              ${(payments || []).map(p => `<tr><td>${formatDate(p.entry_date)}</td><td>${escapeHTML(p.category || "Tahsilat")}</td><td>${escapeHTML(p.note || "-")}</td><td>${moneyTR(p.amount)}</td></tr>`).join("")}
            </tbody></table></div>` : `<p class="muted">Henüz ödeme kaydı yok.</p>`}
          </section>`;
      } catch (error) {
        console.error("İş finans özeti yüklenemedi:", error);
        financeHTML = `<section class="panel" style="margin-top:16px"><h3>Finans özeti</h3><p class="muted">Finans bilgileri yüklenemedi: ${escapeHTML(error.message)}</p></section>`;
      }
    }

    const dialog = $("#jobDetailDialog");
    if (!dialog) return toast("İş detay penceresi bulunamadı.");
    dialog.innerHTML = `
      <div class="modal-head">
        <div><p class="eyebrow">KT MEDIA · İŞ DETAYI</p><h3>${escapeHTML(job.title || "İş detayları")}</h3></div>
        <button class="icon-btn" type="button" id="closeJobDetail">✕</button>
      </div>
      <div class="form-grid" style="margin-top:14px">
        <div><small class="muted">İş türü</small><p><b>${escapeHTML(job.job_type || "-")}</b></p></div>
        <div><small class="muted">Operasyon aşaması</small><p><span class="status ${statusClass(job.status)}">${escapeHTML(job.status || "-")}</span></p></div>
        <div><small class="muted">Çekim tarihi</small><p><b>${formatDate(job.work_date)}</b></p></div>
        <div><small class="muted">Planlanan teslim tarihi</small><p><b>${formatDate(job.delivery_date)}</b></p></div>
        <div><small class="muted">Müşteri telefonu</small><p><b>${escapeHTML(job.customer_phone || "-")}</b></p></div>
        <div><small class="muted">Müşteri e-posta</small><p><b>${escapeHTML(job.customer_email || "-")}</b></p></div>
        <div><small class="muted">Lokasyon</small><p><b>${escapeHTML(job.location || "-")}</b></p></div>
        <div><small class="muted">Operasyon ekibi</small><p><b>${escapeHTML(job.assigned_to || "Atanmadı")}</b></p></div>
        <div class="wide"><small class="muted">Operasyon notları</small><div style="white-space:pre-wrap;background:#faf8f4;border-radius:10px;padding:13px;margin-top:6px">${escapeHTML(job.notes || "Henüz operasyon notu eklenmemiş.")}</div></div>
      </div>
      ${financeHTML}
      <div class="modal-actions"><button class="btn primary" type="button" id="closeJobDetailBottom">Kapat</button></div>
    `;
    const close = () => dialog.close();
    $("#closeJobDetail").addEventListener("click", close);
    $("#closeJobDetailBottom").addEventListener("click", close);
    if (!dialog.open) dialog.showModal();
  }

  function stat(label, value, note, icon) {
    return `
      <div class="stat">
        <div class="stat-top">
          <span>${label}</span>
          <span class="stat-icon">${icon}</span>
        </div>
        <strong>${value}</strong>
        <small>${note}</small>
      </div>
    `;
  }


  async function loadArchiveData() {
    const [drivesResult, archivesResult] = await Promise.all([
      client.from("archive_drives").select("*").order("created_at", { ascending: false }),
      client.from("job_archives").select("*").order("created_at", { ascending: false })
    ]);
    if (drivesResult.error) throw drivesResult.error;
    if (archivesResult.error) throw archivesResult.error;
    archiveDrives = drivesResult.data || [];
    jobArchives = archivesResult.data || [];
  }

  function capacityNumber(value) {
    const match = String(value || "").replace(",", ".").match(/[0-9]+(?:\.[0-9]+)?/);
    return match ? Number(match[0]) : 0;
  }

  function renderHarddisks() {
    const total = archiveDrives.reduce((sum, drive) => sum + capacityNumber(drive.capacity), 0);
    const free = archiveDrives.reduce((sum, drive) => sum + capacityNumber(drive.free_space), 0);
    const used = Math.max(0, total - free);
    const pct = total ? Math.round(used / total * 100) : 0;
    const driveCards = archiveDrives.length ? archiveDrives.map(drive => {
      const cap = capacityNumber(drive.capacity), freeSpace = capacityNumber(drive.free_space);
      const usedPct = cap ? Math.max(0, Math.min(100, Math.round((cap-freeSpace)/cap*100))) : 0;
      return `<article class="drive-card">
        <div class="drive-card-top"><span class="drive-icon">▱</span><div class="drive-card-title"><b>${escapeHTML(drive.drive_name)}</b><small>${escapeHTML(drive.physical_location || "Konum belirtilmedi")}</small></div><span class="pill ${drive.drive_status === "Aktif" ? "green" : ""}">${escapeHTML(drive.drive_status)}</span></div>
        <div class="drive-capacity"><b>${escapeHTML(drive.capacity || "Kapasite girilmedi")}</b><span>${escapeHTML(drive.free_space || "Boş alan girilmedi")} boş</span></div>
        <div class="capacity-track"><i style="width:${usedPct}%"></i></div>
        <small>${usedPct}% dolu · Seri No: ${escapeHTML(drive.serial_number || "—")}</small>
        ${drive.notes ? `<p class="muted drive-note">${escapeHTML(drive.notes)}</p>` : ""}
      </article>`;
    }).join("") : `<div class="empty">Henüz harddisk eklenmemiş. İlk diskinizi ekleyerek başlayın.</div>`;
    const jobOptions = jobs.map(job => `<option value="${escapeHTML(job.id)}">${escapeHTML(job.title)}</option>`).join("");
    const driveOptions = archiveDrives.map(drive => `<option value="${escapeHTML(drive.id)}">${escapeHTML(drive.drive_name)}</option>`).join("");
    const rows = jobArchives.length ? jobArchives.map(record => {
      const job = jobs.find(item => String(item.id) === String(record.job_id));
      const mainDrive = archiveDrives.find(drive => String(drive.id) === String(record.drive_id));
      const backupDrive = archiveDrives.find(drive => String(drive.id) === String(record.backup_drive_id));
      return `<tr><td><b>${escapeHTML(job?.title || "Silinmiş / bulunamayan iş")}</b><small class="archive-sub">${escapeHTML(job?.job_type || "")}</small></td><td>${formatDate(job?.work_date)}</td><td><span class="pill">${escapeHTML(mainDrive?.drive_name || "Disk seçilmedi")}</span></td><td>${escapeHTML(backupDrive?.drive_name || "—")}</td><td class="archive-path">${escapeHTML(record.folder_path)}</td><td><span class="pill ${record.backup_status === "Tamamlandı" ? "green" : "blue"}">${escapeHTML(record.backup_status)}</span></td></tr>`;
    }).join("") : `<tr><td colspan="6"><div class="empty">Henüz çekim–disk bağlantısı yok.</div></td></tr>`;
    return `<div class="section-heading"><div><h2>Harddisk Yönetimi</h2><p class="muted">Arşiv disklerinizi ve çekimlerin hangi diskte saklandığını yönetin.</p></div>${isAdmin() ? `<button class="btn primary" id="toggleDriveForm">＋ Yeni Disk Ekle</button>` : ""}</div>
      <div class="stats-grid archive-stats">${stat("Toplam disk", archiveDrives.length, "Kayıtlı depolama birimi", "▱")}${stat("Toplam kapasite", `${total.toLocaleString("tr-TR")} TB`, "Tanımlı disk kapasitesi", "▤")}${stat("Kullanılan alan", `${used.toLocaleString("tr-TR")} TB`, `%${pct} doluluk`, "◔")}${stat("Boş alan", `${free.toLocaleString("tr-TR")} TB`, "Girilen boş alan bilgisi", "▱")}</div>
      ${isAdmin() ? `<section class="panel archive-form-panel hidden" id="driveFormPanel"><div class="panel-heading"><h3>Yeni harddisk kaydı</h3><button class="icon-btn" type="button" id="closeDriveForm">✕</button></div><form id="driveForm" class="archive-form"><label>Disk adı<input name="drive_name" required placeholder="Örn. Disk 01 – Ana Arşiv"></label><label>Seri numarası<input name="serial_number" placeholder="Seri numarası"></label><label>Kapasite<input name="capacity" placeholder="Örn. 8 TB" required></label><label>Boş alan<input name="free_space" placeholder="Örn. 5.6 TB"></label><label>Fiziksel konum<input name="physical_location" placeholder="Örn. Stüdyo / Kasa 2"></label><label>Durum<select name="drive_status"><option>Aktif</option><option>Yedek</option><option>Arşiv</option><option>Arızalı</option></select></label><label class="wide">Not<textarea name="notes" rows="2"></textarea></label><button class="btn primary" type="submit">Diski kaydet</button></form></section>` : ""}
      <section class="panel"><div class="panel-heading"><h3>Disklerim</h3><span class="muted">${archiveDrives.length} disk</span></div><div class="drive-grid">${driveCards}</div></section>
      <section class="panel archive-record-panel"><div class="panel-heading"><div><h3>Arşiv Kayıtları (Çekim – Disk Bağlantısı)</h3><small class="muted">Her çekimin ana diskini, yedek diskini ve klasör yolunu kaydedin.</small></div><button class="btn primary" id="toggleArchiveForm">＋ Yeni Arşiv Kaydı</button></div>
      <div class="archive-form-panel hidden" id="archiveFormPanel"><form id="archiveForm" class="archive-form"><label class="wide">Çekim / Müşteri<select name="job_id" required><option value="">İş seçin</option>${jobOptions}</select></label><label>Ana disk<select name="drive_id" required><option value="">Disk seçin</option>${driveOptions}</select></label><label>Yedek disk<select name="backup_drive_id"><option value="">Yedek disk yok</option>${driveOptions}</select></label><label class="wide">Klasör yolu<input name="folder_path" required placeholder="2026/Düğün/Müşteri-Adı"></label><label>Yedek durumu<select name="backup_status"><option>Bekliyor</option><option>Devam Ediyor</option><option>Tamamlandı</option></select></label><label>Yedekleme tarihi<input name="backup_date" type="date"></label><label class="wide">Not<textarea name="notes" rows="2"></textarea></label><button class="btn primary" type="submit">Arşiv bağlantısını kaydet</button></form></div>
      <div class="table-wrap"><table class="data-table archive-table"><thead><tr><th>Müşteri / İş</th><th>Çekim tarihi</th><th>Ana disk</th><th>Yedek disk</th><th>Klasör yolu</th><th>Yedek durumu</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  async function saveDrive(form) {
    if (!isAdmin()) return toast("Disk eklemek için yönetici yetkisi gerekiyor.");
    const data = new FormData(form);
    const row = Object.fromEntries(data.entries());
    row.created_by = user.id;
    const { error } = await client.from("archive_drives").insert(row);
    if (error) return toast("Disk kaydedilemedi: " + error.message);
    await loadArchiveData(); await render(); toast("Harddisk kaydedildi.");
  }

  async function saveJobArchive(form) {
    const data = new FormData(form);
    const row = { job_id: Number(data.get("job_id")), drive_id: data.get("drive_id"), backup_drive_id: data.get("backup_drive_id") || null, folder_path: String(data.get("folder_path") || "").trim(), backup_status: data.get("backup_status"), backup_date: data.get("backup_date") || null, notes: String(data.get("notes") || "").trim(), created_by: user.id };
    if (!row.job_id || !row.drive_id || !row.folder_path) return toast("İş, ana disk ve klasör yolu zorunludur.");
    const { error } = await client.from("job_archives").insert(row);
    if (error) return toast("Arşiv bağlantısı kaydedilemedi: " + error.message);
    await loadArchiveData(); await render(); toast("Çekim–disk bağlantısı kaydedildi.");
  }

  function renderDashboard() {
    const today = todayString();
    const active = jobs.filter(j =>
      j.status !== "Teslim Edildi"
    );
    const shoots = jobs.filter(j =>
      j.work_date === today
    );
    const editing = jobs.filter(j =>
      j.status === "Montajda"
    );

    return `
      <div class="welcome">
        <div>
          <p class="eyebrow">KT MEDIA PRODÜKSİYON</p>
          <h1>Merhaba, ${escapeHTML(profile.display_name || user.email)} 👋</h1>
          <p class="muted">Bugünün iş akışına genel bakış.</p>
        </div>
        <button class="btn primary" id="dashboardNewJob">＋ Yeni iş oluştur</button>
      </div>

      <div class="stats-grid">
        ${stat("Toplam iş", jobs.length, "Tüm kayıtlar", "▣")}
        ${stat("Aktif işler", active.length, "Devam eden süreçler", "◷")}
        ${stat("Bugünkü çekim", shoots.length, "Bugün planlanan", "▦")}
        ${stat("Montajda", editing.length, "Kurgu aşamasındaki işler", "◫")}
      </div>

      <div class="dashboard-grid">
        <section class="panel">
          <div class="panel-heading">
            <h3>Son iş hareketleri</h3>
            <span>${jobs.length} kayıt</span>
          </div>
          ${jobRows([...jobs].slice(0, 8))}
        </section>

        <section class="panel">
          <div class="panel-heading"><h3>Hızlı erişim</h3></div>
          <div class="quick-grid">
            ${quickLink("calendar", "▦ Takvim", "Çekim tarihlerini görüntüle")}
            ${quickLink("editing", "◫ Montaj", "Montaj aşamasındaki işler")}
            ${quickLink("delivery", "⇧ Teslim", "Teslim edilecek işler")}
            ${quickLink("archive", "▤ Arşiv", "Tamamlanan işleri incele")}
          </div>
        </section>
      </div>
    `;
  }

  function quickLink(target, title, description) {
    return `
      <button class="quick-link" data-goto="${target}">
        <b>${title}</b>
        <small>${description}</small>
      </button>
    `;
  }

  function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const start = (firstDay + 6) % 7;

    let cells = "";
    for (let i = 0; i < start; i++) {
      cells += `<div class="calendar-cell muted"></div>`;
    }

    for (let day = 1; day <= days; day++) {
      const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayJobs = jobs.filter(j => j.work_date === date);

      cells += `
        <div class="calendar-cell">
          <b>${day}</b>
          ${dayJobs.map(j => `
            <div class="calendar-event" title="${escapeHTML(j.title)}">
              ${escapeHTML(j.title)}
            </div>
          `).join("")}
        </div>
      `;
    }

    return `
      <section class="panel">
        <div class="panel-heading">
          <button class="btn ghost" id="prevMonth">←</button>
          <h3>${calendarDate.toLocaleDateString("tr-TR", {
            month: "long", year: "numeric"
          })}</h3>
          <button class="btn ghost" id="nextMonth">→</button>
        </div>
        <div class="calendar-grid">
          ${["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
            .map(d => `<b class="calendar-weekday">${d}</b>`).join("")}
          ${cells}
        </div>
      </section>
      <section class="panel">
        <h3>Yaklaşan çekimler</h3>
        ${jobRows([...jobs].sort((a,b) =>
          (a.work_date || "").localeCompare(b.work_date || "")
        ))}
      </section>
    `;
  }

  function renderJobs() {
    return `
      <div class="section-heading">
        <div>
          <h2>Çekim işleri</h2>
          <p class="muted">Tüm planlanan ve devam eden işler.</p>
        </div>
        <div class="section-actions" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="exportJobsExcel" type="button">⇩ Tüm Kayıtları Excel'e Aktar</button>
          <button class="btn primary" id="jobsNewJob">＋ Yeni İş</button>
        </div>
      </div>
      ${jobRows(jobs)}
    `;
  }



  async function exportAllJobsExcel() {
    if (!isAdmin()) return toast("Excel raporu indirmek için yönetici yetkisi gerekiyor.");
    if (!jobs.length) return toast("Dışa aktarılacak çekim işi bulunmuyor.");

    try {
      // İş bedelleri ve kaporalar rapor için ayrıca okunur; kayıtlar değiştirilmez.
      const [{ data: feeRows, error: feeError }, { data: paymentRows, error: paymentError }] = await Promise.all([
        client.from("finance_job_values").select("job_id,job_fee"),
        client.from("finance_entries").select("job_id,entry_type,amount,category").eq("entry_type", "income")
      ]);
      if (feeError) throw feeError;
      if (paymentError) throw paymentError;

      const fees = Object.fromEntries((feeRows || []).map(row => [String(row.job_id), Number(row.job_fee || 0)]));
      const paidByJob = {};
      (paymentRows || []).forEach(row => {
        if (row.job_id) paidByJob[String(row.job_id)] = (paidByJob[String(row.job_id)] || 0) + Number(row.amount || 0);
      });

      const headers = ["İş Numarası","Müşteri / İş Adı","Telefon","E-posta","İş Türü","Çekim Tarihi","Lokasyon","Çekim / Operasyon Sorumlusu","İş Bedeli (TL)","Alınan Ödeme / Kapora (TL)","Kalan Tutar (TL)","İş Durumu","Teslim Tarihi","Notlar"];
      const rows = [...jobs].sort((a,b) => (a.work_date || "").localeCompare(b.work_date || "")).map(job => {
        const fee = fees[String(job.id)] || 0;
        const paid = paidByJob[String(job.id)] || 0;
        return [
          job.id, job.title || "", job.customer_phone || "", job.customer_email || "",
          job.job_type || "", job.work_date || "", job.location || "", job.assigned_to || "",
          fee.toFixed(2), paid.toFixed(2), Math.max(0, fee-paid).toFixed(2),
          job.status || "", job.delivery_date || "", job.notes || ""
        ];
      });
      const csvText = "\\uFEFF" + [headers, ...rows].map(row =>
        row.map(value => '"' + String(value ?? "").replace(/"/g, '""') + '"').join(";")
      ).join("\\r\\n");
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `KT-Media-Cekim-Isleri-Tum-Kayitlar-${todayString()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast(`${jobs.length} çekim işi Excel ile açılabilecek şekilde indirildi.`);
    } catch (error) {
      console.error("Çekim işleri Excel dışa aktarma hatası:", error);
      toast("Excel raporu oluşturulamadı: " + (error.message || "Bilinmeyen hata"));
    }
  }

  function renderStage(status, title, description) {
    const list = jobs.filter(j => j.status === status);
    return `
      <div class="section-heading">
        <div>
          <h2>${title}</h2>
          <p class="muted">${description}</p>
        </div>
      </div>
      ${jobRows(list)}
    `;
  }

  function renderDelivery() {
    const today = todayString();
    const active = jobs.filter(j => j.status !== "Teslim Edildi" && j.delivery_date);
    const overdue = active.filter(j => j.delivery_date < today)
      .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
    const upcoming = active.filter(j => j.delivery_date >= today &&
      Math.round((new Date(j.delivery_date + "T12:00:00") - new Date(today + "T12:00:00")) / 86400000) <= 3)
      .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
    const ready = jobs.filter(j => j.status === "Teslime Hazır");
    const delivered = jobs.filter(j => j.status === "Teslim Edildi");
    const card = (label, value, hint, color) => `
      <div class="stat" style="border-top:3px solid ${color}">
        <div class="stat-top"><span>${label}</span></div>
        <strong>${value}</strong><small>${hint}</small>
      </div>`;
    const section = (title, description, list, empty) => `
      <section class="panel" style="margin-top:18px">
        <h3>${title} <span class="muted" style="font-size:13px">(${list.length})</span></h3>
        <p class="muted">${description}</p>
        ${list.length ? jobRows(list) : `<div class="empty">${empty}</div>`}
      </section>`;
    return `
      <div class="section-heading"><div><h2>Teslimat Kontrol Merkezi</h2>
        <p class="muted">Teslim tarihlerini otomatik kontrol eder. Gecikmeler iş durumundan bağımsız hesaplanır.</p></div>
      </div>
      <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px">
        ${card("Gecikmiş işler", overdue.length, "Teslim tarihi geçmiş", "#d94b42")}
        ${card("Yaklaşan teslimat", upcoming.length, "Önümüzdeki 3 gün", "#c59a50")}
        ${card("Teslime hazır", ready.length, "Teslim bekliyor", "#438b68")}
        ${card("Teslim edildi", delivered.length, "Tamamlanan işler", "#6b829c")}
      </div>
      ${section("Gecikmiş İşler", "Teslim tarihi geçmiş ve henüz teslim edilmemiş kayıtlar.", overdue, "Gecikmiş iş bulunmuyor. Harika!")}
      ${section("Yaklaşan Teslimatlar", "Bugün veya önümüzdeki 3 gün içinde teslim edilmesi gereken işler.", upcoming, "Önümüzdeki 3 gün için teslimat yok.")}
      ${section("Teslime Hazır", "Teslimat için hazır olarak işaretlenen kayıtlar.", ready, "Teslime hazır iş bulunmuyor.")}
      ${section("Sonuçlanan Teslimatlar", "Teslim edildi olarak işaretlenen işler.", delivered.slice().sort((a,b) => (b.delivery_date || "").localeCompare(a.delivery_date || "")), "Henüz teslim edilmiş iş bulunmuyor.")}
    `;
  }

  async function renderTeam() {
    if (!isAdmin()) {
      return `<section class="panel">Bu alan yalnızca yöneticilere açıktır.</section>`;
    }

    const { data, error } = await client
      .from("profiles")
      .select("id,display_name,role,approved,active,created_at")
      .order("created_at", { ascending: false });

    if (error) return `<section class="panel">Ekip listesi alınamadı: ${escapeHTML(error.message)}</section>`;

    return `
      <section class="panel">
        <h2>Ekip Yönetimi</h2>
        <p class="muted">Yeni ekip hesaplarını buradan kontrol edebilirsin.</p>
        ${data.map(person => {
          const active = person.active !== false;
          const isSelf = person.id === user.id;
          const isOtherAdmin = person.role === "admin" && !isSelf;
          return `
            <div class="team-row">
              <div>
                <b>${escapeHTML(person.display_name || "İsimsiz kullanıcı")}</b>
                <small>${escapeHTML(person.role || "Ekip üyesi")}</small>
              </div>
              <span>${!active ? "Erişimi kapalı" : person.approved ? "Onaylı" : "Onay bekliyor"}</span>
              ${active && !person.approved ? `<button class="btn primary" data-approve="${person.id}">Onayla</button>` : ""}
              ${!isSelf && !isOtherAdmin ? (active
                ? `<button class="btn danger" data-deactivate-member="${person.id}" data-member-name="${escapeHTML(person.display_name || "Bu ekip üyesi")}">Sil</button>`
                : `<button class="btn" data-reactivate-member="${person.id}">Yeniden Etkinleştir</button>`) : ""}
            </div>
          `;
        }).join("")}
      </section>
    `;
  }


  const money = value => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(value || 0));
  const monthKey = date => String(date || "").slice(0, 7);
  const financeMonthLabel = key => new Date(key + "-01T12:00:00").toLocaleDateString("tr-TR", { month: "short" });

  async function loadFinanceEntries() {
    if (!isAdmin()) { financeEntries = []; return; }
    const { data, error } = await client.from("finance_entries")
      .select("id,entry_type,amount,entry_date,category,note,job_id")
      .order("entry_date", { ascending: false });
    if (error) throw error;
    financeEntries = data || [];
    const { data: feeRows, error: feeError } = await client.from("finance_job_values").select("job_id,job_fee");
    if (feeError) throw feeError;
    financeJobFees = Object.fromEntries((feeRows || []).map(row => [String(row.job_id), Number(row.job_fee || 0)]));
  }

  function renderFinance() {
    if (!isAdmin()) return `<section class="panel">Bu alan yalnızca yetkililere açıktır.</section>`;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const monthEntries = financeEntries.filter(x => monthKey(x.entry_date) === currentMonth);
    const collections = monthEntries.filter(x => x.entry_type === "income").reduce((s,x)=>s+Number(x.amount||0),0);
    const expenses = monthEntries.filter(x => x.entry_type === "expense").reduce((s,x)=>s+Number(x.amount||0),0);
    const booked = jobs.filter(j => monthKey(j.work_date) === currentMonth).reduce((s,j)=>s+Number(financeJobFees[String(j.id)]||0),0);
    const receivedByJob = {};
    financeEntries.filter(x=>x.entry_type==="income" && x.job_id).forEach(x=>receivedByJob[x.job_id]=(receivedByJob[x.job_id]||0)+Number(x.amount||0));
    const receivables = jobs.reduce((s,j)=>s+Math.max(0,Number(financeJobFees[String(j.id)]||0)-(receivedByJob[j.id]||0)),0);
    const allTimeCollections = financeEntries.filter(x=>x.entry_type==="income").reduce((s,x)=>s+Number(x.amount||0),0);
    const allTimeExpenses = financeEntries.filter(x=>x.entry_type==="expense").reduce((s,x)=>s+Number(x.amount||0),0);
    const allTimeBooked = Object.values(financeJobFees).reduce((s,v)=>s+Number(v||0),0);
    const net = allTimeCollections-allTimeExpenses;
    const months = Array.from({length:6},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;});
    const max = Math.max(1,...months.flatMap(m=>[financeEntries.filter(x=>monthKey(x.entry_date)===m&&x.entry_type==="income").reduce((s,x)=>s+Number(x.amount||0),0),financeEntries.filter(x=>monthKey(x.entry_date)===m&&x.entry_type==="expense").reduce((s,x)=>s+Number(x.amount||0),0)]));
    const chart = months.map(m=>{
      const inc=financeEntries.filter(x=>monthKey(x.entry_date)===m&&x.entry_type==="income").reduce((s,x)=>s+Number(x.amount||0),0);
      const exp=financeEntries.filter(x=>monthKey(x.entry_date)===m&&x.entry_type==="expense").reduce((s,x)=>s+Number(x.amount||0),0);
      return `<div class="finance-month"><div class="finance-bars"><div class="finance-bar income" style="height:${Math.max(2,inc/max*100)}%" title="Tahsilat ${money(inc)}"></div><div class="finance-bar expense" style="height:${Math.max(2,exp/max*100)}%" title="Gider ${money(exp)}"></div></div><small>${financeMonthLabel(m)}</small><small class="finance-chart-value">${money(inc)}</small></div>`;
    }).join("");
    const outstanding = jobs.filter(j=>Number(financeJobFees[String(j.id)]||0)>(receivedByJob[j.id]||0));
    const jobName = id => jobs.find(j=>String(j.id)===String(id))?.title || "İş / müşteri silinmiş";
    const today = todayString();
    return `
      <div class="section-heading"><div><h2>Finans Yönetimi</h2><p class="muted">Tüm tutarlar KDV hariçtir. Finans bilgileri yalnızca yetkililere açıktır.</p></div></div>
      <div class="stats-grid finance-stats">
        ${stat("Bu ay iş hacmi",money(booked),"Çekim tarihi bu ay olan işler","▣")}
        ${stat("Bu ay tahsilat",money(collections),"Kasaya giren ödeme","₺")}
        ${stat("Bekleyen toplam alacak",money(receivables),"Tüm müşterilerden kalan","◷")}
        ${stat("Net nakit sonucu",money(net),"Toplam tahsilat − toplam gider","↗")}
      </div>
      <div class="stats-grid finance-stats" style="margin-top:12px">
        ${stat("Toplam iş bedeli",money(allTimeBooked),"Kayıtlı tüm işlerin toplamı","▣")}
        ${stat("Toplam tahsilat",money(allTimeCollections),"Tüm zamanlar","₺")}
        ${stat("Toplam gider",money(allTimeExpenses),"Tüm zamanlar","−")}
        ${stat("Kalan alacak",money(receivables),"Henüz tahsil edilmemiş","◷")}
      </div>
      <section class="panel finance-panel"><div class="panel-heading"><div><h3>Aylık tahsilat / gider grafiği</h3><small class="muted">Son 6 ay · KDV hariç</small></div><div class="finance-legend"><span><i class="income-dot"></i> Tahsilat</span><span><i class="expense-dot"></i> Gider</span></div></div><div class="finance-chart">${chart}</div></section>
      <div class="finance-columns">
        <section class="panel"><h3>Ödeme kaydı ekle</h3><form id="paymentForm" class="finance-form">
          <label>İlgili müşteri / iş<select name="job_id" required><option value="">İş seçin</option>${jobs.map(j=>`<option value="${escapeHTML(j.id)}">${escapeHTML(j.title)}</option>`).join("")}</select></label>
          <label>Ödeme tutarı (₺)<input name="amount" type="number" min="0.01" step="0.01" required></label>
          <label>Tahsilat tarihi<input name="entry_date" type="date" value="${today}" required></label>
          <label>Ödeme türü<select name="category"><option>Kapora</option><option>Ara Ödeme</option><option>Kalan Ödeme</option><option>Diğer</option></select></label>
          <label class="wide">Not<input name="note" placeholder="İsteğe bağlı açıklama"></label>
          <button class="btn primary" type="submit">Tahsilatı kaydet</button></form></section>
        <section class="panel"><h3>Gider ekle</h3><form id="expenseForm" class="finance-form">
          <label>Gider tutarı (₺)<input name="amount" type="number" min="0.01" step="0.01" required></label>
          <label>Gider tarihi<input name="entry_date" type="date" value="${today}" required></label>
          <label>Gider kategorisi<select name="category"><option>Personel</option><option>Ekipman</option><option>Ulaşım</option><option>Yemek</option><option>Kira</option><option>Yazılım</option><option>Diğer</option></select></label>
          <label class="wide">Not<input name="note" placeholder="Gider açıklaması"></label>
          <button class="btn primary" type="submit">Gideri kaydet</button></form></section>
      </div>
      <section class="panel"><div class="panel-heading"><h3>Müşteri bazlı bekleyen alacaklar</h3><b>${outstanding.length} müşteri / iş</b></div>
        ${outstanding.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Müşteri / iş</th><th>İş tarihi</th><th>İletişim</th><th>İş bedeli</th><th>Ödenen</th><th>Kalan alacak</th></tr></thead><tbody>${outstanding.map(j=>{const paid=receivedByJob[j.id]||0;return `<tr><td><b>${escapeHTML(j.title)}</b></td><td>${formatDate(j.work_date)}</td><td>${escapeHTML(j.customer_phone||"-")}<br>${escapeHTML(j.customer_email||"")}</td><td>${money(financeJobFees[String(j.id)]||0)}</td><td>${money(paid)}</td><td><b>${money(Math.max(0,Number(financeJobFees[String(j.id)]||0)-paid))}</b></td></tr>`}).join("")}</tbody></table></div>`:`<div class="empty">Bekleyen alacak bulunmuyor.</div>`}
      </section>
      <section class="panel"><div class="panel-heading"><div><h3>Tahsilat ve gider geçmişi</h3><small class="muted">Her kayıt için müşteri, tarih ve silme işlemi</small></div></div>
        <div class="finance-form" style="margin-bottom:14px"><label>Başlangıç tarihi<input id="financeExportFrom" type="date" value="${currentMonth}-01"></label><label>Bitiş tarihi<input id="financeExportTo" type="date" value="${today}"></label><button class="btn primary" id="exportFinanceBtn" type="button">Excel raporu indir</button></div>
        ${financeEntries.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Tarih</th><th>Tür</th><th>Müşteri / iş</th><th>Kategori</th><th>Açıklama</th><th>Tutar</th><th>İşlem</th></tr></thead><tbody>${financeEntries.map(x=>`<tr><td>${formatDate(x.entry_date)}</td><td>${x.entry_type==="income"?"Tahsilat":"Gider"}</td><td>${escapeHTML(x.job_id?jobName(x.job_id):"Genel gider")}</td><td>${escapeHTML(x.category||"-")}</td><td>${escapeHTML(x.note||"-")}</td><td><b>${money(x.amount)}</b></td><td><button class="btn ghost" type="button" data-delete-finance="${escapeHTML(x.id)}">Sil</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Henüz finans hareketi yok.</div>`}
      </section>`;
  }

  async function deleteFinanceEntry(id) {
    if (!isAdmin()) return toast("Bu işlem için yönetici yetkisi gerekiyor.");
    const entry = financeEntries.find(x => String(x.id) === String(id));
    if (!entry) return;
    if (!confirm(`${entry.entry_type === "income" ? "Tahsilat" : "Gider"} kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;
    const { error } = await client.from("finance_entries").delete().eq("id", id);
    if (error) return toast("Silme hatası: " + error.message);
    await loadFinanceEntries(); await render(); toast("Finans kaydı silindi.");
  }

  function exportFinanceReport() {
    if (!isAdmin()) return toast("Bu işlem için yönetici yetkisi gerekiyor.");
    const from = $("#financeExportFrom")?.value || "";
    const to = $("#financeExportTo")?.value || "";
    if (from && to && from > to) return toast("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
    const rows = financeEntries.filter(x => (!from || x.entry_date >= from) && (!to || x.entry_date <= to));
    const jobName = id => jobs.find(j=>String(j.id)===String(id))?.title || "İş / müşteri silinmiş";
    const csv = [["Tarih","Tür","Müşteri / İş","Telefon","E-posta","Kategori","Açıklama","Tutar (KDV hariç)"], ...rows.map(x=>{const j=jobs.find(j=>String(j.id)===String(x.job_id));return [x.entry_date,x.entry_type==="income"?"Tahsilat":"Gider",x.job_id?jobName(x.job_id):"Genel gider",j?.customer_phone||"",j?.customer_email||"",x.category||"",x.note||"",Number(x.amount||0).toFixed(2)];})];
    const csvText = "\uFEFF" + csv.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\r\n");
    const blob = new Blob([csvText], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href=url; a.download=`KT-Media-Finans-${from||"baslangic"}-${to||"bugun"}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("Excel ile açılabilen rapor indirildi.");
  }

  async function saveFinanceEntry(form, entryType) {
    if (!isAdmin()) return toast("Finans işlemi için yetki gerekiyor.");
    const data = new FormData(form);
    const amount = Number(data.get("amount"));
    if (!(amount > 0)) return toast("Geçerli bir tutar girin.");
    const row = { entry_type: entryType, amount, entry_date: data.get("entry_date"), category: data.get("category"), note: (data.get("note")||"").trim(), created_by: user.id };
    if (entryType === "income") row.job_id = data.get("job_id");
    const { error } = await client.from("finance_entries").insert(row);
    if (error) return toast("Kayıt hatası: " + error.message);
    await loadFinanceEntries(); await render(); toast(entryType==="income"?"Tahsilat kaydedildi.":"Gider kaydedildi.");
  }

  async function render() {
    $("#pageTitle").textContent = pageTitles[page] || "Genel Bakış";

    let html = "";

    if (page === "dashboard") html = renderDashboard();
    if (page === "calendar") html = renderCalendar();
    if (page === "jobs") html = renderJobs();
    if (page === "editing") {
      html = renderStage("Montajda", "Montaj Süreci", "Kurgu aşamasındaki işler.");
    }
    if (page === "delivery") {
      html = renderDelivery();
    }
    if (page === "archive") {
      html = renderStage("Teslim Edildi", "Arşiv", "Tamamlanmış işler.");
    }
    if (page === "harddisks") {
      try { await loadArchiveData(); html = renderHarddisks(); }
      catch (error) { html = `<section class="panel">Harddisk verileri yüklenemedi: ${escapeHTML(error.message)}<p class="muted">Veritabanı kurulumunu ve erişim izinlerini kontrol edin.</p></section>`; }
    }
    if (page === "team") html = await renderTeam();
    if (page === "finance") {
      if (!isAdmin()) html = `<section class="panel">Bu alan yalnızca yöneticilere açıktır.</section>`;
      else { await loadFinanceEntries(); html = renderFinance(); }
    }

    $("#content").innerHTML = html;

    document.querySelectorAll(".nav-item").forEach(button => {
      button.classList.toggle("active", button.dataset.page === page);
    });

    bindPageEvents();
  }

  async function loadTeamMembers() {
    if (!isAdmin()) return;
    const { data, error } = await client
      .from("profiles")
      .select("display_name")
      .eq("approved", true)
      .eq("active", true)
      .order("display_name", { ascending: true });
    if (error) throw error;
    teamMembers = (data || []).map(person => person.display_name).filter(Boolean);
  }

  async function loadJobs() {
    const { data, error } = await client
      .from("jobs")
      .select("*")
      .order("work_date", { ascending: true });

    if (error) throw error;
    jobs = data || [];
  }

  async function loadProfile() {
    const { data, error } = await client
      .from("profiles")
      .select("id,display_name,role,approved,active")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const displayName =
        user.user_metadata?.display_name ||
        user.email.split("@")[0];

      const { error: insertError } = await client
        .from("profiles")
        .insert({
          id: user.id,
          display_name: displayName,
          role: "member",
          approved: false
        });

      if (insertError) throw insertError;

      throw new Error("Hesabınız yönetici onayı bekliyor.");
    }

    profile = data;

    if (profile.active === false) {
      await client.auth.signOut();
      throw new Error("Hesabınız yönetici tarafından devre dışı bırakılmıştır.");
    }

    if (profile.approved !== true) {
      await client.auth.signOut();
      throw new Error("Hesabınız henüz yönetici tarafından onaylanmadı.");
    }
  }

  async function startApp() {
    await loadProfile();

    $("#authScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");

    $("#userName").textContent =
      profile.display_name || user.email;
    $("#userRole").textContent =
      isAdmin() ? "Yönetici" : "Ekip üyesi";
    $("#avatar").textContent =
      (profile.display_name || "KT").slice(0, 2).toUpperCase();

    document.querySelectorAll(".admin-only").forEach(el => {
      el.classList.toggle("hidden", !isAdmin());
    });

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(console.error);
    await loadTeamMembers();
    await loadJobs();
    mountNotificationUI();
    await loadNotifications();
    subscribeToNotifications();
    const requestedJobId = new URLSearchParams(location.search).get("job_id");
    if (requestedJobId) page = "jobs";
    await render();
    if (requestedJobId) focusJob(requestedJobId);
  }

  async function authSubmit(event) {
    event.preventDefault();

    const email = $("#email").value.trim();
    const password = $("#password").value;
    const displayName = $("#displayName").value.trim();

    try {
      showAuthMessage("İşlem yapılıyor...");

      if (authMode === "login") {
        const { error } = await client.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      } else {
        if (!displayName) throw new Error("Ad soyad girin.");

        const { error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName }
          }
        });

        if (error) throw error;

        showAuthMessage(
          "Kayıt oluşturuldu. Yönetici onayı sonrasında giriş yapabilirsiniz."
        );
        return;
      }

      const { data } = await client.auth.getUser();
      user = data.user;
      await startApp();
    } catch (error) {
      showAuthMessage(error.message || "Bir hata oluştu.");
    }
  }

  function setAuthMode(mode) {
    authMode = mode;
    document.querySelectorAll("[data-auth]").forEach(button => {
      button.classList.toggle("active", button.dataset.auth === mode);
    });

    $("#nameField").classList.toggle("hidden", mode !== "signup");
    $("#authSubmit").textContent =
      mode === "login" ? "Giriş yap" : "Ekip kaydı";
    showAuthMessage("");
  }

  function openJobDialog() {
    if (!isAdmin()) {
      toast("Yeni iş ekleme yetkiniz bulunmuyor.");
      return;
    }

    $("#jobForm").reset();
    const assignment = $("#jobAssignees");
    assignment.innerHTML = teamMembers.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join("");
    $("#jobDialog").showModal();
  }

  async function saveJob(event) {
    event.preventDefault();

    if (!isAdmin()) {
      toast("Bu işlem yalnızca yönetici tarafından yapılabilir.");
      return;
    }

    const form = new FormData($("#jobForm"));
    const workDate = form.get("work_date");

    if (!workDate) {
      toast("Çekim tarihi seçmelisiniz.");
      return;
    }

    const delivery = new Date(workDate + "T12:00:00");
    delivery.setDate(delivery.getDate() + 15);
    const deliveryDate = [
      delivery.getFullYear(),
      String(delivery.getMonth() + 1).padStart(2, "0"),
      String(delivery.getDate()).padStart(2, "0")
    ].join("-");

    const record = {
      title: form.get("title").trim(),
      customer_phone: (form.get("customer_phone") || "").trim(),
      customer_email: (form.get("customer_email") || "").trim(),
      job_type: form.get("job_type"),
      location: form.get("location").trim(),
      assigned_to: Array.from($("#jobAssignees").selectedOptions).map(option => option.value).join(", "),
      work_date: workDate,
      delivery_date: deliveryDate,
      status: form.get("status"),
      notes: form.get("notes").trim(),
      created_by: user.id
    };

    try {
      const { data: insertedJob, error } = await client.from("jobs").insert(record).select("id").single();
      if (error) throw error;

      const jobFee = Number(form.get("job_fee") || 0);
      if (jobFee > 0) {
        const { error: feeError } = await client.from("finance_job_values").insert({
          job_id: insertedJob.id, job_fee: jobFee, created_by: user.id
        });
        if (feeError) throw new Error("İş kaydedildi ancak iş bedeli kaydedilemedi: " + feeError.message);
      }
      const deposit = Number(form.get("deposit_paid") || 0);
      if (deposit > 0) {
        const { error: depositError } = await client.from("finance_entries").insert({
          entry_type: "income", amount: deposit, entry_date: todayString(),
          category: "Kapora", note: record.title + " · İlk kapora", job_id: insertedJob.id, created_by: user.id
        });
        if (depositError) throw new Error("İş kaydedildi ancak kapora kaydedilemedi: " + depositError.message);
      }
      if (record.assigned_to) await sendPushForJob(insertedJob.id);
      $("#jobDialog").close();
      await loadJobs();
      await render();
      toast("Yeni iş başarıyla kaydedildi.");
    } catch (error) {
      toast("Kayıt hatası: " + error.message);
    }
  }

  async function deleteJob(id) {
    // Güvenlik: Silme işlemi yalnızca onaylı yönetici hesabına açıktır.
    if (!isAdmin()) {
      toast("Bu işlem için yönetici yetkisi gerekiyor.");
      return;
    }

    const job = jobs.find(item => String(item.id) === String(id));
    if (!job) {
      toast("Silinecek iş kaydı bulunamadı.");
      return;
    }

    if (!confirm(`"${job.title}" işi kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`)) return;

    const { error } = await client
      .from("jobs")
      .delete()
      .eq("id", id);

    if (error) {
      toast("İş silinemedi: " + error.message);
      return;
    }

    await loadJobs();
    await render();
    toast("İş kaydı silindi.");
  }

  async function changeStatus(id) {
    const job = jobs.find(item => String(item.id) === String(id));
    if (!job) return;

    const statuses = [
      "Planlandı",
      "Çekim Tamamlandı",
      "Montajda",
      "Teslime Hazır",
      "Teslim Edildi"
    ];

    const next = statuses[(statuses.indexOf(job.status) + 1) % statuses.length];

    if (!confirm(`"${job.title}" işi "${next}" olarak güncellensin mi?`)) return;

    const { error } = await client
      .from("jobs")
      .update({ status: next })
      .eq("id", id);

    if (error) {
      toast("Durum güncellenemedi: " + error.message);
      return;
    }

    await loadJobs();
    await render();
    toast("İş durumu güncellendi.");
  }

  async function approveMember(id) {
    if (!isAdmin()) return;

    if (!confirm("Bu ekip üyesinin hesabını onaylamak istiyor musunuz?")) return;

    const { error } = await client
      .from("profiles")
      .update({ approved: true })
      .eq("id", id);

    if (error) {
      toast("Onay işlemi başarısız: " + error.message);
      return;
    }

    await render();
    toast("Ekip üyesi onaylandı.");
  }

  async function deactivateMember(id, memberName) {
    if (!isAdmin() || id === user.id) return;
    if (!confirm(`${memberName} adlı ekip üyesinin erişimini kapatmak istiyor musunuz?\n\nEski iş kayıtları ve geçmiş görev bilgileri korunacaktır.`)) return;
    const { error } = await client.from("profiles").update({ active: false }).eq("id", id).neq("role", "admin");
    if (error) { toast("Ekip üyesi devre dışı bırakılamadı: " + error.message); return; }
    await loadTeamMembers(); await render();
    toast("Ekip üyesinin erişimi kapatıldı. Eski iş kayıtları korundu.");
  }

  async function reactivateMember(id) {
    if (!isAdmin()) return;
    if (!confirm("Bu ekip üyesinin erişimini yeniden açmak istiyor musunuz?")) return;
    const { error } = await client.from("profiles").update({ active: true }).eq("id", id).neq("role", "admin");
    if (error) { toast("Ekip üyesi yeniden etkinleştirilemedi: " + error.message); return; }
    await render();
    toast("Ekip üyesi yeniden etkinleştirildi. Onay durumu ayrıca kontrol edilmelidir.");
  }

  function bindPageEvents() {
    $("#toggleDriveForm")?.addEventListener("click", () => $("#driveFormPanel")?.classList.toggle("hidden"));
    $("#closeDriveForm")?.addEventListener("click", () => $("#driveFormPanel")?.classList.add("hidden"));
    $("#driveForm")?.addEventListener("submit", event => { event.preventDefault(); saveDrive(event.currentTarget); });
    $("#toggleArchiveForm")?.addEventListener("click", () => $("#archiveFormPanel")?.classList.toggle("hidden"));
    $("#archiveForm")?.addEventListener("submit", event => { event.preventDefault(); saveJobArchive(event.currentTarget); });
    $("#paymentForm")?.addEventListener("submit", event => { event.preventDefault(); saveFinanceEntry(event.currentTarget, "income"); });
    $("#expenseForm")?.addEventListener("submit", event => { event.preventDefault(); saveFinanceEntry(event.currentTarget, "expense"); });
    $("#exportFinanceBtn")?.addEventListener("click", exportFinanceReport);
    document.querySelectorAll("[data-delete-finance]").forEach(button => button.addEventListener("click", () => deleteFinanceEntry(button.dataset.deleteFinance)));
    $("#dashboardNewJob")?.addEventListener("click", openJobDialog);
    $("#jobsNewJob")?.addEventListener("click", openJobDialog);
    $("#exportJobsExcel")?.addEventListener("click", exportAllJobsExcel);

    $("#prevMonth")?.addEventListener("click", async () => {
      calendarDate.setMonth(calendarDate.getMonth() - 1);
      await render();
    });

    $("#nextMonth")?.addEventListener("click", async () => {
      calendarDate.setMonth(calendarDate.getMonth() + 1);
      await render();
    });

    document.querySelectorAll("[data-goto]").forEach(button => {
      button.addEventListener("click", async () => {
        page = button.dataset.goto;
        await render();
      });
    });

    document.querySelectorAll("[data-job-detail]").forEach(button => {
      button.addEventListener("click", () => openJobDetails(button.dataset.jobDetail));
    });

    document.querySelectorAll("[data-status]").forEach(button => {
      button.addEventListener("click", () => changeStatus(button.dataset.status));
    });

    document.querySelectorAll("[data-delete-job]").forEach(button => {
      button.addEventListener("click", () => deleteJob(button.dataset.deleteJob));
    });

    document.querySelectorAll("[data-approve]").forEach(button => {
      button.addEventListener("click", () => approveMember(button.dataset.approve));
    });
    document.querySelectorAll("[data-deactivate-member]").forEach(button => {
      button.addEventListener("click", () => deactivateMember(button.dataset.deactivateMember, button.dataset.memberName || "Ekip üyesi"));
    });
    document.querySelectorAll("[data-reactivate-member]").forEach(button => {
      button.addEventListener("click", () => reactivateMember(button.dataset.reactivateMember));
    });
  }

  function bindEvents() {
    $("#authForm").addEventListener("submit", authSubmit);
    $("#jobForm").addEventListener("submit", saveJob);

    document.querySelectorAll("[data-auth]").forEach(button => {
      button.addEventListener("click", () => setAuthMode(button.dataset.auth));
    });

    document.querySelectorAll("[data-close]").forEach(button => {
      button.addEventListener("click", () => $("#jobDialog").close());
    });

    $("#newJobBtn").addEventListener("click", openJobDialog);

    $("#logoutBtn").addEventListener("click", async () => {
      await client.auth.signOut();
      location.reload();
    });

    $("#nav").addEventListener("click", async event => {
      const button = event.target.closest("[data-page]");
      if (!button) return;

      const target = button.dataset.page;
      if (target === "finance" && !isAdmin()) return;

      page = target;
      await render();
    });

    $("#globalSearch").addEventListener("input", event => {
      const query = event.target.value.toLocaleLowerCase("tr");
      const filtered = jobs.filter(job =>
        [job.title, job.job_type, job.location, job.status]
          .some(value => String(value || "")
            .toLocaleLowerCase("tr").includes(query))
      );

      if (query) {
        page = "jobs";
        $("#pageTitle").textContent = "Arama Sonuçları";
        $("#content").innerHTML = jobRows(filtered);
      } else {
        render();
      }
    });
  }

  async function init() {
    if (!client) {
      showAuthMessage(
        "Supabase bağlantısı bulunamadı. supabase-config.js dosyasını kontrol edin."
      );
      return;
    }

    if (!config.url || !config.publishableKey) {
      showAuthMessage(
        "Supabase URL ve Publishable Key bilgileri eksik."
      );
      return;
    }

    bindEvents();

    const { data, error } = await client.auth.getSession();
    if (error) {
      showAuthMessage(error.message);
      return;
    }

    if (data.session?.user) {
      user = data.session.user;
      try {
        await startApp();
      } catch (error) {
        showAuthMessage(error.message);
      }
    }
  }

  init();
})();
