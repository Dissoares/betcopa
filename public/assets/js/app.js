/* ============================================================
   BETCOPA — app.js v2
   ============================================================ */

// ── State ────────────────────────────────────────────────────
const S = {
  user:         null,
  games:        [],
  bets:         [],
  csrf:         null,
  selectedGame: null,
  selectedBet:  null,
  pendingBet:   null,      // picks salvos para retomar após login
  scoreHome:    0,
  scoreAway:    0,
  multiplier:   5,
  multMin:      1,
  multMax:      100,
  betPercent:   10,
  timers:       [],        // countdown interval refs
  pollTimer:    null,      // intervalo de polling para jogos ao vivo
  adminEmail:   'admin@betcopa.local',
  activeFilter: 'todos',   // filtro ativo nos cards de jogos
};

let editingGameId = null;

// ── Catálogo de seleções (nome canônico PT-BR + código ISO) ──
const TEAMS = [
  { name: 'África do Sul',    code: 'za' },
  { name: 'Alemanha',         code: 'de' },
  { name: 'Arábia Saudita',   code: 'sa' },
  { name: 'Argentina',        code: 'ar' },
  { name: 'Austrália',        code: 'au' },
  { name: 'Áustria',          code: 'at' },
  { name: 'Bélgica',          code: 'be' },
  { name: 'Bolívia',          code: 'bo' },
  { name: 'Brasil',           code: 'br' },
  { name: 'Camarões',         code: 'cm' },
  { name: 'Canadá',           code: 'ca' },
  { name: 'Chile',            code: 'cl' },
  { name: 'China',            code: 'cn' },
  { name: 'Colômbia',         code: 'co' },
  { name: 'Coreia do Norte',  code: 'kp' },
  { name: 'Coreia do Sul',    code: 'kr' },
  { name: 'Costa do Marfim',  code: 'ci' },
  { name: 'Costa Rica',       code: 'cr' },
  { name: 'Croácia',          code: 'hr' },
  { name: 'Dinamarca',        code: 'dk' },
  { name: 'Egito',            code: 'eg' },
  { name: 'Equador',          code: 'ec' },
  { name: 'Escócia',          code: 'gb-sct' },
  { name: 'Espanha',          code: 'es' },
  { name: 'Estados Unidos',   code: 'us' },
  { name: 'Etiópia',          code: 'et' },
  { name: 'França',           code: 'fr' },
  { name: 'Gales',            code: 'gb-wls' },
  { name: 'Gana',             code: 'gh' },
  { name: 'Holanda',          code: 'nl' },
  { name: 'Hungria',          code: 'hu' },
  { name: 'Indonésia',        code: 'id' },
  { name: 'Inglaterra',       code: 'gb-eng' },
  { name: 'Irlanda',          code: 'ie' },
  { name: 'Irã',              code: 'ir' },
  { name: 'Itália',           code: 'it' },
  { name: 'Japão',            code: 'jp' },
  { name: 'Mali',             code: 'ml' },
  { name: 'Marrocos',         code: 'ma' },
  { name: 'México',           code: 'mx' },
  { name: 'Nigéria',          code: 'ng' },
  { name: 'Noruega',          code: 'no' },
  { name: 'Panamá',           code: 'pa' },
  { name: 'Paraguai',         code: 'py' },
  { name: 'Peru',             code: 'pe' },
  { name: 'Polônia',          code: 'pl' },
  { name: 'Portugal',         code: 'pt' },
  { name: 'República Tcheca', code: 'cz' },
  { name: 'Rússia',           code: 'ru' },
  { name: 'Senegal',          code: 'sn' },
  { name: 'Sérvia',           code: 'rs' },
  { name: 'Suécia',           code: 'se' },
  { name: 'Suíça',            code: 'ch' },
  { name: 'Tunísia',          code: 'tn' },
  { name: 'Turquia',          code: 'tr' },
  { name: 'Ucrânia',          code: 'ua' },
  { name: 'Uruguai',          code: 'uy' },
  { name: 'Venezuela',        code: 've' },
];

// Mantido para lookup reverso (auto-detect por nome em jogos importados)
const FLAGS = Object.fromEntries(
  TEAMS.flatMap(t => [
    [t.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), t.code],
    [t.name.toLowerCase(), t.code],
  ])
);

const TEAM_NAMES = Object.fromEntries(TEAMS.map(t => [t.code, t.name]));

const flagUrl = (code) => `https://flagcdn.com/w80/${code.toLowerCase()}.png`;

const flagEmoji = code => {
  const c = (code || '').trim().toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(c)) return '🏳️';
  return String.fromCodePoint(c.charCodeAt(0) + 0x1F1A5, c.charCodeAt(1) + 0x1F1A5);
};

// Retorna HTML do emblema — logo (img) da API, flag por codigo ISO, ou fallback
const getEmblem = (game, side) => {
  const teamName = side === 'home' ? game.time_casa : game.time_fora;

  // 1. API logo
  const logo = side === 'home' ? game.logo_casa : game.logo_fora;
  if (logo) {
    return `<img class="team-logo" src="${logo}" alt="${teamName}" loading="lazy" onerror="this.style.display='none'" />`;
  }

  // 2. Admin-stored ISO code (2-letter or subdivision like gb-eng)
  const stored = ((side === 'home' ? game.bandeira_casa : game.bandeira_fora) || '').trim();
  if (/^[a-z]{2}(-[a-z]+)?$/i.test(stored) && stored !== '') {
    return `<img class="team-logo team-logo--flag" src="${flagUrl(stored)}" alt="${teamName}" loading="lazy" onerror="this.style.display='none'" />`;
  }

  // 3. Auto-detect by team name (normalize accents via simple map)
  const normalized = teamName.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const code = FLAGS[normalized] || FLAGS[teamName.toLowerCase().trim()];
  if (code) {
    return `<img class="team-logo team-logo--flag" src="${flagUrl(code)}" alt="${teamName}" loading="lazy" onerror="this.style.display='none'" />`;
  }

  // 4. Fallback
  return `<span class="team-flag-fallback">&#127937;</span>`;
};

// ── API helper ────────────────────────────────────────────────
const api = async (url, method = 'GET', body = null) => {
  if (method !== 'GET' && !S.csrf) {
    await loadCsrf();
  }

  const headers = { Accept: 'application/json' };
  if (S.csrf) headers['X-CSRF-Token'] = S.csrf;
  if (body) headers['Content-Type'] = 'application/json';
  if (body && method !== 'GET' && typeof body === 'object') {
    body = { ...body, csrf: S.csrf };
  }

  const request = async () => {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || 'Erro na requisição');
    }
    return res.json();
  };

  try {
    return await request();
  } catch (error) {
    if (error.message === 'Token CSRF inválido' && method !== 'GET') {
      await loadCsrf();
      if (S.csrf) {
        headers['X-CSRF-Token'] = S.csrf;
        return await request();
      }
    }
    throw error;
  }
};

// ── Alerts ────────────────────────────────────────────────────
const showAlert = (msg, type = 'info', ms = 4500) => {
  const el = document.getElementById('alerts');
  const div = document.createElement('div');
  div.className = `alert alert--${type}`;
  div.textContent = msg;
  el.appendChild(div);
  setTimeout(() => div.remove(), ms);
};

// ── Toast (SweetAlert2) ───────────────────────────────────────
const _iconMap = { success: 'success', danger: 'error', info: 'info', warning: 'warning' };
const toast = (msg, type = 'success') => {
  Swal.fire({
    toast: true,
    position: 'bottom-end',
    icon: _iconMap[type] ?? 'info',
    title: msg,
    showConfirmButton: false,
    timer: 3500,
    timerProgressBar: true,
  });
};

// ── Confirm dialog (SweetAlert2) ─────────────────────────────
const confirm = async (opts = {}) => {
  const result = await Swal.fire({
    icon:              opts.icon             ?? 'warning',
    title:             opts.title            ?? 'Confirmar',
    html:              opts.html             ?? opts.text ?? '',
    showCancelButton:  true,
    confirmButtonText: opts.confirmText      ?? 'Confirmar',
    cancelButtonText:  opts.cancelText       ?? 'Cancelar',
    confirmButtonColor: opts.confirmColor    ?? '#e63946',
    reverseButtons:    true,
    focusCancel:       true,
  });
  return result.isConfirmed;
};

// ── Format helpers ────────────────────────────────────────────
const fmtMoney = (n) => `R$ ${parseFloat(n).toFixed(2).replace('.', ',')}`;
const fmtDate  = (v) => new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// Data amigável para o card: "Hoje · 23:59", "Amanhã · 15:33" ou "06/05 · 15:33"
const fmtGameDate = (v) => {
  const d    = new Date(v);
  const now  = new Date();
  const same = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate();
  const tom = new Date(now); tom.setDate(tom.getDate() + 1);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (same(d, now))  return `Hoje · ${time}`;
  if (same(d, tom))  return `Amanhã · ${time}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ` · ${time}`;
};

const maskName = (name) => {
  if (!name) return 'Usuário';
  return name.split(' ').map((part, i) =>
    i === 0 ? part[0] + '*'.repeat(Math.max(2, part.length - 1)) : part[0] + '***'
  ).join(' ');
};

// ── Game status badge ─────────────────────────────────────────
// Critérios (por prioridade):
//  1. Ao Vivo    → status_api ∈ {1H,2H,HT,ET,BT,P,INT,LIVE}  (jogo em andamento)
//  2. Suspenso   → status_api ∈ {SUSP,CANC,ABD,PST}
//  3. Finalizado → status='finalizado' OU status_api ∈ {FT,AET,PEN,AWD,WO}
//  4. Fechado    → status='encerrado'  (apostas fechadas, jogo não registrado)
//  5. Em Breve   → status='aberto' + menos de 1h para o pontapé
//  6. Aberto     → status='aberto' + mais de 1h para o pontapé
const gameBadge = (g) => {
  const api  = (g.status_api || '').toUpperCase();
  const s    = g.status;
  const diff = new Date(g.data_hora) - Date.now();

  // 1. Ao Vivo — badge AO VIVO no header do card
  const liveStatuses = ['1H','2H','ET','BT','P','HT','LIVE','INT'];
  if (liveStatuses.includes(api)) {
    return `<span class="badge badge--live"><i class="fa-solid fa-circle"></i> AO VIVO</span>`;
  }

  // 2. Suspenso / Cancelado / Adiado
  if (['SUSP','CANC','ABD','PST'].includes(api)) {
    const label = api === 'PST' ? 'Adiado' : api === 'SUSP' ? 'Suspenso' : 'Cancelado';
    return `<span class="badge badge--cancelled"><i class="fa-solid fa-ban"></i> ${label}</span>`;
  }

  // 3. Finalizado
  if (s === 'finalizado' || ['FT','AET','PEN','AWD','WO'].includes(api)) {
    const label = api === 'AET' ? 'Prorrogação' : api === 'PEN' ? 'Pênaltis' : 'Finalizado';
    return `<span class="badge badge--final"><i class="fa-solid fa-flag-checkered"></i> ${label}</span>`;
  }

  // 4. Fechado para apostas (apostas encerradas, jogo ainda não terminou)
  if (s === 'encerrado') {
    return `<span class="badge badge--closed"><i class="fa-solid fa-lock"></i> Fechado</span>`;
  }

  // 5. Em Breve: aberto + menos de 1h para começar
  if (s === 'aberto' && diff > 0 && diff <= 3600000) {
    return `<span class="badge badge--soon"><i class="fa-solid fa-clock"></i> Em Breve</span>`;
  }

  // 6. Apostas em breve: aberto + mais de 7 dias para começar
  if (s === 'aberto' && diff > 7 * 24 * 3600_000) {
    return `<span class="badge badge--far"><i class="fa-solid fa-calendar"></i> Apostas em breve</span>`;
  }

  // 7. aberto
  return `<span class="badge badge--open"><i class="fa-solid fa-unlock"></i> Aberto</span>`;
};

// ── Navigation ────────────────────────────────────────────────
const navigate = (view) => {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById(`view-${view}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.remove('view--entering');
    void target.offsetWidth; // reflow para reiniciar animação
    target.classList.add('view--entering');
  }

  document.querySelectorAll('.nav__btn').forEach(btn => {
    btn.classList.toggle('nav__btn--active', btn.dataset.nav === view);
  });

  // Banner só aparece na view de jogos
  const bannerWrap = document.getElementById('matchBannerWrap');
  if (bannerWrap) bannerWrap.classList.toggle('hidden', view !== 'jogos');

  history.replaceState(null, '', `/#${view}`);
};

