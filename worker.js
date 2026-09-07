// XPanel Worker — مرحله ۲: سیستم لاگین + صفحه پنل

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname;

    try {
      if (path === '/') return statusJSON();
      if (path === '/panel' || path === '/panel/') return servePanel();
      if (path === '/panel/login' && req.method === 'POST') return panelLogin(req, env);
      if (path === '/panel/logout' && req.method === 'POST') return panelLogout(req, env);
      if (path === '/panel/api/me') return me(req, env);
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  },
};

/* ---------- کمکی‌ها ---------- */
const json = (o, status = 200, headers = {}) =>
  new Response(JSON.stringify(o, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const hex = (b) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return hex(buf);
}

// رمز پیش‌فرض: admin (مرحله بعد قابلیت تغییرش رو اضافه می‌کنیم)
async function ensurePwd(env) {
  let h = await env.KV.get('pwdHash');
  if (!h) {
    h = await sha256('admin');
    await env.KV.put('pwdHash', h);
  }
  return h;
}

function readToken(req) {
  const header = req.headers.get('X-Token');
  if (header) return header;
  const m = (req.headers.get('Cookie') || '').match(/xpanel_token=([\w-]+)/);
  return m ? m[1] : null;
}

async function authed(req, env) {
  const t = readToken(req);
  if (!t) return false;
  return !!(await env.KV.get('token:' + t));
}

/* ---------- endpointها ---------- */
function statusJSON() {
  return json({ project: 'xpanel-worker', status: 'ok', step: 2 });
}

async function panelLogin(req, env) {
  const { pass } = await req.json().catch(() => ({}));
  const hash = await sha256(pass || '');
  const pwd = await ensurePwd(env);
  if (hash !== pwd) return json({ ok: false, error: 'wrong password' }, 401);

  const token = crypto.randomUUID();
  await env.KV.put('token:' + token, '1', { expirationTtl: 7 * 24 * 3600 }); // ۷ روز
  return json({ ok: true, token }, 200, {
    'Set-Cookie': `xpanel_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`,
  });
}

async function panelLogout(req, env) {
  const t = readToken(req);
  if (t) await env.KV.delete('token:' + t);
  return json({ ok: true }, 200, {
    'Set-Cookie': 'xpanel_token=; Path=/; Max-Age=0',
  });
}

async function me(req, env) {
  if (!(await authed(req, env))) return json({ ok: false }, 401);
  return json({ ok: true, user: 'admin' });
}

/* ---------- صفحه پنل ---------- */
function servePanel() {
  return new Response(panelHTML(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function panelHTML() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>XPanel</title>
<style>
  * { box-sizing: border-box; font-family: Tahoma, sans-serif; }
  body { background: #0b1020; color: #e5e7eb; margin: 0; padding: 16px;
         display: flex; min-height: 100vh; align-items: center; justify-content: center; }
  .card { background: #151b31; border: 1px solid #223; border-radius: 16px; padding: 24px;
          width: 100%; max-width: 380px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
  h1 { font-size: 20px; margin: 0 0 16px; text-align: center; }
  input, button { width: 100%; padding: 12px; margin: 6px 0; border-radius: 10px;
                  border: 1px solid #2b3350; background: #0b1020; color: #fff; font-size: 15px; }
  button { background: #4f7cff; border: none; cursor: pointer; font-weight: bold; }
  .msg { color: #f87171; font-size: 13px; min-height: 18px; text-align: center; }
  .ok { color: #34d399; text-align: center; }
</style>
</head>
<body>
  <div class="card" id="loginCard">
    <h1>🔐 ورود به XPanel</h1>
    <input id="pass" type="password" placeholder="رمز عبور">
    <button onclick="doLogin()">ورود</button>
    <div class="msg" id="msg"></div>
  </div>

  <div class="card" id="dashCard" style="display:none">
    <h1>⚡ XPanel</h1>
    <p class="ok">ورود موفق بود ✅</p>
    <p style="text-align:center;font-size:13px;opacity:.7">
      مرحله ۲ کامل شد — تنظیمات از مرحله بعد اضافه میشه
    </p>
    <button onclick="doLogout()" style="background:#ef4444">خروج</button>
  </div>

<script>
const $ = (id) => document.getElementById(id);

async function checkSession() {
  const r = await fetch('/panel/api/me', {
    headers: { 'X-Token': localStorage.getItem('xpanel_token') || '' },
  });
  if (r.ok) showDash();
}

function showDash() {
  $('loginCard').style.display = 'none';
  $('dashCard').style.display = 'block';
}

async function doLogin() {
  $('msg').textContent = '';
  const r = await fetch('/panel/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pass: $('pass').value }),
  });
  if (r.ok) {
    const d = await r.json();
    localStorage.setItem('xpanel_token', d.token);
    showDash();
  } else {
    $('msg').textContent = 'رمز عبور اشتباهه!';
  }
}

async function doLogout() {
  await fetch('/panel/logout', {
    method: 'POST',
    headers: { 'X-Token': localStorage.getItem('xpanel_token') || '' },
  });
  localStorage.removeItem('xpanel_token');
  location.reload();
}

checkSession();
</script>
</body>
</html>`;
    }
