(() => {
  const config = window.TENDERDESK_CONFIG || {};
  const client = window.supabase?.createClient && config.supabaseUrl && config.supabaseAnonKey
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    : null;
  const shell = document.querySelector(".app-shell");
  if (!shell) return;
  if (!client) return;

  const authStyles = document.createElement("link");
  authStyles.rel = "stylesheet";
  authStyles.href = "/auth.css";
  document.head.append(authStyles);

  let profile = null;
  let modal = null;
  let adminPanel = null;
  const safe = value => String(value || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const setToast = message => {
    const toast = document.querySelector("#toast");
    if (toast) { toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2800); }
  };
  function gate(message, showForm = true) {
    if (shell) shell.hidden = true;
    let welcome = document.querySelector("#welcome-gate");
    if (!welcome) {
      welcome = document.createElement("main"); welcome.id = "welcome-gate"; welcome.className = "welcome-gate";
      welcome.innerHTML = `<section class="welcome-art"><div class="welcome-logo"><span>i.</span><b>infinico<small>TENDER BD</small></b></div><div class="welcome-splash"><span class="splash-orbit orbit-one"></span><span class="splash-orbit orbit-two"></span><span class="splash-card">◈</span><span class="splash-dot dot-one"></span><span class="splash-dot dot-two"></span></div><p>Better visibility.<br><strong>Better opportunities.</strong></p><small>Public procurement, organized for your team.</small></section><section class="welcome-form-wrap"><div class="welcome-form" id="welcome-form"><span class="section-kicker">INFINICO TENDER BD</span><h1>Welcome back</h1><p class="welcome-subtitle" id="auth-message">${safe(message || "Sign in to discover Bangladesh's public opportunities.")}</p>${!client?'<div class="auth-config-note">Authentication is not configured yet. Set the Supabase project URL and anon key to enable accounts.</div>':''}<div class="auth-tabs"><button class="active" data-auth-tab="login">Sign in</button><button data-auth-tab="signup">Create account</button></div><form id="auth-form"><label>Full name<input name="name" autocomplete="name" placeholder="Your name" hidden></label><label>Email address<input name="email" type="email" autocomplete="email" placeholder="name@company.com" required></label><label>Password<input name="password" type="password" autocomplete="current-password" placeholder="At least 8 characters" minlength="8" required></label><button class="auth-submit" type="submit">Sign in <span>→</span></button></form><p class="auth-footnote">New accounts require administrator approval before accessing the workspace.</p></div></section>`;
      document.body.append(welcome);
      welcome.querySelectorAll("[data-auth-tab]").forEach(button => button.addEventListener("click", () => {
        const signup = button.dataset.authTab === "signup";
        welcome.querySelectorAll("[data-auth-tab]").forEach(item => item.classList.toggle("active", item === button));
        const form = welcome.querySelector("#auth-form"); form.dataset.mode = signup ? "signup" : "login";
        const name = form.elements.name; name.hidden = !signup; name.required = signup;
        form.querySelector(".auth-submit").innerHTML = `${signup ? "Create account" : "Sign in"} <span>→</span>`;
        welcome.querySelector("#auth-message").textContent = signup ? "Request access to your procurement workspace." : "Sign in to discover Bangladesh's public opportunities.";
      }));
      welcome.querySelector("#auth-form").addEventListener("submit", submitAuth);
    }
    welcome.hidden = false;
    welcome.querySelector("#auth-message").textContent = message || "Sign in to discover Bangladesh's public opportunities.";
    shell.hidden = true;
  }
  async function submitAuth(event) {
    event.preventDefault();
    if (!client) return;
    const form = event.currentTarget; const button = form.querySelector(".auth-submit");
    const values = new FormData(form); button.disabled = true; button.textContent = "Please wait…";
    try {
      if (form.dataset.mode === "signup") {
        const { data, error } = await client.auth.signUp({ email: values.get("email"), password: values.get("password"), options: { data: { full_name: values.get("name") } } });
        if (error) throw error;
        if (!data.session) { gate("Check your email to confirm the account. An administrator must approve it before you can sign in."); return; }
      } else {
        const { error } = await client.auth.signInWithPassword({ email: values.get("email"), password: values.get("password") });
        if (error) throw error;
      }
      await start();
    } catch (error) { document.querySelector("#auth-message").textContent = error.message || "Could not authenticate."; }
    finally { button.disabled = false; button.innerHTML = `${form.dataset.mode === "signup" ? "Create account" : "Sign in"} <span>→</span>`; }
  }
  function addSessionMenu(user) {
    const profileRow = document.querySelector(".profile-row");
    if (!profileRow) return;
    const label = profileRow.querySelector("div:nth-child(2)");
    if (label) label.innerHTML = `<b>${safe(profile?.full_name || user.email.split("@")[0])}</b><small>${safe(profile?.role === "admin" ? "Administrator" : "Approved member")}</small>`;
    const actions = document.querySelector(".top-actions");
    if (!actions || document.querySelector("#signout-button")) return;
    const signout = document.createElement("button"); signout.id = "signout-button"; signout.className = "icon-button auth-signout"; signout.title = "Sign out"; signout.setAttribute("aria-label", "Sign out"); signout.textContent = "↪";
    signout.addEventListener("click", async () => { await client.auth.signOut(); location.reload(); }); actions.append(signout);
    if (profile?.role === "admin") {
      const admin = document.createElement("button"); admin.className = "admin-menu-button"; admin.textContent = "Users"; admin.addEventListener("click", openAdmin); actions.insertBefore(admin, signout);
    }
  }
  async function start() {
    if (!client) return gate("Authentication has not been configured.");
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) return gate();
    const { data, error } = await client.from("profiles").select("id,full_name,status,role").eq("id", session.user.id).maybeSingle();
    if (error || !data) { await client.auth.signOut(); return gate("Account profile is unavailable. Contact your administrator."); }
    profile = data;
    if (data.status !== "approved") { await client.auth.signOut(); return gate(data.status === "pending" ? "Your request is awaiting administrator approval." : "This account is not approved for workspace access."); }
    document.querySelector("#welcome-gate")?.remove(); shell.hidden = false; addSessionMenu(session.user);
    client.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") location.reload(); });
  }
  function ensureAdminPanel() {
    if (adminPanel) return adminPanel;
    adminPanel = document.createElement("div"); adminPanel.className = "admin-backdrop"; adminPanel.hidden = true;
    adminPanel.innerHTML = `<section class="admin-panel"><header><div><span class="section-kicker">WORKSPACE ACCESS</span><h2>Manage accounts</h2><p>Review sign-up requests and grant or revoke access.</p></div><button class="modal-close" aria-label="Close">×</button></header><div class="admin-summary" id="admin-summary"></div><div class="admin-table-wrap"><table><thead><tr><th>MEMBER</th><th>STATUS</th><th>ROLE</th><th>JOINED</th><th>ACTION</th></tr></thead><tbody id="admin-users"></tbody></table></div><div class="admin-footer"><form id="invite-form"><input type="email" name="email" placeholder="Add existing account email" required><input name="name" placeholder="Full name"><select name="role"><option value="member">Member</option><option value="admin">Admin</option></select><button class="auth-submit">Add account</button></form></div></section>`;
    document.body.append(adminPanel);
    adminPanel.querySelector(".modal-close").addEventListener("click", () => adminPanel.hidden = true);
    adminPanel.addEventListener("click", event => { if (event.target === adminPanel) adminPanel.hidden = true; });
    adminPanel.querySelector("#invite-form").addEventListener("submit", createManagedAccount);
    return adminPanel;
  }
  async function openAdmin() {
    const panel = ensureAdminPanel(); panel.hidden = false;
    const body = panel.querySelector("#admin-users"); body.innerHTML = '<tr><td colspan="5">Loading accounts…</td></tr>';
    const { data, error } = await client.from("profiles").select("id,email,full_name,status,role,created_at").order("created_at", { ascending: false });
    if (error) { body.innerHTML = `<tr><td colspan="5">${safe(error.message)}</td></tr>`; return; }
    const users = data || []; panel.querySelector("#admin-summary").textContent = `${users.filter(u=>u.status==="pending").length} pending · ${users.filter(u=>u.status==="approved").length} active`;
    body.innerHTML = users.map(user => `<tr><td><b>${safe(user.full_name || "Account")}</b><small>${safe(user.email || "")}</small></td><td><span class="user-status status-${safe(user.status)}">${safe(user.status)}</span></td><td>${safe(user.role)}</td><td>${new Date(user.created_at).toLocaleDateString()}</td><td>${user.id===profile.id?"You":`<button data-user-id="${safe(user.id)}" data-next-status="${user.status==="approved"?"blocked":"approved"}">${user.status==="approved"?"Revoke":"Approve"}</button>`}</td></tr>`).join("");
    body.querySelectorAll("button[data-user-id]").forEach(button=>button.addEventListener("click",async()=>{button.disabled=true;const {error}=await client.rpc("admin_set_user_access",{target_user_id:button.dataset.userId,next_status:button.dataset.nextStatus});if(error){setToast(error.message);button.disabled=false;}else openAdmin();}));
  }
  async function createManagedAccount(event) {
    event.preventDefault(); const values=new FormData(event.currentTarget); const {error}=await client.rpc("admin_create_profile",{target_email:values.get("email"),target_name:values.get("name"),target_role:values.get("role")});
    if(error){setToast(error.message);return;}event.currentTarget.reset();setToast("Account access created. User must finish sign-up with their email.");openAdmin();
  }
  window.InfinicoTenderAuth={client,gate};
  start();
})();