// ── Header user chip ──────────────────────────────────────────
const renderDrawer = () => {
  const body = document.getElementById('drawerBody');
  if (!body) return;

  if (S.user) {
    const initials = S.user.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const saldo    = parseFloat(S.user.saldo || 0);
    const isAdmin  = S.user.email === S.adminEmail;

    body.innerHTML = `
      <div class="dr-user">
        <div class="user-chip__avatar user-chip__avatar--lg">${initials}</div>
        <div class="dr-user__info">
          <div class="dr-user__name">${S.user.nome}</div>
          <div class="dr-user__balance">${fmtMoney(saldo)}</div>
        </div>
      </div>
      <div class="dr-sep"></div>
      <div class="dr-section">
        <button class="dr-item" data-nav="jogos"><i class="fa-solid fa-house"></i> Início</button>
        <button class="dr-item" data-nav="palpites"><i class="fa-solid fa-ticket"></i> Meus Palpites</button>
        <button class="dr-item" data-nav="ganhadores"><i class="fa-solid fa-trophy"></i> Ganhadores</button>
      </div>
      ${isAdmin ? `
      <div class="dr-sep"></div>
      <p class="dr-section-label">ADMINISTRAÇÃO</p>
      <div class="dr-section">
        <button class="dr-item" data-nav="admin"><i class="fa-solid fa-shield-halved"></i> Painel Admin</button>
      </div>` : ''}
      <div class="dr-sep"></div>
      <div class="dr-section">
        <button class="dr-item dr-item--danger" id="drawerLogout">
          <i class="fa-solid fa-right-from-bracket"></i> Sair
        </button>
      </div>
      <div class="dr-bottom">
        <div class="dr-sep"></div>
        <p class="dr-section-label">TEMA</p>
        <div class="dr-section">
          <button class="dr-item btn-theme-toggle">
            <i class="fa-solid fa-moon theme-icon"></i> Alternar Modo
          </button>
        </div>
      </div>`;

    document.getElementById('drawerLogout')?.addEventListener('click', () => { closeMobileMenu(); logout(); });
  } else {
    body.innerHTML = `
      <div class="dr-section">
        <button class="dr-item" data-nav="jogos"><i class="fa-solid fa-futbol"></i> Jogos</button>
        <button class="dr-item" data-nav="ganhadores"><i class="fa-solid fa-trophy"></i> Ganhadores</button>
      </div>
      <div class="dr-sep"></div>
      <button class="btn btn--primary btn--full" data-nav="auth">
        <i class="fa-solid fa-right-to-bracket"></i> Entrar
      </button>
      <div class="dr-bottom">
        <div class="dr-sep"></div>
        <p class="dr-section-label">TEMA</p>
        <div class="dr-section">
          <button class="dr-item btn-theme-toggle">
            <i class="fa-solid fa-moon theme-icon"></i> Alternar Modo
          </button>
        </div>
      </div>`;
  }
};

const renderHeader = () => {
  const wrap = document.getElementById('headerUser');
  if (S.user) {
    const initials  = S.user.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const saldo     = parseFloat(S.user.saldo || 0);
    const isAdmin   = S.user.email === S.adminEmail;
    const firstName = S.user.nome.split(' ')[0];

    wrap.innerHTML = `
      <div class="udrop" id="userDropdown">
        <button class="udrop__trigger" id="userDropdownBtn">
          <div class="user-chip__avatar">${initials}</div>
          <span class="udrop__name">${firstName}</span>
          <i class="fa-solid fa-chevron-down udrop__chevron"></i>
        </button>
        <div class="udrop__menu">
          <div class="udrop__info">
            <div class="user-chip__avatar user-chip__avatar--lg">${initials}</div>
            <div class="udrop__info-text">
              <div class="udrop__fullname">${S.user.nome}</div>
              <div class="udrop__balance">${fmtMoney(saldo)}</div>
            </div>
          </div>
          <div class="udrop__sep"></div>
          <button class="udrop__item" data-udrop-nav="jogos">
            <i class="fa-solid fa-house"></i> Início
          </button>
          <button class="udrop__item" data-udrop-nav="palpites">
            <i class="fa-solid fa-ticket"></i> Meus Palpites
          </button>
          <button class="udrop__item" id="udropBtnSaque">
            <i class="fa-solid fa-money-bill-transfer"></i> Solicitar Saque
          </button>
          <button class="udrop__item" data-udrop-nav="ganhadores">
            <i class="fa-solid fa-trophy"></i> Ganhadores
          </button>
          ${isAdmin ? `
          <div class="udrop__sep"></div>
          <button class="udrop__item" data-udrop-nav="admin">
            <i class="fa-solid fa-shield-halved"></i> Painel Admin
          </button>` : ''}
          <div class="udrop__sep"></div>
          <button class="udrop__item udrop__item--danger" id="dropdownLogout">
            <i class="fa-solid fa-right-from-bracket"></i> Sair
          </button>
        </div>
      </div>`;

    document.querySelectorAll('.nav__btn--auth').forEach(b => b.style.display = '');
    document.getElementById('btnNavLogin')?.remove();
    if (isAdmin) document.querySelectorAll('.nav__btn--admin').forEach(b => b.style.display = '');
  } else {
    wrap.innerHTML = `<button class="btn btn--primary btn--sm" id="btnNavLogin">Entrar</button>`;
    document.getElementById('btnNavLogin').addEventListener('click', () => navigate('auth'));
    document.querySelectorAll('.nav__btn--auth').forEach(b => b.style.display = 'none');
    document.querySelectorAll('.nav__btn--admin').forEach(b => b.style.display = 'none');
  }
  renderDrawer();
};

const openMobileMenu = () => {
  document.getElementById('mobileDrawer')?.classList.add('drawer--open');
  document.body.classList.add('drawer-open');
};

const closeMobileMenu = () => {
  document.getElementById('mobileDrawer')?.classList.remove('drawer--open');
  document.body.classList.remove('drawer-open');
};

const setTheme = (theme) => {
  const isLight = theme === 'light';
  document.body.classList.toggle('theme-light', isLight);
  document.querySelectorAll('.theme-icon').forEach(el => {
    el.className = (isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon') + ' theme-icon';
  });
  localStorage.setItem('betcopaTheme', theme);
};

const toggleTheme = () => {
  setTheme(document.body.classList.contains('theme-light') ? 'dark' : 'light');
};

const loadTheme = () => {
  const stored = localStorage.getItem('betcopaTheme');
  setTheme(stored === 'light' ? 'light' : 'dark');
};

// ── Game helpers ──────────────────────────────────────────────
const LIVE_API_CODES = ['1H','2H','ET','BT','P','HT','LIVE','INT'];

const isGameLive = (g) => LIVE_API_CODES.includes((g.status_api || '').toUpperCase());

const updateHeroStats = () => {
  const live = S.games.filter(g => LIVE_API_CODES.includes((g.status_api || '').toUpperCase())).length;
  const open = S.games.filter(g => g.status === 'aberto').length;
  const el = id => document.getElementById(id);
  if (el('heroStatGames')) el('heroStatGames').textContent = S.games.length;
  if (el('heroStatOpen'))  el('heroStatOpen').textContent  = open;
  if (el('heroStatLive'))  el('heroStatLive').textContent  = live;
  el('heroStatLiveWrap')?.classList.toggle('hidden', live === 0);
  // Indicador ao vivo no nav
  document.querySelectorAll('.nav__btn[data-nav="jogos"], .dr-item[data-nav="jogos"]').forEach(btn => {
    const dot = btn.querySelector('.nav-live-dot');
    if (live > 0) { if (!dot) btn.insertAdjacentHTML('beforeend', '<span class="nav-live-dot"></span>'); }
    else            { dot?.remove(); }
  });
};

// ── Game card renderer ────────────────────────────────────────
const renderCard = (g) => {
  const emblemHome = getEmblem(g, 'home');
  const emblemAway = getEmblem(g, 'away');
  const isLive     = isGameLive(g);
  const isClosed   = g.status !== 'aberto' || isLive;
  const isFinal    = g.status === 'finalizado';
  const isTooFar   = !isClosed && (new Date(g.data_hora) - Date.now()) > 7 * 24 * 3600_000;
  const isSoon     = !isClosed && (new Date(g.data_hora) - Date.now()) <= 3600000;

  const statusClass = isLive   ? 'live'
                    : isFinal  ? 'final'
                    : isClosed ? 'closed'
                    : isSoon   ? 'soon'
                    :            'open';

  const badgeLabel = gameBadge(g);
  const scoreStr   = g.placar_real ? g.placar_real.replace('x', ' × ') : null;
  const oddNum     = parseFloat(g.odd || 1);
  const oddFmt     = oddNum % 1 === 0 ? oddNum.toFixed(0) : oddNum.toFixed(1).replace('.', ',');

  let midHtml;
  if (isLive) {
    const { period, min } = fmtLiveClock(g);
    const clockTxt = min !== null ? `${period} · ${min}'` : period;
    midHtml = `
        <div class="gc-score gc-score--live">
          <span class="gc-score__val">${scoreStr ?? '0 × 0'}</span>
          <span class="gc-score__period" id="lvclock-${g.id}">${clockTxt}</span>
        </div>`;
  } else if (isFinal && scoreStr) {
    midHtml = `
        <div class="gc-vs">VS</div>
        <div class="gc-score gc-score--final">
          <span class="gc-score__label">PLACAR</span>
          <span class="gc-score__val">${scoreStr}</span>
        </div>`;
  } else if (!isClosed) {
    midHtml = `
        <div class="gc-vs">VS</div>
        <div class="gc-countdown">
          <span class="gc-countdown__label">COMEÇA EM</span>
          <span class="gc-countdown__time" id="cdtime-${g.id}">--:--:--</span>
        </div>`;
  } else {
    midHtml = `<div class="gc-vs">VS</div><span class="gc-dash">—</span>`;
  }

  const btnLabel = isFinal
    ? '<i class="fa-solid fa-flag-checkered"></i> Finalizado'
    : isTooFar
    ? '<i class="fa-solid fa-calendar-xmark"></i> Apostas em breve'
    : '<i class="fa-solid fa-lock"></i> Encerrado';

  const ctaHtml = !isClosed
    ? `<p class="gc-cta"><i class="fa-solid fa-fire"></i> Acerte e ganhe de <strong>${S.multMin}×</strong> a <strong>${S.multMax}×</strong> o valor!</p>`
    : '';

  const urgencyHtml = isSoon
    ? `<span class="gc-urgency"><i class="fa-solid fa-bolt"></i> Encerra em breve!</span>`
    : '';

  const betBlocked = isClosed || isTooFar;
  const footHtml = isLive
    ? `<button class="btn btn--ghost btn--full" disabled>
         <i class="fa-solid fa-lock"></i> Apostas encerradas
       </button>`
    : `<button class="btn ${!betBlocked ? 'btn--primary' : 'btn--ghost'} btn--full"
         data-action="bet" data-id="${g.id}" ${betBlocked ? 'disabled' : ''}>
         ${!betBlocked ? '<i class="fa-solid fa-bullseye"></i> Fazer Palpite' : btnLabel}
       </button>
       ${ctaHtml}`;

  return `
    <article class="game-card game-card--${statusClass}">
      <div class="game-card__head">
        ${badgeLabel}
        ${isLive
          ? `<span class="game-card__date game-card__date--live"><i class="fa-solid fa-circle fa-beat" style="font-size:.5em;color:var(--danger)"></i> Ao Vivo</span>`
          : `<time class="game-card__date">${fmtGameDate(g.data_hora)}</time>`
        }
      </div>
      <div class="game-card__matchup">
        <div class="game-card__team">
          <div class="game-card__emblem">${emblemHome}</div>
          <span class="game-card__name">${g.time_casa}</span>
        </div>
        <div class="game-card__mid">${midHtml}</div>
        <div class="game-card__team">
          <div class="game-card__emblem">${emblemAway}</div>
          <span class="game-card__name">${g.time_fora}</span>
        </div>
      </div>
      <div class="game-card__foot">
        ${urgencyHtml}
        ${footHtml}
      </div>
    </article>`;
};

// Stores all games per section so "Ver mais" can render the hidden remainder
const _sectionReg = {};
const SECTION_LIMIT = 6;

const renderSection = (id, title, iconHtml, games, extraClass = '') => {
  if (!games.length) return '';
  _sectionReg[id] = games;
  const cls   = ['games-section', extraClass].filter(Boolean).join(' ');
  const shown = games.slice(0, SECTION_LIMIT);
  const more  = games.length - SECTION_LIMIT;

  const moreBtn = more > 0
    ? `<button class="btn-show-more" data-sid="${id}">
         <i class="fa-solid fa-chevron-down"></i>
         Ver mais ${more} jogo${more !== 1 ? 's' : ''}
       </button>`
    : '';

  return `
    <section class="${cls}" id="gs-${id}">
      <div class="games-section__header">
        <h3 class="games-section__title">${iconHtml}${title}</h3>
        <span class="games-section__count">${games.length}</span>
      </div>
      <div class="games-grid" id="gs-grid-${id}">${shown.map(renderCard).join('')}</div>
      ${moreBtn}
    </section>`;
};

// ── Match Banner carousel ─────────────────────────────────────
// Auto-advance timer lives outside S.timers so it can be paused on hover
// and re-created without polluting S.timers on each mouse event.
let _mbAutoTimer = null;

const renderMatchBanner = () => {
  let el   = document.getElementById('matchBanner');
  const wrap = document.getElementById('matchBannerWrap');
  if (!el || !wrap) return;

  // Clear previous auto-advance and strip old listeners via clone
  clearInterval(_mbAutoTimer);
  _mbAutoTimer = null;
  const fresh = el.cloneNode(false);
  el.replaceWith(fresh);
  el = fresh;

  // Slide priority: live games → soon (<1h) → next upcoming (max 8 total)
  const live = S.games.filter(isGameLive);
  const soon = S.games
    .filter(g => g.status === 'aberto' && !isGameLive(g))
    .filter(g => { const ms = new Date(g.data_hora) - Date.now(); return ms > 0 && ms <= 3_600_000; })
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
  const next = S.games
    .filter(g => g.status === 'aberto' && !isGameLive(g) && !soon.includes(g))
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  const MAX_SLIDES = 8;
  const slides = [...live, ...soon, ...next].slice(0, MAX_SLIDES);

  if (!slides.length) {
    wrap.className = 'match-banner-wrap hidden';
    el.innerHTML = '';
    return;
  }

  const setThemeClass = (g) => {
    wrap.classList.remove('match-banner--live', 'match-banner--soon');
    wrap.classList.add(isGameLive(g) ? 'match-banner--live' : 'match-banner--soon');
    wrap.classList.remove('hidden');
  };

  const buildSlide = (g, idx) => {
    const gLive = isGameLive(g);
    const logoH = g.logo_casa ? `<img src="${g.logo_casa}" class="mb-logo" alt="${g.time_casa}">` : `<span class="mb-flag">${flagImg(g.bandeira_casa || '', '2rem')}</span>`;
    const logoA = g.logo_fora ? `<img src="${g.logo_fora}" class="mb-logo" alt="${g.time_fora}">` : `<span class="mb-flag">${flagImg(g.bandeira_fora || '', '2rem')}</span>`;
    let pill, center, cta;

    if (gLive) {
      const score = g.placar_real ? g.placar_real.replace('x', ' × ') : '0 × 0';
      const { period, min } = fmtLiveClock(g);
      pill   = `<div class="mb-pill mb-pill--live"><i class="fa-solid fa-circle fa-beat"></i> AO VIVO</div>`;
      center = `<div class="mb-score">${score}</div>
                <div class="mb-clock" id="mbc-clk-${g.id}">${min !== null ? `${period} · ${min}'` : period}</div>`;
      cta    = `<button class="btn btn--danger btn--sm mb-cta-btn" disabled>
                  <i class="fa-solid fa-satellite-dish fa-beat"></i> Ao Vivo
                </button>`;
    } else {
      const ms     = new Date(g.data_hora) - Date.now();
      const isSoon = ms <= 3_600_000;
      pill   = isSoon
        ? `<div class="mb-pill mb-pill--soon"><i class="fa-solid fa-bolt"></i> EM BREVE</div>`
        : `<div class="mb-pill mb-pill--next"><i class="fa-solid fa-clock"></i> PRÓXIMO JOGO</div>`;
      center = `<div class="mb-label">COMEÇA EM</div>
                <div class="mb-countdown" id="mbc-cd-${g.id}">${fmtCountdown(ms)}</div>`;
      cta    = `<button class="btn btn--primary btn--sm mb-cta-btn" data-action="bet" data-id="${g.id}">
                  <i class="fa-solid fa-bullseye"></i> Fazer Palpite
                </button>`;
    }

    return `
      <div class="mb-slide${idx === 0 ? ' mb-slide--active' : ''}" data-slide="${idx}">
        ${pill}
        <div class="mb-match">
          <div class="mb-team">${logoH}<span class="mb-name">${g.time_casa}</span></div>
          <div class="mb-center">${center}</div>
          <div class="mb-team">${logoA}<span class="mb-name">${g.time_fora}</span></div>
        </div>
        ${cta}
      </div>`;
  };

  const navHtml = slides.length > 1 ? `
    <div class="mb-nav">
      <button class="mb-arrow" id="mbPrev"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="mb-dots">${slides.map((_, i) =>
        `<button class="mb-dot${i === 0 ? ' mb-dot--active' : ''}" data-dot="${i}"></button>`
      ).join('')}</div>
      <button class="mb-arrow" id="mbNext"><i class="fa-solid fa-chevron-right"></i></button>
    </div>` : '';

  setThemeClass(slides[0]);
  el.className = 'match-banner container';
  el.innerHTML = `<div class="mb-strip" id="mbStrip">${slides.map(buildSlide).join('')}</div>${navHtml}`;

  // Countdown timers for non-live slides
  slides.filter(g => !isGameLive(g)).forEach(g => {
    const cdEl = document.getElementById(`mbc-cd-${g.id}`);
    if (!cdEl) return;
    S.timers.push(setInterval(() => {
      cdEl.textContent = fmtCountdown(new Date(g.data_hora) - Date.now());
    }, 1000));
  });

  // Live clock updates
  slides.filter(isGameLive).forEach(g => {
    const clkEl = document.getElementById(`mbc-clk-${g.id}`);
    if (!clkEl) return;
    S.timers.push(setInterval(() => {
      const { period, min } = fmtLiveClock(g);
      clkEl.textContent = min !== null ? `${period} · ${min}'` : period;
    }, 30_000));
  });

  if (slides.length <= 1) return;

  const isDesktop = () => window.innerWidth >= 768;
  let current = 0;

  const goTo = (idx) => {
    current = Math.max(0, Math.min(idx, slides.length - 1));
    el.querySelectorAll('.mb-dot').forEach((d, i) => d.classList.toggle('mb-dot--active', i === current));
    setThemeClass(slides[current]);

    const strip = document.getElementById('mbStrip');
    if (isDesktop()) {
      const card = strip.children[current];
      if (card) strip.scrollTo({ left: card.offsetLeft - strip.offsetLeft, behavior: 'smooth' });
      strip.querySelectorAll('.mb-slide').forEach((s, i) => s.classList.toggle('mb-slide--active', i === current));
    } else {
      strip.querySelectorAll('.mb-slide').forEach((s, i) => s.classList.toggle('mb-slide--active', i === current));
    }
  };

  const advance   = () => goTo((current + 1) % slides.length);
  const startAuto = () => { clearInterval(_mbAutoTimer); _mbAutoTimer = setInterval(advance, 5_000); };

  el.addEventListener('click', e => {
    const dot = e.target.closest('.mb-dot');
    if (dot) { goTo(Number(dot.dataset.dot)); if (!isDesktop()) startAuto(); }
  });

  document.getElementById('mbPrev')?.addEventListener('click', () => {
    goTo(current <= 0 ? slides.length - 1 : current - 1);
    if (!isDesktop()) startAuto();
  });
  document.getElementById('mbNext')?.addEventListener('click', () => {
    goTo((current + 1) % slides.length);
    if (!isDesktop()) startAuto();
  });

  if (!isDesktop()) {
    el.addEventListener('mouseenter', () => clearInterval(_mbAutoTimer));
    el.addEventListener('mouseleave', startAuto);
    startAuto();
  }

  // ── Drag-to-scroll (desktop) ──────────────────────────────
  const strip = document.getElementById('mbStrip');
  if (strip) {
    let dragStartX = 0, dragScrollLeft = 0, isDragging = false;

    strip.addEventListener('mousedown', e => {
      isDragging = true;
      dragStartX    = e.pageX - strip.offsetLeft;
      dragScrollLeft = strip.scrollLeft;
      strip.style.cursor = 'grabbing';
      strip.style.userSelect = 'none';
    });
    strip.addEventListener('mouseleave', () => {
      isDragging = false;
      strip.style.cursor = '';
      strip.style.userSelect = '';
    });
    strip.addEventListener('mouseup', () => {
      isDragging = false;
      strip.style.cursor = '';
      strip.style.userSelect = '';
    });
    strip.addEventListener('mousemove', e => {
      if (!isDragging) return;
      e.preventDefault();
      const x    = e.pageX - strip.offsetLeft;
      const walk = (x - dragStartX) * 1.2;
      strip.scrollLeft = dragScrollLeft - walk;
    });
    // previne clique em botões quando apenas arrastando
    strip.addEventListener('click', e => {
      if (Math.abs(strip.scrollLeft - dragScrollLeft) > 4) e.stopPropagation();
    }, true);
  }

  // ── Swipe touch (mobile) ──────────────────────────────────
  let touchStartX = 0, touchStartY = 0;
  el.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (!e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy)) return; // ignore tap ou scroll vertical
    if (dx < 0) goTo((current + 1) % slides.length);
    else         goTo(current <= 0 ? slides.length - 1 : current - 1);
    startAuto();
  }, { passive: true });
};

