// اپ تک‌صفحه‌ای بدون فریم‌ورک — فقط fetch + hash router ساده.
const root = document.getElementById("app");
let STATE = { authenticated: false, projects: [] };

// ---------- API helper ----------
async function api(path, options = {}) {
  const res = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, error: "پاسخ نامعتبر از سرور" };
  }
  if (res.status === 401 && STATE.authenticated) {
    STATE.authenticated = false;
    location.hash = "#/login";
  }
  return data;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function fmtDate(s) {
  if (!s) return "-";
  return s.replace(" ", " ساعت ").slice(0, 16);
}

// ---------- Router ----------
const routes = {
  "#/login": renderLogin,
  "#/dashboard": renderDashboard,
  "#/projects": renderProjects,
  "#/topics": renderTopics,
  "#/flashcards": renderFlashcards,
  "#/review": renderReview,
  "#/settings": renderSettings,
};

function currentBase() {
  const h = location.hash || "#/dashboard";
  return "#/" + h.split("/")[1];
}

async function router() {
  if (!location.hash) location.hash = STATE.authenticated ? "#/dashboard" : "#/login";
  if (!STATE.authenticated && location.hash !== "#/login") {
    location.hash = "#/login";
    return;
  }
  const fn = routes[currentBase()] || renderDashboard;
  await fn();
}
window.addEventListener("hashchange", router);

// ---------- Shell ----------
function shell(activeTab, contentHtml) {
  const tabs = [
    ["#/dashboard", "داشبورد"],
    ["#/projects", "پروژه‌ها"],
    ["#/topics", "مباحث"],
    ["#/flashcards", "فلش‌کارت‌ها"],
    ["#/review", "مرور"],
    ["#/settings", "تنظیمات"],
  ];
  root.innerHTML = `
    <header class="topbar">
      <nav class="tabs">
        ${tabs.map(([href, label]) => `<button class="${activeTab === href ? "active" : ""}" onclick="location.hash='${href}'">${label}</button>`).join("")}
      </nav>
      <span class="brand">🩺 آکادمی دکتر خسته</span>
      <button class="btn-ghost" onclick="doLogout()">خروج</button>
    </header>
    <main>${contentHtml}</main>
  `;
}

async function doLogout() {
  await api("/auth/logout", { method: "POST" });
  STATE.authenticated = false;
  location.hash = "#/login";
}

// ---------- Login ----------
function renderLogin() {
  root.innerHTML = `
    <div class="center-screen">
      <div class="card login-card">
        <h1>🩺 آکادمی دکتر خسته</h1>
        <p>برای ورود، رمز عبور ادمین رو وارد کن</p>
        <input type="password" id="pw" placeholder="رمز عبور" />
        <div class="error-msg" id="login-err"></div>
        <button class="btn-primary btn-block" onclick="doLogin()">ورود</button>
      </div>
    </div>
  `;
  document.getElementById("pw").focus();
  document.getElementById("pw").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
}

async function doLogin() {
  const password = document.getElementById("pw").value;
  const res = await api("/auth/login", { method: "POST", body: JSON.stringify({ password }) });
  if (res.ok) {
    STATE.authenticated = true;
    location.hash = "#/dashboard";
    router();
  } else {
    document.getElementById("login-err").textContent = res.error || "ورود ناموفق بود";
  }
}

// ---------- Dashboard ----------
async function renderDashboard() {
  shell("#/dashboard", `<div class="empty-state">در حال بارگذاری آمار...</div>`);
  const stats = await api("/flashcards/stats/overview");
  const html = `
    <div class="grid grid-2">
      <div class="card stat-box"><div class="num">${stats.total ?? 0}</div><div class="label">کل کارت‌ها</div></div>
      <div class="card stat-box"><div class="num">${stats.due ?? 0}</div><div class="label">امروز باید مرور شود</div></div>
      <div class="card stat-box"><div class="num">${stats.learned ?? 0}</div><div class="label">یادگرفته‌شده</div></div>
      <div class="card stat-box"><div class="num">${stats.reviewed ?? 0}</div><div class="label">مرورشده تاکنون</div></div>
    </div>
    <div style="margin-top:20px; text-align:center;">
      <button class="btn-amber" onclick="location.hash='#/review'">شروع مرور امروز →</button>
    </div>
  `;
  shell("#/dashboard", html);
}

