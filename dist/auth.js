(() => {
  const config = window.INFINICO_CONFIG || {};
  const shell = document.querySelector(".app-shell");
  if (!shell) return;
  const safe = value => String(value || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let client;
  let db;
  let profile = null;
  let adminPanel = null;
  let gateNode = null;
  let mode = "login";

  const setMessage = message => {
    const node = gateNode?.querySelector("#auth-message");
    if (node) node.textContent = message;
  };
  const toast = message => {
    const node = document.querySelector("#toast");
    if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 3000); }
  };
  const setMode = next => {
    mode = next;
    if (!gateNode) return;
    gateNode.querySelectorAll("[data-auth-tab]").forEach(button => button.classList.toggle("active", button.dataset.authTab === next));
    const form = gateNode.querySelector("#auth-form");
    const signup = next === "signup";
    form.elements.name.closest("label").hidden = !signup;
    form.elements.phone.closest("label").hidden = !signup;
    form.elements.name.hidden = !signup;
    form.elements.phone.hidden = !signup;
    form.elements.name.required = signup;
    form.elements.phone.required = signup;
    form.querySelector(".auth-submit").innerHTML = `${signup ? "Create account" : "Sign in"}<span>→</span>`;
    gateNode.querySelector(".auth-footnote").textContent = signup
      ? "Your request will be reviewed by an administrator before workspace access is granted."
      : "Need access? Create an account. New accounts need administrator approval.";
    setMessage(signup ? "Request access to your procurement workspace." : "Sign in to discover Bangladesh's public opportunities.");
  };

  function renderGate(message = "") {
    shell.hidden = true;
    if (!gateNode) {
      gateNode = document.createElement("main");
      gateNode.id = "welcome-gate";
      gateNode.className = "welcome-gate";
      gateNode.innerHTML = `
        <section class="welcome-art">
          <a class="welcome-logo" href="#" aria-label="Infinico Tender Bd">
            <img src="/assets/infinico-tender-bd-logo.png" alt="INFINICO TENDER BD">
          </a>
          <div class="welcome-message"><span class="section-kicker">BANGLADESH PROCUREMENT INTELLIGENCE</span><h2>Find the opportunities<br><strong>that move you forward.</strong></h2><p>Live tenders and contract awards, together in one clear workspace.</p></div>
          <small>INFINICO TENDER BD · PUBLIC PROCUREMENT, MADE CLEAR</small>
        </section>
        <section class="welcome-form-wrap"><div class="welcome-form" id="welcome-form">
          <span class="section-kicker">YOUR PROCUREMENT WORKSPACE</span><h1>Welcome back</h1><p class="welcome-subtitle" id="auth-message">${safe(message || "Sign in to discover Bangladesh's public opportunities.")}</p>
          <div class="auth-tabs"><button class="active" type="button" data-auth-tab="login">Sign in</button><button type="button" data-auth-tab="signup">Create account</button></div>
          <form id="auth-form" autocomplete="on">
            <label>Full name<input name="name" autocomplete="name" placeholder="Your full name" hidden></label>
            <label>Mobile number<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="e.g. +880 1XXXXXXXXX" pattern="[+0-9() -]{9,18}" hidden></label>
            <label>Email address<input name="email" type="email" autocomplete="email" placeholder="name@company.com" required></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" placeholder="At least 8 characters" minlength="8" required></label>
            <button class="auth-submit" type="submit">Sign in<span>→</span></button>
          </form>
          <p class="auth-footnote">Need access? Create an account. New accounts need administrator approval.</p>
          <div class="auth-error" id="auth-error" role="alert" hidden></div>
        </div></section>`;
      document.body.append(gateNode);
      gateNode.querySelectorAll("[data-auth-tab]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.authTab)));
      gateNode.querySelector("#auth-form").addEventListener("submit", submitAuth);
    }
    gateNode.hidden = false;
    shell.hidden = true;
    if (message) setMessage(message);
  }

  function showError(message) {
    const node = gateNode?.querySelector("#auth-error");
    if (!node) return setMessage(message);
    node.textContent = message;
    node.hidden = false;
  }

  async function submitAuth(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector(".auth-submit");
    const values = new FormData(form);
    button.disabled = true;
    button.textContent = "Please wait…";
    gateNode.querySelector("#auth-error").hidden = true;
    try {
      let authResult;
      if (mode === "signup") {
        authResult = await client.auth.signUp({ email: values.get("email").trim(), password: values.get("password"), options: { data: { name: values.get("name").trim(), phone: values.get("phone").trim() } } });
        if (authResult.error) throw authResult.error;
        const session = authResult.data?.session;
        if (!session) {
          setMessage("Your account was created. Verify your email if asked, then sign in here to finish your access setup.");
          setMode("login");
          return;
        }
        const { error: profileError } = await db.rpc("infinico_register_profile", { target_name: values.get("name").trim(), target_phone: values.get("phone").trim() });
        if (profileError) throw profileError;
      } else {
        authResult = await client.auth.signInWithPassword({ email: values.get("email").trim(), password: values.get("password") });
        if (authResult.error) throw authResult.error;
      }
      await start();
    } catch (error) {
      showError(error.message || "Could not authenticate. Please check your details and try again.");
    } finally {
      button.disabled = false;
      button.innerHTML = `${mode === "signup" ? "Create account" : "Sign in"}<span>→</span>`;
    }
  }

  function updateSidebar(user) {
    const row = document.querySelector(".profile-row");
    const label = row?.querySelector("div:nth-child(2)");
    if (label) label.innerHTML = `<b>${safe(profile?.full_name || user.name || user.email?.split("@")[0])}</b><small>${profile?.role === "admin" ? "Administrator" : "Approved member"}</small>`;
    const avatar = document.querySelector(".top-avatar");
    if (avatar) avatar.textContent = String(profile?.full_name || user.name || user.email || "IT").split(/[ @]/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
    const actions = document.querySelector(".top-actions");
    if (!actions || document.querySelector("#signout-button")) return;
    const signout = document.createElement("button");
    signout.id = "signout-button"; signout.className = "icon-button auth-signout"; signout.title = "Sign out"; signout.setAttribute("aria-label", "Sign out"); signout.textContent = "↪";
    signout.addEventListener("click", async () => { await client.auth.signOut(); location.reload(); });
    actions.append(signout);
    if (profile?.role === "admin") {
      const admin = document.createElement("button"); admin.className = "admin-menu-button"; admin.textContent = "Manage users"; admin.addEventListener("click", openAdmin); actions.insertBefore(admin, signout);
    }
  }

  async function start() {
    const { data, error } = await client.auth.getSession();
    const session = data?.session;
    if (error || !session?.user) { profile = null; return renderGate(); }
    let { data: row, error: profileError } = await db.from("infinico_profiles").select("id,email,full_name,phone,status,role,created_at").eq("id", session.user.id).maybeSingle();
    if (profileError) return renderGate("We couldn't check workspace access. Please try again in a moment.");
    if (!row) {
      const metadata = session.user.user_metadata || {};
      if (!metadata.name || !metadata.phone) return renderGate("This account has no workspace profile yet. Sign up with your name and mobile number first.");
      const { error: registerError } = await db.rpc("infinico_register_profile", { target_name: metadata.name, target_phone: metadata.phone });
      if (registerError) return renderGate(registerError.message || "We couldn't finish your workspace profile. Please try again.");
      ({ data: row, error: profileError } = await db.from("infinico_profiles").select("id,email,full_name,phone,status,role,created_at").eq("id", session.user.id).maybeSingle());
      if (profileError || !row) return renderGate("Your account was created, but we couldn't load its workspace profile yet. Please retry.");
    }
    profile = row;
    if (row.status !== "approved") return renderGate(row.status === "pending" ? "Your request is awaiting administrator approval." : "This account is not approved for workspace access.");
    gateNode?.remove(); gateNode = null;
    shell.hidden = false;
    updateSidebar(session.user);
  }

  function ensureAdminPanel() {
    if (adminPanel) return adminPanel;
    adminPanel = document.createElement("div"); adminPanel.className = "admin-backdrop"; adminPanel.hidden = true;
    adminPanel.innerHTML = `<section class="admin-panel"><header><div><span class="section-kicker">WORKSPACE ACCESS</span><h2>Manage accounts</h2><p>Approve members, revoke access, or create an approved sign-up invitation.</p></div><button class="modal-close" aria-label="Close">×</button></header><div class="admin-summary" id="admin-summary"></div><div class="admin-table-wrap"><table><thead><tr><th>MEMBER</th><th>MOBILE</th><th>STATUS</th><th>ROLE</th><th>JOINED</th><th>ACTION</th></tr></thead><tbody id="admin-users"></tbody></table></div><div class="admin-footer"><h3>Invite an account</h3><p>They will set their own password and required mobile number when they sign up.</p><form id="invite-form"><input type="email" name="email" placeholder="Email address" required><input name="name" placeholder="Full name" required><select name="role"><option value="member">Member</option><option value="admin">Admin</option></select><button class="auth-submit">Create invite</button></form></div></section>`;
    document.body.append(adminPanel);
    adminPanel.querySelector(".modal-close").addEventListener("click", () => adminPanel.hidden = true);
    adminPanel.addEventListener("click", event => { if (event.target === adminPanel) adminPanel.hidden = true; });
    adminPanel.querySelector("#invite-form").addEventListener("submit", createInvite);
    return adminPanel;
  }

  async function openAdmin() {
    const panel = ensureAdminPanel(); panel.hidden = false;
    const body = panel.querySelector("#admin-users"); body.innerHTML = '<tr><td colspan="6">Loading accounts…</td></tr>';
    const { data, error } = await db.from("infinico_profiles").select("id,email,full_name,phone,status,role,created_at").order("created_at", { ascending: false });
    if (error) { body.innerHTML = `<tr><td colspan="6">${safe(error.message)}</td></tr>`; return; }
    const users = data || [];
    panel.querySelector("#admin-summary").textContent = `${users.filter(u => u.status === "pending").length} pending · ${users.filter(u => u.status === "approved").length} active · ${users.length} total`;
    body.innerHTML = users.map(user => `<tr><td><b>${safe(user.full_name || "Account")}</b><small>${safe(user.email || "")}</small></td><td>${safe(user.phone || "—")}</td><td><span class="user-status status-${safe(user.status)}">${safe(user.status)}</span></td><td>${safe(user.role)}</td><td>${new Date(user.created_at).toLocaleDateString()}</td><td>${user.id === profile.id ? "You" : `<button data-user-id="${safe(user.id)}" data-next-status="${user.status === "approved" ? "blocked" : "approved"}">${user.status === "approved" ? "Revoke" : "Approve"}</button>`}</td></tr>`).join("");
    body.querySelectorAll("button[data-user-id]").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      const { error: updateError } = await db.rpc("infinico_admin_set_user_access", { target_user_id: button.dataset.userId, next_status: button.dataset.nextStatus });
      if (updateError) { toast(updateError.message); button.disabled = false; } else openAdmin();
    }));
  }

  async function createInvite(event) {
    event.preventDefault();
    const form = event.currentTarget; const values = new FormData(form); const button = form.querySelector("button");
    button.disabled = true;
    const { error } = await db.rpc("infinico_admin_create_invite", { target_email: values.get("email").trim(), target_name: values.get("name").trim(), target_role: values.get("role") });
    button.disabled = false;
    if (error) { toast(error.message); return; }
    form.reset(); toast("Approved sign-up invite created."); openAdmin();
  }

  if (!config.neonAuthUrl || !config.neonDataApiUrl) {
    renderGate("Neon Auth is not configured for this deployment yet.");
    return;
  }
  try {
    renderGate();
    import("https://esm.sh/@neondatabase/neon-js@0.7.0-beta?bundle").then(({ createClient, SupabaseAuthAdapter }) => {
    client = createClient({
      auth: { adapter: SupabaseAuthAdapter(), url: config.neonAuthUrl },
      dataApi: { url: config.neonDataApiUrl, options: { db: { schema: "public" } } }
    });
    db = client.schema("public");
    start();
    }).catch(() => renderGate("The sign-in service could not be reached. Please refresh and try again."));
  } catch (error) {
    renderGate("The sign-in service could not be reached. Please refresh and try again.");
  }
})();