const renderGames = () => {
  const container = document.getElementById('gamesGrid');
  const empty     = document.getElementById('gamesEmpty');
  if (!container) return;

  S.timers.forEach(clearInterval);
  S.timers = [];

  updateHeroStats();

  const now     = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate();
  const dayOffset = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };

  const live = S.games.filter(isGameLive);

  const openSorted = S.games
    .filter(g => g.status === 'aberto' && !isGameLive(g))
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  const soon     = openSorted.filter(g => { const ms = new Date(g.data_hora) - now; return ms > 0 && ms <= 3_600_000; });
  const today    = openSorted.filter(g => { const ms = new Date(g.data_hora) - now; return sameDay(new Date(g.data_hora), now) && ms > 3_600_000; });
  const tomorrow = openSorted.filter(g => sameDay(new Date(g.data_hora), dayOffset(1)));

  // Days 2–6 ahead: one section per day
  const weekSections = [];
  for (let i = 2; i <= 6; i++) {
    const d     = dayOffset(i);
    const games = openSorted.filter(g => sameDay(new Date(g.data_hora), d));
    if (!games.length) continue;
    const wday = d.toLocaleDateString('pt-BR', { weekday: 'short' });
    const cap  = wday.charAt(0).toUpperCase() + wday.slice(1).replace('.', '');
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    weekSections.push({
      sid:   `week${d.toISOString().slice(0, 10).replace(/-/g, '')}`,
      title: `${cap} · ${date}`,
      games,
    });
  }

  // Games beyond 7 days
  const beyond = openSorted.filter(g => new Date(g.data_hora) >= dayOffset(7));

  const finished = S.games
    .filter(g => g.status === 'finalizado' || g.status === 'encerrado')
    .sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));

  if (!live.length && !openSorted.length && !finished.length) {
    container.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  let html = '';
  html += renderSection('live',     'Ao Vivo',     '<i class="fa-solid fa-circle fa-beat"></i>',  live,     'games-section--live');
  html += renderSection('soon',     'Em Breve',    '<i class="fa-solid fa-bolt"></i>',             soon,     'games-section--soon');
  html += renderSection('today',    'Hoje',        '<i class="fa-solid fa-sun"></i>',              today,    'games-section--today');
  html += renderSection('tomorrow', 'Amanhã',      '<i class="fa-solid fa-calendar-day"></i>',    tomorrow, 'games-section--tomorrow');
  weekSections.forEach(ws => {
    html += renderSection(ws.sid, ws.title, '<i class="fa-solid fa-calendar-week"></i>', ws.games, 'games-section--week');
  });
  if (beyond.length)
    html += renderSection('beyond', 'Próximos', '<i class="fa-solid fa-calendar-plus"></i>', beyond, 'games-section--beyond');
  html += renderSection('finished', 'Finalizados', '<i class="fa-solid fa-flag-checkered"></i>',  finished, 'games-section--finished');

  container.innerHTML = html;

  renderMatchBanner();
  startCountdowns();
  startLiveClocks();

  // Polling automático só quando há jogos ao vivo
  if (S.games.some(isGameLive)) startLivePoll();
  else stopLivePoll();
};

// ── Countdown timers ──────────────────────────────────────────
// > 1 dia  → "2d 05h 30m"  (atualiza por minuto visualmente, mas intervalo continua em 1s)
// < 1 dia  → "HH:MM:SS"
// expirado → "Em breve!"
const fmtCountdown = (ms) => {
  if (ms <= 0) return 'Em breve!';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d >= 1) return `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m`;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

const fmtLiveClock = (g) => {
  const api     = (g.status_api || '').toUpperCase();
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(g.data_hora)) / 60000));
  // elapsed=0 significa data_hora no futuro (dados inconsistentes) — não exibe minuto
  const hasMin  = elapsed > 0;

  if (api === 'HT')  return { period: 'Intervalo',      min: null };
  if (api === 'BT')  return { period: 'Interv. Prorr.', min: null };
  if (api === 'P')   return { period: 'Pênaltis',       min: null };
  if (api === 'INT') return { period: 'Interrompido',   min: null };

  if (api === '1H')  return { period: '1º Tempo',    min: hasMin ? Math.min(elapsed, 45) : null };
  if (api === '2H')  return { period: '2º Tempo',    min: hasMin ? Math.min(45 + Math.max(0, elapsed - 60), 90) : null };
  if (api === 'ET')  return { period: 'Prorrogação', min: hasMin ? Math.min(90 + Math.max(0, elapsed - 110), 120) : null };

  return { period: 'Ao Vivo', min: null };
};

const startLiveClocks = () => {
  S.games.filter(isGameLive).forEach(g => {
    const el = document.getElementById(`lvclock-${g.id}`);
    if (!el || el.dataset.t) return;
    el.dataset.t = '1';
    const tick = () => {
      const { period, min } = fmtLiveClock(g);
      el.textContent = min !== null ? `${period} · ${min}'` : period;
    };    tick();
    S.timers.push(setInterval(tick, 30000));
  });
};

const startCountdowns = () => {
  S.games.forEach(g => {
    if (g.status !== 'aberto') return;
    const el = document.getElementById(`cdtime-${g.id}`);
    if (!el || el.dataset.t) return;
    el.dataset.t = '1';

    const tick = () => {
      const diff = new Date(g.data_hora) - Date.now();
      const txt  = fmtCountdown(diff);
      el.textContent = txt;
      if (diff <= 0) el.classList.add('game-card__countdown-time--expired');
    };
    tick();
    S.timers.push(setInterval(tick, 1000));
  });
};

// ── Bets list ─────────────────────────────────────────────────
const betTimeline = (status) => {
  const STEPS = [
    { key: 'pendente',  label: 'Aguardando' },
    { key: 'pago',      label: 'Pago' },
    { key: 'confirmado',label: 'Confirmado' },
    { key: 'resultado', label: status === 'ganhou' ? '<span style="color:var(--primary)">Ganhou!</span>' : status === 'perdido' ? '<span style="color:var(--danger)">Perdeu</span>' : 'Resultado' },
  ];
  const ORDER = ['pendente', 'pago', 'confirmado'];
  const done  = status === 'ganhou' || status === 'perdido';
  const idx   = done ? 3 : ORDER.indexOf(status);

  return `<div class="bet-status-steps">${STEPS.map((step, i) => {
    const state = i < idx ? 'done' : i === idx ? 'active' : '';
    const line  = i < STEPS.length - 1
      ? `<span class="bet-step__line${i < idx ? ' bet-step__line--done' : ''}"></span>`
      : '';
    return `<span class="bet-step bet-step--${state}"><span class="bet-step__dot"></span><span class="bet-step__label">${step.label}</span></span>${line}`;
  }).join('')}</div>`;
};

