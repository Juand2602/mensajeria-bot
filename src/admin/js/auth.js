function getToken() {
  return localStorage.getItem('token');
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/admin/index.html';
  }
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = '/admin/index.html';
}

function initMobileNav() {
  const btn = document.getElementById('btnMenuMobile');
  const menu = document.getElementById('menuMobile');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => {
    const seVaAAbrir = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(seVaAAbrir));
  });
}

async function authFetch(url, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    logout();
    throw new Error('No autorizado');
  }
  return response;
}

// Escapa texto proveniente de datos de clientes/conductores (nombre, direcciones, etc.)
// antes de insertarlo en innerHTML — esos valores vienen de lo que el cliente
// escribe por WhatsApp y no son de confianza.
function esc(valor) {
  return String(valor).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