// ---------- Projects ----------
async function loadProjects() {
  const res = await api("/projects");
  STATE.projects = res.projects || [];
  return STATE.projects;
}

function projectOptions(selectedId) {
  return STATE.projects
    .map((p) => `<option value="${p.id}" ${p.id == selectedId ? "selected" : ""}>${esc(p.title)}</option>`)
    .join("");
}

async function renderProjects() {
  const projects = await loadProjects();
  const list = projects.length
    ? projects.map((p) => `
      <div class="project-item">
        <h3 style="color:${esc(p.color)}">${esc(p.title)}</h3>
        <p class="hint">${esc(p.description || "")}</p>
        <div class="meta-row">
          <button class="btn-ghost" onclick="editProject(${p.id})">ویرایش</button>
          <button class="btn-danger" onclick="deleteProject(${p.id})">حذف</button>
        </div>
      </div>`).join("")
    : `<div class="empty-state">هنوز پروژه‌ای نساختی</div>`;

  shell("#/projects", `
    <div class="toolbar">
      <button class="btn-primary" onclick="editProject()">+ پروژه جدید</button>
    </div>
    ${list}
  `);
}

function editProject(id) {
  const p = STATE.projects.find((x) => x.id === id) || {};
  openModal(`
    <h3>${id ? "ویرایش پروژه" : "پروژه جدید"}</h3>
    <input id="m-title" placeholder="عنوان" value="${esc(p.title || "")}" />
    <textarea id="m-desc" rows="3" placeholder="توضیحات">${esc(p.description || "")}</textarea>
    <div class="field-row">
      <input id="m-color" type="color" value="${p.color || "#2dd4bf"}" />
      <input id="m-icon" placeholder="آیکون (اختیاری)" value="${esc(p.icon || "folder")}" />
    </div>
    <button class="btn-primary btn-block" onclick="saveProject(${id || "null"})">ذخیره</button>
  `);
}

async function saveProject(id) {
  const body = {
    title: document.getElementById("m-title").value.trim(),
    description: document.getElementById("m-desc").value,
    color: document.getElementById("m-color").value,
    icon: document.getElementById("m-icon").value,
  };
  if (!body.title) return alert("عنوان الزامی است");
  const res = id
    ? await api(`/projects/${id}`, { method: "PUT", body: JSON.stringify(body) })
    : await api("/projects", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) return alert(res.error || "خطا");
  closeModal();
  renderProjects();
}

async function deleteProject(id) {
  if (!confirm("پروژه و همه‌ی مباحث آن حذف شود؟")) return;
  await api(`/projects/${id}`, { method: "DELETE" });
  renderProjects();
}

// ---------- Topics ----------
async function renderTopics() {
  await loadProjects();
  const q = STATE.topicQuery || "";
  const res = await api("/topics" + (q ? `?q=${encodeURIComponent(q)}` : ""));
  const topics = res.topics || [];
  const projectTitle = (id) => (STATE.projects.find((p) => p.id === id) || {}).title || "-";

  const list = topics.length
    ? topics.map((t) => `
      <div class="topic-item">
        <h3>${t.is_pinned ? '<span class="pin">📌</span> ' : ""}${esc(t.title)}</h3>
        <div class="meta-row">
          <span>${esc(projectTitle(t.project_id))}</span>
          <span>${t.word_count} کلمه</span>
          <span>${t.reading_time} دقیقه مطالعه</span>
        </div>
        <div class="meta-row" style="margin-top:8px;">
          <button class="btn-ghost" onclick="openTopic(${t.id})">باز کردن</button>
          <button class="btn-ghost" onclick="editTopicMeta(${t.id})">ویرایش سریع</button>
          <button class="btn-danger" onclick="deleteTopic(${t.id})">حذف</button>
        </div>
      </div>`).join("")
    : `<div class="empty-state">مبحثی یافت نشد</div>`;

  shell("#/topics", `
    <div class="toolbar">
      <input type="text" placeholder="جستجو در مباحث..." value="${esc(q)}" onchange="STATE.topicQuery=this.value; renderTopics()" />
      <button class="btn-primary" onclick="editTopicFull()">+ مبحث جدید</button>
    </div>
    ${list}
  `);
}