const renderBets = () => {
  const list  = document.getElementById('betsList');
  const empty = document.getElementById('betsEmpty');
  if (!list) return;

  if (!S.bets.length) {
    list.innerHTML = '';
    empty && empty.classList.remove('hidden');
    return;
  }
  empty && empty.classList.add('hidden');

  list.innerHTML = S.bets.map(b => {
    const isWin  = b.status === 'ganhou';
    const isLoss = b.status === 'perdido';

    // Bandeiras: busca o jogo correspondente em S.games
    const game = S.games.find(g => g.time_casa === b.time_casa && g.time_fora === b.time_fora);
    const fHome = game?.bandeira_casa;
    const fAway = game?.bandeira_fora;
    const flagsHtml = (fHome || fAway)
      ? `<div class="bet-card__game-flags">
           ${fHome ? `<img src="${flagUrl(fHome)}" alt="${b.time_casa}" />` : ''}
           <span>${b.time_casa}</span>
           <span class="flag-sep">×</span>
           ${fAway ? `<img src="${flagUrl(fAway)}" alt="${b.time_fora}" />` : ''}
           <span>${b.time_fora}</span>
         </div>`
      : `<div class="bet-card__game-name">${b.time_casa} × ${b.time_fora}</div>`;

    const actionHtml = b.status === 'pendente'
      ? `<button class="btn btn--primary btn--sm" data-action="pay" data-id="${b.id}"><i class="fa-solid fa-credit-card"></i> Pagar PIX</button>`
      : b.status === 'pago'
      ? `<button class="btn btn--ghost btn--sm" data-action="confirm" data-id="${b.id}"><i class="fa-solid fa-check"></i> Confirmar</button>`
      : isWin
      ? `<span class="badge badge--open"><i class="fa-solid fa-trophy"></i> Ganhou!</span>`
      : isLoss
      ? `<span class="badge badge--closed"><i class="fa-solid fa-x"></i> Perdeu</span>`
      : `<span class="badge">${b.status}</span>`;

    return `
      <div class="bet-card ${isWin ? 'bet-card--win' : ''} ${isLoss ? 'bet-card--loss' : ''}">
        <div class="bet-card__game">
          ${flagsHtml}
          <div class="bet-card__palpite"><i class="fa-solid fa-bullseye" style="font-size:.75em;opacity:.6"></i> Palpite: ${b.placar_casa} × ${b.placar_fora}</div>
          ${betTimeline(b.status)}
        </div>
        <div class="bet-card__meta">
          <div class="bet-card__col">
            <div class="bet-card__col-label">Pago</div>
            <div class="bet-card__col-val">${fmtMoney(b.valor)}</div>
          </div>
          <div class="bet-card__col">
            <div class="bet-card__col-label">Mult.</div>
            <div class="bet-card__col-val">${parseFloat(b.odd).toFixed(0)}×</div>
          </div>
          <div class="bet-card__col">
            <div class="bet-card__col-label">${isWin ? 'Ganhou' : 'Prêmio'}</div>
            <div class="bet-card__col-val ${isWin ? 'bet-card__col-val--win' : isLoss ? 'bet-card__col-val--loss' : ''}">
              ${isLoss ? '—' : fmtMoney(b.possivel_ganho)}
            </div>
          </div>
        </div>
        <div class="bet-card__actions">${actionHtml}</div>
      </div>`;
  }).join('');
};

// ── Ranking ───────────────────────────────────────────────────
const renderRanking = async () => {
  let data;
  try { data = await api('/api/ranking'); } catch { return; }

  const podiumEl = document.getElementById('rankingPodium');
  const spot     = document.getElementById('rankingWinnerSpot');
  const winsEl   = document.getElementById('rankingWinners');
  const nearEl   = document.getElementById('rankingNear');

  const medals = [
    '<i class="fa-solid fa-medal" style="color:#FFD700"></i>',
    '<i class="fa-solid fa-medal" style="color:#C0C0C0"></i>',
    '<i class="fa-solid fa-medal" style="color:#CD7F32"></i>',
  ];

  if (data.vencedores && data.vencedores.length) {
    spot.classList.add('hidden');

    // Pódio para os 3 primeiros
    if (podiumEl) {
      const top3 = data.vencedores.slice(0, 3);
      // Ordena para exibição: 2º - 1º - 3º
      const podiumOrder = top3.length >= 3
        ? [top3[1], top3[0], top3[2]]
        : top3.length === 2
        ? [top3[1], top3[0]]
        : [top3[0]];

      podiumEl.innerHTML = podiumOrder.map((r, displayIdx) => {
        const realPos = top3.indexOf(r); // posição real (0-indexed)
        return `
          <div class="podium-step podium-step--${realPos + 1}">
            <div class="podium-step__medal">${medals[realPos] || ''}</div>
            <div class="podium-step__name">${maskName(r.nome)}</div>
            <div class="podium-step__game">${r.jogo}</div>
            <div class="podium-step__val">${fmtMoney(r.ganho)}</div>
          </div>`;
      }).join('');
    }

    winsEl.innerHTML = data.vencedores.map((r, i) => `
      <div class="ranking-row">
        <span class="ranking-row__pos">${medals[i] || i + 1}</span>
        <span class="ranking-row__name">${maskName(r.nome)}</span>
        <span class="ranking-row__val">${fmtMoney(r.ganho)}</span>
      </div>`).join('');
  } else {
    spot.classList.add('hidden');
    if (podiumEl) podiumEl.innerHTML = '';
    winsEl.innerHTML = '<p class="text--muted">Nenhum ganhador ainda.</p>';
  }

  if (data.quase && data.quase.length) {
    nearEl.innerHTML = data.quase.map((r, i) => `
      <div class="ranking-row">
        <span class="ranking-row__pos">${i + 1}</span>
        <span class="ranking-row__name">${maskName(r.nome)}</span>
        <span class="ranking-row__diff">${r.diferenca} gol(s)</span>
      </div>`).join('');
  } else {
    nearEl.innerHTML = '<p class="text--muted">Nenhum palpite registrado ainda.</p>';
  }
};

// ── Modals ────────────────────────────────────────────────────
const openModal  = (id) => document.getElementById(id)?.classList.remove('hidden');
const closeModal = (id) => document.getElementById(id)?.classList.add('hidden');
const closeAllModals = () => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));

// ── Bet modal ─────────────────────────────────────────────────
const openBetModal = (gameId, pending = null) => {
  const game = S.games.find(g => g.id === Number(gameId));
  if (!game) return;

  S.selectedGame = game;
  S.scoreHome    = pending?.scoreHome  ?? 0;
  S.scoreAway    = pending?.scoreAway  ?? 0;
  S.multiplier   = Math.min(S.multMax, Math.max(S.multMin, pending?.multiplier ?? Math.round((S.multMin + S.multMax) / 2)));

  const slider = document.getElementById('multiplierSlider');
  slider.min   = S.multMin;
  slider.max   = S.multMax;
  slider.value = S.multiplier;
  const lblMin = document.getElementById('sliderLabelMin');
  const lblMax = document.getElementById('sliderLabelMax');
  if (lblMin) lblMin.textContent = `${S.multMin}×`;
  if (lblMax) lblMax.textContent = `${S.multMax}×`;
  const payLbl = document.getElementById('betPayLabel');
  if (payLbl) payLbl.textContent = `Você aposta (${S.betPercent}% do prêmio)`;

  document.getElementById('betFlagHome').innerHTML    = getEmblem(game, 'home');
  document.getElementById('betNameHome').textContent  = game.time_casa;
  document.getElementById('betFlagAway').innerHTML    = getEmblem(game, 'away');
  document.getElementById('betNameAway').textContent  = game.time_fora;
  document.getElementById('scoreHome').textContent    = S.scoreHome;
  document.getElementById('scoreAway').textContent    = S.scoreAway;

  updateBetPreview();
  openModal('modalPalpite');
};

const updateBetPreview = () => {
  const game      = S.selectedGame;
  if (!game) return;
  const mult      = S.multiplier;
  const base      = parseFloat(game.valor_base || 1);
  const premio    = base * mult;
  const valor     = +(premio * S.betPercent / 100).toFixed(2);

  document.getElementById('multiplierDisplay').textContent = `${mult}×`;
  document.getElementById('betPayAmount').textContent      = fmtMoney(valor);
  document.getElementById('betWinAmount').textContent      = fmtMoney(premio);
  document.getElementById('betPreviewScore').textContent   =
    `${game.time_casa} ${S.scoreHome} × ${S.scoreAway} ${game.time_fora}`;

  // Update slider track fill
  const slider = document.getElementById('multiplierSlider');
  const range  = (S.multMax - S.multMin) || 1;
  const pct    = ((mult - S.multMin) / range) * 100;
  slider.style.background = `linear-gradient(to right, var(--primary) ${pct}%, var(--surface-3) ${pct}%)`;
};

const submitBet = async () => {
  if (!S.user) {
    // Sem login: mostra ticket em pré-visualização (sem chamar a API)
    const base   = parseFloat(S.selectedGame.valor_base || 1);
    const premio = base * S.multiplier;
    const valor  = +(premio * S.betPercent / 100).toFixed(2);
    S.selectedBet = null;
    S.pendingBet  = {
      gameId:     S.selectedGame.id,
      scoreHome:  S.scoreHome,
      scoreAway:  S.scoreAway,
      multiplier: S.multiplier,
    };
    closeModal('modalPalpite');
    fillTicket({
      id:             null,
      placar_casa:    S.scoreHome,
      placar_fora:    S.scoreAway,
      valor,
      possivel_ganho: premio,
    });
    openModal('modalTicket');
    return;
  }

  const btn = document.getElementById('btnConfirmBet');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const result = await api('/api/apostas', 'POST', {
      jogo_id:       S.selectedGame.id,
      placar_casa:   S.scoreHome,
      placar_fora:   S.scoreAway,
      multiplicador: S.multiplier,
    });

    S.selectedBet = result.aposta;
    closeModal('modalPalpite');
    fillTicket(result.aposta);
    openModal('modalTicket');
    await loadBets();
  } catch (err) {
    toast(err.message || 'Erro ao registrar palpite.', 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar Palpite →';
  }
};

// ── Ticket modal ──────────────────────────────────────────────
const fillTicket = (bet) => {
  const game    = S.selectedGame;
  const isGuest = !bet.id;
  document.getElementById('ticketId').textContent      = isGuest ? 'Pré-visualização' : `#${String(bet.id).padStart(6, '0')}`;
  document.getElementById('ticketGame').textContent    = game ? `${game.time_casa} × ${game.time_fora}` : '—';
  document.getElementById('ticketPalpite').textContent = `${bet.placar_casa} × ${bet.placar_fora}`;
  document.getElementById('ticketValor').textContent   = fmtMoney(bet.valor);
  document.getElementById('ticketPremio').textContent  = fmtMoney(bet.possivel_ganho);

  const payBtn = document.getElementById('btnSimulatePay');
  payBtn.innerHTML = isGuest
    ? '<i class="fa-solid fa-lock"></i> Entrar para Pagar via PIX'
    : '<i class="fa-solid fa-credit-card"></i> Pagar via PIX';
};

// ── PIX modal state ───────────────────────────────────────────
let _pixTimerInterval  = null;
let _pixPollingInterval = null;

const openPixModal = (data) => {
  // QR Code imagem
  const qrWrap = document.getElementById('pixQrWrap');
  const qrImg  = document.getElementById('pixQrImg');
  if (data.qr_code_base64) {
    qrImg.src = `data:image/png;base64,${data.qr_code_base64}`;
    qrWrap.classList.remove('hidden');
  } else {
    qrWrap.classList.add('hidden');
  }

  // Chave PIX
  const keyVal = document.getElementById('pixKeyVal');
  const keyRow = document.getElementById('pixKeyRow');
  const pixKey = data.qr_code || data.pix_chave || '';
  keyVal.textContent = pixKey || '—';
  keyRow.classList.toggle('hidden', !pixKey);

  // Valor (pego do selectedBet que foi preenchido)
  document.getElementById('pixAmount').textContent = fmtMoney(S.selectedBet?.valor || 0);

  // Status
  document.getElementById('pixStatusText').textContent = 'Aguardando pagamento…';

  // Botão copiar código completo
  document.getElementById('btnPixCopyFull').onclick = () => {
    navigator.clipboard.writeText(pixKey).then(() => toast('Código copiado!', 'success'));
  };
  document.getElementById('btnPixCopy').onclick = () => {
    navigator.clipboard.writeText(pixKey).then(() => toast('Chave copiada!', 'success'));
  };

  // Countdown: expires_at ou 10 min padrão
  let deadline = data.expires_at ? new Date(data.expires_at).getTime() : (Date.now() + 10 * 60 * 1000);
  clearInterval(_pixTimerInterval);
  const timerEl  = document.getElementById('pixTimerCount');
  const timerWrap = document.getElementById('pixTimer');
  _pixTimerInterval = setInterval(() => {
    const left = deadline - Date.now();
    if (left <= 0) {
      clearInterval(_pixTimerInterval);
      timerEl.textContent = '00:00';
      timerWrap.classList.add('pix-timer--expired');
      clearInterval(_pixPollingInterval);
      return;
    }
    const m = String(Math.floor(left / 60000)).padStart(2, '0');
    const s = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
    timerWrap.classList.toggle('pix-timer--urgent', left < 2 * 60 * 1000);
  }, 1000);

  // Polling de status: a cada 5 s verifica se aposta mudou para 'confirmado'
  clearInterval(_pixPollingInterval);
  if (S.selectedBet?.id) {
    _pixPollingInterval = setInterval(async () => {
      try {
        const r = await api('/api/apostas');
        const updated = (r.apostas || []).find(b => b.id === S.selectedBet.id);
        if (updated && updated.status === 'confirmado') {
          clearInterval(_pixPollingInterval);
          clearInterval(_pixTimerInterval);
          document.getElementById('pixStatusText').textContent = '✓ Pagamento confirmado!';
          S.bets = r.apostas;
          await loadUser();
          renderBets();
          setTimeout(() => closePixModal(), 2000);
        }
      } catch { /* silencioso */ }
    }, 5000);
  }

  document.getElementById('modalPixOverlay').classList.remove('hidden');
};

const closePixModal = () => {
  clearInterval(_pixTimerInterval);
  clearInterval(_pixPollingInterval);
  document.getElementById('modalPixOverlay').classList.add('hidden');
};

