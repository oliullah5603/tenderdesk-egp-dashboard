(() => {
  const config = window.INFINICO_CONFIG || {};
  const shell = document.querySelector(".app-shell");
  if (!shell) return;
  window.INFINICO_ADMIN = false;
  const safe = value => String(value || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let client;
  let db;
  let profile = null;
  let adminPollTimer = null;
  let pendingCheckTimer = null;
  let completeProfileUser = null;
  let pendingIds = new Set();
  let settings = { alerts: true, interval: 15000 };
  let gateNode = null;
  let mode = "login";
  const inviteEmail = new URLSearchParams(location.search).get("invite")?.trim().toLowerCase() || "";
  const inviteName = new URLSearchParams(location.search).get("name")?.trim() || "";

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
    const complete = next === "complete", pending = next === "pending", profileFields = signup || complete;
    gateNode.querySelector(".auth-tabs").hidden = complete || pending;
    gateNode.querySelector("[name='email']").closest("label").hidden = complete || pending;
    gateNode.querySelector("[name='password']").closest("label").hidden = pending;
    form.elements.name.closest("label").hidden = !profileFields;
    form.elements.phone.closest("label").hidden = !profileFields;
    form.elements.name.hidden = !profileFields;
    form.elements.phone.hidden = !profileFields;
    form.elements.name.required = profileFields;
    form.elements.phone.required = profileFields;
    form.elements.email.required = !complete && !pending;
    form.elements.password.required = !pending && !complete;
    form.hidden = pending;
    form.querySelector(".auth-submit").hidden = pending;
    form.querySelector(".auth-submit").innerHTML = `${signup ? (inviteEmail ? "Set password" : "Create account") : complete ? "Finish setup" : "Sign in"}<span>→</span>`;
    gateNode.querySelector(".auth-pending-actions").hidden = !pending;
    gateNode.querySelector(".auth-footnote").textContent = complete
      ? "Your sign-in worked. Add your name and mobile number once to finish setting up this workspace account."
      : pending ? "We will check again automatically while this page stays open."
      : signup ? "Your request will be reviewed by an administrator before workspace access is granted."
      : "Need access? Create an account. New accounts need administrator approval.";
    setMessage(complete ? "Finish your workspace profile to continue." : pending ? "Your access request is waiting for administrator approval." : signup ? "Request access to your procurement workspace." : "Sign in to discover Bangladesh's public opportunities.");
  };

  function adminOnly() { return profile?.role === "admin" && profile?.status === "approved"; }
  window.INFINICO_ADMIN_API = { loadUsers: () => adminOnly() && loadAdminUsers() };

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
          <div class="auth-pending-actions" hidden><button type="button" id="check-access">Check approval</button><button type="button" id="gate-signout">Sign out</button></div>
          <div class="auth-error" id="auth-error" role="alert" hidden></div>
        </div></section>`;
      document.body.append(gateNode);
      gateNode.querySelectorAll("[data-auth-tab]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.authTab)));
      gateNode.querySelector("#auth-form").addEventListener("submit", submitAuth);
      gateNode.querySelector("#check-access").addEventListener("click", start);
      gateNode.querySelector("#gate-signout").addEventListener("click", async () => { clearInterval(pendingCheckTimer); pendingCheckTimer = null; await client.auth.signOut(); location.reload(); });
      if (inviteEmail) {
        const form = gateNode.querySelector("#auth-form");
        form.elements.email.value = inviteEmail;
        form.elements.email.readOnly = true;
        form.elements.name.value = inviteName;
        form.elements.name.readOnly = Boolean(inviteName);
        gateNode.querySelector("[data-auth-tab='signup']").textContent = "Set password";
        gateNode.querySelector("#welcome-form h1").textContent = "You’re invited";
        setMode("signup");
        setMessage(`Create your password for ${inviteEmail}. Confirm your mobile number to activate the invited workspace account.`);
      }
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
      if (mode === "complete") {
        if (!completeProfileUser) throw new Error("Your sign-in has expired. Please sign in again to finish setup.");
        const { error: profileError } = await db.rpc("infinico_register_profile", { target_name: values.get("name").trim(), target_phone: values.get("phone").trim() });
        if (profileError) throw profileError;
        completeProfileUser = null;
        await start();
      } else if (mode === "signup") {
        authResult = await client.auth.signUp({ email: values.get("email").trim(), password: values.get("password"), options: { data: { name: values.get("name").trim(), phone: values.get("phone").trim() } } });
        if (authResult.error) throw authResult.error;
        const session = authResult.data?.session;
        if (!session) {
          gateNode.querySelector("#auth-error").hidden = true;
          setMode("login");
          setMessage(inviteEmail
            ? `Account created for ${values.get("email").trim()}. Verify the email from your inbox, then sign in with the password you just set. This invitation grants access automatically.`
            : `Account created for ${values.get("email").trim()}. Verify the email from your inbox, then sign in to submit your access request. The admin will see it in Users.`);
          return;
        }
        await start();
      } else {
        authResult = await client.auth.signInWithPassword({ email: values.get("email").trim(), password: values.get("password") });
        if (authResult.error) throw authResult.error;
      }
      await start();
    } catch (error) {
      const message = error.message || "Could not authenticate. Please check your details and try again.";
      showError(/already registered|already exists|user exists/i.test(message) ? "This email already has an account. Sign in instead, or verify the confirmation email if you have not done so." : message);
    } finally {
      button.disabled = false;
      if (button.isConnected) button.innerHTML = `${mode === "signup" ? (inviteEmail ? "Set password" : "Create account") : mode === "complete" ? "Finish setup" : "Sign in"}<span>→</span>`;
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
    const adminNav = document.querySelector("#admin-side-nav"), adminLabel = document.querySelector("#admin-nav-label");
    if (adminNav) adminNav.hidden = !adminOnly();
    if (adminLabel) adminLabel.hidden = !adminOnly();
    if (adminOnly()) initializeAdmin();
  }

  async function start() {
    const { data, error } = await client.auth.getSession();
    const session = data?.session;
    if (error || !session?.user) { clearInterval(pendingCheckTimer); pendingCheckTimer = null; completeProfileUser = null; profile = null; window.INFINICO_ADMIN = false; return renderGate(); }
    let { data: row, error: profileError } = await db.from("infinico_profiles").select("id,email,full_name,phone,status,role,created_at").eq("id", session.user.id).maybeSingle();
    if (profileError) return renderGate("We couldn't check workspace access. Please try again in a moment.");
    if (!row) {
      const metadata = session.user.user_metadata || {};
      if (!metadata.name || !metadata.phone) {
        completeProfileUser = session.user;
        renderGate("Your sign-in succeeded, but this account still needs its workspace profile.");
        gateNode.querySelector("[name='name']").value = metadata.name || inviteName || "";
        gateNode.querySelector("[name='phone']").value = metadata.phone || "";
        setMode("complete");
        return;
      }
      const { error: registerError } = await db.rpc("infinico_register_profile", { target_name: metadata.name, target_phone: metadata.phone });
      if (registerError) {
        completeProfileUser = session.user;
        renderGate(registerError.message || "We couldn't finish your workspace profile. Enter your name and mobile number to retry.");
        gateNode.querySelector("[name='name']").value = metadata.name || inviteName || "";
        gateNode.querySelector("[name='phone']").value = metadata.phone || "";
        setMode("complete");
        return;
      }
      ({ data: row, error: profileError } = await db.from("infinico_profiles").select("id,email,full_name,phone,status,role,created_at").eq("id", session.user.id).maybeSingle());
      if (profileError || !row) return renderGate("Your account was created, but we couldn't load its workspace profile yet. Please retry.");
    }
    profile = row;
    completeProfileUser = null;
    window.INFINICO_ADMIN = row.role === "admin" && row.status === "approved";
    if (row.status === "pending") {
      renderGate("Your access request is waiting for administrator approval.");
      setMode("pending");
      if (!pendingCheckTimer) pendingCheckTimer = setInterval(() => { if (document.visibilityState === "visible") start(); }, 10000);
      return;
    }
    clearInterval(pendingCheckTimer); pendingCheckTimer = null;
    if (row.status !== "approved") return renderGate("This account is not approved for workspace access.");
    gateNode?.remove(); gateNode = null;
    shell.hidden = false;
    updateSidebar(session.user);
  }

  function initializeAdmin() {
    const saved = JSON.parse(localStorage.getItem("infinico-admin-settings") || "null");
    if (saved) settings = { ...settings, ...saved };
    const alerts = document.querySelector("#admin-alerts-enabled"), interval = document.querySelector("#admin-poll-interval");
    if (alerts) { alerts.checked = settings.alerts; alerts.onchange = () => { settings.alerts = alerts.checked; saveSettings(); }; }
    if (interval) { interval.value = String(settings.interval); interval.onchange = () => { settings.interval = Number(interval.value); saveSettings(); startAdminPolling(); }; }
    document.querySelector("#admin-users-refresh")?.addEventListener("click", loadAdminUsers);
    document.querySelector("#invite-form")?.addEventListener("submit", createInvite);
    document.querySelector("#copy-invite-link")?.addEventListener("click", async () => {
      const input = document.querySelector("#invite-link");
      try { await navigator.clipboard.writeText(input.value); toast("Invite link copied."); }
      catch { input.select(); document.execCommand("copy"); toast("Invite link copied."); }
    });
    loadAdminUsers();
    startAdminPolling();
  }

  function saveSettings() { localStorage.setItem("infinico-admin-settings", JSON.stringify(settings)); }

  function startAdminPolling() {
    clearInterval(adminPollTimer);
    if (!adminOnly()) return;
    pollPending(true);
    adminPollTimer = setInterval(() => { if (document.visibilityState === "visible") pollPending(false); }, settings.interval);
  }

  async function pollPending(initial) {
    if (!adminOnly()) return;
    const { data, error } = await db.from("infinico_profiles").select("id,email,full_name,status").eq("status", "pending").order("created_at", { ascending: false });
    if (error) return;
    const requests = data || [], ids = new Set(requests.map(user => user.id));
    const badge = document.querySelector("#admin-pending-count");
    if (badge) { badge.textContent = String(requests.length); badge.hidden = !requests.length; }
    if (!initial && settings.alerts) {
      const newRequest = requests.find(user => !pendingIds.has(user.id));
      if (newRequest) {
        toast(`New access request: ${newRequest.full_name || newRequest.email}`);
        if (document.querySelector("#users-page")?.classList.contains("active-page")) loadAdminUsers();
      }
    }
    pendingIds = ids;
  }

  async function loadAdminUsers() {
    if (!adminOnly()) return;
    const body = document.querySelector("#admin-users"); if (!body) return;
    body.innerHTML = '<tr><td colspan="6">Loading accounts…</td></tr>';
    const { data, error } = await db.from("infinico_profiles").select("id,email,full_name,phone,status,role,created_at").order("created_at", { ascending: false });
    if (error) { body.innerHTML = `<tr><td colspan="6">${safe(error.message)}</td></tr>`; return; }
    renderAdminUsers(data || [], false);
  }

  function renderAdminUsers(users, pendingOnly) {
    if (!adminOnly()) return;
    const body = document.querySelector("#admin-users"); if (!body) return;
    const allUsers = pendingOnly ? null : users;
    const pending = pendingOnly ? users : users.filter(user => user.status === "pending");
    const shown = pendingOnly ? pending : allUsers;
    const count = document.querySelector("#admin-users-count"), summary = document.querySelector("#admin-users-summary");
    if (count) count.textContent = String(pendingOnly ? pending.length : users.length);
    if (summary) summary.textContent = pendingOnly ? `${pending.length} pending approval request${pending.length === 1 ? "" : "s"}` : `${pending.length} pending · ${users.filter(u => u.status === "approved").length} active · ${users.length} total`;
    if (!shown.length) { body.innerHTML = `<tr><td colspan="6">${pendingOnly ? "No pending requests." : "No user accounts yet."}</td></tr>`; return; }
    body.innerHTML = shown.map(user => `<tr><td><b>${safe(user.full_name || "Account")}</b><small>${safe(user.email || "")}</small></td><td>${safe(user.phone || "—")}</td><td><span class="user-status status-${safe(user.status)}">${safe(user.status)}</span></td><td>${safe(user.role)}</td><td>${new Date(user.created_at).toLocaleDateString()}</td><td>${user.id === profile.id ? "You" : `<button data-user-id="${safe(user.id)}" data-next-status="${user.status === "approved" ? "blocked" : "approved"}">${user.status === "approved" ? "Revoke" : "Approve"}</button>`}</td></tr>`).join("");
    body.querySelectorAll("button[data-user-id]").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      const { error: updateError } = await db.rpc("infinico_admin_set_user_access", { target_user_id: button.dataset.userId, next_status: button.dataset.nextStatus });
      if (updateError) { toast(updateError.message); button.disabled = false; } else { toast(button.dataset.nextStatus === "approved" ? "User access approved." : "User access revoked."); loadAdminUsers(); pollPending(true); }
    }));
  }

  async function createInvite(event) {
    event.preventDefault();
    const form = event.currentTarget; const values = new FormData(form); const button = form.querySelector("button");
    button.disabled = true;
    const email = values.get("email").trim().toLowerCase(), name = values.get("name").trim();
    const { error } = await db.rpc("infinico_admin_create_invite", { target_email: email, target_name: name, target_role: values.get("role") });
    button.disabled = false;
    if (error) { toast(error.message); return; }
    const inviteUrl = new URL(location.origin + location.pathname);
    inviteUrl.searchParams.set("invite", email);
    inviteUrl.searchParams.set("name", name);
    inviteUrl.hash = "signup";
    const result = document.querySelector("#invite-link-result");
    result.querySelector("#invite-link").value = inviteUrl.toString();
    result.hidden = false;
    form.reset(); toast("Invite created. Copy and share the link."); loadAdminUsers();
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