async function openTopic(id) {
  const res = await api(`/topics/${id}`);
  if (!res.ok) return alert(res.error);
  const t = res.topic;
  const html = DOMPurify.sanitize(marked.parse(t.content_md || ""));
  shell("#/topics", `
    <div class="toolbar">
      <button class="btn-ghost" onclick="location.hash='#/topics'">← بازگشت به مباحث</button>
      <button class="btn-ghost" onclick="editTopicFull(${t.id})">ویرایش</button>
    </div>
    <div class="card">
      <h2>${esc(t.title)}</h2>
      <div class="meta-row" style="margin-bottom:14px;">
        ${t.tags ? t.tags.split(",").filter(Boolean).map((tag) => `<span class="tag-pill">${esc(tag.trim())}</span>`).join("") : ""}
      </div>
      <div class="markdown-body">${html}</div>
    </div>
  `);
}

function editTopicFull(id) {
  const t = id ? STATE._editingTopic : null;
  if (id) {
    api(`/topics/${id}`).then((res) => {
      STATE._editingTopic = res.topic;
      showTopicEditor(res.topic);
    });
  } else {
    showTopicEditor(null);
  }
}

function showTopicEditor(t) {
  root.innerHTML = `
    <header class="topbar">
      <button class="btn-ghost" onclick="location.hash='#/topics'">← انصراف</button>
      <span class="brand">${t ? "ویرایش مبحث" : "مبحث جدید"}</span>
    </header>
    <main>
      <input id="e-title" placeholder="عنوان مبحث" value="${esc(t?.title || "")}" />
      <select id="e-project">${projectOptions(t?.project_id)}</select>
      <input id="e-tags" placeholder="برچسب‌ها (با کاما جدا کن)" value="${esc(t?.tags || "")}" />
      <label><input type="checkbox" id="e-pinned" style="width:auto; display:inline-block;" ${t?.is_pinned ? "checked" : ""}/> پین شود</label>
      <textarea id="e-content" rows="16" placeholder="محتوا با Markdown...">${esc(t?.content_md || "")}</textarea>
      <button class="btn-primary btn-block" onclick="saveTopic(${t?.id || "null"})">ذخیره مبحث</button>
    </main>
  `;
}

async function saveTopic(id) {
  const body = {
    title: document.getElementById("e-title").value.trim(),
    project_id: document.getElementById("e-project").value,
    tags: document.getElementById("e-tags").value,
    is_pinned: document.getElementById("e-pinned").checked,
    content_md: document.getElementById("e-content").value,
  };
  if (!body.title) return alert("عنوان الزامی است");
  if (!body.project_id) return alert("یک پروژه انتخاب کن");
  const res = id
    ? await api(`/topics/${id}`, { method: "PUT", body: JSON.stringify(body) })
    : await api("/topics", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) return alert(res.error || "خطا");
  location.hash = "#/topics";
  renderTopics();
}

function editTopicMeta(id) {
  editTopicFull(id);
}

async function deleteTopic(id) {
  if (!confirm("این مبحث حذف شود؟")) return;
  await api(`/topics/${id}`, { method: "DELETE" });
  renderTopics();
}

// ---------- Flashcards ----------
async function renderFlashcards() {
  await loadProjects();
  const res = await api("/flashcards");
  const cards = res.flashcards || [];
  const list = cards.length
    ? cards.map((f) => `
      <div class="card-item">
        <h3>${esc(f.front)}</h3>
        <p class="hint">${esc(f.back)}</p>
        <div class="meta-row">
          <span>مبحث: ${esc(f.topic_title || "-")}</span>
          <span>سررسید: ${fmtDate(f.next_review_at)}</span>
          <span>مرور شده: ${f.total_reviews} بار</span>
        </div>
        <div class="meta-row" style="margin-top:8px;">
          <button class="btn-ghost" onclick="editCard(${f.id})">ویرایش</button>
          <button class="btn-ghost" onclick="resetCard(${f.id})">ریست پیشرفت</button>
          <button class="btn-danger" onclick="deleteCard(${f.id})">حذف</button>
        </div>
      </div>`).join("")
    : `<div class="empty-state">فلش‌کارتی وجود ندارد</div>`;

  shell("#/flashcards", `
    <div class="toolbar">
      <button class="btn-primary" onclick="editCard()">+ کارت جدید</button>
      <button class="btn-ghost" onclick="location.hash='#/review'">شروع مرور</button>
    </div>
    ${list}
  `);
}