const simulatePay = async () => {
  if (!S.user) {
    closeModal('modalTicket');
    showAlert('Entre ou cadastre-se para pagar — seu palpite será retomado!', 'info');
    navigate('auth');
    return;
  }

  const btn = document.getElementById('btnSimulatePay');
  btn.disabled = true; btn.textContent = 'Processando PIX...';
  try {
    const data = await api(`/api/apostas/${S.selectedBet.id}/pagar`, 'POST', {});
    S.selectedBet.valor = S.selectedBet.valor || data.valor;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> PIX gerado!';
    closeModal('modalTicket');

    if (data.gateway === 'simulado') {
      toast('Pagamento simulado! Confirme a aposta em "Meus Palpites".', 'success');
    } else {
      openPixModal(data);
    }
    await loadBets();
  } catch (err) {
    toast(err.message || 'Erro ao processar pagamento.', 'danger');
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-credit-card"></i> Pagar via PIX';
  }
};


// ── Resultado modal ───────────────────────────────────────────
const showResultado = (bet, won) => {
  const content = document.getElementById('resultadoContent');
  const nextGame = S.games.find(g => g.status === 'aberto' && g.id !== (S.selectedGame?.id));

  if (won) {
    // Confetti comemorativo
    if (typeof confetti === 'function') {
      confetti({ particleCount: 150, spread: 80, colors: ['#00C853', '#FFD700', '#ffffff'], origin: { y: 0.6 } });
    }

    content.innerHTML = `
      <span class="resultado-win__icon"><i class="fa-solid fa-trophy" style="color:var(--gold)"></i></span>
      <div class="resultado-win__title">Você Acertou!</div>
      <span class="resultado-win__amount">${fmtMoney(bet.possivel_ganho)}</span>
      <p class="resultado-win__info">O valor foi adicionado ao seu saldo.</p>
      <div class="resultado-win__btns">
        <button class="btn btn--gold btn--full btn--large" id="btnSacar"><i class="fa-solid fa-money-bill-wave"></i> Sacar Saldo</button>
        <button class="btn btn--ghost btn--full" id="btnApostarNov"><i class="fa-solid fa-futbol"></i> Apostar Novamente</button>
      </div>`;
    document.getElementById('btnSacar').addEventListener('click', () => {
      closeAllModals();
      openSaqueModal();
    });
    document.getElementById('btnApostarNov').addEventListener('click', () => {
      closeAllModals(); navigate('jogos');
    });
  } else {
    const nextHtml = nextGame
      ? `<div class="resultado-loss__next">
           <div class="resultado-loss__next-label">Próximo jogo</div>
           <div class="resultado-loss__next-game">${nextGame.time_casa} × ${nextGame.time_fora} — ${fmtDate(nextGame.data_hora)}</div>
         </div>
         <button class="btn btn--primary btn--full btn--large" id="btnTentarNovamente"><i class="fa-solid fa-bullseye"></i> Palpitar no Próximo</button>`
      : `<button class="btn btn--primary btn--full btn--large" id="btnTentarNovamente"><i class="fa-solid fa-futbol"></i> Ver Todos os Jogos</button>`;

    content.innerHTML = `
      <span class="resultado-loss__icon"><i class="fa-regular fa-face-sad-tear"></i></span>
      <div class="resultado-loss__title">Não foi dessa vez!</div>
      <p class="resultado-loss__sub">Mas você está quase lá. Tente no próximo jogo!</p>
      ${nextHtml}`;

    document.getElementById('btnTentarNovamente').addEventListener('click', () => {
      closeAllModals();
      if (nextGame) openBetModal(nextGame.id);
      else navigate('jogos');
    });
  }

  openModal('modalResultado');
};

// ── Auth ──────────────────────────────────────────────────────
const submitLogin = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Entrando...';
  try {
    await api('/api/login', 'POST', {
      email: document.getElementById('loginEmail').value,
      senha: document.getElementById('loginPassword').value,
    });
    await loadUser();
    await loadBets();

    if (S.pendingBet) {
      const pb = S.pendingBet;
      S.pendingBet = null;
      navigate('jogos');
      showAlert(`Bem-vindo, ${S.user.nome.split(' ')[0]}! Finalizando seu palpite…`, 'success');
      e.target.reset();
      setTimeout(async () => {
        try {
          const result = await api('/api/apostas', 'POST', {
            jogo_id:       pb.gameId,
            placar_casa:   pb.scoreHome,
            placar_fora:   pb.scoreAway,
            multiplicador: pb.multiplier,
          });
          S.selectedGame = S.games.find(g => g.id === pb.gameId) ?? S.selectedGame;
          S.selectedBet  = result.aposta;
          fillTicket(result.aposta);
          openModal('modalTicket');
          await loadBets();
        } catch (err) {
          toast(err.message || 'Erro ao registrar palpite.', 'danger');
        }
      }, 350);
    } else {
      navigate('jogos');
      showAlert(`Bem-vindo, ${S.user.nome.split(' ')[0]}!`, 'success');
      e.target.reset();
    }
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar →';
  }
};

const submitRegister = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Criando conta...';
  try {
    await api('/api/register', 'POST', {
      nome:  document.getElementById('registerName').value,
      email: document.getElementById('registerEmail').value,
      senha: document.getElementById('registerPassword').value,
    });
    showAlert('Conta criada! Faça login para começar.', 'success');
    // switch to login tab
    switchAuthTab('login');
    e.target.reset();
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.textContent = 'Criar conta grátis →';
  }
};

const logout = async () => {
  try { await api('/api/logout', 'POST'); } catch {}
  S.user = null; S.bets = [];
  renderHeader();
  renderBets();
  navigate('jogos');
  showAlert('Até logo!', 'info');
};

const switchAuthTab = (tab) => {
  document.getElementById('authLogin').classList.toggle('hidden', tab !== 'login');
  document.getElementById('authRegister').classList.toggle('hidden', tab !== 'register');
  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.classList.toggle('auth-tab--active', btn.dataset.authTab === tab);
  });
};

// ── Admin ─────────────────────────────────────────────────────
const ADMIN_PAGE_SIZE = 8;
let adminGamesPage = 0;

const renderAdminGames = () => {
  const listEl  = document.getElementById('adminGamesList');
  const pageEl  = document.getElementById('adminGamesPagination');
  const countEl = document.getElementById('adminGamesCount');
  if (!listEl) return;

  // Lê filtros
  const fTeam     = (document.getElementById('filterTeam')?.value || '').toLowerCase().trim();
  const fStatus   = document.getElementById('filterStatus')?.value || '';
  const fDateFrom = document.getElementById('filterDateFrom')?.value || '';
  const fDateTo   = document.getElementById('filterDateTo')?.value || '';

  const filtered = S.games.filter(g => {
    if (fTeam && !g.time_casa.toLowerCase().includes(fTeam) && !g.time_fora.toLowerCase().includes(fTeam)) return false;
    if (fStatus && g.status !== fStatus) return false;
    const d = g.data_hora ? g.data_hora.slice(0, 10) : '';
    if (fDateFrom && d < fDateFrom) return false;
    if (fDateTo   && d > fDateTo)   return false;
    return true;
  });

  const all        = [...filtered].sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));
  const total      = all.length;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  if (adminGamesPage >= totalPages) adminGamesPage = totalPages - 1;
  const page = all.slice(adminGamesPage * ADMIN_PAGE_SIZE, (adminGamesPage + 1) * ADMIN_PAGE_SIZE);

  if (countEl) countEl.textContent = `${total} jogo${total !== 1 ? 's' : ''}`;

  if (!total) {
    listEl.innerHTML = '<p class="empty-state">Nenhum jogo cadastrado ainda.</p>';
    if (pageEl) pageEl.innerHTML = '';
    return;
  }

  const statusBadge = g => gameBadge(g);

  const placar = g => {
    const casa = g.placar_casa != null ? g.placar_casa : 0;
    const fora = g.placar_fora != null ? g.placar_fora : 0;
    const isFinal = g.status === 'finalizado';
    return `<strong${isFinal ? '' : ' class="text--muted"'}>${casa} × ${fora}</strong>`;
  };

  const flagThumb = code =>
    code && /^[a-z]{2}(-[a-z]+)?$/i.test(code)
      ? `<img src="${flagUrl(code)}" alt="" style="width:1.2rem;height:auto;border-radius:2px;vertical-align:middle;margin-right:.3rem" loading="lazy" />`
      : '';

  listEl.innerHTML = `
    <table class="admin-table">
      <thead><tr>
        <th>Confronto</th>
        <th>Data</th>
        <th>Status</th>
        <th>Placar</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${page.map(g => `
          <tr>
            <td><strong>${flagThumb(g.bandeira_casa)}${g.time_casa} × ${flagThumb(g.bandeira_fora)}${g.time_fora}</strong></td>
            <td class="text--muted" style="font-size:.82rem;white-space:nowrap">${fmtDate(g.data_hora)}</td>
            <td>${statusBadge(g)}</td>
            <td>${placar(g)}</td>
            <td style="white-space:nowrap;display:flex;gap:.25rem;align-items:center">
              <button class="btn btn--ghost btn--sm" data-action="editar-jogo" data-id="${g.id}"><i class="fa-solid fa-pen"></i> Editar</button>
              ${g.status !== 'finalizado'
                ? `<button class="btn btn--ghost btn--sm" data-action="abrir-resultado" data-id="${g.id}" data-label="${g.time_casa} × ${g.time_fora}">Resultado</button>`
                : ''}
              <button class="btn btn--danger btn--sm" data-action="excluir-jogo" data-id="${g.id}" data-label="${g.time_casa} × ${g.time_fora}" title="Excluir jogo"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  if (pageEl) {
    if (totalPages <= 1) { pageEl.innerHTML = ''; return; }
    pageEl.innerHTML = `
      <div class="admin-pagination__inner">
        <button class="btn btn--ghost btn--sm" ${adminGamesPage === 0 ? 'disabled' : ''} data-action="admin-page" data-page="${adminGamesPage - 1}">‹ Anterior</button>
        <span class="text--muted" style="font-size:.82rem">Página ${adminGamesPage + 1} de ${totalPages}</span>
        <button class="btn btn--ghost btn--sm" ${adminGamesPage >= totalPages - 1 ? 'disabled' : ''} data-action="admin-page" data-page="${adminGamesPage + 1}">Próxima ›</button>
      </div>`;
  }
};

const populateAdminSelect = () => renderAdminGames();

const editGame = (id) => {
  const g = (S.games || []).find(x => x.id === id);
  if (!g) return;

  editingGameId = id;

  // Preenche times
  const homeEl = document.getElementById('adminHome');
  const awayEl = document.getElementById('adminAway');
  if (homeEl) {
    homeEl.value = g.bandeira_casa || '';
    // fallback: tenta pelo nome
    if (!homeEl.value) {
      Array.from(homeEl.options).forEach(o => { if (o.dataset.name === g.time_casa) homeEl.value = o.value; });
    }
  }
  if (awayEl) {
    awayEl.value = g.bandeira_fora || '';
    if (!awayEl.value) {
      Array.from(awayEl.options).forEach(o => { if (o.dataset.name === g.time_fora) awayEl.value = o.value; });
    }
  }

  // Dispara preview
  ['adminHome', 'adminAway'].forEach(sid => document.getElementById(sid)?.dispatchEvent(new Event('change')));

  // Data (converte 'YYYY-MM-DD HH:MM:SS' → 'YYYY-MM-DDTHH:MM')
  const dateEl = document.getElementById('adminDate');
  if (dateEl && g.data_hora) dateEl.value = g.data_hora.replace(' ', 'T').slice(0, 16);

  // Status, valor_base, odd
  const statusEl = document.getElementById('adminCreateStatus');
  if (statusEl) statusEl.value = g.status || 'aberto';
  const apiEl = document.getElementById('adminStatusApi');
  if (apiEl) apiEl.value = g.status_api || '';
  const vbEl = document.getElementById('adminValorBase');
  if (vbEl) vbEl.value = g.valor_base || '1.00';
  const oddEl = document.getElementById('adminCreateOdd');
  if (oddEl) oddEl.value = g.odd || '1.00';

  // Placar (placar_real = '2x1')
  if (g.placar_real) {
    const parts = g.placar_real.split('x');
    const sh = document.getElementById('adminCreateScoreHome');
    const sa = document.getElementById('adminCreateScoreAway');
    if (sh) sh.value = parts[0] ?? '';
    if (sa) sa.value = parts[1] ?? '';
  } else {
    document.getElementById('adminCreateScoreHome').value = '';
    document.getElementById('adminCreateScoreAway').value = '';
  }

  // UI: muda título, botão e mostra cancelar
  const titleEl  = document.getElementById('adminGameFormTitle');
  const submitEl = document.getElementById('adminGameSubmitBtn');
  const cancelEl = document.getElementById('btnCancelEditGame');
  if (titleEl)  titleEl.textContent  = '\u270f\ufe0f Editar Jogo';
  if (submitEl) submitEl.textContent = 'Salvar Altera\u00e7\u00f5es';
  if (cancelEl) cancelEl.classList.remove('hidden');

  // Scroll até o formulário
  document.getElementById('adminGameForm')?.closest('.panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const deleteGame = async (id, label) => {
  const result = await Swal.fire({
    title: 'Excluir jogo?',
    text: label,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Excluir',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#e53935',
  });
  if (!result.isConfirmed) return;
  try {
    await api(`/api/admin/jogos/${id}`, 'DELETE');
    toast('Jogo excluído com sucesso.', 'success');
    await loadGames();
    renderAdminGames();
  } catch (err) {
    toast(err.message || 'Erro ao excluir jogo.', 'danger');
  }
};

const cancelEditGame = () => {
  editingGameId = null;
  document.getElementById('adminGameForm').reset();
  const apiEl = document.getElementById('adminStatusApi');
  if (apiEl) apiEl.value = '';
  const flagReset = '<i class="fa-regular fa-flag" style="font-size:1.4rem;opacity:.4"></i>';
  ['prevFlagHome','prevFlagAway','gfFlagPreviewHome','gfFlagPreviewAway'].forEach(sid => {
    const el = document.getElementById(sid); if (el) el.innerHTML = flagReset;
  });
  const el = (sid) => document.getElementById(sid);
  if (el('prevNameHome')) el('prevNameHome').textContent = 'Casa';
  if (el('prevNameAway')) el('prevNameAway').textContent = 'Fora';
  const titleEl  = document.getElementById('adminGameFormTitle');
  const submitEl = document.getElementById('adminGameSubmitBtn');
  const cancelEl = document.getElementById('btnCancelEditGame');
  if (titleEl)  titleEl.innerHTML  = '<i class="fa-solid fa-plus"></i> Cadastrar Jogo';
  if (submitEl) submitEl.innerHTML = '<i class="fa-solid fa-plus"></i> Cadastrar Jogo';
  if (cancelEl) cancelEl.classList.add('hidden');
};

const openAdminResultado = (id, label) => {
  document.getElementById('adminGameSelect').value  = id;
  document.getElementById('adminResultadoJogo').textContent = label;
  document.getElementById('adminResultForm').reset();
  document.getElementById('adminScoreHome').value = '';
  document.getElementById('adminScoreAway').value = '';
  document.getElementById('modalAdminResultado').classList.remove('hidden');
};

const closeAdminResultado = () => {
  document.getElementById('modalAdminResultado').classList.add('hidden');
};

const submitAdminGame = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  const isEditing = editingGameId !== null;
  btn.disabled = true; btn.textContent = isEditing ? 'Salvando...' : 'Cadastrando...';
  try {
    const homeOpt = document.getElementById('adminHome');
    const awayOpt = document.getElementById('adminAway');
    const homeCode = homeOpt.value;
    const awayCode = awayOpt.value;
    const payload = {
      time_casa:     homeOpt.options[homeOpt.selectedIndex]?.dataset.name || '',
      time_fora:     awayOpt.options[awayOpt.selectedIndex]?.dataset.name || '',
      bandeira_casa: homeCode || 'br',
      bandeira_fora: awayCode || 'br',
      data_hora:     document.getElementById('adminDate').value,
      status:        document.getElementById('adminCreateStatus').value,
      status_api:    document.getElementById('adminStatusApi')?.value || '',
      placar_casa:   document.getElementById('adminCreateScoreHome').value !== '' ? parseInt(document.getElementById('adminCreateScoreHome').value, 10) : null,
      placar_fora:   document.getElementById('adminCreateScoreAway').value !== '' ? parseInt(document.getElementById('adminCreateScoreAway').value, 10) : null,
      valor_base:    parseFloat(document.getElementById('adminValorBase').value),
      odd:           parseFloat(document.getElementById('adminCreateOdd').value),
    };
    if (isEditing) {
      await api(`/api/admin/jogos/${editingGameId}`, 'PUT', payload);
      toast('Jogo atualizado com sucesso!', 'success');
    } else {
      await api('/api/admin/jogos', 'POST', payload);
      toast('Jogo cadastrado com sucesso!', 'success');
    }
    cancelEditGame();
    await loadGames();
    populateAdminSelect();
  } catch (err) {
    toast(err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = editingGameId !== null ? 'Salvar Alterações' : 'Cadastrar Jogo';
  }
};

const populateTeamSelects = () => {
  const opts = '<option value="">— selecione —</option>' +
    TEAMS.map(t => `<option value="${t.code}" data-name="${t.name}" data-code="${t.code}">${flagEmoji(t.code)} ${t.name}</option>`).join('');
  ['adminHome', 'adminAway'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.innerHTML = opts;
  });
};

const flagImg = (code, size = '2rem') =>
  code && /^[a-z]{2}(-[a-z]+)?$/i.test(code)
    ? `<img src="${flagUrl(code)}" alt="" style="width:${size};height:auto;border-radius:3px;display:block" loading="lazy" />`
    : '<span style="font-size:1.4rem">&#127937;</span>';

const setupGameFormPreview = () => {
  const el = id => document.getElementById(id);
  const codeOf = id => {
    const sel = el(id);
    return sel?.value || '';
  };
  const nameOf = id => {
    const sel = el(id);
    return sel?.options[sel.selectedIndex]?.dataset.name || (id === 'adminHome' ? 'Casa' : 'Fora');
  };
  const update = () => {
    const homeCode = codeOf('adminHome');
    const awayCode = codeOf('adminAway');
    const nh = nameOf('adminHome');
    const na = nameOf('adminAway');
    if (el('prevFlagHome'))      el('prevFlagHome').innerHTML      = flagImg(homeCode, '1.6rem');
    if (el('prevFlagAway'))      el('prevFlagAway').innerHTML      = flagImg(awayCode, '1.6rem');
    if (el('prevNameHome'))      el('prevNameHome').textContent      = nh;
    if (el('prevNameAway'))      el('prevNameAway').textContent      = na;
    if (el('gfFlagPreviewHome')) el('gfFlagPreviewHome').innerHTML = flagImg(homeCode, '3rem');
    if (el('gfFlagPreviewAway')) el('gfFlagPreviewAway').innerHTML = flagImg(awayCode, '3rem');
  };
  ['adminHome', 'adminAway'].forEach(id => el(id)?.addEventListener('change', update));
};

const importFromApi = async () => {
  const btn      = document.getElementById('btnImport');
  const resultEl = document.getElementById('importResult');
  const leagueId = Number(document.getElementById('importLeague').value);
  const status   = document.getElementById('importStatus').value;

  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando...';
  resultEl.innerHTML = '';

  try {
    const res = await api('/api/admin/import', 'POST', { league_id: leagueId, status });
    resultEl.innerHTML = `<div class="alert alert--success">${res.message}</div>`;
    await loadGames();
    populateAdminSelect();
  } catch (err) {
    resultEl.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> Importar Jogos';
  }
};

const syncResults = async () => {
  const btn      = document.getElementById('btnSync');
  const resultEl = document.getElementById('importResult');

  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';
  if (resultEl) resultEl.innerHTML = '';

  try {
    const res = await api('/api/admin/sync', 'POST', {});
    toast(res.message ?? 'Sincronização concluída!', 'success');
    await loadGames();
    await loadBets();
    await renderRanking();
    populateAdminSelect();
  } catch (err) {
    toast(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Sincronizar Resultados';
  }
};

const submitAdminResult = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  const id  = Number(document.getElementById('adminGameSelect').value);
  if (!id) { toast('Selecione um jogo.', 'warning'); return; }

  const jogo    = (S.games || []).find(g => g.id === id);
  const nomeCasa = jogo?.time_casa ?? 'Casa';
  const nomeFora = jogo?.time_fora ?? 'Fora';
  const placarCasa = document.getElementById('adminScoreHome').value;
  const placarFora = document.getElementById('adminScoreAway').value;

  const ok = await confirm({
    icon:         'warning',
    title:        'Registrar resultado?',
    html:         `<strong>${nomeCasa} ${placarCasa} × ${placarFora} ${nomeFora}</strong><br><small style="color:#888">Esta ação processará todas as apostas e <b>não pode ser desfeita</b>.</small>`,
    confirmText:  'Sim, registrar',
    cancelText:   'Cancelar',
    confirmColor: '#2ecc71',
  });
  if (!ok) return;

  btn.disabled = true; btn.textContent = 'Registrando...';
  try {
    await api(`/api/admin/jogos/${id}/resultado`, 'POST', {
      placar_casa: Number(placarCasa),
      placar_fora: Number(placarFora),
    });
    toast('Resultado registrado e apostas processadas!', 'success');
    closeAdminResultado();
    await loadGames();
    await loadBets();
    await renderRanking();
  } catch (err) {
    toast(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.textContent = 'Registrar Resultado';
  }
};

// ── Data loaders ──────────────────────────────────────────────
const loadCsrf = async () => {
  try {
    const r = await api('/api/csrf');
    S.csrf = r.token;
    console.debug('CSRF token loaded', S.csrf);
  } catch (err) {
    console.warn('Falha ao carregar CSRF token', err);
  }
};

const loadUser = async () => {
  try {
    const r = await api('/api/user');
    S.user = r.user;
  } catch {
    S.user = null;
  }
  renderHeader();
};

const loadGames = async () => {
  const skel = document.getElementById('gamesSkeletons');
  const grid = document.getElementById('gamesGrid');
  if (skel) skel.classList.remove('hidden');
  if (grid) grid.innerHTML = '';
  try {
    const r = await api('/api/jogos');
    S.games = r.jogos;
  } catch {
    S.games = [];
  }
  if (skel) skel.classList.add('hidden');
  renderGames();
};

const loadBets = async () => {
  if (!S.user) { S.bets = []; renderBets(); return; }
  try {
    const r = await api('/api/apostas');
    const prev = S.bets || [];
    S.bets = r.apostas;

    // Detecta mudanças para 'ganhou' ou 'perdido' e mostra resultado
    S.bets.forEach(b => {
      const old = prev.find(p => p.id === b.id);
      if (old && old.status !== b.status && (b.status === 'ganhou' || b.status === 'perdido')) {
        showResultado(b, b.status === 'ganhou');
      }
    });
  } catch {
    S.bets = [];
  }
  renderBets();
};

// ── Saque ─────────────────────────────────────────────────────
const openSaqueModal = async () => {
  const saldo = parseFloat(S.user?.saldo || 0);
  document.getElementById('saqueDispSaldo').textContent = fmtMoney(saldo);
  document.getElementById('saqueValor').value = '';
  document.getElementById('saqueChave').value = '';
  document.getElementById('saqueTipo').value  = '';
  document.getElementById('modalSaqueOverlay').classList.remove('hidden');
  await loadSaques();
};

const closeSaqueModal = () => {
  document.getElementById('modalSaqueOverlay').classList.add('hidden');
};

const loadSaques = async () => {
  if (!S.user) return;
  try {
    const r = await api('/api/user/saques');
    S.saques = r.saques || [];
  } catch {
    S.saques = [];
  }
};

const submitSaque = async (e) => {
  e.preventDefault();
  const btn   = document.getElementById('btnSaqueSubmit');
  const valor = parseFloat(document.getElementById('saqueValor').value);
  const tipo  = document.getElementById('saqueTipo').value;
  const chave = document.getElementById('saqueChave').value.trim();

  if (!valor || valor < 10) { toast('Valor mínimo de saque é R$ 10,00.', 'warning'); return; }
  if (!tipo)                 { toast('Selecione o tipo de chave PIX.', 'warning'); return; }
  if (!chave)                { toast('Informe a chave PIX.', 'warning'); return; }

  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    const r = await api('/api/user/saques', 'POST', { valor, tipo_pix: tipo, chave_pix: chave });
    toast(r.message || 'Solicitação enviada!', 'success');
    closeSaqueModal();
    await loadUser();
  } catch (err) {
    toast(err.message || 'Erro ao solicitar saque.', 'danger');
  } finally {
    btn.disabled = false; btn.textContent = 'Solicitar saque';
  }
};