async function editCard(id) {
  let f = {};
  if (id) {
    const all = await api("/flashcards");
    f = (all.flashcards || []).find((x) => x.id === id) || {};
  }
  const topics = (await api("/topics")).topics || [];
  openModal(`
    <h3>${id ? "ویرایش کارت" : "کارت جدید"}</h3>
    <select id="m-topic">
      <option value="">— انتخاب مبحث —</option>
      ${topics.map((t) => `<option value="${t.id}" ${t.id == f.topic_id ? "selected" : ""}>${esc(t.title)}</option>`).join("")}
    </select>
    <textarea id="m-front" rows="2" placeholder="روی کارت (سوال)">${esc(f.front || "")}</textarea>
    <textarea id="m-back" rows="2" placeholder="پشت کارت (جواب)">${esc(f.back || "")}</textarea>
    <input id="m-hint" placeholder="راهنما (اختیاری)" value="${esc(f.hint || "")}" />
    <input id="m-tags" placeholder="برچسب‌ها" value="${esc(f.tags || "")}" />
    <button class="btn-primary btn-block" onclick="saveCard(${id || "null"})">ذخیره</button>
  `);
}

async function saveCard(id) {
  const body = {
    topic_id: document.getElementById("m-topic").value,
    front: document.getElementById("m-front").value,
    back: document.getElementById("m-back").value,
    hint: document.getElementById("m-hint").value,
    tags: document.getElementById("m-tags").value,
  };
  if (!body.topic_id) return alert("مبحث را انتخاب کن");
  const res = id
    ? await api(`/flashcards/${id}`, { method: "PUT", body: JSON.stringify(body) })
    : await api("/flashcards", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) return alert(res.error || "خطا");
  closeModal();
  renderFlashcards();
}

async function resetCard(id) {
  await api(`/flashcards/${id}/reset`, { method: "POST" });
  renderFlashcards();
}
async function deleteCard(id) {
  if (!confirm("این کارت حذف شود؟")) return;
  await api(`/flashcards/${id}`, { method: "DELETE" });
  renderFlashcards();
}

// ---------- Review ----------
let reviewState = { sessionId: null, queue: [], index: 0, showBack: false };

async function renderReview() {
  const res = await api("/review/queue?limit=20");
  reviewState = { sessionId: res.session_id, queue: res.queue || [], index: 0, showBack: false };
  renderReviewCard();
}

function renderReviewCard() {
  const { queue, index, showBack } = reviewState;
  if (index >= queue.length) {
    return shell("#/review", `
      <div class="card review-card">
        <h2>🎉 تمام کارت‌های امروز مرور شد</h2>
        <button class="btn-primary" onclick="location.hash='#/dashboard'">بازگشت به داشبورد</button>
      </div>
    `);
  }
  const card = queue[index];
  shell("#/review", `
    <p class="hint" style="text-align:center;">کارت ${index + 1} از ${queue.length}</p>
    <div class="card review-card">
      <div style="font-size:1.2rem;">${esc(card.front)}</div>
      ${showBack ? `<div style="color:var(--teal); font-size:1.05rem; border-top:1px solid var(--border); padding-top:14px; width:100%;">${esc(card.back)}</div>` : ""}
      ${
        showBack
          ? `<div class="review-buttons">
              <button class="btn-danger" onclick="answerCard('again')">دوباره</button>
              <button class="btn-ghost" onclick="answerCard('hard')">سخت</button>
              <button class="btn-primary" onclick="answerCard('good')">خوب</button>
              <button class="btn-amber" onclick="answerCard('easy')">آسان</button>
            </div>`
          : `<button class="btn-primary btn-block" onclick="reviewState.showBack=true; renderReviewCard()">نمایش جواب</button>`
      }
    </div>
  `);
}