// ── Event binding ─────────────────────────────────────────────
const bind = () => {
  // Nav — cobre header, drawer e qualquer outro elemento com data-nav
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    navigate(btn.dataset.nav);
    if (btn.dataset.nav === 'palpites')   loadBets();
    if (btn.dataset.nav === 'ganhadores') renderRanking();
    if (btn.dataset.nav === 'admin')      populateAdminSelect();
    closeMobileMenu();
    document.getElementById('userDropdown')?.classList.remove('udrop--open');
  });

  // Logo
  document.querySelector('.logo')?.addEventListener('click', e => { e.preventDefault(); navigate('jogos'); });

  // User dropdown — toggle, outside-click close, nav items, logout
  document.addEventListener('click', e => {
    const dropdown = document.getElementById('userDropdown');
    if (!dropdown) return;
    if (e.target.closest('#userDropdownBtn')) {
      e.stopPropagation();
      dropdown.classList.toggle('udrop--open');
      return;
    }
    if (!e.target.closest('#userDropdown')) dropdown.classList.remove('udrop--open');
  });

  document.addEventListener('click', e => {
    const item = e.target.closest('[data-udrop-nav]');
    if (!item) return;
    const view = item.dataset.udropNav;
    navigate(view);
    document.getElementById('userDropdown')?.classList.remove('udrop--open');
    if (view === 'palpites')   loadBets();
    if (view === 'ganhadores') renderRanking();
    if (view === 'admin')      populateAdminSelect();
  });

  document.addEventListener('click', e => {
    if (e.target.closest('#dropdownLogout')) logout();
    if (e.target.closest('#udropBtnSaque')) { openSaqueModal(); }
  });

  // Game grid actions (bet / pay / confirm) via delegation
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'bet')     openBetModal(id);
    if (action === 'pay')     { S.selectedBet = { id: Number(id) }; openModal('modalTicket'); }
    if (action === 'confirm') {
      const betId = Number(id);
      api(`/api/apostas/${betId}/confirmar`, 'POST', {})
        .then(async () => {
          toast('Aposta confirmada!', 'success');
          await loadUser();
          await loadBets();
        })
        .catch(err => toast(err.message || 'Erro ao confirmar.', 'danger'));
    }
  });

  // "Ver mais" section expansion
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-show-more');
    if (!btn) return;
    const sid   = btn.dataset.sid;
    const games = _sectionReg[sid];
    const grid  = document.getElementById(`gs-grid-${sid}`);
    if (!grid || !games) return;
    const shown = grid.querySelectorAll('.game-card').length;
    grid.insertAdjacentHTML('beforeend', games.slice(shown).map(renderCard).join(''));
    btn.remove();
    startCountdowns();
    startLiveClocks();
  });

  // Modal close via backdrop or × button
  document.addEventListener('click', e => {
    const target = e.target;
    if (target.dataset.close) closeModal(target.dataset.close);
    if (target.classList.contains('modal__backdrop') && !target.dataset.close) closeAllModals();
  });

  // Score counter buttons
  document.getElementById('modalPalpite').addEventListener('click', e => {
    const btn = e.target.closest('.score-btn');
    if (!btn) return;
    const dir  = Number(btn.dataset.dir);
    const side = btn.dataset.score;
    if (side === 'home') S.scoreHome = Math.max(0, S.scoreHome + dir);
    if (side === 'away') S.scoreAway = Math.max(0, S.scoreAway + dir);
    document.getElementById('scoreHome').textContent = S.scoreHome;
    document.getElementById('scoreAway').textContent = S.scoreAway;
    updateBetPreview();
  });

  // Multiplier slider
  document.getElementById('multiplierSlider').addEventListener('input', e => {
    S.multiplier = Number(e.target.value);
    updateBetPreview();
  });

  // Confirm bet button
  document.getElementById('btnConfirmBet').addEventListener('click', submitBet);

  // Ticket payment buttons
  document.getElementById('btnSimulatePay').addEventListener('click', simulatePay);

  // PIX modal
  document.getElementById('btnPixClose')?.addEventListener('click', closePixModal);
  document.getElementById('modalPixOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modalPixOverlay')) closePixModal();
  });

  // Saque modal
  document.getElementById('btnSaqueClose')?.addEventListener('click', closeSaqueModal);
  document.getElementById('modalSaqueOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modalSaqueOverlay')) closeSaqueModal();
  });
  document.getElementById('formSaque')?.addEventListener('submit', submitSaque);

  // Mobile drawer — delegado para cobrir botões gerados dinamicamente
  document.addEventListener('click', e => {
    if (e.target.closest('.btn-theme-toggle')) toggleTheme();
  });
  document.getElementById('btnMobileMenu')?.addEventListener('click', openMobileMenu);
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="close-mobile-menu"]');
    if (btn) closeMobileMenu();
  });

  // Auth forms
  document.getElementById('loginForm').addEventListener('submit', submitLogin);
  document.getElementById('registerForm').addEventListener('submit', submitRegister);

  // Auth tab switcher
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAuthTab(tab.dataset.authTab));
  });

  // Config tabs switcher
  document.querySelectorAll('.config-tab').forEach(tab => {
    tab.addEventListener('click', () => switchConfigTab(tab.dataset.configTab));
  });

  // Media picker: upload de logo
  document.getElementById('logoFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) uploadLogo(file);
    e.target.value = ''; // permite selecionar o mesmo arquivo novamente
  });

  // Media picker: botão remover
  document.getElementById('logoPickerRemove')?.addEventListener('click', () => removeLogo());

  // Arrastar & soltar no picker
  const picker = document.getElementById('logoPicker');
  if (picker) {
    picker.addEventListener('dragover', (e) => { e.preventDefault(); picker.classList.add('media-picker--drag'); });
    picker.addEventListener('dragleave', () => picker.classList.remove('media-picker--drag'));
    picker.addEventListener('drop', (e) => {
      e.preventDefault();
      picker.classList.remove('media-picker--drag');
      const file = e.dataTransfer.files?.[0];
      if (file) uploadLogo(file);
    });
  }

  // Admin forms
  document.getElementById('adminGameForm').addEventListener('submit', submitAdminGame);
  document.getElementById('adminResultForm').addEventListener('submit', submitAdminResult);
  populateTeamSelects();
  setupGameFormPreview();

  // Filtros da lista de jogos
  ['filterTeam', 'filterStatus', 'filterDateFrom', 'filterDateTo'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => { adminGamesPage = 0; renderAdminGames(); });
    document.getElementById(id)?.addEventListener('change', () => { adminGamesPage = 0; renderAdminGames(); });
  });
  document.getElementById('btnClearFilter')?.addEventListener('click', () => {
    ['filterTeam', 'filterStatus', 'filterDateFrom', 'filterDateTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    adminGamesPage = 0;
    renderAdminGames();
  });

  // Admin sidebar tabs
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-admin-tab]');
    if (btn) switchAdminTab(btn.dataset.adminTab);
  });

  // Admin games list — editar + resultado + paginação + fechar modal
  document.getElementById('adminGamesList')?.addEventListener('click', e => {
    const editBtn = e.target.closest('[data-action="editar-jogo"]');
    if (editBtn) { editGame(Number(editBtn.dataset.id)); return; }
    const btn = e.target.closest('[data-action="abrir-resultado"]');
    if (btn) openAdminResultado(Number(btn.dataset.id), btn.dataset.label);
    const delBtn = e.target.closest('[data-action="excluir-jogo"]');
    if (delBtn) { deleteGame(Number(delBtn.dataset.id), delBtn.dataset.label); return; }
  });
  document.getElementById('btnCancelEditGame')?.addEventListener('click', cancelEditGame);
  document.getElementById('adminGamesPagination')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="admin-page"]');
    if (btn && !btn.disabled) { adminGamesPage = Number(btn.dataset.page); renderAdminGames(); }
  });
  document.addEventListener('click', e => {
    if (e.target.closest('[data-close="modalAdminResultado"]')) closeAdminResultado();
  });

  // Block / unblock user via event delegation
  document.getElementById('adminUsersList')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action][data-uid]');
    if (!btn) return;
    handleBlockUser(Number(btn.dataset.uid), btn.dataset.action === 'block');
  });

  // Filtro de apostas
  document.getElementById('btnFilterBets')?.addEventListener('click', fetchAdminBets);
  document.getElementById('btnClearBetFilter')?.addEventListener('click', () => {
    const g = document.getElementById('filterBetGame');
    const s = document.getElementById('filterBetStatus');
    if (g) g.value = ''; if (s) s.value = '';
    fetchAdminBets();
  });

  // Filtro de usuários (client-side)
  const applyUserFilter = () => {
    const term   = (document.getElementById('filterUser')?.value || '').toLowerCase();
    const status = document.getElementById('filterUserStatus')?.value || '';
    document.querySelectorAll('#adminUsersList .admin-table tbody tr').forEach(row => {
      const matchText   = !term   || row.textContent.toLowerCase().includes(term);
      const matchStatus = !status || (row.dataset.status || '') === status;
      row.style.display = matchText && matchStatus ? '' : 'none';
    });
  };
  document.getElementById('filterUser')?.addEventListener('input', applyUserFilter);
  document.getElementById('filterUserStatus')?.addEventListener('change', applyUserFilter);

  // Botão refresh dashboard
  document.getElementById('btnRefreshDash')?.addEventListener('click', loadAdminDashboard);

  // Config form
  document.getElementById('adminConfigForm')?.addEventListener('submit', submitAdminConfig);

  // Import / Sync (botões dentro da aba Jogos)
  document.getElementById('btnImport')?.addEventListener('click', importFromApi);
  document.getElementById('btnSync')?.addEventListener('click', syncResults);
};

// ── Admin helpers ─────────────────────────────────────────────
const fmtR$ = (n) => `R$ ${parseFloat(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const statusPill = (s) => {
  const labels = {
    pendente: 'Pendente', pago: 'Pago', confirmado: 'Confirmado',
    ganhou: 'Ganhou <i class="fa-solid fa-check"></i>', perdido: 'Perdeu <i class="fa-solid fa-x"></i>',
    ativo: 'Ativo', bloqueado: 'Bloqueado',
  };
  return `<span class="status-pill status-pill--${s}">${labels[s] || s}</span>`;
};

// ── Admin tab navigation ──────────────────────────────────────
const switchAdminTab = (tab) => {
  document.querySelectorAll('.admin-tab').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.admin-nav__btn').forEach(btn => {
    btn.classList.toggle('admin-nav__btn--active', btn.dataset.adminTab === tab);
  });
  document.getElementById(`atab-${tab}`)?.classList.remove('hidden');

  history.replaceState(null, '', `/#admin/${tab}`);

  if (tab === 'dashboard') loadAdminDashboard();
  if (tab === 'usuarios')  loadAdminUsers();
  if (tab === 'apostas')   loadAdminBets();
  if (tab === 'config')    loadAdminConfig();
  if (tab === 'jogos')     populateAdminSelect();
};

// ── Dashboard ─────────────────────────────────────────────────
const loadAdminDashboard = async () => {
  const statsEl   = document.getElementById('dashStats');
  const recentEl  = document.getElementById('dashRecentes');
  const byGameEl  = document.getElementById('dashPorJogo');
  statsEl.innerHTML = '<p class="text--muted">Carregando...</p>';

  try {
    const { stats, recentes, por_jogo } = await api('/api/admin/dashboard');

    statsEl.innerHTML = [
      { label: 'Usuários',        value: stats.total_usuarios,        cls: '' },
      { label: 'Total apostas',   value: stats.total_apostas,         cls: '' },
      { label: 'Volume apostado', value: fmtR$(stats.volume_apostado), cls: 'info' },
      { label: 'Prêmios pagos',   value: fmtR$(stats.volume_pago),     cls: 'danger' },
      { label: 'Margem da casa',  value: fmtR$(stats.margem_casa),     cls: 'green' },
      { label: 'Apostas ganhas',  value: stats.apostas_ganhas,         cls: 'green' },
      { label: 'Pendentes pag.',  value: stats.apostas_pendentes,      cls: 'gold' },
      { label: 'Jogos abertos',   value: stats.jogos_abertos,          cls: '' },
    ].map(c => `
      <div class="dash-card ${c.cls ? `dash-card--${c.cls}` : ''}">
        <div class="dash-card__label">${c.label}</div>
        <div class="dash-card__value ${c.cls ? `dash-card__value--${c.cls}` : ''}">${c.value}</div>
      </div>`).join('');

    recentEl.innerHTML = recentes.length
      ? `<table class="admin-table">
           <thead><tr><th>#</th><th>Usuário</th><th>Jogo</th><th>Valor</th><th>Status</th></tr></thead>
           <tbody>${recentes.map(b => `
             <tr>
               <td>#${b.id}</td>
               <td>${b.usuario}</td>
               <td>${b.time_casa} × ${b.time_fora}</td>
               <td>${fmtR$(b.valor)}</td>
               <td>${statusPill(b.status)}</td>
             </tr>`).join('')}
           </tbody>
         </table>`
      : '<p class="text--muted">Nenhuma aposta ainda.</p>';

    byGameEl.innerHTML = por_jogo.length
      ? `<table class="admin-table">
           <thead><tr><th>Jogo</th><th>Apostas</th><th>Arrecadado</th><th>Pago</th><th>Pendentes</th></tr></thead>
           <tbody>${por_jogo.map(g => `
             <tr>
               <td>${g.time_casa} × ${g.time_fora}</td>
               <td>${g.total_apostas}</td>
               <td>${fmtR$(g.arrecadado)}</td>
               <td>${fmtR$(g.pago)}</td>
               <td>${g.pendentes > 0 ? `<span class="status-pill status-pill--pendente">${g.pendentes}</span>` : '0'}</td>
             </tr>`).join('')}
           </tbody>
         </table>`
      : '<p class="text--muted">Nenhum jogo cadastrado.</p>';

  } catch (err) {
    statsEl.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  }
};