async function answerCard(button) {
  const card = reviewState.queue[reviewState.index];
  await api(`/review/${reviewState.sessionId}/answer`, {
    method: "POST",
    body: JSON.stringify({ card_id: card.id, button }),
  });
  reviewState.index += 1;
  reviewState.showBack = false;
  if (reviewState.index >= reviewState.queue.length) {
    await api(`/review/${reviewState.sessionId}/end`, { method: "POST" });
  }
  renderReviewCard();
}

// ---------- Settings ----------
async function renderSettings() {
  const s = await api("/settings");
  shell("#/settings", `
    <div class="card settings-section">
      <h3>اتصال گیت‌هاب</h3>
      <p class="hint">داده‌های اپ به‌صورت فایل JSON داخل این ریپو نگه‌داری می‌شود.</p>
      <p>ریپو فعلی: <b>${esc(s.github_repo || "-")}</b> (برنچ: ${esc(s.github_branch)})</p>
      <p>توکن گیت‌هاب: ${s.github_token_set ? esc(s.github_token_preview) : "تنظیم نشده"}</p>
      <button class="btn-ghost" onclick="testGithub()">تست اتصال</button>
      <div id="gh-test-result" class="hint"></div>
    </div>

    ${!s.can_edit_from_panel ? `
    <div class="card settings-section">
      <p class="hint">برای این‌که بتونی متغیرها رو از همین پنل عوض کنی، اول باید CF_API_TOKEN / CF_ACCOUNT_ID / CF_WORKER_NAME
      رو طبق فایل README (یک‌بار، از طریق GitHub Actions) تنظیم کنی.</p>
    </div>` : `
    <div class="card settings-section">
      <h3>تغییر تنظیمات گیت‌هاب</h3>
      <input id="s-token" placeholder="توکن جدید گیت‌هاب (خالی = بدون تغییر)" />
      <input id="s-repo" placeholder="owner/repo (خالی = بدون تغییر)" value="" />
      <input id="s-branch" placeholder="نام برنچ (خالی = بدون تغییر)" value="" />
      <button class="btn-primary" onclick="saveGithubSettings()">ذخیره</button>
    </div>

    <div class="card settings-section">
      <h3>تغییر رمز عبور</h3>
      <input id="s-cur-pw" type="password" placeholder="رمز فعلی" />
      <input id="s-new-pw" type="password" placeholder="رمز جدید (حداقل ۶ کاراکتر)" />
      <button class="btn-primary" onclick="saveNewPassword()">تغییر رمز</button>
    </div>
    `}
    <div id="settings-msg" class="hint"></div>
  `);
}

async function testGithub() {
  const res = await api("/settings/test-github");
  document.getElementById("gh-test-result").textContent = res.message;
}

async function saveGithubSettings() {
  const body = {
    github_token: document.getElementById("s-token").value || undefined,
    github_repo: document.getElementById("s-repo").value || undefined,
    github_branch: document.getElementById("s-branch").value || undefined,
  };
  const res = await api("/settings", { method: "POST", body: JSON.stringify(body) });
  document.getElementById("settings-msg").textContent = res.ok ? (res.note || "ذخیره شد") : res.error;
}

async function saveNewPassword() {
  const body = {
    current_password: document.getElementById("s-cur-pw").value,
    new_password: document.getElementById("s-new-pw").value,
  };
  const res = await api("/settings", { method: "POST", body: JSON.stringify(body) });
  document.getElementById("settings-msg").textContent = res.ok ? "رمز عبور تغییر کرد" : res.error;
}

// ---------- Modal ----------
function openModal(html) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.id = "modal-backdrop";
  wrap.innerHTML = `<div class="card modal">${html}</div>`;
  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
}
function closeModal() {
  const el = document.getElementById("modal-backdrop");
  if (el) el.remove();
}

// ---------- Boot ----------
(async function boot() {
  const res = await api("/auth/me");
  STATE.authenticated = Boolean(res.ok);
  router();
})();