// ── Usuários ──────────────────────────────────────────────────
const loadAdminUsers = async () => {
  const el = document.getElementById('adminUsersList');
  el.innerHTML = '<p class="text--muted">Carregando...</p>';
  try {
    const { usuarios } = await api('/api/admin/usuarios');
    const countEl = document.getElementById('adminUsersCount');
    if (countEl) countEl.textContent = `${usuarios.length} usuário${usuarios.length !== 1 ? 's' : ''}`;
    if (!usuarios.length) { el.innerHTML = '<p class="text--muted">Nenhum usuário.</p>'; return; }

    el.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr><th>#</th><th>Nome</th><th>Email</th><th>Saldo</th><th>Apostas</th><th>Ganhas</th><th>Status</th><th>Ações</th></tr>
        </thead>
        <tbody>
          ${usuarios.map(u => `
            <tr data-status="${u.bloqueado == 1 ? 'bloqueado' : 'ativo'}">
              <td>${u.id}</td>
              <td>${u.nome}</td>
              <td>${u.email}</td>
              <td>${fmtR$(u.saldo)}</td>
              <td>${u.total_apostas}</td>
              <td>${u.apostas_ganhas}</td>
              <td>${statusPill(u.bloqueado == 1 ? 'bloqueado' : 'ativo')}</td>
              <td>
                ${u.bloqueado == 1
                  ? `<button class="btn btn--primary btn--sm" data-action="unblock" data-uid="${u.id}">Desbloquear</button>`
                  : `<button class="btn btn--danger  btn--sm" data-action="block"   data-uid="${u.id}">Bloquear</button>`
                }
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    el.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  }
};

const handleBlockUser = async (uid, block) => {
  const action = block ? 'bloquear' : 'desbloquear';
  const ok = await confirm({
    icon:        block ? 'warning' : 'question',
    title:       block ? 'Bloquear usuário?' : 'Desbloquear usuário?',
    html:        block
      ? 'O usuário <b>não conseguirá fazer login</b> enquanto estiver bloqueado.'
      : 'O usuário voltará a ter acesso normalmente.',
    confirmText:  block ? 'Bloquear' : 'Desbloquear',
    cancelText:  'Cancelar',
    confirmColor: block ? '#e63946' : '#2ecc71',
  });
  if (!ok) return;

  try {
    await api(`/api/admin/usuarios/${uid}/${action}`, 'POST', {});
    toast(block ? 'Usuário bloqueado.' : 'Usuário desbloqueado.', 'success');
    loadAdminUsers();
  } catch (err) {
    toast(err.message, 'danger');
  }
};

// ── Admin Apostas ─────────────────────────────────────────────
const loadAdminBets = async () => {
  // popular filtro de jogos
  const sel = document.getElementById('filterBetGame');
  if (sel && S.games.length) {
    sel.innerHTML = '<option value="">Todos os jogos</option>' +
      S.games.map(g => `<option value="${g.id}">${g.time_casa} × ${g.time_fora}</option>`).join('');
  }
  await fetchAdminBets();
};

const fetchAdminBets = async () => {
  const el     = document.getElementById('adminBetsList');
  const jogoId = document.getElementById('filterBetGame')?.value || '';
  const status = document.getElementById('filterBetStatus')?.value || '';
  el.innerHTML = '<p class="text--muted">Carregando...</p>';

  const params = new URLSearchParams();
  if (jogoId) params.set('jogo_id', jogoId);
  if (status) params.set('status', status);

  try {
    const { apostas } = await api(`/api/admin/apostas?${params}`);
    const countEl = document.getElementById('adminBetsCount');
    if (countEl) countEl.textContent = `${apostas.length} aposta${apostas.length !== 1 ? 's' : ''}`;
    if (!apostas.length) { el.innerHTML = '<p class="text--muted">Nenhuma aposta encontrada.</p>'; return; }

    el.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr><th>#</th><th>Usuário</th><th>Jogo</th><th>Palpite</th><th>Valor</th><th>Mult.</th><th>Prêmio</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${apostas.map(b => `
            <tr>
              <td>#${b.id}</td>
              <td>${b.usuario}</td>
              <td>${b.time_casa} × ${b.time_fora}</td>
              <td>${b.placar_casa} × ${b.placar_fora}</td>
              <td>${fmtR$(b.valor)}</td>
              <td>${parseFloat(b.multiplicador).toFixed(0)}×</td>
              <td>${fmtR$(b.possivel_ganho)}</td>
              <td>${statusPill(b.status)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    el.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  }
};

// ── Configurações ─────────────────────────────────────────────
const loadAdminConfig = async () => {
  const statusEl = document.getElementById('configStatus');
  try {
    const { config } = await api('/api/admin/config');
    const set = (id, key) => {
      const el = document.getElementById(id);
      if (el && config[key]) el.value = config[key].valor;
    };
    set('cfg_site_nome',                 'site_nome');
    set('cfg_site_emoji',                'site_emoji');
    // Atualizar media picker com o logo atual
    const currentLogo = config['site_logo']?.valor || '';
    setLogoPickerState(currentLogo);
    set('cfg_site_title',                'site_title');
    set('cfg_site_description',          'site_description');
    set('cfg_site_keywords',             'site_keywords');
    set('cfg_admin_email',               'admin_email');
    set('cfg_maintenance_mode',          'maintenance_mode');
    set('cfg_user_registration_enabled', 'user_registration_enabled');
    set('cfg_api_football_key',          'api_football_key');
    set('cfg_api_football_timezone',     'api_football_timezone');
    set('cfg_pix_tipo',                  'pix_tipo');
    set('cfg_pix_chave',                 'pix_chave');
    set('cfg_pix_nome',                  'pix_nome');
    set('cfg_bonus_cadastro',            'bonus_cadastro');
    set('cfg_valor_base_padrao',         'valor_base_padrao');
    set('cfg_mult_min',                  'mult_min');
    set('cfg_mult_max',                  'mult_max');
    set('cfg_bet_percent',               'bet_percent');
    set('cfg_max_aposta',                'max_aposta');
    set('cfg_max_ganho',                 'max_ganho');
    set('cfg_saques_ativos',             'saques_ativos');
  } catch (err) {
    statusEl && (statusEl.innerHTML = `<div class="alert alert--danger">${err.message}</div>`);
  }
};

const switchConfigTab = (tab) => {
  document.querySelectorAll('.config-tab').forEach(btn => {
    btn.classList.toggle('config-tab--active', btn.dataset.configTab === tab);
  });
  document.querySelectorAll('.config-panel').forEach(panel => {
    panel.classList.toggle('config-panel--active', panel.dataset.configPanel === tab);
  });
};

const submitAdminConfig = async (e) => {
  e.preventDefault();
  const btn      = e.target.querySelector('button[type=submit]');
  const statusEl = document.getElementById('configStatus');
  btn.disabled = true; btn.textContent = '⏳ Salvando...';
  statusEl.innerHTML = '';

  const get = (id) => document.getElementById(id)?.value ?? '';
  try {
    const res = await api('/api/admin/config', 'POST', {
      site_nome:                 get('cfg_site_nome'),
      site_emoji:                get('cfg_site_emoji'),
      site_title:                get('cfg_site_title'),
      site_description:          get('cfg_site_description'),
      site_keywords:             get('cfg_site_keywords'),
      admin_email:               get('cfg_admin_email'),
      maintenance_mode:          get('cfg_maintenance_mode'),
      user_registration_enabled: get('cfg_user_registration_enabled'),
      api_football_key:          get('cfg_api_football_key'),
      api_football_timezone:     get('cfg_api_football_timezone'),
      pix_tipo:                  get('cfg_pix_tipo'),
      pix_chave:                 get('cfg_pix_chave'),
      pix_nome:                  get('cfg_pix_nome'),
      bonus_cadastro:            get('cfg_bonus_cadastro'),
      valor_base_padrao:         get('cfg_valor_base_padrao'),
      mult_min:                  get('cfg_mult_min'),
      mult_max:                  get('cfg_mult_max'),
      bet_percent:               get('cfg_bet_percent'),
      max_aposta:                get('cfg_max_aposta'),
      max_ganho:                 get('cfg_max_ganho'),
      saques_ativos:             get('cfg_saques_ativos'),
    });
    toast(res.message ?? 'Configurações salvas!', 'success');
    // O logo já foi aplicado no momento do upload — não precisa refazer aqui
  } catch (err) {
    toast(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Configurações';
  }
};

// ── Live polling ──────────────────────────────────────────────
const POLL_INTERVAL = 60_000; // 60s

const loadGamesSilent = async () => {
  try {
    const r = await api('/api/jogos');
    S.games = r.jogos;
    renderGames();
    if (S.user) await loadBets();
  } catch { /* ignora erros silenciosos */ }
};

const startLivePoll = () => {
  if (S.pollTimer) return;
  S.pollTimer = setInterval(async () => {
    await loadGamesSilent();
    if (!S.games.some(isGameLive)) stopLivePoll();
  }, POLL_INTERVAL);
};

const stopLivePoll = () => {
  clearInterval(S.pollTimer);
  S.pollTimer = null;
};

// ── Media Picker: Logo ────────────────────────────────────────

// Sincroniza o estado visual do picker com uma URL (ou vazio)
const setLogoPickerState = (url) => {
  const empty   = document.getElementById('logoPickerEmpty');
  const preview = document.getElementById('logoPickerPreview');
  const img     = document.getElementById('logoPickerImg');
  const btnLbl  = document.getElementById('logoPickerBtnLabel');
  if (!empty || !preview) return;

  if (url) {
    img.src = url;
    empty.classList.add('hidden');
    preview.classList.remove('hidden');
    if (btnLbl) btnLbl.textContent = 'Trocar imagem';
  } else {
    img.src = '';
    preview.classList.add('hidden');
    empty.classList.remove('hidden');
    if (btnLbl) btnLbl.textContent = 'Enviar imagem';
  }
};

const setLogoPickerStatus = (msg, isError = false) => {
  const el = document.getElementById('logoPickerStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'media-picker__status' + (isError ? ' media-picker__status--error' : '');
  if (msg) setTimeout(() => { el.textContent = ''; el.className = 'media-picker__status'; }, 4000);
};

const uploadLogo = async (file) => {
  const picker = document.getElementById('logoPicker');
  picker?.classList.add('media-picker--loading');
  setLogoPickerStatus('Enviando...');

  try {
    const formData = new FormData();
    formData.append('logo', file);
    formData.append('csrf_token', S.csrf || '');

    const res = await fetch('/api/admin/upload-logo', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao enviar logo');

    setLogoPickerState(data.url);
    applyBrandLogo(data.url);
    setLogoPickerStatus('Logo salvo!');
    toast('Logo atualizado com sucesso.', 'success');
  } catch (err) {
    setLogoPickerStatus(err.message, true);
    toast(err.message, 'danger');
  } finally {
    picker?.classList.remove('media-picker--loading');
  }
};

const removeLogo = async () => {
  if (!await confirm('Remover o logo?', 'O ícone padrão será exibido no lugar.')) return;
  const picker = document.getElementById('logoPicker');
  picker?.classList.add('media-picker--loading');

  try {
    const res  = await api('/api/admin/delete-logo', 'POST', {});
    setLogoPickerState('');
    applyBrandLogo('');
    toast(res.message || 'Logo removido.', 'success');
  } catch (err) {
    toast(err.message, 'danger');
  } finally {
    picker?.classList.remove('media-picker--loading');
  }
};

// ── Init (continuação) ────────────────────────────────────────

// Aplica (ou remove) o logo de imagem nos 3 pontos de marca
const applyBrandLogo = (url) => {
  const ids = ['brandLogoHeader', 'brandLogoDrawer', 'brandLogoFooter'];
  ids.forEach(id => {
    const img  = document.getElementById(id);
    if (!img) return;
    const text = img.nextElementSibling; // .brand-logo-text
    if (url) {
      img.src = url;
      img.classList.remove('hidden');
      text?.classList.add('hidden');
    } else {
      img.classList.add('hidden');
      img.src = '';
      text?.classList.remove('hidden');
    }
  });
};

const loadBetConfig = async () => {
  try {
    const cfg = await api('/api/config/bets');
    S.multMin    = cfg.mult_min    || 1;
    S.multMax    = cfg.mult_max    || 100;
    S.betPercent = cfg.bet_percent || 10;
    if (S.multiplier < S.multMin) S.multiplier = S.multMin;
    if (S.multiplier > S.multMax) S.multiplier = S.multMax;
    applyBrandLogo(cfg.site_logo || '');
  } catch (_) { /* usa defaults */ }
};

// Draws a soccer ball: white sphere + classic black pentagonal patches
const drawBall = (ctx, x, y, r) => {
  // Base sphere: white fill + subtle shadow
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#f5f5f5';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.lineWidth = r * 0.08;
  ctx.stroke();

  // Classic 5-patch pentagon pattern (simplified as one center + 5 triangular wedges)
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip(); // keep patches inside the ball

  ctx.fillStyle = 'rgba(15,15,15,.82)';

  // Central pentagon
  const penta = (cx, cy, rad, rot = 0) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = rot + (i * Math.PI * 2) / 5 - Math.PI / 2;
      i === 0 ? ctx.moveTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a))
              : ctx.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();
  };

  penta(x, y, r * 0.35);

  // 5 outer pentagons (classic ball positions)
  for (let i = 0; i < 5; i++) {
    const a   = (i * Math.PI * 2) / 5 - Math.PI / 2;
    const d   = r * 0.68;
    penta(x + d * Math.cos(a), y + d * Math.sin(a), r * 0.28, a + Math.PI / 5);
  }

  ctx.restore();
};

// Draws a 5-pointed star
const drawStar = (ctx, x, y, r) => {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a    = (i * Math.PI) / 5 - Math.PI / 2;
    const dist = i % 2 === 0 ? r : r * 0.42;
    i === 0 ? ctx.moveTo(x + dist * Math.cos(a), y + dist * Math.sin(a))
            : ctx.lineTo(x + dist * Math.cos(a), y + dist * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = '#FFD700';
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,120,0,.5)';
  ctx.lineWidth = r * 0.1;
  ctx.stroke();
};

const initHeroParticles = () => {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const resize = () => {
    canvas.width  = canvas.offsetWidth  || canvas.parentElement.offsetWidth;
    canvas.height = canvas.offsetHeight || canvas.parentElement.offsetHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  // 70% bolas, 30% estrelas
  const mkParticle = () => {
    const isBall = Math.random() < 0.70;
    return {
      x:    Math.random() * canvas.width,
      y:    Math.random() * canvas.height,
      r:    isBall ? Math.random() * 8 + 5        // bola: 5–13 px
                   : Math.random() * 5 + 4,        // estrela: 4–9 px
      vx:   (Math.random() - .5) * 0.3,
      vy:   -(Math.random() * 0.45 + 0.12),
      rot:  Math.random() * Math.PI * 2,
      vrot: (Math.random() - .5) * 0.018,
      alpha: Math.random() * 0.5,
      kind: isBall ? 'ball' : 'star',
    };
  };

  const particles = Array.from({ length: 28 }, mkParticle);

  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.x     += p.vx;
      p.y     += p.vy;
      p.rot   += p.vrot;
      p.alpha += 0.003;

      if (p.y < -(p.r * 2)) {
        Object.assign(p, mkParticle(), { y: canvas.height + p.r * 2, alpha: 0 });
      }
      if (p.x < -(p.r * 2))                p.x = canvas.width  + p.r * 2;
      if (p.x >  canvas.width  + p.r * 2)  p.x = -(p.r * 2);

      const fadeTop = Math.min(1, p.y / (canvas.height * 0.2));
      const opacity = Math.min(p.alpha, 0.65) * fadeTop;
      if (opacity <= 0.01) return;

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.kind === 'ball') drawBall(ctx, 0, 0, p.r);
      else                   drawStar(ctx, 0, 0, p.r);
      ctx.restore();
    });

    requestAnimationFrame(tick);
  };

  tick();
};

const init = async () => {
  loadTheme();
  initHeroParticles();
  bind();
  await loadCsrf();
  await Promise.all([loadUser(), loadBetConfig()]);
  await loadGames();
  if (S.user) await loadBets();

  // Restaura rota do hash após tudo carregado
  const hash = location.hash.replace('#', '') || location.pathname.replace(/^\//, '');
  if (hash.startsWith('admin/')) {
    const tab = hash.replace('admin/', '') || 'dashboard';
    const validTabs = ['dashboard', 'jogos', 'apostas', 'usuarios', 'config'];
    navigate('admin');
    switchAdminTab(validTabs.includes(tab) ? tab : 'dashboard');
  } else if (hash) {
    const validViews = ['jogos', 'apostas', 'ranking', 'admin', 'auth', 'perfil'];
    if (validViews.includes(hash)) navigate(hash);
  }
};

document.addEventListener('DOMContentLoaded', init);
