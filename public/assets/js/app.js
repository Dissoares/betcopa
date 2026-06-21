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
  stake:        50,
  stakeMin:     5,
  stakeMax:     500,
  oddPadrao:    5,
  timers:       [],        // countdown interval refs
  pollTimer:    null,      // intervalo de polling para jogos ao vivo
  adminEmail:     'admin@betcopa.local',
  activeFilter:   'todos',   // filtro ativo nos cards de jogos
  bonusCadastro:  0,
  _payMethod:     'pix',     // método selecionado no modal de pagamento
  _depositId:     null,
  _depositAmt:    0,
};


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

const flagUrl    = (code) => `/assets/flags/${code.toLowerCase()}.png`;
const flagUrlCdn = (code) => `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
// Gera atributos src + onerror com fallback para CDN caso a cópia local não exista
const flagImgSrc = (code) => {
  const c = code.toLowerCase();
  return `src="/assets/flags/${c}.png" onerror="this.onerror=null;this.src='https://flagcdn.com/w80/${c}.png'"`;
};


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
    return `<img class="team-logo team-logo--flag" alt="${teamName}" loading="lazy" ${flagImgSrc(stored)} />`;
  }

  // 3. Auto-detect by team name (normalize accents via simple map)
  const normalized = teamName.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const code = FLAGS[normalized] || FLAGS[teamName.toLowerCase().trim()];
  if (code) {
    return `<img class="team-logo team-logo--flag" alt="${teamName}" loading="lazy" ${flagImgSrc(code)} />`;
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

// ── Alerts → redireciona para toast ───────────────────────────
const showAlert = (msg, type = 'info') => {
  toast(msg.replace(/<[^>]*>/g, ''), type);
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
  const parts  = name.trim().split(/\s+/);
  const first  = parts[0];
  const last   = parts.length > 1 ? parts[parts.length - 1] : null;
  const mFirst = first.length > 3 ? first.slice(0, 3) + '***' : first;
  if (!last) return mFirst;
  const mLast  = last.length <= 2 ? last : last[0] + '***' + last[last.length - 1];
  return mFirst + ' ' + mLast;
};

// ── Game status badge ─────────────────────────────────────────
// Critérios (por prioridade):
//  1. Ao Vivo    → status_api ∈ {1H,2H,HT,ET,BT,P,INT,LIVE}  (jogo em andamento)
//  2. Suspenso   → status_api ∈ {SUSP,CANC,ABD,PST}
//  3. Finalizado → status='finalizado' OU status_api ∈ {FT,AET,PEN,AWD,WO}
//  4. Fechado    → status='encerrado'  (apostas fechadas, jogo não registrado)
//  5. Em Breve   → status='aberto' + menos de 1h para o pontapé
//  6. Aberto     → status='aberto' + mais de 1h para o pontapé
const gameBadge = (g, opts = {}) => {
  const api  = (g.status_api || '').toUpperCase();
  const s    = g.status;
  const diff = new Date(g.data_hora) - Date.now();

  // 1. Ao Vivo — badge AO VIVO no header do card
  const liveStatuses = ['1H','2H','ET','BT','P','HT','LIVE','INT'];
  if (liveStatuses.includes(api) || (s === 'aberto' && diff <= 0)) {
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

  // 4. Encerrado (apostas fechadas, jogo não processado)
  if (s === 'encerrado') {
    return `<span class="badge badge--closed"><i class="fa-solid fa-lock"></i> Encerrado</span>`;
  }

  // 5. Em Breve: aberto + menos de 1h para começar
  if (s === 'aberto' && diff > 0 && diff <= 3600000) {
    return `<span class="badge badge--soon"><i class="fa-solid fa-clock"></i> Apostas encerram em breve</span>`;
  }

  // 6. Em breve: aberto + mais de 7 dias para começar
  if (s === 'aberto' && diff > 7 * 24 * 3600_000) {
    return `<span class="badge badge--soon"><i class="fa-solid fa-calendar"></i> Em Breve</span>`;
  }

  // 7. aberto — se for seção HOJE exibe "É HOJE!"
  if (opts.isToday) {
    return `<span class="badge badge--open badge--today"><i class="fa-solid fa-bolt"></i> É HOJE!</span>`;
  }
  return `<span class="badge badge--open"><i class="fa-solid fa-unlock"></i> Aberto</span>`;
};

// ── Navigation ────────────────────────────────────────────────
const LEGAL_VIEWS = ['termos', 'privacidade', 'jogo-responsavel'];

const _isAdmin = () => !!S.user && (S.user.email === S.adminEmail || !!S.user.is_admin);

const _NAV_LABELS = {
  jogos: 'Jogos', auth: 'Login/Cadastro', palpites: 'Meus Palpites',
  ranking: 'Ranking', ganhadores: 'Ganhadores', grupos: 'Grupos',
  perfil: 'Perfil', suporte: 'Suporte', resultados: 'Resultados',
};
const navigate = (view) => {
  if (view === 'admin' && !_isAdmin()) {
    view = S.user ? 'jogos' : 'auth';
  }
  const navLbl = _NAV_LABELS[view];
  if (navLbl) { trackEvent('navigate', `Navegou para: ${navLbl}`); _pushNav(navLbl); }
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
  const contaBtn    = document.getElementById('bottomNavConta');
  const palpitesBtn = document.getElementById('bottomNavPalpites');
  if (contaBtn)    contaBtn.classList.toggle('nav__btn--active',    view === 'auth' || view === 'perfil');
  if (palpitesBtn) palpitesBtn.classList.toggle('nav__btn--active', view === 'palpites');

  // Banner só aparece na view de jogos
  const bannerWrap = document.getElementById('matchBannerWrap');
  if (bannerWrap) bannerWrap.classList.toggle('hidden', view !== 'jogos');

  window.scrollTo({ top: 0, behavior: 'instant' });

  // Pending bet timer na página de auth
  if (view === 'auth' && S.pendingBet) {
    setTimeout(startPendingBetTimer, 80);
  }

  // Suporte: exige login
  if (view === 'suporte') {
    if (!S.user) { navigate('auth'); return; }
    stopTicketPoll();
    _activeTicketId = null;
    loadUserTickets();
  }

  // Perfil: exige login e carrega dados
  if (view === 'perfil') {
    if (!S.user) { navigate('auth'); return; }
    loadPerfil();
  }

  history.replaceState(null, '', `/#${view}`);
};

// ── Header user chip ──────────────────────────────────────────
let _drawerCdTimer = null;

const buildDrawerNextGame = () => {
  const g = S.games
    .filter(g => g.status === 'aberto' && !isGameLive(g))
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))[0];
  if (!g) return '';
  const ms = new Date(g.data_hora) - Date.now();
  if (ms <= 0 || ms > 48 * 3600_000) return '';
  return `
    <div class="dr-next-game">
      <div class="dr-next-game__head">
        <span class="dr-next-game__label"><i class="fa-solid fa-bolt"></i> Próximo Jogo</span>
        <span class="dr-next-game__cd" id="drNextCd">${fmtCountdown(ms)}</span>
      </div>
      <div class="dr-next-game__foot">
        <span class="dr-next-game__teams">${g.time_casa} × ${g.time_fora}</span>
        <button class="dr-next-game__btn" data-action="bet" data-id="${g.id}">
          Apostar <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    </div>`;
};

const startDrawerCd = () => {
  clearInterval(_drawerCdTimer);
  const cdEl = document.getElementById('drNextCd');
  if (!cdEl) return;
  const g = S.games
    .filter(g => g.status === 'aberto' && !isGameLive(g))
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))[0];
  if (!g) return;
  _drawerCdTimer = setInterval(() => {
    const left = new Date(g.data_hora) - Date.now();
    if (left <= 0) { clearInterval(_drawerCdTimer); cdEl.textContent = 'Iniciando!'; return; }
    cdEl.textContent = fmtCountdown(left);
  }, 1000);
};

const renderDrawer = () => {
  const body = document.getElementById('drawerBody');
  if (!body) return;

  if (S.user) {
    const initials = S.user.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const saldo    = parseFloat(S.user.saldo || 0);
    const isAdmin  = _isAdmin();

    body.innerHTML = `
      <div class="dr-user">
        <div class="user-chip__avatar user-chip__avatar--lg">${initials}</div>
        <div class="dr-user__info">
          <div class="dr-user__name">${S.user.nome}</div>
          <div class="dr-user__balance-row">
            <span class="dr-user__balance-label">Saldo</span>
            <span class="dr-user__balance">${fmtMoney(saldo)}</span>
            <button class="btn btn--primary btn--xs dr-deposit-btn" id="drawerBtnDeposit">
              <i class="fa-solid fa-plus"></i> Adicionar
            </button>
          </div>
        </div>
      </div>
      <div class="dr-sep"></div>
      <div class="dr-section">
        <button class="dr-item" data-nav="jogos"><i class="fa-solid fa-house"></i> Jogos</button>
        <button class="dr-item" data-nav="grupos"><i class="fa-solid fa-table-cells"></i> Grupos</button>
        <button class="dr-item" data-nav="resultados"><i class="fa-solid fa-chart-simple"></i> Resultados</button>
        <button class="dr-item" data-nav="palpites"><i class="fa-solid fa-ticket"></i> Meus Palpites</button>
        <button class="dr-item" data-nav="ganhadores"><i class="fa-solid fa-trophy"></i> Ganhadores</button>
        <button class="dr-item" data-nav="suporte"><i class="fa-solid fa-headset"></i> Suporte</button>
      </div>
      ${isAdmin ? `
      <div class="dr-sep"></div>
      <p class="dr-section-label">ADMINISTRAÇÃO</p>
      <div class="dr-section">
        <button class="dr-item" data-nav="admin"><i class="fa-solid fa-shield-halved"></i> Painel Admin</button>
      </div>` : ''}
      <div class="dr-sep"></div>
      ${buildDrawerNextGame()}
      <div class="dr-sep"></div>
      <div class="dr-section">
        <button class="dr-item dr-item--referral" id="drawerBtnReferral">
          <i class="fa-solid fa-gift"></i> Convide e Ganhe Bônus
          <span class="dr-badge-bonus">+R$10</span>
        </button>
      </div>
      <div class="dr-sep"></div>
      <div class="dr-section">
        <button class="dr-item dr-item--danger" id="drawerLogout">
          <i class="fa-solid fa-right-from-bracket"></i> Sair
        </button>
      </div>`;

    document.getElementById('drawerLogout')?.addEventListener('click', () => { closeMobileMenu(); logout(); });
    document.getElementById('drawerBtnDeposit')?.addEventListener('click', () => { closeMobileMenu(); openModal('modalDeposit'); });
    document.getElementById('drawerBtnReferral')?.addEventListener('click', () => { closeMobileMenu(); openReferralModal(); });
    startDrawerCd();
  } else {
    const openCount     = S.games.filter(g => g.status === 'aberto').length;
    const liveCount     = S.games.filter(isGameLive).length;
    const finishedCount = S.games.filter(g => g.status === 'finalizado').length;
    const mult          = S.oddPadrao ? `${S.oddPadrao}×` : '5×';
    const totalGames    = S.games.length;

    // Próximo jogo — sem limite de tempo, apenas futuros
    const nextG = S.games
      .filter(g => g.status === 'aberto' && !isGameLive(g))
      .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))[0];
    const nextMs = nextG ? new Date(nextG.data_hora) - Date.now() : 0;
    const nextWidget = (nextG && nextMs > 0) ? `
      <div class="dr-next-game">
        <div class="dr-next-game__head">
          <span class="dr-next-game__label"><i class="fa-solid fa-bolt"></i> Próximo Jogo</span>
          <span class="dr-next-game__cd" id="drNextCd">${fmtCountdown(nextMs)}</span>
        </div>
        <div class="dr-next-game__foot">
          <span class="dr-next-game__teams">${nextG.time_casa} × ${nextG.time_fora}</span>
          <button class="dr-next-game__btn" data-action="bet" data-id="${nextG.id}">
            Apostar <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>` : '';

    body.innerHTML = `
      <div class="dr-hero">
        <div class="dr-hero__eyebrow">
          <span class="dr-hero__dot"></span>
          Copa do Mundo 2026
        </div>
        <p class="dr-hero__headline">Acerte o placar.<br>Ganhe de verdade.</p>
        <p class="dr-hero__sub">${totalGames ? `${totalGames} partidas disponíveis` : 'Partidas disponíveis para apostar'}</p>
        <button class="dr-hero__cta" id="drawerHeroCta">
          Apostar agora <i class="fa-solid fa-bolt"></i>
        </button>
      </div>

      ${nextWidget ? `<div class="dr-sep"></div>${nextWidget}` : ''}

      <div class="dr-sep"></div>
      <p class="dr-section-label">Navegar</p>
      <div class="dr-section">
        <button class="dr-item" data-nav="jogos">
          <i class="fa-solid fa-futbol"></i> Jogos
          ${openCount ? `<span class="dr-badge">${openCount}</span>` : ''}
        </button>
        <button class="dr-item" data-nav="grupos"><i class="fa-solid fa-table-cells"></i> Grupos</button>
        <button class="dr-item" data-nav="resultados"><i class="fa-solid fa-chart-simple"></i> Resultados</button>
        <button class="dr-item" data-nav="ganhadores"><i class="fa-solid fa-trophy"></i> Ganhadores</button>
        <button class="dr-item" data-nav="suporte"><i class="fa-solid fa-headset"></i> Suporte</button>
      </div>

      <div class="dr-sep"></div>
      <div class="dr-stats-strip">
        <div class="dr-stat-chip">
          <span class="dr-stat-chip__val">${openCount || '0'}</span>
          <span class="dr-stat-chip__lbl">Abertos</span>
        </div>
        <div class="dr-stat-chip dr-stat-chip--gold">
          <span class="dr-stat-chip__val">${mult}</span>
          <span class="dr-stat-chip__lbl">Mult.</span>
        </div>
        <div class="dr-stat-chip dr-stat-chip--danger">
          <span class="dr-stat-chip__val">${liveCount || '0'}</span>
          <span class="dr-stat-chip__lbl">Ao Vivo</span>
        </div>
      </div>

      <div class="dr-sep"></div>`;

    document.getElementById('drawerHeroCta')?.addEventListener('click', () => {
      closeMobileMenu(); navigate('auth'); switchAuthTab('register');
    });
  }

  startDrawerCd();

  const footer = document.getElementById('drawerFooter');
  if (footer) {
    footer.innerHTML = `
      <div class="dr-sep"></div>
      <div class="dr-section">
        <button class="dr-item dr-item--pwa hidden" id="drawerBtnPwa">
          <i class="fa-solid fa-download"></i> Instalar App
          <span class="dr-badge-pwa">App</span>
        </button>
        <button class="dr-item btn-theme-toggle">
          <i class="fa-solid fa-moon theme-icon"></i>Modo
        </button>
      </div>`;

    document.getElementById('drawerBtnPwa')?.addEventListener('click', async () => {
      if (!_installPrompt) return;
      _installPrompt.prompt();
      const { outcome } = await _installPrompt.userChoice;
      if (outcome === 'accepted') {
        _installPrompt = null;
        document.getElementById('drawerBtnPwa')?.classList.add('hidden');
        document.getElementById('btnInstallPwa')?.classList.add('hidden');
      }
    });

    if (_installPrompt) {
      document.getElementById('drawerBtnPwa')?.classList.remove('hidden');
    }
  }
};

const renderHeader = () => {
  const wrap = document.getElementById('headerUser');
  if (S.user) {
    const initials  = S.user.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const saldo     = parseFloat(S.user.saldo || 0);
    const isAdmin   = S.user.email === S.adminEmail || !!S.user.is_admin;
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
              <div class="udrop__balance-row">
                <span class="udrop__balance-label">Saldo</span>
                <span class="udrop__balance">${fmtMoney(saldo)}</span>
                <button class="btn btn--primary btn--xs udrop__deposit-btn" id="udropBtnDeposit">
                  <i class="fa-solid fa-plus"></i> 
                </button>
              </div>
            </div>
          </div>
          <div class="udrop__sep"></div>
          <button class="udrop__item" data-udrop-nav="perfil">
            <i class="fa-solid fa-circle-user"></i> Meu Perfil
          </button>
          <button class="udrop__item" data-udrop-nav="palpites">
            <i class="fa-solid fa-ticket"></i> Meus Palpites
          </button>
          <button class="udrop__item" id="udropBtnSaque">
            <i class="fa-solid fa-money-bill-transfer"></i> Solicitar Saque
          </button>
          ${isAdmin ? `
          <div class="udrop__sep"></div>
          <button class="udrop__item" data-udrop-nav="admin">
            <i class="fa-solid fa-shield-halved"></i> Painel Admin
          </button>` : ''}
          <div class="udrop__sep"></div>
          <button class="udrop__item udrop__item--referral" id="udropBtnReferral">
            <i class="fa-solid fa-gift"></i> Convide e Ganhe Bônus
            <span class="dr-badge-bonus">+R$10</span>
          </button>
          <div class="udrop__sep"></div>
          <button class="udrop__item udrop__item--danger" id="dropdownLogout">
            <i class="fa-solid fa-right-from-bracket"></i> Sair
          </button>
        </div>
      </div>`;

    document.querySelectorAll('.nav__btn--auth').forEach(b => b.style.display = '');
    document.getElementById('btnNavLogin')?.remove();
    document.getElementById('drawerAuthBtns')?.classList.add('hidden');
    // Show bell and start notification polling
    document.getElementById('notifBell')?.classList.remove('hidden');
    if (!_notifPoll) startNotifPoll();
  } else {
    wrap.innerHTML = `
      <button class="btn btn--primary btn--sm header__register-btn" id="btnNavRegister">
        <i class="fa-solid fa-user-plus"></i><span class="header__register-label"> Criar conta</span>
      </button>
      <button class="btn btn--ghost btn--sm header__login-btn" id="btnNavLogin">Entrar</button>`;
    document.getElementById('btnNavRegister').addEventListener('click', () => {
      navigate('auth');
      setTimeout(() => switchAuthTab('register'), 80);
    });
    document.getElementById('btnNavLogin').addEventListener('click', () => { navigate('auth'); switchAuthTab('login'); });
    document.getElementById('drawerAuthBtns')?.classList.remove('hidden');
    document.querySelectorAll('.nav__btn--auth').forEach(b => b.style.display = 'none');
    // Hide bell and stop polling
    document.getElementById('notifBell')?.classList.add('hidden');
    stopNotifPoll();
  }
  renderDrawer();
};

// ── Scroll lock (funciona no iOS com position:fixed) ─────────
let _scrollLockY    = 0;
let _scrollLockCount = 0;

const lockScroll = () => {
  if (_scrollLockCount++ > 0) return;
  _scrollLockY = window.scrollY;
  document.body.style.top = `-${_scrollLockY}px`;
  document.body.classList.add('scroll-locked');
};

const unlockScroll = () => {
  _scrollLockCount = Math.max(0, _scrollLockCount - 1);
  if (_scrollLockCount > 0) return;
  document.body.classList.remove('scroll-locked');
  document.body.style.top = '';
  window.scrollTo(0, _scrollLockY);
};

const openMobileMenu = () => {
  document.getElementById('mobileDrawer')?.classList.add('drawer--open');
  document.body.classList.add('drawer-open');
  lockScroll();
};

const closeMobileMenu = () => {
  document.getElementById('mobileDrawer')?.classList.remove('drawer--open');
  document.body.classList.remove('drawer-open');
  unlockScroll();
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
  setTheme(stored === 'dark' ? 'dark' : 'light');
};

// ── Game helpers ──────────────────────────────────────────────
const LIVE_API_CODES = ['1H','2H','ET','BT','P','HT','LIVE','INT'];

const isGameLive = (g) =>
  LIVE_API_CODES.includes((g.status_api || '').toUpperCase()) ||
  (g.status === 'aberto' && new Date(g.data_hora) <= Date.now());

const updateHeroStats = () => {
  const live        = S.games.filter(isGameLive).length;
  const open        = S.games.filter(g => g.status === 'aberto' && !isGameLive(g)).length;
  const finalizados = S.games.filter(g => g.status === 'finalizado').length;
  const el = id => document.getElementById(id);
  if (el('heroStatGames')) el('heroStatGames').textContent = S.games.length;
  if (el('heroStatOpen'))  el('heroStatOpen').textContent  = open;
  if (el('heroStatFinal')) el('heroStatFinal').textContent = finalizados;
  const liveGames = S.games.filter(isGameLive);
  const wrap = el('heroStatLiveWrap');
  if (wrap) {
    wrap.classList.toggle('hidden', liveGames.length === 0);
    if (liveGames.length === 1) {
      const g  = liveGames[0];
      const tc = teamNamePt(g.time_casa);
      const tf = teamNamePt(g.time_fora);
      wrap.innerHTML = `<i class="fa-solid fa-circle copa-hero__live-dot"></i> Ao Vivo · ${tc} x ${tf}`;
    } else {
      wrap.innerHTML = `<i class="fa-solid fa-circle copa-hero__live-dot"></i> <span id="heroStatLive">${liveGames.length}</span> Ao Vivo`;
    }
  }
  // Indicador ao vivo no nav
  document.querySelectorAll('.nav__btn[data-nav="jogos"], .dr-item[data-nav="jogos"]').forEach(btn => {
    const dot = btn.querySelector('.nav-live-dot');
    if (live > 0) { if (!dot) btn.insertAdjacentHTML('beforeend', '<span class="nav-live-dot"></span>'); }
    else            { dot?.remove(); }
  });
};

// ── League name abbreviations ─────────────────────────────────
const LEAGUE_SHORT = {
  'Campeonato Brasileiro Série A': 'Campeonato Brasileiro Série A',
  'Campeonato Brasileiro Série B': 'Campeonato Brasileiro Série B',
  'Campeonato Brasileiro Série C': 'Campeonato Brasileiro Série C',
  'Brasileirão Série A':           'Brasileirão Série A',
  'Brasileirão Série B':           'Brasileirão Série B',
  'Copa Libertadores':             'Copa Libertadores',
  'Copa Sul-Americana':            'Copa Sul-Americana',
  'Copa do Mundo FIFA':            'Copa do Mundo FIFA',
  'FIFA World Cup':                'Copa do Mundo',
  'UEFA Champions League':         'UEFA Champions League',
  'UEFA Europa League':            'Europa League',
  'UEFA Europa Conference League': 'Conference',
  'Premier League':                'Premier League',
  'La Liga':                       'La Liga',
  'Serie A':                       'Serie A',
  'Ligue 1':                       'Ligue 1',
  'Bundesliga':                    'Bundesliga',
  'Eredivisie':                    'Eredivisie',
  'Primeira Liga':                 'Primeira Liga',
  'Championship':                  'Championship',
  'Copa América':                  'Copa América',
};
const leagueShortName = (name) => LEAGUE_SHORT[name] || name;

const LEAGUE_ICONS = {
  'all':                'fa-solid fa-layer-group',
  'Copa do Mundo 2026': 'fa-solid fa-trophy',
  'Copa do Mundo':      'fa-solid fa-trophy',
  'Copa do Mundo FIFA': 'fa-solid fa-trophy',
  'FIFA World Cup':     'fa-solid fa-trophy',
  'Copa Libertadores':  'fa-solid fa-trophy',
  'Copa do Brasil':     'fa-solid fa-flag',
  'Copa América':       'fa-solid fa-trophy',
  'Premier League':     'fa-solid fa-crown',
  'La Liga':            'fa-solid fa-star',
  'Serie A':            'fa-solid fa-futbol',
  'Bundesliga':         'fa-solid fa-shield-halved',
  'Ligue 1':            'fa-solid fa-circle-dot',
  'Champions League':   'fa-solid fa-star',
};
const leagueIcon = (key) => `<i class="${LEAGUE_ICONS[key] || 'fa-solid fa-trophy'}"></i>`;

const TEAM_NAMES_PT = {
  // Seleções — Copa do Mundo 2026
  'Afghanistan':'Afeganistão','Albania':'Albânia','Algeria':'Argélia',
  'Andorra':'Andorra','Angola':'Angola','Argentina':'Argentina',
  'Armenia':'Armênia','Australia':'Austrália','Austria':'Áustria',
  'Azerbaijan':'Azerbaijão','Bahrain':'Bahrein','Bangladesh':'Bangladesh',
  'Belgium':'Bélgica','Bolivia':'Bolívia','Bosnia and Herzegovina':'Bósnia e Herzegovina',
  'Bosnia-Herzegovina':'Bósnia e Herzegovina','Brazil':'Brasil','Bulgaria':'Bulgária',
  'Cameroon':'Camarões','Canada':'Canadá','Cape Verde':'Cabo Verde',
  'Chile':'Chile','China':'China','Chinese Taipei':'Taipé Chinesa',
  'Colombia':'Colômbia','Congo DR':'Congo','Costa Rica':'Costa Rica',
  'Croatia':'Croácia','Cuba':'Cuba','Czech Republic':'República Tcheca',
  'Czechia':'República Tcheca','Denmark':'Dinamarca','DR Congo':'Congo RD',
  'Ecuador':'Equador','Egypt':'Egito','El Salvador':'El Salvador',
  'England':'Inglaterra','Estonia':'Estônia','Ethiopia':'Etiópia',
  'Finland':'Finlândia','France':'França','Georgia':'Geórgia',
  'Germany':'Alemanha','Ghana':'Gana','Greece':'Grécia',
  'Guatemala':'Guatemala','Guinea':'Guiné','Haiti':'Haiti',
  'Honduras':'Honduras','Hungary':'Hungria','Iceland':'Islândia',
  'India':'Índia','Indonesia':'Indonésia','Iran':'Irã',
  'Iraq':'Iraque','Ireland':'Irlanda','Israel':'Israel',
  'Italy':'Itália','Ivory Coast':'Costa do Marfim',"Côte d'Ivoire":'Costa do Marfim',
  'Jamaica':'Jamaica','Japan':'Japão','Jordan':'Jordânia',
  'Kazakhstan':'Cazaquistão','Kenya':'Quênia','Kosovo':'Kosovo',
  'Kuwait':'Kuwait','Latvia':'Letônia','Libya':'Líbia',
  'Lithuania':'Lituânia','Luxembourg':'Luxemburgo','Malaysia':'Malásia',
  'Mali':'Mali','Malta':'Malta','Mexico':'México',
  'Moldova':'Moldávia','Montenegro':'Montenegro','Morocco':'Marrocos',
  'Mozambique':'Moçambique','Namibia':'Namíbia','Netherlands':'Holanda',
  'New Zealand':'Nova Zelândia','Nicaragua':'Nicarágua','Nigeria':'Nigéria',
  'North Korea':'Coreia do Norte','North Macedonia':'Macedônia do Norte',
  'Norway':'Noruega','Oman':'Omã','Palestine':'Palestina',
  'Panama':'Panamá','Paraguay':'Paraguai','Peru':'Peru',
  'Philippines':'Filipinas','Poland':'Polônia','Portugal':'Portugal',
  'Qatar':'Catar','Romania':'Romênia','Russia':'Rússia',
  'Saudi Arabia':'Arábia Saudita','Scotland':'Escócia','Senegal':'Senegal',
  'Serbia':'Sérvia','Slovakia':'Eslováquia','Slovenia':'Eslovênia',
  'Somalia':'Somália','South Africa':'África do Sul','South Korea':'Coreia do Sul',
  'Korea Republic':'Coreia do Sul','Rep. Korea':'Coreia do Sul',
  'Spain':'Espanha','Sudan':'Sudão','Sweden':'Suécia',
  'Switzerland':'Suíça','Syria':'Síria','Tanzania':'Tanzânia',
  'Thailand':'Tailândia','Trinidad and Tobago':'Trinidad e Tobago',
  'Tunisia':'Tunísia','Turkey':'Turquia','Türkiye':'Turquia',
  'Uganda':'Uganda','Ukraine':'Ucrânia','United Arab Emirates':'Emirados Árabes',
  'United States':'Estados Unidos','USA':'Estados Unidos','Uruguay':'Uruguai',
  'Uzbekistan':'Uzbequistão','Venezuela':'Venezuela','Vietnam':'Vietnã',
  'Wales':'País de Gales','Zambia':'Zâmbia','Zimbabwe':'Zimbábue',
};
const teamNamePt = (name) => TEAM_NAMES_PT[name] || name;

// ── Game card renderer ────────────────────────────────────────
const renderCard = (g, opts = {}) => {
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

  const badgeLabel = gameBadge(g, opts);
  const scoreStr   = g.placar_real ? g.placar_real.replace('x', ' × ') : null;
  const oddNum     = parseFloat(g.odd || 1);
  const oddFmt     = oddNum % 1 === 0 ? oddNum.toFixed(0) : oddNum.toFixed(1).replace('.', ',');

  const { period: livePeriod, shortPeriod: liveShort, clockStr } =
    isLive ? fmtLiveClock(g) : { period: null, shortPeriod: null, clockStr: null };

  let midHtml;
  if (isLive) {
    midHtml = `
        <div class="gc-score gc-score--live">
          <div class="gc-tv-bar">
            <span class="gc-tv-bar__period" id="lvperiod-${g.id}">${livePeriod ?? ''}</span>
            <span class="gc-tv-bar__clock" id="lvclock-${g.id}">${clockStr ?? '—'}</span>
          </div>
          <span class="gc-score__val">${scoreStr ?? '0 × 0'}</span>
        </div>`;
  } else if (isFinal && scoreStr) {
    midHtml = `
        <div class="gc-vs">×</div>
        <div class="gc-score gc-score--final">
          <span class="gc-score__label">PLACAR</span>
          <span class="gc-score__val">${scoreStr}</span>
        </div>`;
  } else if (!isClosed) {
    midHtml = `
        <div class="gc-vs">×</div>
        <div class="gc-countdown">
          <span class="gc-countdown__label" id="cdlabel-${g.id}">COMEÇA EM</span>
          <span class="gc-countdown__time" id="cdtime-${g.id}">--:--:--</span>
        </div>`;
  } else {
    midHtml = `<div class="gc-vs">VS</div><span class="gc-dash">—</span>`;
  }

  const btnLabel = isFinal
    ? '<i class="fa-solid fa-flag-checkered"></i> Finalizado'
    : isTooFar
    ? '<i class="fa-solid fa-calendar"></i> Em Breve'
    : '<i class="fa-solid fa-lock"></i> Encerrado';

  const ctaOdd    = g.odd > 1 ? g.odd : S.oddPadrao;
  const ctaOddNum = parseFloat(ctaOdd);
  const ctaOddFmt = ctaOddNum % 1 === 0
    ? ctaOddNum.toFixed(0)
    : ctaOddNum.toFixed(1).replace('.', ',');
  const ctaHtml = !isClosed
    ? `<p class="gc-cta"><i class="fa-solid fa-fire"></i> Acerte o placar e ganhe <strong>${ctaOdd}×</strong> vezes o seu palpite!</p>`
    : '';

  const urgencyHtml = isSoon
    ? `<span class="gc-urgency"><i class="fa-solid fa-bolt"></i> Faça seu palpite antes que encerre.</span>`
    : '';

  const betBlocked = isClosed || isTooFar;
  const oddPill = (!betBlocked && ctaOddNum > 1)
    ? `<span class="gc-odd-pill">${ctaOddFmt}<small>×</small></span>` : '';

  const mobileCta = !betBlocked
    ? `<div class="gc-mob-countdown">
         <span class="gc-countdown__label" id="cdlabel-mob-${g.id}">COMEÇA EM</span>
         <span class="gc-countdown__time" id="cdtime-mob-${g.id}">--:--:--</span>
       </div>`
    : oddPill;

  const footHtml = isLive
    ? `<button class="btn btn--ghost btn--full" disabled>
         <i class="fa-solid fa-lock"></i> Palpites encerrados
       </button>`
    : isFinal && scoreStr
    ? `<div class="gc-final-cta">
         <span class="gc-final-cta__score">${scoreStr}</span>
         <button class="btn btn--ghost btn--full" disabled>
           <i class="fa-solid fa-flag-checkered"></i> Finalizado
         </button>
       </div>`
    : `${mobileCta}
       <button class="btn ${!betBlocked ? 'btn--primary btn--bet' : 'btn--ghost'} btn--full"
         data-action="bet" data-id="${g.id}" ${betBlocked ? 'disabled' : ''}>
         ${!betBlocked ? '<i class="fa-solid fa-bolt"></i> Apostar' : btnLabel}
       </button>
       ${ctaHtml}`;

  const leagueHtml = g.liga_nome
    ? `<span class="gc-league"><i class="fa-solid fa-trophy"></i> ${leagueShortName(g.liga_nome)}</span>`
    : `<span></span>`;

  const cardClickable = !betBlocked && !isLive;

  const shareBtn = !isFinal
    ? `<button class="gc-share-btn" type="button" data-action="share-game" data-id="${g.id}" title="Compartilhar"><i class="fa-solid fa-share-nodes"></i></button>`
    : '';

  return `
    <article class="game-card game-card--${statusClass}${opts.isToday ? ' game-card--today' : ''}" data-game-id="${g.id}"${!cardClickable ? ' data-blocked' : ''}>
      <div class="game-card__head">
        ${badgeLabel}
        ${leagueHtml}
        <div class="gc-head-right">
          ${isLive
            ? `<span class="game-card__date game-card__date--live" id="gcdateclock-${g.id}">${liveShort ?? ''}</span>`
            : `<time class="game-card__date">${fmtGameDate(g.data_hora)}</time>`
          }
          ${shareBtn}
        </div>
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
  const cls     = ['games-section', extraClass].filter(Boolean).join(' ');
  const shown   = games.slice(0, SECTION_LIMIT);
  const more    = games.length - SECTION_LIMIT;
  const isToday = id === 'today';

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
      <div class="games-grid" id="gs-grid-${id}">${shown.map(g => renderCard(g, { isToday })).join('')}</div>
      ${moreBtn}
    </section>`;
};

// ── Match Banner carousel ─────────────────────────────────────
/* ── Next Game Bar — barra de urgência no topo do conteúdo ─── */
let _ngbTimer = null;
const renderNextGameBar = () => {
  const bar = document.getElementById('nextGameBar');
  if (!bar) return;
  clearInterval(_ngbTimer);

  const g = S.games
    .filter(g => g.status === 'aberto' && !isGameLive(g))
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))[0];
  const ms = g ? new Date(g.data_hora) - Date.now() : 0;
  if (!g || ms <= 0) { bar.classList.add('hidden'); return; }

  const fmtNgb = (ms) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const seg = n => String(n).padStart(2,'0').split('').map(d => `<b>${d}</b>`).join('');
    const sep = '<i>:</i>';
    if (h > 0) return seg(h) + sep + seg(m) + sep + seg(s);
    return seg(m) + sep + seg(s);
  };

  bar.innerHTML = `
    <span class="ngb__dot"></span>
    <div class="ngb__info">
      <span class="ngb__label">Próximo Jogo</span>
      <span class="ngb__teams">${g.time_casa} × ${g.time_fora}</span>
    </div>
    <div class="ngb__timer">
      <span class="ngb__timer-label">começa em</span>
      <span class="ngb__timer-cd" id="ngbCd">${fmtNgb(ms)}</span>
    </div>
    <button class="ngb__btn" data-action="bet" data-id="${g.id}">
      Apostar <i class="fa-solid fa-arrow-right"></i>
    </button>`;
  bar.classList.remove('hidden');

  _ngbTimer = setInterval(() => {
    const left = new Date(g.data_hora) - Date.now();
    const cdEl = document.getElementById('ngbCd');
    if (!cdEl || left <= 0) { clearInterval(_ngbTimer); renderNextGameBar(); return; }
    cdEl.innerHTML = fmtNgb(left);
  }, 1000);
};

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

  // Slide: só próximos jogos (ao vivo já aparece na seção própria no topo)
  const soon = S.games
    .filter(g => g.status === 'aberto' && !isGameLive(g))
    .filter(g => { const ms = new Date(g.data_hora) - Date.now(); return ms > 0 && ms <= 3_600_000; })
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
  const next = S.games
    .filter(g => g.status === 'aberto' && !isGameLive(g) && !soon.includes(g))
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  const MAX_SLIDES = 8;
  const slides = [...soon, ...next].slice(0, MAX_SLIDES);

  if (!slides.length) {
    wrap.className = 'match-banner-wrap hidden';
    el.innerHTML = '';
    return;
  }

  const setThemeClass = (g) => {
    wrap.classList.remove('match-banner--live', 'match-banner--soon');
    wrap.classList.add(isGameLive(g) ? 'match-banner--live' : 'match-banner--soon');
    const jogosView = document.getElementById('view-jogos');
    if (jogosView && !jogosView.classList.contains('hidden')) {
      wrap.classList.remove('hidden');
    }
  };

  const buildSlide = (g, idx) => {
    const logoH = g.logo_casa
      ? `<img src="${g.logo_casa}" class="mb-logo" alt="">`
      : `<span class="mb-flag">${flagEmoji(g.bandeira_casa || '')}</span>`;
    const logoA = g.logo_fora
      ? `<img src="${g.logo_fora}" class="mb-logo" alt="">`
      : `<span class="mb-flag">${flagEmoji(g.bandeira_fora || '')}</span>`;

    const dt      = new Date(g.data_hora);
    const ms      = dt - Date.now();
    const isSoon  = ms > 0 && ms <= 3_600_000;
    const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const soonDot = isSoon ? `<span class="mb-soon-dot"></span>` : '';

    return `
      <div class="mb-slide mb-slide--c${idx % 5}" data-slide="${idx}" data-game-id="${g.id}">
        <time class="mb-slide__meta">${dateStr} · ${timeStr}${soonDot}</time>
        <div class="mb-slide__team">${logoH}<span class="mb-name">${g.time_casa}</span></div>
        <div class="mb-slide__team">${logoA}<span class="mb-name">${g.time_fora}</span></div>
      </div>`;
  };

  setThemeClass(slides[0]);
  el.className = 'match-banner';
  el.innerHTML = `
    <div class="mb-header">
      <span class="mb-header__label"><i class="fa-solid fa-calendar-day"></i> Próximos Jogos</span>
      <span class="mb-header__swipe"><i class="fa-solid fa-angles-right"></i></span>
    </div>
    <div class="mb-strip" id="mbStrip">${slides.map(buildSlide).join('')}</div>`;

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
      const { period, clockStr } = fmtLiveClock(g);
      clkEl.textContent = clockStr ? `${period} · ${clockStr}` : period;
    }, 1000));
  });

  if (slides.length <= 1) return;

  const isDesktop = () => window.innerWidth >= 768;
  let current = 0;
  let _mbScrollRaf = null;

  const mbSmoothScroll = (el, targetLeft, duration = 600) => {
    if (_mbScrollRaf) cancelAnimationFrame(_mbScrollRaf);
    const startLeft = el.scrollLeft;
    const diff = targetLeft - startLeft;
    if (Math.abs(diff) < 1) return;
    const startTime = performance.now();
    const easeInOutQuart = t => t < .5 ? 8*t*t*t*t : 1 - Math.pow(-2*t + 2, 4) / 2;
    const tick = (now) => {
      const p = Math.min((now - startTime) / duration, 1);
      el.scrollLeft = startLeft + diff * easeInOutQuart(p);
      if (p < 1) _mbScrollRaf = requestAnimationFrame(tick);
    };
    _mbScrollRaf = requestAnimationFrame(tick);
  };

  const goTo = (idx) => {
    current = Math.max(0, Math.min(idx, slides.length - 1));
    el.querySelectorAll('.mb-dot').forEach((d, i) => d.classList.toggle('mb-dot--active', i === current));
    setThemeClass(slides[current]);

    const strip = document.getElementById('mbStrip');
    const card = strip.children[current];
    if (card) mbSmoothScroll(strip, card.offsetLeft - strip.offsetLeft);
    strip.querySelectorAll('.mb-slide').forEach((s, i) => s.classList.toggle('mb-slide--active', i === current));
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

// ── League tab filter ─────────────────────────────────────────
let _activeLeague = 'all';

// Priority order for known leagues (rest sorted alphabetically after)
const LEAGUE_PRIORITY = [
  'Copa do Mundo FIFA', 'Copa do Mundo', 'World Cup',
  'UEFA Champions League', 'Champions League',
  'UEFA Europa League', 'Europa League',
  'Brasileirão Série A', 'Brasileirao Serie A',
  'Copa Libertadores', 'Copa do Brasil',
  'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
];

const renderLeagueTabs = () => {
  const bar = document.getElementById('leagueTabs');
  if (!bar) return;

  // Count games per league (non-cancelled)
  const counts = {};
  S.games.forEach(g => {
    const liga = g.liga_nome || 'Outras';
    counts[liga] = (counts[liga] || 0) + 1;
  });

  const leagues = Object.keys(counts);

  // Hide bar only when there are no leagues
  if (leagues.length === 0) { bar.classList.add('hidden'); return; }

  // Sort: priority first, then alphabetical
  leagues.sort((a, b) => {
    const ai = LEAGUE_PRIORITY.findIndex(p => a.toLowerCase().includes(p.toLowerCase()));
    const bi = LEAGUE_PRIORITY.findIndex(p => b.toLowerCase().includes(p.toLowerCase()));
    const av = ai === -1 ? 999 : ai;
    const bv = bi === -1 ? 999 : bi;
    return av !== bv ? av - bv : a.localeCompare(b, 'pt-BR');
  });

  const totalCount = S.games.length;
  bar.innerHTML = [
    `<button class="league-tab ${_activeLeague === 'all' ? 'league-tab--active' : ''}"
             data-league="all" role="tab" aria-selected="${_activeLeague === 'all'}">
       ${leagueIcon('all')} Todos <span class="league-tab__count">${totalCount}</span>
     </button>`,
    ...leagues.map(liga =>
      `<button class="league-tab ${_activeLeague === liga ? 'league-tab--active' : ''}"
               data-league="${liga.replace(/"/g, '&quot;')}" role="tab"
               aria-selected="${_activeLeague === liga}">
         ${leagueIcon(liga)} ${leagueShortName(liga)} <span class="league-tab__count">${counts[liga]}</span>
       </button>`
    ),
  ].join('');

  bar.classList.remove('hidden');
};

const renderTicker = () => {
  const inner = document.getElementById('tickerInner');
  if (!inner || !S.games.length) return;

  const fmtDt = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  // Apenas jogos finalizados com placar
  const finished = S.games.filter(g => g.status === 'finalizado' && g.placar_real);

  if (!finished.length) {
    inner.innerHTML = '';
    return;
  }

  const items = finished.map(g => {
    const [goalsHome, goalsAway] = g.placar_real.split('x').map(Number);
    const draw = goalsHome === goalsAway;
    const homeWon = goalsHome > goalsAway;

    if (draw) {
      return `<span class="ticker-item ticker-item--result">
        <span style="color:#f97316;font-weight:600">${g.time_casa}</span>
        <span class="ticker-score">${goalsHome} × ${goalsAway}</span>
        <span style="color:#f97316;font-weight:600">${g.time_fora}</span>
        <span class="ticker-draw">empatou!</span>
      </span>`;
    }

    const homeColor = homeWon ? '#59ff15' : '#f87171';
    const awayColor = homeWon ? '#f87171' : '#59ff15';
    const trophy = `<i class="fa-solid fa-trophy" style="color:#facc15;font-size:.7rem;margin:0 2px"></i>`;

    return `<span class="ticker-item ticker-item--result">
      <span style="color:${homeColor};font-weight:600">${homeWon ? trophy : ''}${g.time_casa}</span>
      <span class="ticker-score">${goalsHome} × ${goalsAway}</span>
      <span style="color:${awayColor};font-weight:600">${homeWon ? '' : trophy}${g.time_fora}</span>
    </span>`;
  }).join('<span class="ticker-sep">✦</span>');

  // Duplicar para loop contínuo sem corte
  inner.innerHTML = items + '<span class="ticker-sep">✦</span>' + items;

  // Ajustar velocidade proporcional ao conteúdo
  const totalW = inner.scrollWidth / 2;
  const dur = Math.max(20, Math.round(totalW / 80));
  inner.style.animationDuration = dur + 's';
};

const renderGames = () => {
  const container = document.getElementById('gamesGrid');
  const empty     = document.getElementById('gamesEmpty');
  if (!container) return;

  S.timers.forEach(clearInterval);
  S.timers = [];

  renderLeagueTabs();
  updateHeroStats();
  renderHeroUrgency();

  // Apply league filter
  const games = _activeLeague === 'all'
    ? S.games
    : S.games.filter(g => (g.liga_nome || 'Outras') === _activeLeague);

  const now     = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate();
  const dayOffset = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };

  const live = games.filter(isGameLive);

  const openSorted = games
    .filter(g => g.status === 'aberto' && !isGameLive(g))
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  // Single pass: bucket openSorted into time sections
  const soon = [], today = [], tomorrow = [], beyond = [];
  const weekMap = {};
  const d1 = dayOffset(1), d7 = dayOffset(7);
  for (const g of openSorted) {
    const dt = new Date(g.data_hora);
    const ms = dt - now;
    if (ms > 0 && ms <= 3_600_000)          { soon.push(g);     continue; }
    if (sameDay(dt, now) && ms > 3_600_000) { today.push(g);    continue; }
    if (sameDay(dt, d1))                    { tomorrow.push(g); continue; }
    if (dt >= d7)                            { beyond.push(g);   continue; }
    const key = dt.toISOString().slice(0, 10);
    if (!weekMap[key]) weekMap[key] = { dt, games: [] };
    weekMap[key].games.push(g);
  }

  const weekSections = Object.values(weekMap).map(({ dt, games }) => {
    const wday = dt.toLocaleDateString('pt-BR', { weekday: 'long' });
    const cap  = wday.charAt(0).toUpperCase() + wday.slice(1);
    const date = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return {
      sid:   `week${dt.toISOString().slice(0, 10).replace(/-/g, '')}`,
      title: `${cap} · ${date}`,
      games,
    };
  });

  const finished = games
    .filter(g => !isGameLive(g) && (g.status === 'finalizado' || g.status === 'encerrado'))
    .sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));

  if (!live.length && !openSorted.length && !finished.length) {
    container.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  // Seção topo → Ao Vivo tem prioridade; sem live, promove "Daqui a Pouco"
  const liveWrap = document.getElementById('liveSectionWrap');
  let soonFeatured = false;
  if (liveWrap) {
    if (live.length) {
      liveWrap.innerHTML = renderSection('live', 'Ao Vivo', '', live, 'games-section--live');
    } else if (soon.length) {
      soonFeatured = true;
      liveWrap.innerHTML = renderSection('soon', 'Daqui a Pouco', '<span class="dot-live"></span>', soon, 'games-section--soon');
    } else {
      liveWrap.innerHTML = '';
    }
  }

  // Demais seções no grid principal (sem ao vivo; soon já pode estar no topo)
  let html = '';
  if (!soonFeatured) {
    html += renderSection('soon', 'Daqui a Pouco', '<span class="dot-live"></span>', soon, 'games-section--soon');
  }
  html += renderSection('today',    'Ainda hoje!', '', today,    'games-section--today');
  html += renderSection('tomorrow', 'Amanhã',   '', tomorrow, 'games-section--tomorrow');
  weekSections.forEach(ws => {
    html += renderSection(ws.sid, ws.title, '', ws.games, 'games-section--week');
  });
  if (beyond.length)
    html += renderSection('beyond', 'Próximos', '', beyond, 'games-section--beyond');
  html += renderSection('finished', 'Finalizados', '', finished, 'games-section--finished');

  container.innerHTML = html;

  renderMatchBanner();
  renderNextGameBar();
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
const fmtCountdownShort = (ms) => {
  if (ms <= 0) return '--:--';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
};

const fmtLiveClock = (g) => {
  const api        = (g.status_api || '').toUpperCase();
  const elapsedMs  = Math.max(0, Date.now() - new Date(g.data_hora));
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const elapsedMin = Math.floor(elapsedSec / 60);
  const secs       = elapsedSec % 60;
  const hasTime    = elapsedSec > 0;

  const clk = (m, s) => `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  if (api === 'HT')  return { period: 'Intervalo',      shortPeriod: 'HT',    clockStr: null };
  if (api === 'BT')  return { period: 'Interv. Prorr.', shortPeriod: 'HT',    clockStr: null };
  if (api === 'P')   return { period: 'Pênaltis',       shortPeriod: 'PEN',   clockStr: null };
  if (api === 'INT') return { period: 'Interrompido',   shortPeriod: 'SUSP',  clockStr: null };

  if (api === '1H')  return { period: '1º Tempo',    shortPeriod: '1T',    clockStr: hasTime ? clk(Math.min(elapsedMin, 45), secs) : null };
  if (api === '2H')  return { period: '2º Tempo',    shortPeriod: '2T',    clockStr: hasTime ? clk(Math.min(45 + Math.max(0, elapsedMin - 60), 90), secs) : null };
  if (api === 'ET')  return { period: 'Prorrogação', shortPeriod: 'PRORR', clockStr: hasTime ? clk(Math.min(90 + Math.max(0, elapsedMin - 110), 120), secs) : null };

  // Estimativa por tempo decorrido quando status_api não foi atualizado
  if (hasTime) {
    if (elapsedMin <= 48)  return { period: '1º Tempo',    shortPeriod: '1T',    clockStr: clk(Math.min(elapsedMin, 45), secs) };
    if (elapsedMin <= 63)  return { period: 'Intervalo',   shortPeriod: 'INT',   clockStr: null };
    if (elapsedMin <= 108) return { period: '2º Tempo',    shortPeriod: '2T',    clockStr: clk(Math.min(45 + Math.max(0, elapsedMin - 63), 90), secs) };
    if (elapsedMin <= 130) return { period: 'Prorrogação', shortPeriod: 'PRORR', clockStr: clk(Math.min(90 + Math.max(0, elapsedMin - 108), 120), secs) };
  }
  return { period: 'Ao Vivo', shortPeriod: 'AO VIVO', clockStr: null };
};

const startLiveClocks = () => {
  S.games.filter(isGameLive).forEach(g => {
    const el = document.getElementById(`lvclock-${g.id}`);
    if (!el || el.dataset.t) return;
    el.dataset.t = '1';
    const perEl      = document.getElementById(`lvperiod-${g.id}`);
    const dateClkEl  = document.getElementById(`gcdateclock-${g.id}`);
    const tick = () => {
      const { period, shortPeriod, clockStr } = fmtLiveClock(g);
      el.textContent = clockStr ?? '—';
      if (perEl)     perEl.textContent     = period ?? '';
      if (dateClkEl) dateClkEl.textContent = clockStr ?? period ?? '';
    };
    tick();
    S.timers.push(setInterval(tick, 1000));
  });
};

const _fmtGameCd = (diff, gameDate) => {
  if (diff <= 0) return { label: 'COMEÇA EM', time: 'Em breve!' };
  if (diff <= 86_400_000) return { label: 'COMEÇA EM', time: fmtCountdown(diff) };
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const gameMidnight  = new Date(gameDate); gameMidnight.setHours(0, 0, 0, 0);
  const calDays = Math.round((gameMidnight - todayMidnight) / 86_400_000);
  if (calDays === 1) return { label: 'COMEÇA EM', time: 'amanhã!' };
  return { label: 'COMEÇA EM', time: `${calDays} dias` };
};

const startCountdowns = () => {
  S.games.forEach(g => {
    if (g.status !== 'aberto') return;
    const el         = document.getElementById(`cdtime-${g.id}`);
    const elLabel    = document.getElementById(`cdlabel-${g.id}`);
    const elMob      = document.getElementById(`cdtime-mob-${g.id}`);
    const elLabelMob = document.getElementById(`cdlabel-mob-${g.id}`);
    if ((!el && !elMob) || (el && el.dataset.t)) return;
    if (el) el.dataset.t = '1';

    const tick = () => {
      const diff = new Date(g.data_hora) - Date.now();
      const { label, time } = _fmtGameCd(diff, g.data_hora);
      if (el)         { el.textContent = time; if (diff <= 0) el.classList.add('game-card__countdown-time--expired'); }
      if (elLabel)    elLabel.textContent = label;
      if (elMob)      { elMob.textContent = time; if (diff <= 0) elMob.classList.add('game-card__countdown-time--expired'); }
      if (elLabelMob) elLabelMob.textContent = label;
    };
    tick();
    S.timers.push(setInterval(tick, 1000));
  });
};

// ── Bets list ─────────────────────────────────────────────────
const betTimeline = (status) => {
  const isWon  = status === 'ganhou';
  const isLost = status === 'perdido';
  const STEPS = [
    { key: 'pendente',   label: 'Palpite' },
    { key: 'pago',       label: 'Pagamento' },
    { key: 'confirmado', label: 'Aguardando Jogo' },
    { key: 'resultado',  label: isWon ? '<span style="color:var(--win-text)">Acertou!</span>' : isLost ? '<span style="color:var(--danger)">Errou Placar</span>' : 'Resultado' },
  ];
  const ORDER = ['pendente', 'pago', 'confirmado'];
  const done  = isWon || isLost;
  // Palpite (i=0) sempre concluído — o card só existe se o palpite foi feito
  // +1 faz "Palpite" virar done e aponta o active para o próximo passo
  const idx   = done ? 4 : status === 'confirmado' ? 3 : ORDER.indexOf(status) + 1;

  const lastIdx = STEPS.length - 1;
  return `<div class="bet-status-steps">${STEPS.map((step, i) => {
    const isLastLost = isLost && i === lastIdx;
    const isLastWon  = isWon  && i === lastIdx;
    let state = i < idx ? 'done' : i === idx ? 'active' : '';
    if (isLastLost) state = 'fail';

    let dot;
    if (isLastLost) {
      dot = `<span class="bet-step__dot bet-step__dot--fail"><i class="fa-solid fa-xmark"></i></span>`;
    } else if (state === 'done') {
      dot = `<span class="bet-step__dot bet-step__dot--check"><i class="fa-solid fa-check"></i></span>`;
    } else {
      dot = `<span class="bet-step__dot"></span>`;
    }

    const lineDone = i < idx && !isLastLost;
    const line = i < lastIdx
      ? `<span class="bet-step__line${lineDone ? ' bet-step__line--done' : ''}"></span>`
      : '';
    return `<span class="bet-step bet-step--${state}">${dot}<span class="bet-step__label">${step.label}</span></span>${line}`;
  }).join('')}</div>`;
};

// ── Online presence ───────────────────────────────────────────
const getOrCreateSid = () => {
  let sid = localStorage.getItem('bc_sid');
  if (!sid) {
    sid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    localStorage.setItem('bc_sid', sid);
  }
  return sid;
};

const _classifyReferrer = (ref) => {
  if (!ref) return { source: 'direto', label: 'Direto' };
  const u = ref.toLowerCase();
  if (/google\./i.test(u))                      return { source: 'google',    label: 'Google' };
  if (/facebook\.com|fb\.com|fb\.gg/i.test(u)) return { source: 'facebook',  label: 'Facebook' };
  if (/instagram\.com/i.test(u))                return { source: 'instagram', label: 'Instagram' };
  if (/twitter\.com|t\.co|x\.com/i.test(u))    return { source: 'twitter',   label: 'Twitter/X' };
  if (/whatsapp\.com|wa\.me/i.test(u))          return { source: 'whatsapp', label: 'WhatsApp' };
  if (/tiktok\.com/i.test(u))                   return { source: 'tiktok',   label: 'TikTok' };
  if (/youtube\.com|youtu\.be/i.test(u))        return { source: 'youtube',  label: 'YouTube' };
  if (/telegram\./i.test(u))                    return { source: 'telegram', label: 'Telegram' };
  try { return { source: 'outro', label: new URL(ref).hostname }; } catch {}
  return { source: 'outro', label: 'Outro' };
};

const _getOrCreateRefInfo = () => {
  const stored = localStorage.getItem('bc_ref');
  if (stored) { try { return JSON.parse(stored); } catch {} }
  const ref  = document.referrer || '';
  const info = _classifyReferrer(ref);
  info.referrer = ref.substring(0, 300);
  localStorage.setItem('bc_ref', JSON.stringify(info));
  return info;
};

const _getOrCreateDevice = () => {
  const cached = localStorage.getItem('bc_dev');
  if (cached) return cached;
  const ua = navigator.userAgent;
  const dev = /tablet|ipad|playbook|silk/i.test(ua)   ? 'tablet'
            : /mobile|android|iphone|ipod|blackberry|opera mini|windows phone/i.test(ua) ? 'mobile'
            : 'desktop';
  localStorage.setItem('bc_dev', dev);
  return dev;
};

const _PAGE_LABELS = {
  '': 'Jogos', 'jogos': 'Jogos', 'palpites': 'Meus Palpites',
  'ranking': 'Ranking', 'ganhadores': 'Ganhadores', 'grupos': 'Grupos',
  'perfil': 'Perfil', 'suporte': 'Suporte', 'resultados': 'Resultados',
  'auth': 'Login/Cadastro', 'termos': 'Termos de Uso',
  'privacidade': 'Privacidade', 'jogo-responsavel': 'Jogo Responsável',
};

const _getCurrentPageLabel = () => {
  const visible = (id) => !document.getElementById(id)?.classList.contains('hidden');
  if (visible('modalPixOverlay'))   return 'Aguardando pagamento PIX';
  if (visible('modalTicket')) {
    if (document.getElementById('flowStep3')?.classList.contains('flow-step--active'))
      return 'Escolhendo forma de pagamento';
    return 'Confirmando palpite';
  }
  if (visible('modalPalpite'))      return 'Fazendo palpite';
  if (visible('modalDepositOverlay')) return 'Realizando depósito';
  if (visible('modalPreLogin'))     return 'Login rápido (pré-aposta)';
  if (visible('modalReferral'))     return 'Programa de indicação';
  const hash = location.hash.replace('#', '').toLowerCase();
  if (hash === 'auth') {
    const regTab = document.querySelector('#authTabs .auth-tab--active, .tab--active[data-tab="register"]');
    return regTab?.dataset?.tab === 'register' ? 'Formulário de cadastro' : 'Formulário de login';
  }
  if (hash.startsWith('admin')) return 'Área Admin';
  return _PAGE_LABELS[hash] || hash || 'Início';
};

// ── Navigation history (breadcrumb for admin) ────────────────
const _navHistory = [];
const _pushNav = (label) => {
  if (!label) return;
  if (_navHistory[_navHistory.length - 1] === label) return;
  _navHistory.push(label);
  if (_navHistory.length > 4) _navHistory.shift();
};

// ── Session event tracking ────────────────────────────────────
let _evtQueue = [];
let _evtFlushTimer = null;

const trackEvent = (type, label) => {
  _evtQueue.push({ type, label });
  clearTimeout(_evtFlushTimer);
  _evtFlushTimer = setTimeout(_flushEvents, 1500);
};

const _flushEvents = async () => {
  if (!_evtQueue.length) return;
  const batch = _evtQueue.splice(0, 50);
  try {
    await api('/api/track', 'POST', { session_id: getOrCreateSid(), events: batch });
  } catch { _evtQueue.unshift(...batch); }
};

// Envia evento de saída do site via sendBeacon (mais confiável no beforeunload)
window.addEventListener('beforeunload', () => {
  trackEvent('navigate', 'Saiu do site');
  if (_evtQueue.length) {
    const payload = JSON.stringify({ session_id: getOrCreateSid(), events: _evtQueue.splice(0) });
    navigator.sendBeacon?.('/api/track', new Blob([payload], { type: 'application/json' }));
  }
});

// Captura UTM da URL e persiste no sessionStorage (só precisa rodar uma vez por visita)
const _captureUTM = () => {
  const p = new URLSearchParams(location.search);
  const src = p.get('utm_source'), med = p.get('utm_medium'), cam = p.get('utm_campaign');
  if (src) sessionStorage.setItem('_utm_source',   src);
  if (med) sessionStorage.setItem('_utm_medium',   med);
  if (cam) sessionStorage.setItem('_utm_campaign', cam);
};
_captureUTM();

const pingOnline = async () => {
  try {
    const refInfo = _getOrCreateRefInfo();
    await api('/api/ping', 'POST', {
      session_id:   getOrCreateSid(),
      page:         _navHistory.length > 1 ? _navHistory.join(' › ') : _getCurrentPageLabel(),
      source:       refInfo.source,
      referrer:     refInfo.referrer,
      device:       _getOrCreateDevice(),
      utm_source:   sessionStorage.getItem('_utm_source')   || undefined,
      utm_medium:   sessionStorage.getItem('_utm_medium')   || undefined,
      utm_campaign: sessionStorage.getItem('_utm_campaign') || undefined,
      screen:       `${screen.width}x${screen.height}`,
      lang:         navigator.language || undefined,
    });
  } catch { /* ignore */ }
};

let _onlineInterval   = null;
let _liveAgoInterval  = null;

const _SRC_META = {
  google:    { label: 'Google',    icon: 'fa-brands fa-google' },
  facebook:  { label: 'Facebook',  icon: 'fa-brands fa-facebook' },
  instagram: { label: 'Instagram', icon: 'fa-brands fa-instagram' },
  twitter:   { label: 'Twitter/X', icon: 'fa-brands fa-x-twitter' },
  whatsapp:  { label: 'WhatsApp',  icon: 'fa-brands fa-whatsapp' },
  tiktok:    { label: 'TikTok',    icon: 'fa-brands fa-tiktok' },
  youtube:   { label: 'YouTube',   icon: 'fa-brands fa-youtube' },
  telegram:  { label: 'Telegram',  icon: 'fa-brands fa-telegram' },
  direto:    { label: 'Direto',    icon: 'fa-solid fa-link' },
  outro:     { label: 'Outro',     icon: 'fa-solid fa-globe' },
};

const _fmtAgo = (ts) => {
  if (!ts) return '';
  const dt   = new Date(ts.replace(' ', 'T'));
  const diff = Math.round((Date.now() - dt.getTime()) / 1000);
  if (diff < 60)   return `${diff}s atrás`;
  if (diff < 3600) return `${Math.round(diff / 60)}min atrás`;
  return `${Math.round(diff / 3600)}h atrás`;
};

// Versões que recebem segundos diretamente do servidor (sem problema de timezone)
const _fmtSeconds = (sec) => {
  if (sec < 0)    return 'agora';
  if (sec < 60)   return `${sec}s atrás`;
  if (sec < 3600) return `${Math.round(sec / 60)}min atrás`;
  return `${Math.round(sec / 3600)}h atrás`;
};
const _fmtSessionDuration = (sec) => {
  if (sec < 0)    return '';
  if (sec < 60)   return `${sec}s na sessão`;
  if (sec < 3600) return `${Math.round(sec / 60)}min na sessão`;
  return `${Math.round(sec / 3600)}h na sessão`;
};

const _fmtDuration = (first_seen) => {
  if (!first_seen) return '';
  const dt   = new Date(first_seen.replace(' ', 'T'));
  const diff = Math.round((Date.now() - dt.getTime()) / 1000);
  if (diff < 60)   return `${diff}s na sessão`;
  if (diff < 3600) return `${Math.round(diff / 60)}min na sessão`;
  return `${Math.round(diff / 3600)}h na sessão`;
};

const _countryFlag = (code) => {
  if (!code || code.length !== 2) return '';
  const c = code.toLowerCase();
  return `<img src="https://flagcdn.com/w40/${c}.png" alt="${code.toUpperCase()}" style="height:14px;width:auto;vertical-align:middle;border-radius:2px" loading="lazy">`;
};

const _avatarColor = (str) => {
  const cols = ['#4ade80','#60a5fa','#f59e0b','#f87171','#a78bfa','#34d399','#fb923c','#e879f9'];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return cols[Math.abs(h) % cols.length];
};

const _deviceIcon = (dev) => {
  if (dev === 'mobile')  return '<i class="fa-solid fa-mobile-screen" title="Mobile"></i>';
  if (dev === 'tablet')  return '<i class="fa-solid fa-tablet-screen-button" title="Tablet"></i>';
  return '<i class="fa-solid fa-desktop" title="Desktop"></i>';
};

let _onlineCountdownVal = 30;
let _onlineCountdownInterval = null;

const _startOnlineCountdown = () => {
  _onlineCountdownVal = 30;
  clearInterval(_onlineCountdownInterval);
  _onlineCountdownInterval = setInterval(() => {
    _onlineCountdownVal = Math.max(0, _onlineCountdownVal - 1);
    const el = document.getElementById('onlineCountdown');
    if (el) el.textContent = `↻ ${_onlineCountdownVal}s`;
    if (_onlineCountdownVal === 0) _onlineCountdownVal = 30;
  }, 1000);
};

// ── Migrations ──────────────────────────────────────────────────
const loadMigrations = async () => {
  const el = document.getElementById('migrationsList');
  if (!el) return;
  el.innerHTML = `<div class="empty-state" style="padding:2rem"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem;opacity:.4"></i></div>`;
  try {
    const list = await api('/api/admin/migrations');
    if (!list.length) {
      el.innerHTML = `<p style="padding:1.5rem;text-align:center;color:var(--text-muted)">Nenhuma migration encontrada na pasta sql/</p>`;
      return;
    }
    el.innerHTML = list.map((m, i) => `
      <div class="migration-row" id="mrow-${i}">
        <div class="migration-row__num">${String(i + 1).padStart(2, '0')}</div>
        <div class="migration-row__file">${m.filename}</div>
        <div class="migration-row__status">
          ${m.status === 'executado'
            ? `<span class="migration-badge migration-badge--ok"><i class="fa-solid fa-check"></i> Executado</span>`
            : `<span class="migration-badge migration-badge--pending"><i class="fa-solid fa-clock"></i> Pendente</span>`}
        </div>
        <div class="migration-row__action">
          ${m.status === 'pendente'
            ? `<button class="btn btn--primary btn--xs" onclick="runMigration('${m.filename}', ${i})"><i class="fa-solid fa-play"></i> Executar</button>`
            : `<button class="btn btn--ghost btn--xs" disabled><i class="fa-solid fa-check"></i> Feito</button>`}
        </div>
      </div>`).join('');
  } catch { el.innerHTML = `<p style="padding:1.5rem;color:var(--danger)">Erro ao carregar migrations.</p>`; }
};

const runMigration = async (filename, idx) => {
  const btn = document.querySelector(`#mrow-${idx} button`);
  if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Executando...`; }
  try {
    const res = await api('/api/admin/migrations/run', 'POST', { filename });
    toast(res.message || 'Executado!', 'success');
    await loadMigrations();
  } catch(e) {
    toast(e.message || 'Erro ao executar migration', 'danger');
    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-play"></i> Executar`; }
  }
};

const runAllPendingMigrations = async () => {
  const btn = document.getElementById('btnRunAllMigrations');
  if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Executando...`; }
  try {
    const list = await api('/api/admin/migrations');
    const pending = list.filter(m => m.status === 'pendente');
    if (!pending.length) { toast('Nenhuma migration pendente.', 'info'); }
    for (const m of pending) {
      const res = await api('/api/admin/migrations/run', 'POST', { filename: m.filename });
      toast(res.message, 'success');
    }
    await loadMigrations();
  } catch(e) {
    toast(e.message || 'Erro ao executar migrations', 'danger');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-play"></i> Executar Pendentes`; }
  }
};

const loadAdminOnline = async () => {
  _startOnlineCountdown();
  try {
    const { stats, sessoes_online } = await api('/api/admin/online');
    const sessions = sessoes_online || [];

    // ── Stats cards ──────────────────────────────────────────────
    const statsEl = document.getElementById('onlineStats');
    if (statsEl) {
      const mobile  = sessions.filter(s => s.device === 'mobile').length;
      const desktop = sessions.filter(s => s.device === 'desktop' || !s.device).length;
      const tablet  = sessions.filter(s => s.device === 'tablet').length;

      // Contagem por origem
      const srcCount = {};
      sessions.forEach(s => { const k = s.source || 'direto'; srcCount[k] = (srcCount[k] || 0) + 1; });
      const srcBadges = Object.entries(srcCount).sort((a,b) => b[1]-a[1]).map(([src, n]) => {
        const m = _SRC_META[src] || _SRC_META.outro;
        return `<span class="online-src-mini online-src--${src}"><i class="${m.icon}"></i> ${m.label} <strong>${n}</strong></span>`;
      }).join('');

      statsEl.innerHTML = `
        <div class="dash-card dash-card--green">
          <div class="dash-card__label"><i class="fa-solid fa-circle-dot" style="color:var(--primary)"></i> Total Online</div>
          <div class="dash-card__value dash-card__value--green">${stats.total}</div>
        </div>
        <div class="dash-card dash-card--info">
          <div class="dash-card__label"><i class="fa-solid fa-user-check"></i> Usuários logados</div>
          <div class="dash-card__value dash-card__value--info">${stats.usuarios}</div>
        </div>
        <div class="dash-card">
          <div class="dash-card__label"><i class="fa-solid fa-eye"></i> Visitantes</div>
          <div class="dash-card__value">${stats.visitantes}</div>
        </div>
        <div class="dash-card">
          <div class="dash-card__label"><i class="fa-solid fa-mobile-screen"></i> Mobile &nbsp;<i class="fa-solid fa-desktop" style="margin-left:.3rem"></i> Desktop</div>
          <div class="dash-card__value" style="font-size:1.1rem;gap:.5rem;display:flex;align-items:baseline">
            <span>${mobile}</span><span style="color:var(--text-muted);font-size:.8rem">/</span><span>${desktop}</span>
            ${tablet ? `<span style="color:var(--text-muted);font-size:.8rem">tab:${tablet}</span>` : ''}
          </div>
        </div>
        <div class="dash-card dash-card--wide">
          <div class="dash-card__label"><i class="fa-solid fa-share-nodes"></i> Origem do tráfego</div>
          <div class="online-src-bar">${srcBadges || '<span style="color:var(--text-muted);font-size:.8rem">—</span>'}</div>
        </div>`;
    }

    // ── Lista unificada de sessões ────────────────────────────────
    const listEl = document.getElementById('onlineUsersList');
    if (!listEl) return;

    if (!sessions.length) {
      listEl.innerHTML = '<p class="text--muted" style="padding:1.5rem 0;text-align:center">Nenhuma sessão ativa no momento.</p>';
      return;
    }

    const _statusLabel = { active: 'Online', idle: 'Inativo', leaving: 'Saindo' };
    const _statusColor = { active: 'var(--green,#59ff15)', idle: '#ff9800', leaving: '#f44336' };

    // Render cards
    listEl.innerHTML = sessions.map(s => {
      const isUser  = !!s.user_id;
      const nome    = isUser ? (s.nome || 'Usuário') : 'Visitante anônimo';
      const agoSec  = parseInt(s.ago_seconds      ?? 0);
      const durSec  = parseInt(s.duration_seconds ?? 0);
      const status  = agoSec < 60 ? 'active' : agoSec < 150 ? 'idle' : 'leaving';
      const sid     = s.session_id || '';

      // ── Avatar ──────────────────────────────────────────────────
      const avatarContent = isUser
        ? (s.nome || 'U').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
        : '<i class="fa-solid fa-user-secret"></i>';
      const avatarBg = isUser ? _avatarColor(s.nome || 'U') : 'rgba(255,255,255,.08)';

      // ── Geo ─────────────────────────────────────────────────────
      const flag = _countryFlag(s.country || '');
      const geo  = [s.city, s.region, s.country_name].filter(Boolean).join(', ');

      // ── Source ──────────────────────────────────────────────────
      const src    = s.source || 'direto';
      const meta   = _SRC_META[src] || _SRC_META.outro;
      const srcLbl = src === 'outro' && s.referrer
        ? (() => { try { return new URL(s.referrer).hostname; } catch { return meta.label; } })()
        : meta.label;

      // ── UTM (tráfego pago / rastreado) ──────────────────────────
      const utmParts = [
        s.utm_source   ? `source=${s.utm_source}`   : '',
        s.utm_medium   ? `medium=${s.utm_medium}`   : '',
        s.utm_campaign ? `campaign=${s.utm_campaign}` : '',
      ].filter(Boolean);
      const utmHtml = utmParts.length
        ? `<div class="ol-card__utm"><i class="fa-solid fa-chart-line"></i> ${utmParts.join(' · ')}</div>`
        : '';

      // ── Referrer ─────────────────────────────────────────────────
      const refHtml = s.referrer
        ? `<div class="ol-card__ref">
             <i class="fa-solid fa-turn-up fa-rotate-90" style="opacity:.5"></i>
             <a href="${s.referrer}" target="_blank" rel="noopener" title="${s.referrer}">
               ${s.referrer.length > 70 ? s.referrer.substring(0,70) + '…' : s.referrer}
             </a>
           </div>`
        : '';

      // ── Página atual ─────────────────────────────────────────────
      const pageHtml = s.page ? (() => {
        const steps = s.page.split(' › ');
        if (steps.length <= 1)
          return `<span class="ol-card__page-cur"><i class="fa-solid fa-location-dot"></i> ${s.page}</span>`;
        return `<div class="ol-card__breadcrumb">
          <i class="fa-solid fa-location-dot" style="opacity:.5;font-size:.7rem"></i>
          ${steps.map((step, i) => i < steps.length - 1
            ? `<span class="ol-card__crumb ol-card__crumb--prev">${step}</span><i class="fa-solid fa-chevron-right ol-card__crumb-sep"></i>`
            : `<span class="ol-card__crumb ol-card__crumb--cur">${step}</span>`
          ).join('')}
        </div>`;
      })() : '';

      // ── Browser + OS badges ──────────────────────────────────────
      const bMeta = _BR_META[s.browser] || { cls: 'br--other', icon: 'fa-solid fa-globe' };
      const oMeta = _OS_META[s.os];
      const techHtml = `<span class="ol-card__tech ${bMeta.cls}">
        <i class="${bMeta.icon}"></i> ${s.browser || 'Outro'}
        ${oMeta ? `<i class="${oMeta.icon}"></i> ${s.os}` : ''}
      </span>`;

      // ── Extras (tela + idioma) ───────────────────────────────────
      const extrasHtml = [
        s.screen ? `<span class="ol-card__extra"><i class="fa-solid fa-display" style="opacity:.4"></i> ${s.screen}</span>` : '',
        s.lang   ? `<span class="ol-card__extra"><i class="fa-solid fa-language" style="opacity:.4"></i> ${s.lang}</span>`   : '',
      ].filter(Boolean).join('');

      // ── Eventos recentes ─────────────────────────────────────────
      const eventsHtml = (() => {
        if (!s.recent_events) return '';
        const evts = s.recent_events.split('~').slice(0, 4).map(raw => {
          const [type, label, sec] = raw.split('|');
          const icon = type === 'navigate' ? 'fa-route'
                     : type === 'modal_open'  || type === 'modal_close' ? 'fa-window-maximize'
                     : type === 'form'   ? 'fa-paper-plane'
                     : type === 'click'  ? 'fa-arrow-pointer'
                     : 'fa-bolt';
          return `<div class="ol-card__evt">
            <i class="fa-solid ${icon} ol-card__evt-icon"></i>
            <span class="ol-card__evt-label">${label || type}</span>
            <span class="ol-card__evt-ago">${_fmtSeconds(parseInt(sec||0))}</span>
          </div>`;
        }).join('');
        return `<div class="ol-card__events">
          <div class="ol-card__events-title"><i class="fa-solid fa-bolt"></i> Ações recentes</div>
          ${evts}
        </div>`;
      })();

      return `<div class="ol-card" data-sid="${sid}">
        <div class="ol-card__left">
          <div class="ol-card__avatar" style="background:${avatarBg}">
            ${avatarContent}
            <span class="ol-card__dot ol-card__dot--${status}" title="${_statusLabel[status]}"></span>
          </div>
        </div>

        <div class="ol-card__body">
          <!-- Linha 1: nome + email + source + device -->
          <div class="ol-card__row ol-card__row--head">
            <strong class="ol-card__name">${nome}</strong>
            ${isUser && s.email ? `<span class="ol-card__email">${s.email}</span>` : ''}
            <span class="ol-card__src online-src--${src}"><i class="${meta.icon}"></i> ${srcLbl}</span>
            <span class="ol-card__device">${_deviceIcon(s.device)}</span>
          </div>

          <!-- Linha 2: tech (browser + OS + screen + lang) -->
          <div class="ol-card__row ol-card__row--tech">
            ${techHtml}
            ${s.screen ? `<span class="ol-card__pill"><i class="fa-solid fa-display"></i> ${s.screen}</span>` : ''}
            ${s.lang   ? `<span class="ol-card__pill"><i class="fa-solid fa-language"></i> ${s.lang}</span>`   : ''}
          </div>

          <!-- Linha 3: geo -->
          <div class="ol-card__row ol-card__row--meta">
            <span class="ol-card__geo">
              ${flag ? flag + ' ' : '<i class="fa-solid fa-location-dot" style="opacity:.35"></i> '}
              ${geo || 'Localização desconhecida'}
              ${s.ip ? `<code class="online-sc__ip">${s.ip}</code>` : ''}
            </span>
          </div>

          <!-- Linha 4: referrer + UTM (só se tiver) -->
          ${(s.referrer || utmParts.length) ? `<div class="ol-card__row ol-card__row--origin">
            ${refHtml}${utmHtml}
          </div>` : ''}

          <!-- Linha 5: eventos recentes (só se tiver) -->
          ${eventsHtml}
        </div>

        <div class="ol-card__times">
          <span class="ol-card__ago" data-ago="${agoSec}">${_fmtSeconds(agoSec)}</span>
          <span class="ol-card__dur">${_fmtSessionDuration(durSec)}</span>
          ${s.page ? `<span class="ol-card__page-wrap">${pageHtml}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    // ── Live counter: atualiza os "X atrás" a cada segundo sem re-fetch ──
    clearInterval(_liveAgoInterval);
    _liveAgoInterval = setInterval(() => {
      document.querySelectorAll('.ol-card__ago[data-ago]').forEach(el => {
        const sec = parseInt(el.dataset.ago) + 1;
        el.dataset.ago = sec;
        el.textContent = _fmtSeconds(sec);
      });
    }, 1000);

  } catch { /* ignore */ }
};

// ── Analytics de tráfego ─────────────────────────────────────
let _analyticsPeriod = 'today';
let _analyticsPage   = 1;

const _BR_META = {
  Chrome:   { cls: 'br--chrome',   icon: 'fa-brands fa-chrome' },
  Firefox:  { cls: 'br--firefox',  icon: 'fa-brands fa-firefox' },
  Safari:   { cls: 'br--safari',   icon: 'fa-brands fa-safari' },
  Edge:     { cls: 'br--edge',     icon: 'fa-brands fa-edge' },
  Opera:    { cls: 'br--opera',    icon: 'fa-brands fa-opera' },
  Samsung:  { cls: 'br--samsung',  icon: 'fa-solid fa-mobile-screen' },
  Chromium: { cls: 'br--chrome',   icon: 'fa-brands fa-chrome' },
  IE:       { cls: 'br--ie',       icon: 'fa-brands fa-internet-explorer' },
};
const _OS_META = {
  Windows:  { icon: 'fa-brands fa-windows' },
  Android:  { icon: 'fa-brands fa-android' },
  iOS:      { icon: 'fa-brands fa-apple' },
  iPadOS:   { icon: 'fa-brands fa-apple' },
  macOS:    { icon: 'fa-brands fa-apple' },
  Linux:    { icon: 'fa-brands fa-linux' },
  ChromeOS: { icon: 'fa-brands fa-chrome' },
};

const _brBadge = (browser, os) => {
  const b   = _BR_META[browser] || { cls: 'br--other', icon: 'fa-solid fa-globe' };
  const oMeta = _OS_META[os];
  const oIcon = oMeta ? `<i class="${oMeta.icon}"></i>` : '';
  return `<span class="an-br-badge ${b.cls}"><i class="${b.icon}"></i> ${browser || 'Outro'} ${oIcon} ${os || ''}</span>`;
};

const _fmtDuration2 = (sec) => {
  if (!sec || sec < 0) return '< 1s';
  if (sec < 60)  return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec/60)}min`;
  return `${Math.floor(sec/3600)}h ${Math.round((sec%3600)/60)}min`;
};

const _fmtDateTime = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts.replace(' ', 'T'));
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
};

const _miniBar = (items, keyField, valField, maxVal) => {
  const max = maxVal || Math.max(...items.map(i => +i[valField]), 1);
  return items.map(i => {
    const pct = Math.round((+i[valField] / max) * 100);
    return `<div class="an-bar-row">
      <span class="an-bar-label">${i[keyField] || '—'}</span>
      <div class="an-bar-track"><div class="an-bar-fill" style="width:${pct}%"></div></div>
      <span class="an-bar-val">${i[valField]}</span>
    </div>`;
  }).join('');
};

const loadAdminAnalytics = async (period = _analyticsPeriod, page = _analyticsPage) => {
  _analyticsPeriod = period;
  _analyticsPage   = page;
  _startOnlineCountdown();

  // Marca botão de período ativo
  document.querySelectorAll('.an-period-btn').forEach(b => {
    b.classList.toggle('an-period-btn--active', b.dataset.period === period);
  });

  const root = document.getElementById('analyticsRoot');
  if (!root) return;

  try {
    const url  = `/api/admin/analytics?period=${period}&page=${page}`;
    const data = await api(url);
    const { stats, online_now, by_source, by_country, by_device, by_browser, by_os, by_page, visits, total_visits, limit } = data;

    // ── Stats cards ───────────────────────────────────────────
    const totalPages  = Math.ceil(total_visits / limit);
    const sessPerDay  = period === 'today' ? total_visits
                      : period === 'week'  ? Math.round(total_visits / 7)
                      : Math.round(total_visits / 30);

    document.getElementById('anStatCards').innerHTML = `
      <div class="an-stat-card">
        <div class="an-stat-card__icon" style="background:rgba(99,102,241,.15);color:#6366f1"><i class="fa-solid fa-chart-line"></i></div>
        <div><div class="an-stat-card__val">${(+stats.total_visits||0).toLocaleString('pt-BR')}</div><div class="an-stat-card__label">Total Visitas</div></div>
      </div>
      <div class="an-stat-card">
        <div class="an-stat-card__icon" style="background:rgba(89,255,21,.15);color:#59ff15"><i class="fa-solid fa-users"></i></div>
        <div><div class="an-stat-card__val">${(+stats.unique_ips||0).toLocaleString('pt-BR')}</div><div class="an-stat-card__label">Visitantes Únicos</div></div>
      </div>
      <div class="an-stat-card">
        <div class="an-stat-card__icon" style="background:rgba(251,191,36,.15);color:#fbbf24"><i class="fa-solid fa-star"></i></div>
        <div><div class="an-stat-card__val">${(+stats.novos||0).toLocaleString('pt-BR')}</div><div class="an-stat-card__label">Novos</div></div>
      </div>
      <div class="an-stat-card">
        <div class="an-stat-card__icon" style="background:rgba(249,115,22,.15);color:#f97316"><i class="fa-solid fa-rotate-left"></i></div>
        <div><div class="an-stat-card__val">${(+stats.retornaram||0).toLocaleString('pt-BR')}</div><div class="an-stat-card__label">Retornou</div></div>
      </div>`;

    // ── Mini charts (barras horizontais) ──────────────────────
    const chartsEl = document.getElementById('anCharts');
    if (chartsEl) {
      const srcRows  = by_source.map(r => ({ source: r.source, cnt: +r.cnt }));
      const maxSrc   = Math.max(...srcRows.map(r => r.cnt), 1);
      const srcBars  = srcRows.map(r => {
        const m = _SRC_META[r.source] || _SRC_META.outro;
        const pct = Math.round((r.cnt / maxSrc) * 100);
        return `<div class="an-bar-row">
          <span class="online-src online-src--${r.source}" style="min-width:110px"><i class="${m.icon}"></i> ${m.label}</span>
          <div class="an-bar-track"><div class="an-bar-fill an-bar-fill--src" style="width:${pct}%"></div></div>
          <span class="an-bar-val">${r.cnt}</span>
        </div>`;
      }).join('');

      const maxCtry = Math.max(...by_country.map(r => +r.cnt), 1);
      const ctryBars = by_country.map(r => {
        const pct  = Math.round((+r.cnt / maxCtry) * 100);
        const flag = _countryFlag(r.country || '');
        return `<div class="an-bar-row">
          <span class="an-bar-label">${flag} ${r.country_name || r.country || '—'}</span>
          <div class="an-bar-track"><div class="an-bar-fill" style="width:${pct}%"></div></div>
          <span class="an-bar-val">${r.cnt}</span>
        </div>`;
      }).join('');

      const maxBr  = Math.max(...by_browser.map(r => +r.cnt), 1);
      const brBars = by_browser.map(r => {
        const m   = _BR_META[r.browser] || { cls:'br--other', icon:'fa-solid fa-globe' };
        const pct = Math.round((+r.cnt / maxBr) * 100);
        return `<div class="an-bar-row">
          <span class="an-bar-label"><span class="an-br-badge ${m.cls}" style="padding:.1rem .35rem"><i class="${m.icon}"></i></span> ${r.browser}</span>
          <div class="an-bar-track"><div class="an-bar-fill" style="width:${pct}%"></div></div>
          <span class="an-bar-val">${r.cnt}</span>
        </div>`;
      }).join('');

      const devMap  = { mobile: 'Mobile', desktop: 'Desktop', tablet: 'Tablet' };
      const devIcon = { mobile: 'fa-solid fa-mobile-screen', desktop: 'fa-solid fa-desktop', tablet: 'fa-solid fa-tablet-screen-button' };
      const maxDev  = Math.max(...by_device.map(r => +r.cnt), 1);
      const devBars = by_device.map(r => {
        const pct = Math.round((+r.cnt / maxDev) * 100);
        return `<div class="an-bar-row">
          <span class="an-bar-label"><i class="${devIcon[r.device] || 'fa-solid fa-globe'}"></i> ${devMap[r.device] || r.device}</span>
          <div class="an-bar-track"><div class="an-bar-fill" style="width:${pct}%"></div></div>
          <span class="an-bar-val">${r.cnt}</span>
        </div>`;
      }).join('');

      const maxPage = Math.max(...by_page.map(r => +r.cnt), 1);
      const pgBars  = by_page.map(r => {
        const pct = Math.round((+r.cnt / maxPage) * 100);
        return `<div class="an-bar-row">
          <span class="an-bar-label"><i class="fa-solid fa-location-dot"></i> ${r.page}</span>
          <div class="an-bar-track"><div class="an-bar-fill an-bar-fill--page" style="width:${pct}%"></div></div>
          <span class="an-bar-val">${r.cnt}</span>
        </div>`;
      }).join('');

      chartsEl.innerHTML = `
        <div class="an-charts-grid">
          <div class="panel an-chart-panel">
            <h4 class="an-chart-title"><i class="fa-solid fa-share-nodes"></i> Origem</h4>
            ${srcBars  || '<p class="text--muted an-empty">—</p>'}
          </div>
          <div class="panel an-chart-panel">
            <h4 class="an-chart-title"><i class="fa-solid fa-earth-americas"></i> Países</h4>
            ${ctryBars || '<p class="text--muted an-empty">—</p>'}
          </div>
          <div class="panel an-chart-panel">
            <h4 class="an-chart-title"><i class="fa-brands fa-chrome"></i> Navegador</h4>
            ${brBars   || '<p class="text--muted an-empty">—</p>'}
          </div>
          <div class="panel an-chart-panel">
            <h4 class="an-chart-title"><i class="fa-solid fa-mobile-screen"></i> Dispositivo</h4>
            ${devBars  || '<p class="text--muted an-empty">—</p>'}
          </div>
          <div class="panel an-chart-panel an-chart-panel--wide">
            <h4 class="an-chart-title"><i class="fa-solid fa-location-dot"></i> Páginas mais acessadas</h4>
            ${pgBars   || '<p class="text--muted an-empty">—</p>'}
          </div>
        </div>`;
    }

    // ── Tabela de visitas ─────────────────────────────────────
    const tableEl = document.getElementById('anVisitsTable');
    if (!tableEl) return;

    const pagerInfo = `${(+stats.total_pageviews||0).toLocaleString('pt-BR')} páginas · ${sessPerDay} sessões/dia · ${(+data.total_visits||0)} IPs únicos · pág. ${page}/${totalPages || 1}`;

    if (!visits.length) {
      tableEl.innerHTML = '<p class="text--muted an-empty">Nenhuma visita registrada para este período.</p>';
      return;
    }

    const rows = visits.map((v, i) => {
      const rowNum    = (page - 1) * limit + i + 1;
      const isUser    = !!v.user_id;
      const nome      = isUser ? (v.nome || 'Usuário') : 'Visitante';
      const flag      = _countryFlag(v.country || '');
      const geo       = [v.city, v.region ? v.region.substring(0,2) : ''].filter(Boolean).join(', ');
      const totalSess = +v.total_sessions || 1;
      const loggedN   = +v.logged_sessions || 0;
      const anonN     = +v.anon_sessions   || 0;
      const sessLabel = totalSess > 1
        ? `<span class="ip-sess-badge">${totalSess} sessões${loggedN ? ` · ${loggedN} logada` : ''}${anonN > 1 || (anonN && loggedN) ? ` · ${anonN} anon` : ''}</span>`
        : '';
      const statusBadge = v.is_new == 1
        ? '<span class="an-status an-status--new"><i class="fa-solid fa-star"></i> Novo</span>'
        : '<span class="an-status an-status--ret"><i class="fa-solid fa-rotate-left"></i> Retornou</span>';
      const src      = v.source || 'direto';
      const srcMeta  = _SRC_META[src] || _SRC_META.outro;
      const srcLabel = src === 'outro' && v.referrer
        ? (() => { try { return new URL(v.referrer).hostname; } catch { return srcMeta.label; } })()
        : srcMeta.label;
      const refUrl   = v.referrer
        ? `<a class="an-ref-link" href="${v.referrer}" target="_blank" rel="noopener" title="${v.referrer}">${v.referrer.length > 60 ? v.referrer.substring(0,60)+'…' : v.referrer} <i class="fa-solid fa-arrow-up-right-from-square"></i></a>`
        : '—';
      const dt  = _fmtDateTime(v.last_seen);
      const dur = _fmtDuration2(+v.duration_sec || 0);

      return `<tr>
        <td class="an-td-num">${rowNum}</td>
        <td class="an-td-visitor">
          <div class="an-visitor-cell">
            <div class="an-visitor-avatar${isUser ? '' : ' an-visitor-avatar--anon'}">${isUser ? (v.nome||'U').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : '<i class="fa-solid fa-user-secret"></i>'}</div>
            <div class="an-visitor-info">
              <div class="an-visitor-name">${nome}${isUser && v.email ? ` <span class="an-visitor-email">${v.email}</span>` : ''} ${sessLabel}</div>
              <div>${_brBadge(v.browser, v.os)}</div>
              <div class="an-visitor-geo">${flag ? `${flag} ` : ''}${geo || v.country_name || ''} <code class="online-sc__ip">${v.ip || ''}</code></div>
            </div>
          </div>
        </td>
        <td class="an-td-center"><span class="an-pageviews">${v.total_page_views||1}×</span></td>
        <td>${statusBadge}</td>
        <td class="an-td-page">
          <div class="an-page-cell">
            <strong>${v.current_page || v.landing_page || '—'}</strong>
          </div>
        </td>
        <td class="an-td-source">
          <div class="an-source-cell">
            <div><span class="online-src online-src--${src}"><i class="${srcMeta.icon}"></i> ${srcLabel}</span></div>
            <div class="an-ref-wrap">${refUrl}</div>
          </div>
        </td>
        <td class="an-td-time">
          <div>${dt}</div>
          <div class="an-dur an-dur--time">
            <span class="an-dur-badge ${+v.duration_sec >= 300 ? 'an-dur--long' : +v.duration_sec >= 60 ? 'an-dur--mid' : 'an-dur--short'}" title="Tempo no site">
              <i class="fa-regular fa-clock"></i> ${dur}
            </span>
            <span style="color:var(--text-muted);font-size:.7rem" title="Saiu">saiu há: ${_fmtAgo(v.last_seen)}</span>
          </div>
        </td>
        <td class="an-td-action">
          <button class="an-eye-btn" data-ip="${v.ip||''}" title="Ver histórico do IP">
            <i class="fa-solid fa-eye"></i>
          </button>
        </td>
      </tr>`;
    }).join('');

    // Paginação
    const prev = page > 1 ? `<button class="btn btn--ghost btn--sm" onclick="loadAdminAnalytics('${period}', ${page-1})"><i class="fa-solid fa-chevron-left"></i></button>` : '';
    const next = page < totalPages ? `<button class="btn btn--ghost btn--sm" onclick="loadAdminAnalytics('${period}', ${page+1})">Próxima <i class="fa-solid fa-chevron-right"></i></button>` : '';
    const pager = `<div class="an-pager">${prev}<span class="an-pager-info">pág. ${page} / ${totalPages}</span>${next}</div>`;

    tableEl.innerHTML = `
      <div class="an-table-header">
        <h3 class="panel__title" style="margin:0"><i class="fa-solid fa-list"></i> Registro de visitas</h3>
        <span class="an-pager-summary">${pagerInfo}</span>
      </div>
      <div class="an-table-wrap">
        <table class="admin-table an-visits-table">
          <thead><tr>
            <th>#</th>
            <th><i class="fa-solid fa-user"></i> Visitante · Local · IP</th>
            <th><i class="fa-solid fa-file-lines"></i> Págs</th>
            <th>Status</th>
            <th><i class="fa-regular fa-file"></i> Última Página</th>
            <th><i class="fa-solid fa-share-nodes"></i> Origem</th>
            <th><i class="fa-regular fa-calendar"></i> Dia</th>
            <th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${pager}`;

  } catch (err) {
    document.getElementById('anStatCards').innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  }
};

// ── Share bet helpers ─────────────────────────────────────────
const _flagCanvasCache = {};

// Carrega bandeira via proxy same-origin (/api/flag/{code}) com fallback CDN.
const loadFlagForCanvas = code => {
  if (!code) return Promise.resolve(null);
  const key = code.toLowerCase();
  if (_flagCanvasCache[key]) return _flagCanvasCache[key];

  const tryImg = src => new Promise(res => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });

  _flagCanvasCache[key] = tryImg(`/api/flag/${key}`)
    .then(img => img || tryImg(`https://flagcdn.com/w80/${key}.png`));

  return _flagCanvasCache[key];
};

const loadImgCors = src => {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src + (src.includes('?') ? '&' : '?') + 'v=' + Date.now();
  });
};

const rrect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);    ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const isoToEmoji = code => {
  if (!code || code.length !== 2) return '';
  const offset = 127397; // 0x1F1E0 - 65
  return [...code.toUpperCase()].map(c => String.fromCodePoint(c.charCodeAt(0) + offset)).join('');
};

const generateBetCard = async (bet) => {
  const W = 600, H = 340;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.getElementById('shareCanvas');
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const game         = S.games.find(g => Number(g.id) === Number(bet.jogo_id));
  const bandeiraCasa = bet.bandeira_casa || game?.bandeira_casa
    || teamNameToIso(bet.time_casa) || teamNameToIso(game?.time_casa) || '';
  const bandeiraFora = bet.bandeira_fora || game?.bandeira_fora
    || teamNameToIso(bet.time_fora) || teamNameToIso(game?.time_fora) || '';
  const siteName     = S.siteName || 'BetCopa';
  const siteLogo     = S.siteLogo || null;
  const ligaName     = bet.liga_nome || game?.liga_nome || '';
  const nomeHome     = toPortuguese(bet.time_casa || '').toUpperCase();
  const nomeAway     = toPortuguese(bet.time_fora || '').toUpperCase();
  const cx           = W / 2;

  const [imgHome, imgAway, imgLogo] = await Promise.all([
    loadFlagForCanvas(bandeiraCasa),
    loadFlagForCanvas(bandeiraFora),
    siteLogo ? loadImgCors(siteLogo) : Promise.resolve(null),
  ]);

  // ── Helpers ───────────────────────────────────────────────
  const accentGrad = () => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0,   'rgba(89,255,21,0)');
    g.addColorStop(0.25,'#59ff15');
    g.addColorStop(0.5, '#FFD700');
    g.addColorStop(0.75,'#59ff15');
    g.addColorStop(1,   'rgba(89,255,21,0)');
    return g;
  };

  const drawStar = (x, y, r, color, alpha = 1) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI / 5) - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.42;
      i === 0 ? ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a))
              : ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore();
  };

  // Bandeira genérica: retângulo colorido que funciona para QUALQUER time
  // label = código ISO (2 letras) ou primeiras 2 letras do nome do time como fallback
  const drawFlagGeneric = (label, x, y, fw, fh) => {
    const text = (label || '??').toUpperCase().slice(0, 2);
    const seed = text.charCodeAt(0) * 53 + (text.charCodeAt(1) || 0) * 29;
    const hue  = seed % 360;
    // Fundo degradê
    ctx.save();
    rrect(ctx, x, y, fw, fh, 6);
    const g = ctx.createLinearGradient(x, y, x + fw, y + fh);
    g.addColorStop(0, `hsla(${hue},60%,30%,1)`);
    g.addColorStop(1, `hsla(${hue},45%,18%,1)`);
    ctx.fillStyle = g; ctx.fill();
    // borda colorida
    ctx.strokeStyle = `hsla(${hue},75%,55%,.45)`; ctx.lineWidth = 1.5; ctx.stroke();
    // faixa horizontal central (simula listras de bandeira)
    ctx.fillStyle = `hsla(${hue},85%,60%,.16)`;
    ctx.fillRect(x + 1, y + fh * 0.35, fw - 2, fh * 0.30);
    ctx.restore();
    // sigla centralizada
    ctx.font = `bold ${Math.round(fh * 0.40)}px -apple-system,BlinkMacSystemFont,Arial,sans-serif`;
    ctx.fillStyle = `hsla(${hue},90%,90%,1)`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + fw / 2, y + fh / 2);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  };

  const drawFlagImage = (img, code, teamName, x, y, fw, fh) => {
    const fallbackLabel = code || (teamName || '').slice(0, 2);
    if (img) {
      ctx.save();
      rrect(ctx, x, y, fw, fh, 6); ctx.clip();
      ctx.drawImage(img, x, y, fw, fh);
      ctx.restore();
      ctx.save();
      rrect(ctx, x, y, fw, fh, 6);
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    } else {
      drawFlagGeneric(fallbackLabel, x, y, fw, fh);
    }
  };

  // ── Background ────────────────────────────────────────────
  ctx.fillStyle = '#080f1e';
  ctx.fillRect(0, 0, W, H);

  // Radial center glow
  const glow = ctx.createRadialGradient(cx, H * 0.5, 0, cx, H * 0.5, 260);
  glow.addColorStop(0, 'rgba(0,180,80,.10)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // Subtle dot grid
  ctx.save(); ctx.globalAlpha = 0.04; ctx.fillStyle = '#ffffff';
  for (let gx = 12; gx < W; gx += 24)
    for (let gy = 12; gy < H; gy += 24) {
      ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill();
    }
  ctx.restore();

  // ── Soccer ball particles ─────────────────────────────────
  const drawBall = (bx, by, r, alpha) => {
    ctx.save(); ctx.globalAlpha = alpha;
    // outer circle
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = r * 0.13; ctx.stroke();
    // center pentagon patch
    ctx.beginPath(); ctx.arc(bx, by, r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
    // 5 outer patches at 72° intervals
    for (let i = 0; i < 5; i++) {
      const ang = (i * 2 * Math.PI / 5) - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(bx + r * 0.62 * Math.cos(ang), by + r * 0.62 * Math.sin(ang), r * 0.20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
    }
    // connecting lines from center to patches
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const ang = (i * 2 * Math.PI / 5) - Math.PI / 2;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + r * 0.62 * Math.cos(ang), by + r * 0.62 * Math.sin(ang));
    }
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = r * 0.09; ctx.stroke();
    ctx.restore();
  };
  // deterministic scatter — same positions every render
  const balls = [
    [38,  22,  8,  .10], [558, 18,  6,  .08], [12,  160, 10, .09],
    [582, 140, 7,  .07], [55,  300, 9,  .10], [570, 295, 8,  .08],
    [100, 50,  5,  .07], [500, 55,  6,  .08], [20,  220, 6,  .06],
    [578, 220, 5,  .06], [140, 315, 7,  .08], [460, 320, 6,  .07],
    [280, 18,  5,  .05], [320, 325, 5,  .05], [75,  130, 4,  .05],
    [525, 130, 4,  .05], [200, 330, 4,  .04], [400, 22,  4,  .04],
  ];
  balls.forEach(([bx, by, r, a]) => drawBall(bx, by, r, a));

  // Top accent bar
  ctx.fillStyle = accentGrad(); ctx.fillRect(0, 0, W, 5);

  // ── Header section ────────────────────────────────────────
  // Brand (top-left)
  const logoSz = 26; let brandX = 18;
  if (imgLogo) {
    ctx.save();
    ctx.beginPath(); ctx.arc(brandX + logoSz / 2, 28, logoSz / 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(imgLogo, brandX, 28 - logoSz / 2, logoSz, logoSz);
    ctx.restore();
    brandX += logoSz + 8;
  }
  ctx.font = 'bold 15px -apple-system,BlinkMacSystemFont,Arial,sans-serif';
  ctx.fillStyle = '#59ff15'; ctx.textAlign = 'left';
  ctx.fillText(siteName, brandX, 34);

  // Status badge (top-right)
  if (bet.status === 'ganhou' || bet.status === 'perdido') {
    const isWin = bet.status === 'ganhou';
    const label = isWin ? 'GANHOU!' : 'PERDEU';
    const bg    = isWin ? 'rgba(89,255,21,.20)' : 'rgba(255,71,87,.18)';
    const col   = isWin ? '#59ff15' : '#FF4757';
    ctx.font = 'bold 11px -apple-system,BlinkMacSystemFont,Arial,sans-serif';
    const tw = ctx.measureText(label).width + 20;
    rrect(ctx, W - tw - 14, 18, tw, 22, 11);
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = col; ctx.globalAlpha = .5; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.textAlign = 'right';
    ctx.fillText(label, W - 24, 33); ctx.textAlign = 'left';
  }

  // Competition title (centered)
  if (ligaName) {
    const ligaUpper = ligaName.toUpperCase();
    ctx.font = 'bold 17px -apple-system,BlinkMacSystemFont,Arial,sans-serif';
    ctx.fillStyle = 'rgba(255,215,0,.92)'; ctx.textAlign = 'center';
    const tw = ctx.measureText(ligaUpper).width;
    ctx.fillText(ligaUpper, cx, 64);
    drawStar(cx - tw / 2 - 18, 59, 6, '#FFD700', 0.95);
    drawStar(cx + tw / 2 + 18, 59, 6, '#FFD700', 0.95);
    ctx.beginPath();
    ctx.moveTo(cx - 110, 75); ctx.lineTo(cx + 110, 75);
    ctx.strokeStyle = 'rgba(255,215,0,.22)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.textAlign = 'left';
  }

  // ── Teams section ─────────────────────────────────────────
  const teamY   = 90;   // top of flag area
  const flagW   = 90, flagH = 60; // flag rectangle (3:2 ratio)
  const nameY   = teamY + flagH + 18;
  const homeX   = cx - 155; // left edge of home flag
  const awayX   = cx + 65;  // left edge of away flag

  drawFlagImage(imgHome, bandeiraCasa, nomeHome, homeX, teamY, flagW, flagH);
  drawFlagImage(imgAway, bandeiraFora, nomeAway, awayX, teamY, flagW, flagH);

  // Team names
  ctx.font = 'bold 14px -apple-system,BlinkMacSystemFont,Arial,sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.textAlign = 'center';
  ctx.fillText(nomeHome, homeX + flagW / 2, nameY);
  ctx.fillText(nomeAway, awayX + flagW / 2, nameY);

  // VS bubble in center
  const vsX = cx, vsY = teamY + flagH / 2 + 2;
  ctx.beginPath(); ctx.arc(vsX, vsY, 22, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1828'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = 'bold 13px -apple-system,BlinkMacSystemFont,Arial,sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.50)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('VS', vsX, vsY);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';

  // ── Score box ─────────────────────────────────────────────
  const scoreY = nameY + 22;
  const boxW = 200, boxH = 72;
  rrect(ctx, cx - boxW / 2, scoreY, boxW, boxH, 14);
  const sg = ctx.createLinearGradient(cx - boxW / 2, scoreY, cx + boxW / 2, scoreY + boxH);
  sg.addColorStop(0, 'rgba(89,255,21,.18)');
  sg.addColorStop(1, 'rgba(0,160,60,.08)');
  ctx.fillStyle = sg; ctx.fill();
  ctx.strokeStyle = 'rgba(89,255,21,.50)'; ctx.lineWidth = 1.5; ctx.stroke();

  ctx.font = '700 10px -apple-system,BlinkMacSystemFont,Arial,sans-serif';
  ctx.fillStyle = '#59ff15'; ctx.textAlign = 'center';
  ctx.fillText('MEU PALPITE', cx, scoreY + 18);

  ctx.font = 'bold 36px -apple-system,BlinkMacSystemFont,Arial,sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${bet.placar_casa}  ×  ${bet.placar_fora}`, cx, scoreY + 58);
  ctx.textAlign = 'left';

  // ── Bottom accent bar ─────────────────────────────────────
  ctx.fillStyle = accentGrad(); ctx.fillRect(0, H - 5, W, 5);

  return canvas;
};

let _shareBetId = null;

const openShareModal = async (betId) => {
  _shareBetId = Number(betId);
  const bet = S.bets.find(b => Number(b.id) === _shareBetId);
  if (!bet) return;

  const overlay  = document.getElementById('modalShareOverlay');
  const spinner  = document.getElementById('shareSpinner');
  const canvas   = document.getElementById('shareCanvas');
  const actionBtns = ['btnShareWhatsApp','btnShareTelegram','btnShareFacebook','btnShareTwitter','btnShareNative','btnShareCopyLink'];

  overlay.classList.remove('hidden');
  spinner.classList.remove('hidden');
  spinner.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Gerando imagem…</span>';
  canvas.classList.add('hidden');
  actionBtns.forEach(id => document.getElementById(id)?.classList.add('hidden'));

  try {
    await generateBetCard(bet);
    spinner.classList.add('hidden');
    canvas.classList.remove('hidden');
    ['btnShareWhatsApp','btnShareTelegram','btnShareFacebook','btnShareTwitter','btnShareCopyLink']
      .forEach(id => document.getElementById(id)?.classList.remove('hidden'));
    if (navigator.share) document.getElementById('btnShareNative')?.classList.remove('hidden');
  } catch {
    spinner.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#FF4757"></i><span>Erro ao gerar imagem.</span>';
  }
};

const closeShareModal = () => {
  document.getElementById('modalShareOverlay')?.classList.add('hidden');
  _shareBetId = null;
};

const _ptNames = {
  'afghanistan':'Afeganistão','albania':'Albânia','algeria':'Argélia','angola':'Angola',
  'argentina':'Argentina','australia':'Austrália','austria':'Áustria','bahrain':'Barein',
  'belgium':'Bélgica','bolivia':'Bolívia','bosnia':'Bósnia','brazil':'Brasil',
  'bulgaria':'Bulgária','cameroon':'Camarões','canada':'Canadá','cape verde':'Cabo Verde',
  'chile':'Chile','china':'China','colombia':'Colômbia','congo':'Congo',
  'costa rica':'Costa Rica','croatia':'Croácia','cuba':'Cuba','czech republic':'República Tcheca',
  'denmark':'Dinamarca','dr congo':'RD Congo','ecuador':'Equador','egypt':'Egito',
  'england':'Inglaterra','france':'França','germany':'Alemanha','ghana':'Gana',
  'greece':'Grécia','guatemala':'Guatemala','guinea':'Guiné','honduras':'Honduras',
  'hungary':'Hungria','iceland':'Islândia','india':'Índia','indonesia':'Indonésia',
  'iran':'Irã','iraq':'Iraque','ireland':'Irlanda','israel':'Israel',
  'italy':'Itália','ivory coast':'Costa do Marfim',"côte d'ivoire":'Costa do Marfim',
  'jamaica':'Jamaica','japan':'Japão','jordan':'Jordânia','kenya':'Quênia',
  'kuwait':'Kuwait','mexico':'México','morocco':'Marrocos','netherlands':'Países Baixos',
  'new zealand':'Nova Zelândia','nigeria':'Nigéria','north korea':'Coreia do Norte',
  'norway':'Noruega','panama':'Panamá','paraguay':'Paraguai','peru':'Peru',
  'philippines':'Filipinas','poland':'Polônia','portugal':'Portugal','qatar':'Catar',
  'romania':'Romênia','russia':'Rússia','saudi arabia':'Arábia Saudita','scotland':'Escócia',
  'senegal':'Senegal','serbia':'Sérvia','slovakia':'Eslováquia','south africa':'África do Sul',
  'south korea':'Coreia do Sul','spain':'Espanha','sweden':'Suécia','switzerland':'Suíça',
  'thailand':'Tailândia','trinidad and tobago':'Trinidad e Tobago','tunisia':'Tunísia',
  'turkey':'Turquia','ukraine':'Ucrânia','united arab emirates':'Emirados Árabes Unidos',
  'united states':'Estados Unidos','usa':'EUA','uruguay':'Uruguai','venezuela':'Venezuela',
  'wales':'País de Gales','zambia':'Zâmbia','zimbabwe':'Zimbábue',
};
const toPortuguese = name => {
  if (!name) return name;
  return _ptNames[name.toLowerCase()] || name;
};

// Team name → ISO 3166 flag code (covers most national teams in PT and EN)
const _teamIso = {
  'brasil':'br','brazil':'br','argentina':'ar','franca':'fr','france':'fr',
  'alemanha':'de','germany':'de','espanha':'es','spain':'es','portugal':'pt',
  'marrocos':'ma','morocco':'ma','escocia':'gb-sct','escócia':'gb-sct','scotland':'gb-sct',
  'inglaterra':'gb-eng','england':'gb-eng','pais de gales':'gb-wls','wales':'gb-wls',
  'país de gales':'gb-wls','irlanda do norte':'gb-nir','northern ireland':'gb-nir',
  'irlanda':'ie','ireland':'ie','belgica':'be','bélgica':'be','belgium':'be',
  'croacia':'hr','croácia':'hr','croatia':'hr','japao':'jp','japão':'jp','japan':'jp',
  'mexico':'mx','méxico':'mx','colombia':'co','colômbia':'co','chile':'cl','peru':'pe',
  'uruguai':'uy','uruguay':'uy','equador':'ec','ecuador':'ec','bolivia':'bo','bolívia':'bo',
  'paraguai':'py','paraguay':'py','venezuela':'ve','estados unidos':'us','usa':'us',
  'canada':'ca','australia':'au','austrália':'au','nigeria':'ng','nigéria':'ng','nigeria':'ng',
  'ghana':'gh','gana':'gh','senegal':'sn','camaroes':'cm','camarões':'cm','cameroon':'cm',
  'egito':'eg','egypt':'eg','africa do sul':'za','áfrica do sul':'za','south africa':'za',
  'italia':'it','itália':'it','italy':'it','russia':'ru','rússia':'ru',
  'turquia':'tr','turkey':'tr','suica':'ch','suíça':'ch','switzerland':'ch',
  'dinamarca':'dk','denmark':'dk','suecia':'se','suécia':'se','sweden':'se',
  'noruega':'no','norway':'no','austria':'at','áustria':'at',
  'polonia':'pl','polônia':'pl','poland':'pl','ucrania':'ua','ucrânia':'ua','ukraine':'ua',
  'servia':'rs','sérvia':'rs','serbia':'rs','grecia':'gr','grécia':'gr','greece':'gr',
  'hungria':'hu','hungary':'hu','romenia':'ro','romênia':'ro','romania':'ro',
  'paises baixos':'nl','países baixos':'nl','netherlands':'nl','holanda':'nl',
  'coreia do sul':'kr','south korea':'kr','coreia do norte':'kp','north korea':'kp',
  'china':'cn','india':'in','índia':'in','indonesia':'id','indonésia':'id',
  'tailandia':'th','tailândia':'th','thailand':'th','filipinas':'ph','philippines':'ph',
  'arabia saudita':'sa','arábia saudita':'sa','saudi arabia':'sa',
  'emirados arabes':'ae','uae':'ae','iran':'ir','irã':'ir',
  'nigeria':'ng','tunisia':'tn','tunísia':'tn','tunisia':'tn','mali':'ml',
  'costa do marfim':'ci','ivory coast':'ci','republica tcheca':'cz','czech republic':'cz',
  'eslovaquia':'sk','slovakia':'sk','eslovenia':'si','slovenia':'si',
  'albania':'al','albânia':'al','finlandia':'fi','finlândia':'fi','finland':'fi',
  'islandia':'is','islândia':'is','iceland':'is','bulgaria':'bg','bulgária':'bg',
  'roménia':'ro','letônia':'lv','latvia':'lv','lituania':'lt','lithuania':'lt',
  'estonia':'ee','estônia':'ee','estonia':'ee','bielorrussia':'by','belarus':'by',
  'georgia':'ge','armênia':'am','armenia':'am','azerbaijao':'az','azerbaijan':'az',
  'cazaquistao':'kz','kazakhstan':'kz','uzbequistao':'uz','uzbekistan':'uz',
  'chile':'cl','jamaica':'jm','cuba':'cu','haiti':'ht','trinidad e tobago':'tt',
  'trinidad and tobago':'tt','costa rica':'cr','guatemala':'gt','honduras':'hn',
  'el salvador':'sv','nicaragua':'ni','panama':'pa','panamá':'pa',
  'quenia':'ke','kenya':'ke','tanzania':'tz','tanzânia':'tz','angola':'ao',
  'mocambique':'mz','moçambique':'mz','mozambique':'mz','zimbabue':'zw','zimbabwe':'zw',
  'zambia':'zm','zâmbia':'zm','etiópia':'et','ethiopia':'et','argelia':'dz','algeria':'dz',
  'libia':'ly','libya':'ly','tunísia':'tn','sudao':'sd','sudan':'sd',
};

const teamNameToIso = name => {
  if (!name) return null;
  const key = name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '').trim();
  return FLAGS[key] || _teamIso[key] || null;
};

const getShareText = (bet) => {
  const game  = S.games.find(g => Number(g.id) === Number(bet?.jogo_id));
  const fH    = game?.bandeira_casa ? flagEmoji(game.bandeira_casa) + ' ' : '';
  const fA    = game?.bandeira_fora ? flagEmoji(game.bandeira_fora) + ' ' : '';
  const nH    = toPortuguese(bet?.time_casa || '').toUpperCase();
  const nA    = toPortuguese(bet?.time_fora || '').toUpperCase();
  const score = `${bet?.placar_casa ?? 0} × ${bet?.placar_fora ?? 0}`;
  const liga  = game?.liga_nome ? `🏆 ${game.liga_nome.toUpperCase()} 🏆\n` : '';
  const url   = bet?.id ? `${location.origin}/share/bet/${bet.id}` : location.origin;

  const live  = game ? isGameLive(game) : false;
  const final = game?.status === 'finalizado';
  const hook  = final ? 'O resultado já saiu, olha aí: 👉'
               : live  ? 'O jogo está rolando AGORA, olha aí: 👉'
               :         'O jogo vai começar em breve, olha aí: 👉';

  return `${liga}Meu palpite foi ${fH}${nH} ${score} ${fA}${nA}, será que acertei?\n${hook}\n${url}`;
};

const shareGameLink = async (gameId) => openGameShareModal(gameId);

const generateGameCard = async (game) => {
  const W = 600, H = 315;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.getElementById('gameShareCanvas');
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const isLive   = isGameLive(game);
  const isFinal  = game.status === 'finalizado';
  const score    = game.placar_real ? game.placar_real.replace('x', ' × ') : null;
  const myBet    = S.bets.find(b => Number(b.jogo_id) === Number(game.id));
  const nomeHome = toPortuguese(game.time_casa || '').toUpperCase();
  const nomeAway = toPortuguese(game.time_fora || '').toUpperCase();
  const ligaName = game.liga_nome || '';
  const cx       = W / 2;

  const homeCode = game.bandeira_casa || teamNameToIso(game.time_casa) || '';
  const awayCode = game.bandeira_fora || teamNameToIso(game.time_fora) || '';

  const [imgHome, imgAway] = await Promise.all([
    loadFlagForCanvas(homeCode),
    loadFlagForCanvas(awayCode),
  ]);

  const F = (sz, w = 'bold') =>
    `${w} ${sz}px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif`;

  const accentGrad = () => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0,    'rgba(89,255,21,0)');
    g.addColorStop(0.25, '#59ff15');
    g.addColorStop(0.5,  '#FFD700');
    g.addColorStop(0.75, '#59ff15');
    g.addColorStop(1,    'rgba(89,255,21,0)');
    return g;
  };

  // Flag retangular com cantos arredondados
  const drawFlag = (img, code, name, fx, fy, fw, fh) => {
    const r = 9;
    ctx.save();
    rrect(ctx, fx, fy, fw, fh, r);
    ctx.clip();
    if (img) {
      const iw = img.naturalWidth  || img.width  || fw;
      const ih = img.naturalHeight || img.height || fh;
      const scale = Math.max(fw / iw, fh / ih);
      const sw = iw * scale, sh = ih * scale;
      ctx.drawImage(img, fx + (fw - sw) / 2, fy + (fh - sh) / 2, sw, sh);
    } else {
      const ini  = ((code || name || '??').toUpperCase()).slice(0, 2);
      const seed = ini.charCodeAt(0) * 53 + (ini.charCodeAt(1) || 0) * 29;
      const hue  = seed % 360;
      const gr   = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
      gr.addColorStop(0, `hsla(${hue},55%,28%,1)`);
      gr.addColorStop(1, `hsla(${hue},40%,14%,1)`);
      ctx.fillStyle = gr; ctx.fillRect(fx, fy, fw, fh);
      ctx.font = F(fh * 0.40); ctx.fillStyle = `hsla(${hue},80%,86%,1)`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ini, fx + fw / 2, fy + fh / 2);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.5;
    rrect(ctx, fx, fy, fw, fh, r); ctx.stroke();
  };

  // ── Background ──────────────────────────────────────────────
  ctx.fillStyle = '#080f1e'; ctx.fillRect(0, 0, W, H);
  const bgGlow = ctx.createRadialGradient(cx, H / 2, 0, cx, H / 2, 300);
  bgGlow.addColorStop(0, 'rgba(0,160,70,.13)');
  bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bgGlow; ctx.fillRect(0, 0, W, H);

  ctx.save(); ctx.globalAlpha = 0.025; ctx.fillStyle = '#fff';
  for (let gx = 12; gx < W; gx += 24)
    for (let gy = 12; gy < H; gy += 24) { ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();

  ctx.fillStyle = accentGrad(); ctx.fillRect(0, 0, W, 5);

  // ── Header: brand + status badge ────────────────────────────
  ctx.font = F(13); ctx.fillStyle = '#59ff15'; ctx.textAlign = 'left';
  ctx.fillText('BetCopa', 18, 26);

  {
    ctx.font = F(10);
    let label, bg, col;
    if (isLive) {
      label = score ? `● ${score}  •  AO VIVO` : '● AO VIVO';
      bg = 'rgba(239,68,68,.22)'; col = '#FF6B6B';
    } else if (isFinal) {
      label = score ? `ENCERRADO  •  ${score}` : 'ENCERRADO';
      bg = 'rgba(107,114,128,.18)'; col = '#9CA3AF';
    } else {
      const dt = new Date(game.data_hora);
      label = dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      bg = 'rgba(89,255,21,.15)'; col = '#59ff15';
    }
    const tw = ctx.measureText(label).width + 22;
    rrect(ctx, W - tw - 12, 10, tw, 22, 11);
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = col; ctx.globalAlpha = .5; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
    if (isLive) {
      ctx.beginPath(); ctx.arc(W - tw - 12 + 9, 21, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#EF4444';
      ctx.shadowColor = 'rgba(239,68,68,.9)'; ctx.shadowBlur = 5;
      ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.fillStyle = col; ctx.textAlign = 'right';
    ctx.fillText(label, W - 21, 25);
  }

  // ── Título da liga — fixo próximo ao topo, fora do bloco centralizado ──
  const LIGA_Y = 54;                    // baseline do título (logo abaixo do header)
  const LIGA_BOTTOM = ligaName ? 70 : 38; // onde o espaço de conteúdo começa

  if (ligaName) {
    ctx.font = F(23, '700'); ctx.fillStyle = 'rgba(255,215,0,.92)'; ctx.textAlign = 'center';
    ctx.fillText(`🏆  ${ligaName.toUpperCase()}  🏆`, cx, LIGA_Y);
  }

  // ── Cálculo de layout: bandeiras + nomes + info centralizados abaixo do título ──
  const flagW  = 155, flagH = 94;
  const gap    = 80;
  const teamNH = 20;
  const infoH  = 28;
  const blockH = flagH + teamNH + 12 + infoH;
  const usable = H - 14 - LIGA_BOTTOM;
  const flagY  = LIGA_BOTTOM + Math.max(4, (usable - blockH) / 2);
  const nameY  = flagY + flagH + 18;
  const divY   = nameY + 12;
  const infoY  = divY + 12;

  const homeFx = cx - flagW - gap / 2;
  const awayFx = cx + gap / 2;

  drawFlag(imgHome, homeCode, nomeHome, homeFx, flagY, flagW, flagH);
  drawFlag(imgAway, awayCode, nomeAway, awayFx, flagY, flagW, flagH);

  // Nomes das equipes — tamanho adaptativo para nomes longos
  const nameFont = (name) => {
    const maxW = flagW + 20;
    let sz = 17;
    ctx.font = F(sz, '700');
    while (sz > 11 && ctx.measureText(name).width > maxW) { sz -= 1; ctx.font = F(sz, '700'); }
    return sz;
  };
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.textAlign = 'center';
  ctx.font = F(nameFont(nomeHome), '700');
  ctx.fillText(nomeHome, homeFx + flagW / 2, nameY);
  ctx.font = F(nameFont(nomeAway), '700');
  ctx.fillText(nomeAway, awayFx + flagW / 2, nameY);

  // ── Centro: placar ou × vermelho ─────────────────────────────
  const midX = cx;
  const midY = flagY + flagH / 2;

  if ((isLive || isFinal) && score) {
    const parts = score.split('×').map(p => p.trim());
    const g1 = parts[0] || '-', g2 = parts[1] || '-';
    ctx.font = F(44, '800'); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const g1W = ctx.measureText(g1).width;
    const xTxt = '×';
    const xW   = ctx.measureText(xTxt).width;
    const g2W  = ctx.measureText(g2).width;
    const pad  = 8;
    let sx = midX - (g1W + pad + xW + pad + g2W) / 2;

    ctx.save();
    ctx.shadowColor = isLive ? 'rgba(239,68,68,.55)' : 'rgba(200,200,200,.30)';
    ctx.shadowBlur  = 18;
    ctx.fillStyle = '#fff'; ctx.fillText(g1, sx, midY); sx += g1W + pad;
    ctx.fillStyle = '#EF4444'; ctx.fillText(xTxt, sx, midY); sx += xW + pad;
    ctx.fillStyle = '#fff'; ctx.fillText(g2, sx, midY);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  } else {
    ctx.save();
    ctx.shadowColor = 'rgba(239,68,68,.55)';
    ctx.shadowBlur  = 22;
    ctx.font = F(64, '800'); ctx.fillStyle = '#EF4444';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('×', midX, midY);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  // ── Divisor ──────────────────────────────────────────────────
  ctx.save(); ctx.globalAlpha = 0.09;
  const dg = ctx.createLinearGradient(0, 0, W, 0);
  dg.addColorStop(0, 'transparent'); dg.addColorStop(.5, '#59ff15'); dg.addColorStop(1, 'transparent');
  ctx.strokeStyle = dg; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(30, divY); ctx.lineTo(W - 30, divY); ctx.stroke();
  ctx.restore();

  // ── Área de info ─────────────────────────────────────────────

  if (myBet) {
    const won = myBet.status === 'ganhou';
    const lost = myBet.status === 'perdeu';
    const infoCol = won ? '#59ff15' : (lost ? '#EF4444' : 'rgba(255,255,255,.55)');
    ctx.font = F(9, '600'); ctx.fillStyle = infoCol; ctx.textAlign = 'center';
    ctx.fillText('MEU PALPITE', cx, infoY);
    ctx.save();
    ctx.shadowColor = infoCol; ctx.shadowBlur = won || lost ? 10 : 0;
    ctx.font = F(28, '800'); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.fillText(`${myBet.placar_casa}  ×  ${myBet.placar_fora}`, cx, infoY + 20);
    ctx.restore(); ctx.textBaseline = 'alphabetic';
  } else if (!isLive && !isFinal) {
    const dt   = new Date(game.data_hora);
    const wday = dt.toLocaleDateString('pt-BR', { weekday: 'short' });
    const date = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const time = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const label = `${wday}, ${date}  ·  ${time}`;

    const clockR = 7;
    const clockColor = 'rgba(251,146,60,.95)';
    const textColor  = '#fbd38d';
    const badgeFontSz = 13;
    ctx.font = F(badgeFontSz, '600');
    const textW = ctx.measureText(label).width;
    const gap   = 6;
    const totalW = clockR * 2 + gap + textW;
    const badgeW = totalW + 28;
    const badgeH = 28;
    const badgeX = cx - badgeW / 2;
    const badgeY = infoY + 4;
    const badgeR = 7;

    // Badge laranja
    rrect(ctx, badgeX, badgeY, badgeW, badgeH, badgeR);
    ctx.fillStyle = 'rgba(251,146,60,.18)'; ctx.fill();
    rrect(ctx, badgeX, badgeY, badgeW, badgeH, badgeR);
    ctx.strokeStyle = 'rgba(251,146,60,.70)'; ctx.lineWidth = 1.2; ctx.stroke();

    // Mini clock icon
    const clkX = badgeX + 14 + clockR;
    const clkY = badgeY + badgeH / 2;
    ctx.save();
    ctx.strokeStyle = clockColor; ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(clkX, clkY, clockR, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(clkX, clkY); ctx.lineTo(clkX, clkY - clockR * 0.65); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(clkX, clkY); ctx.lineTo(clkX + clockR * 0.5, clkY + clockR * 0.3); ctx.stroke();
    ctx.restore();

    // Date text
    ctx.font = F(badgeFontSz, '600');
    ctx.fillStyle = textColor; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, clkX + clockR + gap, clkY);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
  } else if (isFinal && !score) {
    ctx.font = F(10, '600'); ctx.fillStyle = 'rgba(156,163,175,.65)'; ctx.textAlign = 'center';
    ctx.fillText('RESULTADO FINAL', cx, infoY + 12);
  } else if (isLive && !score) {
    ctx.font = F(10, '600'); ctx.fillStyle = 'rgba(239,68,68,.70)'; ctx.textAlign = 'center';
    ctx.fillText('EM ANDAMENTO', cx, infoY + 12);
  }

  // Watermark
  ctx.font = F(9, '400'); ctx.fillStyle = 'rgba(107,114,128,.30)'; ctx.textAlign = 'center';
  ctx.fillText('betcopa.online', cx, H - 9);

  ctx.fillStyle = accentGrad(); ctx.fillRect(0, H - 5, W, 5);
  return canvas;
};

let _shareGameId = null;

const openGameShareModal = async (gameId) => {
  _shareGameId = Number(gameId);
  const game = S.games.find(g => Number(g.id) === _shareGameId);
  if (!game) return;

  const overlay = document.getElementById('modalGameShareOverlay');
  const spinner = document.getElementById('gameShareSpinner');
  const canvas  = document.getElementById('gameShareCanvas');

  overlay.classList.remove('hidden');
  spinner.classList.remove('hidden');
  spinner.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Gerando imagem…</span>';
  canvas.classList.add('hidden');
  ['btnGameShareWhatsApp','btnGameShareTelegram','btnGameShareTwitter','btnGameShareFacebook','btnGameShareNative','btnGameShareCopyLink']
    .forEach(id => document.getElementById(id)?.classList.add('hidden'));

  try {
    await generateGameCard(game);
    spinner.classList.add('hidden');
    canvas.classList.remove('hidden');
    ['btnGameShareWhatsApp','btnGameShareTelegram','btnGameShareFacebook','btnGameShareTwitter','btnGameShareCopyLink']
      .forEach(id => document.getElementById(id)?.classList.remove('hidden'));
    if (navigator.share) document.getElementById('btnGameShareNative')?.classList.remove('hidden');
  } catch {
    spinner.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#FF4757"></i><span>Erro ao gerar imagem.</span>';
  }
};

const closeGameShareModal = () => {
  document.getElementById('modalGameShareOverlay')?.classList.add('hidden');
  _shareGameId = null;
};

const getGameShareText = (game) => {
  const url     = `${location.origin}/share/game/${game.id}`;
  const isLive  = isGameLive(game);
  const isFinal = game.status === 'finalizado';
  const score   = game.placar_real ? game.placar_real.replace('x', ' x ') : null;
  const myBet   = S.bets.find(b => Number(b.jogo_id) === Number(game.id));
  const fH = game.bandeira_casa ? flagEmoji(game.bandeira_casa) + ' ' : '';
  const fA = game.bandeira_fora ? flagEmoji(game.bandeira_fora) + ' ' : '';
  const nH = toPortuguese(game.time_casa || '').toUpperCase();
  const nA = toPortuguese(game.time_fora || '').toUpperCase();

  if (isLive && score) {
    const bs = myBet ? `${myBet.placar_casa}×${myBet.placar_fora}` : null;
    if (bs) return `🔴 CARA, olha esse jogo!\n${fH}${nH} ${score} ${fA}${nA} AO VIVO agora...\nEu chutei ${bs} — SE VIRAR EU GANHO 🤑\n👉 ${url}`;
    return `🔴 OLHA ESSE JOGO!\n${fH}${nH} ${score} ${fA}${nA} AO VIVO agora!\nAinda pode virar — quem você acha que ganha? 👀\n${url}`;
  }
  if (isLive) {
    const bs = myBet ? `${myBet.placar_casa}×${myBet.placar_fora}` : null;
    if (bs) return `⚽ ${fH}${nH} × ${fA}${nA} COMEÇOU AO VIVO!\nEu chutei ${bs} — torce comigo 🙏\n${url}`;
    return `⚽ COMEÇOU! ${fH}${nH} × ${fA}${nA} ao vivo agora!\nEntra aqui e aposta no resultado — dá pra ganhar prêmio 🏆\n${url}`;
  }
  if (isFinal && score) {
    if (myBet) {
      const bs = `${myBet.placar_casa}×${myBet.placar_fora}`;
      if (myBet.status === 'ganhou') {
        return `🏆 ACERTEI O PLACAR!\n${fH}${nH} ${score} ${fA}${nA}\nEu chutei exatamente ${bs} no BetCopa e GANHEI! 🎉\nVocê também pode: ${url}`;
      }
      return `😅 Quase! Eu chutei ${bs}, mas saiu ${score}...\n${fH}${nH} × ${fA}${nA} | BetCopa\nNa próxima acerto! Entra: ${url}`;
    }
    return `⚽ Saiu o resultado: ${fH}${nH} ${score} ${fA}${nA}\nVocê teria acertado o placar? Testa no próximo jogo: ${url}`;
  }
  const dt   = new Date(game.data_hora);
  const when = dt.toLocaleString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  const date = dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
  if (myBet) {
    const bs = `${myBet.placar_casa}×${myBet.placar_fora}`;
    return `🔥 Fiz meu palpite: ${fH}${nH} ${bs} ${fA}${nA}\nComeça hoje às ${when} — se eu acertar o placar exato GANHO prêmio!\nVocê chutaria diferente? 👉 ${url}`;
  }
  return `⚽ ${fH}${nH} × ${fA}${nA} hoje às ${when}\nEu ainda não sei quanto vai ser... qual seria seu palpite?\nEntra no BetCopa e tenta a sorte: ${url}`;
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

    const game     = S.games.find(g => g.id === b.jogo_id);
    const homeCode = b.bandeira_casa || game?.bandeira_casa || teamNameToIso(game?.time_casa || b.time_casa) || '';
    const awayCode = b.bandeira_fora || game?.bandeira_fora || teamNameToIso(game?.time_fora || b.time_fora) || '';
    const homeFlag = homeCode ? `<img src="${flagUrl(homeCode)}" onerror="this.src='${flagUrlCdn(homeCode)}'" class="bet-flag" alt="">` : '';
    const awayFlag = awayCode ? `<img src="${flagUrl(awayCode)}" onerror="this.src='${flagUrlCdn(awayCode)}'" class="bet-flag" alt="">` : '';

    const gameIsLive = game ? isGameLive(game) : false;
    const statusBadge = b.status === 'pendente'
      ? `<span class="badge badge--far"><i class="fa-solid fa-clock"></i> Pagamento Pendente</span>`
      : b.status === 'pago'
      ? `<span class="badge badge--confirmed"><i class="fa-solid fa-circle-check"></i> Pagamento Concluído</span>`
      : b.status === 'confirmado' && gameIsLive
      ? `<span class="badge badge--live"><i class="fa-solid fa-circle"></i> Jogo em Andamento</span>`
      : b.status === 'confirmado'
      ? `<span class="badge badge--soon"><i class="fa-solid fa-hourglass-half"></i> Aguardando o Jogo</span>`
      : isWin
      ? `<span class="badge badge--open"><i class="fa-solid fa-trophy"></i> Acertou o Placar!</span>`
      : isLoss
      ? `<span class="badge badge--closed"><i class="fa-solid fa-circle-xmark"></i> Placar Errado</span>`
      : '';

    const payHtml = b.status === 'pendente'
      ? `<button class="btn btn--primary btn--sm" data-action="pay" data-id="${b.id}"><i class="fa-brands fa-pix"></i> Pagar PIX</button>`
      : b.status === 'pago'
      ? `<button class="btn btn--primary btn--sm" data-action="repay" data-id="${b.id}"><i class="fa-brands fa-pix"></i> Ver PIX</button>
         <button class="btn btn--ghost btn--sm" data-action="confirm" data-id="${b.id}"><i class="fa-solid fa-circle-check"></i> Já Paguei</button>`
      : '';

    return `
      <div class="bet-card ${isWin ? 'bet-card--win' : ''} ${isLoss ? 'bet-card--loss' : ''}">

        <!-- Linha 1: times + badge -->
        <div class="bet-card__header">
          <div class="bet-card__teams">
            ${homeFlag}<strong>${b.time_casa}</strong>
            <span class="bet-card__vs">×</span>
            ${awayFlag}<strong>${b.time_fora}</strong>
          </div>
          ${statusBadge}
        </div>

        <!-- Linha 2: palpite + timeline -->
        <div class="bet-card__palpite"><i class="fa-solid fa-bullseye"></i> Palpite: ${(() => {
          const h = Number(b.placar_casa), a = Number(b.placar_fora);
          const hClass = h > a ? 'score--win' : h < a ? 'score--lose' : 'score--draw';
          const aClass = a > h ? 'score--win' : a < h ? 'score--lose' : 'score--draw';
          return `<span class="${hClass}">${b.placar_casa}</span> × <span class="${aClass}">${b.placar_fora}</span>`;
        })()}</div>
        ${betTimeline(b.status)}

        <!-- Linha 3: stats + ação de pagamento -->
        <div class="bet-card__footer">
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
          ${payHtml ? `<div class="bet-card__actions">${payHtml}</div>` : ''}
        </div>

        <!-- Linha 4: compartilhar -->
        <div class="bet-card__share">
          <button class="bet-card__share-btn" data-action="share" data-id="${b.id}">
            <i class="fa-solid fa-share-nodes"></i> ${isWin ? 'Compartilhar Acerto 🏆' : isLoss ? 'Compartilhar Resultado' : 'Compartilhar Palpite'}
          </button>
        </div>
      </div>`;
  }).join('') + _pager(_betsPage, _betsTotal, BETS_LIMIT, 'my-bets');

  // Pré-aquece o cache de bandeiras em background — quando o usuário
  // clicar em "Compartilhar" as imagens já estarão prontas
  S.bets.forEach(b => {
    if (b.bandeira_casa) loadFlagForCanvas(b.bandeira_casa);
    if (b.bandeira_fora) loadFlagForCanvas(b.bandeira_fora);
  });
};

// ── Resultados ────────────────────────────────────────────────
let _resSearch     = '';
let _resDateFilter = 'all';

const renderResultCard = (g) => {
  const parts     = g.placar_real ? g.placar_real.split('x') : null;
  const homeGoals = parts ? parseInt(parts[0]) : null;
  const awayGoals = parts ? parseInt(parts[1]) : null;
  const homeWin   = homeGoals !== null && homeGoals > awayGoals;
  const awayWin   = awayGoals !== null && awayGoals > homeGoals;
  const draw      = homeGoals !== null && homeGoals === awayGoals;
  const hasScore  = homeGoals !== null;

  const emblemH = g.logo_casa
    ? `<img src="${g.logo_casa}" class="rc__emblem-img" alt="${g.time_casa}" loading="lazy">`
    : `<span class="rc__emblem-flag">${flagEmoji(g.bandeira_casa || '')}</span>`;
  const emblemA = g.logo_fora
    ? `<img src="${g.logo_fora}" class="rc__emblem-img" alt="${g.time_fora}" loading="lazy">`
    : `<span class="rc__emblem-flag">${flagEmoji(g.bandeira_fora || '')}</span>`;

  const homeMod = !hasScore ? '' : homeWin ? 'rc__team--win' : draw ? 'rc__team--draw' : 'rc__team--loss';
  const awayMod = !hasScore ? '' : awayWin ? 'rc__team--win' : draw ? 'rc__team--draw' : 'rc__team--loss';
  const hScMod  = !hasScore ? '' : homeWin ? 'rc__score--win' : draw ? 'rc__score--draw' : 'rc__score--loss';
  const aScMod  = !hasScore ? '' : awayWin ? 'rc__score--win' : draw ? 'rc__score--draw' : 'rc__score--loss';

  const timeStr     = new Date(g.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const leagueLabel = g.liga_nome ? (leagueShortName(g.liga_nome) || g.liga_nome) : '';

  return `
    <div class="rc">
      <div class="rc__meta">
        <span class="rc__league">${leagueLabel}</span>
        <time class="rc__time">${timeStr}</time>
      </div>
      <div class="rc__row">
        <div class="rc__team rc__team--home ${homeMod}">
          <div class="rc__emblem">${emblemH}</div>
          <span class="rc__team-name">${g.time_casa}</span>
        </div>
        <div class="rc__scoreline">
          <strong class="rc__score ${hScMod}">${homeGoals !== null ? homeGoals : '—'}</strong>
          <span class="rc__sep">×</span>
          <strong class="rc__score ${aScMod}">${awayGoals !== null ? awayGoals : '—'}</strong>
        </div>
        <div class="rc__team rc__team--away ${awayMod}">
          <span class="rc__team-name">${g.time_fora}</span>
          <div class="rc__emblem">${emblemA}</div>
        </div>
      </div>
    </div>`;
};

const renderResultados = () => {
  let games = S.games.filter(g => g.status === 'finalizado');

  const q = _resSearch.trim().toLowerCase();
  if (q) games = games.filter(g =>
    g.time_casa.toLowerCase().includes(q) ||
    g.time_fora.toLowerCase().includes(q) ||
    (g.liga_nome || '').toLowerCase().includes(q)
  );

  if (_resDateFilter === 'hoje') {
    const today = new Date().toDateString();
    games = games.filter(g => new Date(g.data_hora).toDateString() === today);
  } else if (_resDateFilter === 'semana') {
    const since = Date.now() - 7 * 24 * 3600_000;
    games = games.filter(g => new Date(g.data_hora) >= since);
  }

  games.sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));

  const list  = document.getElementById('resultsList');
  const empty = document.getElementById('resultsEmpty');
  if (!list || !empty) return;

  if (!games.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  // Agrupar por data
  const groups = new Map();
  games.forEach(g => {
    const d   = new Date(g.data_hora);
    const key = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  });

  list.innerHTML = [...groups.entries()].map(([dateLabel, gms]) => `
    <div class="res-group">
      <div class="res-group__header">
        <span class="res-group__date">${dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</span>
        <span class="res-group__count">${gms.length} jogo${gms.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="res-group__list">${gms.map(renderResultCard).join('')}</div>
    </div>`).join('');
};

// ── Tabela de Grupos ──────────────────────────────────────────
const fmtGroupLabel = (g) => g
  ? g.replace(/^Group /i, 'Grupo ').replace(/^GROUP_/, 'Grupo ')
  : '';

const renderGrupos = (standings) => {
  const grid  = document.getElementById('gruposGrid');
  const empty = document.getElementById('gruposEmpty');
  if (!grid || !empty) return;

  // A API pode retornar stage "GROUP_STAGE" ou "ALL" dependendo do torneio/fase
  // Identificamos grupos pela presença do campo group com "Group X" ou "GROUP_X"
  const groups = standings.filter(s => s.type === 'TOTAL' && s.group && /group/i.test(s.group));

  if (!groups.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = groups.map(group => {
    const label = fmtGroupLabel(group.group);
    const rows  = group.table.map((row, i) => {
      const pos        = row.position ?? i + 1;
      const cls        = pos <= 2 ? 'gt__row--qualified' : pos === 3 ? 'gt__row--playoff' : '';
      const name       = teamNamePt(row.team?.shortName || row.team?.name || '?');
      const crest      = row.team?.crest
        ? `<img src="${row.team.crest}" class="gt__crest" alt="${name}" loading="lazy">`
        : `<span class="gt__crest-ph"></span>`;
      const gd         = row.goalDifference >= 0 ? `+${row.goalDifference}` : row.goalDifference;
      return `
        <tr class="gt__row ${cls}">
          <td class="gt__pos">${pos}</td>
          <td class="gt__team"><div class="gt__team-inner">${crest}<span>${name}</span></div></td>
          <td>${row.playedGames ?? 0}</td>
          <td>${row.won ?? 0}</td>
          <td>${row.draw ?? 0}</td>
          <td>${row.lost ?? 0}</td>
          <td>${row.goalsFor ?? 0}</td>
          <td>${row.goalsAgainst ?? 0}</td>
          <td class="gt__gd">${gd}</td>
          <td class="gt__pts">${row.points ?? 0}</td>
        </tr>`;
    }).join('');

    return `
      <div class="gt">
        <div class="gt__header">${label}</div>
        <table class="gt__table">
          <thead>
            <tr>
              <th>#</th>
              <th class="gt__th-team">Seleção</th>
              <th title="Jogos">J</th>
              <th title="Vitórias">V</th>
              <th title="Empates">E</th>
              <th title="Derrotas">D</th>
              <th title="Gols Pró">GP</th>
              <th title="Gols Contra">GC</th>
              <th title="Saldo de Gols">SG</th>
              <th title="Pontos">PT</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');
};

const loadGrupos = async (force = false) => {
  const grid  = document.getElementById('gruposGrid');
  const empty = document.getElementById('gruposEmpty');
  const info  = document.getElementById('gruposCacheInfo');
  const btn   = document.getElementById('btnRefreshGrupos');
  if (!grid) return;

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
  grid.innerHTML = '<p class="text--muted" style="padding:2rem;text-align:center"><i class="fa-solid fa-spinner fa-spin"></i> Carregando grupos…</p>';
  empty?.classList.add('hidden');

  try {
    const url  = '/api/jogos/standings' + (force ? '?refresh=1' : '');
    const data = await api(url);

    if (data.warning && info) { info.textContent = '⚠ ' + data.warning; info.classList.remove('hidden'); }
    else if (info) info.classList.add('hidden');

    if (data.cached_at && info && !data.warning) {
      const age = Math.round((Date.now() / 1000 - data.cached_at) / 60);
      info.textContent = age < 2 ? 'Atualizado agora' : `Cache de ${age} min atrás`;
      info.classList.remove('hidden');
    }

    renderGrupos(data.standings || []);
  } catch (err) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('i').nextSibling.textContent = ' Erro ao carregar grupos.';
    toast(err.message || 'Erro ao carregar tabela de grupos.', 'danger');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate"></i>'; }
  }
};

// ── Ranking ───────────────────────────────────────────────────
const renderRanking = async () => {
  let data;
  try { data = await api('/api/ranking'); } catch { return; }

  const winsEl    = document.getElementById('rankingWinners');
  const nearEl    = document.getElementById('rankingNear');
  const countEl   = document.getElementById('rankingWinsCount');
  document.getElementById('rankingWinnerSpot')?.classList.add('hidden');

  const MEDAL_EMOJI  = ['🥇', '🥈', '🥉'];
  const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

  const teamImgs = (r) => {
    const IS = 'class="hf-flag"';
    const imgH = r.logo_casa   ? `<img src="${escHtml(r.logo_casa)}" ${IS} onerror="this.style.display='none'">`
               : r.bandeira_casa ? `<img src="${escHtml(flagUrl(r.bandeira_casa))}" ${IS} onerror="this.style.display='none'">` : '';
    const imgA = r.logo_fora   ? `<img src="${escHtml(r.logo_fora)}" ${IS} onerror="this.style.display='none'">`
               : r.bandeira_fora ? `<img src="${escHtml(flagUrl(r.bandeira_fora))}" ${IS} onerror="this.style.display='none'">` : '';
    const [tc, tf] = r.jogo.split(' x ');
    return { imgH, imgA, tc: escHtml(teamNamePt(tc)), tf: escHtml(teamNamePt(tf)) };
  };

  const initial = (r) => (r.nome_real || r.nome || '?').charAt(0).toUpperCase();

  // ── Ganhadores ─────────────────────────────────────────────
  if (data.vencedores?.length) {
    if (countEl) { countEl.textContent = data.vencedores.length; countEl.classList.remove('hidden'); }
    winsEl.innerHTML = data.vencedores.map((r, i) => {
      const { imgH, imgA, tc, tf } = teamImgs(r);
      const medal = MEDAL_EMOJI[i] ?? `<span class="hf-row__num">${i + 1}</span>`;
      return `
        <div class="hf-row">
          <span class="hf-row__pos">${medal}</span>
          <div class="hf-row__avatar" style="${i < 3 ? `border-color:${MEDAL_COLORS[i]};color:${MEDAL_COLORS[i]}` : ''}">${initial(r)}</div>
          <div class="hf-row__info">
            <span class="hf-row__name">${escHtml(maskName(r.nome_real || r.nome))}</span>
            <span class="hf-row__game">${imgH}${tc} × ${imgA}${tf}
              <span class="hf-row__sep">·</span>
              <span class="hf-row__score">${(r.resultado||'').replace('x','×')}</span>
            </span>
          </div>
          <span class="hf-row__amount">${fmtMoney(r.ganho)}</span>
        </div>`;
    }).join('');
  } else {
    if (countEl) countEl.classList.add('hidden');
    winsEl.innerHTML = '<p class="text--muted hf-empty">Nenhum ganhador ainda.</p>';
  }

  // ── Quase lá ───────────────────────────────────────────────
  if (data.quase?.length) {
    nearEl.innerHTML = data.quase.map((r, i) => {
      const { imgH, imgA, tc, tf } = teamImgs(r);
      const far = r.diferenca >= 2;

      // Detecta se acertou um lado exato
      const [betH, betA]   = r.aposta.split(' x ');
      const [realH, realA] = (r.resultado || '').split('x');
      let badgeText, badgeClass = '';
      if (betH === realH && betA !== realA) {
        const n = parseInt(realH, 10);
        badgeText  = `Acertou ${n} gol${n !== 1 ? 's' : ''} do ${tc}`;
      } else if (betA === realA && betH !== realH) {
        const n = parseInt(realA, 10);
        badgeText  = `Acertou ${n} gol${n !== 1 ? 's' : ''} do ${tf}`;
      } else {
        badgeText  = r.diferenca === 1 ? '1 gol' : `${r.diferenca} gols`;
        badgeClass = far ? ' near-row__badge--far' : '';
      }

      return `
        <div class="near-row">
          <span class="near-row__pos">${i + 1}</span>
          <div class="near-row__body">
            <div class="near-row__top">
              <span class="near-row__name">${escHtml(maskName(r.nome_real || r.nome))}</span>
              <span class="near-row__badge${badgeClass}">${badgeText}</span>
            </div>
            <div class="near-row__game">${imgH}${tc} × ${imgA}${tf}</div>
            <div class="near-row__detail">
              Resultado <strong class="near-row__real">${(r.resultado||'').replace('x','×')}</strong>
              <span class="near-row__sep">·</span>
              Palpite <strong class="near-row__guess">${r.aposta.replace('x','×')}</strong>
            </div>
          </div>
        </div>`;
    }).join('');
  } else {
    nearEl.innerHTML = '<p class="text--muted hf-empty">Nenhum palpite registrado ainda.</p>';
  }
};

// ── Modals ────────────────────────────────────────────────────
const _MODAL_LABELS = {
  modalPalpite:       'Modal de palpite',
  modalTicket:        'Modal de confirmação/pagamento',
  modalPixOverlay:    'Modal de pagamento PIX',
  modalDepositOverlay:'Modal de depósito',
  modalPreLogin:      'Modal de login rápido',
  modalReferral:      'Modal de indicação',
  modalResultado:     'Modal de resultado',
  modalPalpiteAno:    'Modal de palpite anterior',
};
const openModal  = (id) => {
  document.getElementById(id)?.classList.remove('hidden');
  lockScroll();
  const lbl = _MODAL_LABELS[id];
  if (lbl) { trackEvent('modal_open', `Abriu: ${lbl}`); _pushNav(lbl); }
  pingOnline();
};
const closeModal = (id) => {
  document.getElementById(id)?.classList.add('hidden');
  unlockScroll();
  const lbl = _MODAL_LABELS[id];
  if (lbl) trackEvent('modal_close', `Fechou: ${lbl}`);
  pingOnline();
};
const closeAllModals = () => {
  const openCount = document.querySelectorAll('.modal:not(.hidden)').length;
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  for (let i = 0; i < openCount; i++) unlockScroll();
};

// ── Referral modal (global — called from renderDrawer and event handlers) ──
const openReferralModal = async () => {
  if (!S.user) { switchAuthTab('register'); navigate('auth'); return; }
  openModal('modalReferral');
  try {
    const data = await api('/api/referral');
    const baseUrl = `${location.protocol}//${location.host}`;
    const link    = `${baseUrl}/?ref=${data.code}`;

    document.getElementById('refBonusAmount').textContent = `+${fmtMoney(data.bonus_per)}`;
    document.getElementById('refCount').textContent       = data.referral_count;
    document.getElementById('refEarned').textContent      = fmtMoney(data.total_earned);
    document.getElementById('refLinkDisplay').textContent = link.replace(/^https?:\/\//, '');

    const meta = 5;
    const pct  = Math.min(100, Math.round((data.referral_count / meta) * 100));
    document.getElementById('refProgressFill').style.width  = `${pct}%`;
    document.getElementById('refProgressLabel').textContent =
      data.referral_count >= meta
        ? '🎉 Bônus especial desbloqueado!'
        : `${data.referral_count} de ${meta} para bônus especial`;

    const waMsg = encodeURIComponent(
      `Oi! Tô ganhando dinheiro acertando o placar dos jogos da Copa 🏆⚽\n\n` +
      `Se cadastra pelo meu link e já ganha bônus no cadastro:\n${link}\n\nNão perde essa! ⏰`
    );
    const tgMsg = encodeURIComponent(`🏆 Acerte o placar e ganhe prêmios reais! ${link}`);

    document.getElementById('refBtnWhatsApp').onclick = () =>
      window.open(`https://wa.me/?text=${waMsg}`, '_blank');
    document.getElementById('refBtnTelegram').onclick = () =>
      window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${tgMsg}`, '_blank');

    const copyLink = () => {
      navigator.clipboard.writeText(link).then(() => toast('Link copiado!', 'success'));
    };
    document.getElementById('refBtnCopy').onclick  = copyLink;
    document.getElementById('refCopyBtn').onclick  = copyLink;
  } catch { toast('Erro ao carregar dados de indicação.', 'danger'); }
};

// ── Bet modal ─────────────────────────────────────────────────
const renderScore = (elId, val) => {
  const el = document.getElementById(elId);
  if (!el) return;
  if (val === null) {
    el.value = '';
    el.classList.add('score-value--empty');
  } else {
    el.value = val;
    el.classList.remove('score-value--empty');
  }
};

const openBetModal = (gameId, pending = null) => {
  const game = S.games.find(g => g.id === Number(gameId));
  if (!game) return;

  S.selectedGame = game;
  S.scoreHome    = pending?.scoreHome ?? 0;
  S.scoreAway    = pending?.scoreAway ?? 0;
  S.stake        = pending?.stake ?? Math.round((S.stakeMin + S.stakeMax) / 2);

  const slider = document.getElementById('stakeSlider');
  if (slider) {
    slider.min   = S.stakeMin;
    slider.max   = S.stakeMax;
    slider.step  = Math.max(1, Math.floor((S.stakeMax - S.stakeMin) / 100));
    slider.value = S.stake;
  }
  const lblMin = document.getElementById('stakeLabelMin');
  const lblMax = document.getElementById('stakeLabelMax');
  if (lblMin) lblMin.textContent = 'Mín';
  if (lblMax) lblMax.textContent = 'Máx';
  const effectiveOdd = parseFloat(game.odd || 0) > 1 ? parseFloat(game.odd) : S.oddPadrao;
  const oddEl = document.getElementById('gameOddDisplay');
  if (oddEl) oddEl.textContent = `${Number.isInteger(effectiveOdd) ? effectiveOdd : effectiveOdd.toFixed(1)}×`;

  document.getElementById('betFlagHome').innerHTML    = getEmblem(game, 'home');
  document.getElementById('betNameHome').textContent  = game.time_casa;
  document.getElementById('betFlagAway').innerHTML    = getEmblem(game, 'away');
  document.getElementById('betNameAway').textContent  = game.time_fora;
  renderScore('scoreHome', S.scoreHome);
  renderScore('scoreAway', S.scoreAway);

  const lgEl = document.getElementById('betLeagueName');
  const dtEl = document.getElementById('betGameDate');
  if (lgEl) lgEl.textContent = leagueShortName(game.liga_nome || '') || game.liga_nome || '—';
  if (dtEl) {
    const d = new Date(game.data_hora);
    dtEl.textContent = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  startBetCountdown(new Date(game.data_hora));

  updateBetPreview();
  openModal('modalPalpite');

  if (slider) {
    const _nudge = () => {
      const orig = parseFloat(slider.value);
      const max  = parseFloat(slider.max);
      const peak = Math.min(orig + (max - orig) * 0.4, max);
      const fire = (v) => { slider.value = v; slider.dispatchEvent(new Event('input')); };
      const animate = (from, to, duration, done) => {
        const start = performance.now();
        const step  = (now) => {
          const t   = Math.min((now - start) / duration, 1);
          const ease = t < .5 ? 2*t*t : -1+(4-2*t)*t;
          fire(from + (to - from) * ease);
          if (t < 1) requestAnimationFrame(step); else done?.();
        };
        requestAnimationFrame(step);
      };
      animate(orig, peak, 900, () => animate(peak, orig, 700));
    };
    setTimeout(_nudge, 700);
  }
};

// ── Pending bet timer (auth page) ────────────────────────────
let _pendingBetTimerRef = null;
const PENDING_BET_TTL = 15 * 60 * 1000; // 15 minutos

const startPendingBetTimer = () => {
  const bar     = document.getElementById('pendingBetBar');
  const display = document.getElementById('pendingBetTimer');
  if (!bar || !display) return;

  let expiry = parseInt(sessionStorage.getItem('pendingBetExpiry') || '0');
  if (!expiry || expiry <= Date.now()) {
    expiry = Date.now() + PENDING_BET_TTL;
    sessionStorage.setItem('pendingBetExpiry', String(expiry));
  }

  bar.classList.remove('hidden');
  if (_pendingBetTimerRef) clearInterval(_pendingBetTimerRef);

  const tick = () => {
    const remaining = Math.max(0, expiry - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    display.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (remaining <= 0) {
      clearPendingBet();
    }
  };
  tick();
  _pendingBetTimerRef = setInterval(tick, 1000);
};

const stopPendingBetTimer = () => {
  if (_pendingBetTimerRef) { clearInterval(_pendingBetTimerRef); _pendingBetTimerRef = null; }
  sessionStorage.removeItem('pendingBetExpiry');
  document.getElementById('pendingBetBar')?.classList.add('hidden');
};

const savePendingBet = (pb) => {
  const expiry = Date.now() + PENDING_BET_TTL;
  localStorage.setItem('pendingBet', JSON.stringify({ ...pb, _expiry: expiry }));
  sessionStorage.setItem('pendingBetExpiry', String(expiry));
};

const clearPendingBet = () => {
  S.pendingBet = null;
  localStorage.removeItem('pendingBet');
  if (_pendingBetTimerRef) { clearInterval(_pendingBetTimerRef); _pendingBetTimerRef = null; }
  sessionStorage.removeItem('pendingBetExpiry');
  document.getElementById('pendingBetBar')?.classList.add('hidden');
};

const restorePendingBet = () => {
  try {
    const raw = localStorage.getItem('pendingBet');
    if (!raw) return;
    const { _expiry, ...pb } = JSON.parse(raw);
    if (!_expiry || _expiry <= Date.now()) { localStorage.removeItem('pendingBet'); return; }
    S.pendingBet = pb;
    sessionStorage.setItem('pendingBetExpiry', String(_expiry));
  } catch { localStorage.removeItem('pendingBet'); }
};

let _betCountdownTimer = null;
const startBetCountdown = (gameDate) => {
  if (_betCountdownTimer) { clearInterval(_betCountdownTimer); _betCountdownTimer = null; }
  const cdEl  = document.getElementById('betGameCountdown');
  const rowEl = document.getElementById('betCountdownRow');
  if (!cdEl || !rowEl) return;
  const tick = () => {
    const diff = gameDate - Date.now();
    if (diff <= 0) {
      cdEl.textContent = 'Jogo em andamento';
      rowEl.className  = 'bm__meta-row2 bm__meta-row2--live';
      clearInterval(_betCountdownTimer); _betCountdownTimer = null;
      return;
    }
    const s = Math.floor(diff / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    const label = d > 0
      ? `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m`
      : h > 0
        ? `${h}h ${String(m).padStart(2,'0')}m ${String(sc).padStart(2,'0')}s`
        : `${String(m).padStart(2,'0')}m ${String(sc).padStart(2,'0')}s`;
    cdEl.textContent = `O jogo começa em ${label}`;
    rowEl.className  = diff <= 3_600_000 ? 'bm__meta-row2 bm__meta-row2--soon' : 'bm__meta-row2';
  };
  tick();
  _betCountdownTimer = setInterval(tick, 1000);
};

const updateBetPreview = () => {
  const game = S.selectedGame;
  if (!game) return;
  const odd    = parseFloat(game.odd || 0) > 1 ? parseFloat(game.odd) : S.oddPadrao;
  const premio = +(S.stake * odd).toFixed(2);

  document.getElementById('stakeDisplay').textContent    = fmtMoney(S.stake);
  document.getElementById('betWinAmount').textContent    = fmtMoney(premio);
  const hintEl = document.getElementById('betPrizeHint');
  if (hintEl) {
    if (S.scoreHome === null || S.scoreAway === null) {
      hintEl.classList.add('hidden');
      hintEl.textContent = '';
    } else {
      hintEl.classList.remove('hidden');
      // hintEl.textContent = `Seu palpite é ${game.time_casa} ${S.scoreHome} × ${S.scoreAway} ${game.time_fora}, você ganhará ${fmtMoney(premio)}.`;
    }
  }

  const slider = document.getElementById('stakeSlider');
  if (slider) {
    const range = (S.stakeMax - S.stakeMin) || 1;
    const pct   = ((S.stake - S.stakeMin) / range) * 100;
    slider.style.background = `linear-gradient(to right, var(--primary) ${pct}%, var(--surface-3) ${pct}%)`;
  }
};

const submitBet = async () => {
  trackEvent('action', 'Clicou em Confirmar Palpite');
  if (S.scoreHome === null || S.scoreAway === null) {
    toast('Selecione o placar antes de confirmar o palpite.', 'danger');
    document.querySelector('.bm__matchup')?.classList.add('bm__scoreboard--shake');
    setTimeout(() => document.querySelector('.bm__matchup')?.classList.remove('bm__scoreboard--shake'), 600);
    return;
  }
  if (!S.user) {
    S.pendingBet = {
      gameId:    S.selectedGame.id,
      scoreHome: S.scoreHome,
      scoreAway: S.scoreAway,
      stake:     S.stake,
    };
    savePendingBet(S.pendingBet);
    const g   = S.selectedGame;
    const odd = parseFloat(g?.odd || 0) > 1 ? parseFloat(g.odd) : (S.oddPadrao ?? 9);
    const previewBet = {
      valor:          S.stake,
      odd,
      possivel_ganho: Math.round(S.stake * odd * 100) / 100,
      placar_casa:    S.scoreHome,
      placar_fora:    S.scoreAway,
      status:         'pendente',
    };
    closeModal('modalPalpite');
    fillTicket(previewBet);
    openModal('modalTicket');
    return;
  }

  const btn = document.getElementById('btnConfirmBet');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const result = await api('/api/apostas', 'POST', {
      jogo_id:     S.selectedGame.id,
      placar_casa: S.scoreHome,
      placar_fora: S.scoreAway,
      valor:       S.stake,
    });

    S.selectedBet = result.aposta;
    trackEvent('bet', `Palpite criado: ${S.selectedGame.time_casa} ${S.scoreHome}×${S.scoreAway} ${S.selectedGame.time_fora} · R$${S.stake}`);
    closeModal('modalPalpite');
    fillTicket(result.aposta);
    openModal('modalTicket');
    await loadBets();
  } catch (err) {
    trackEvent('error', `Erro ao criar palpite: ${err.message || 'desconhecido'}`);
    toast(err.message || 'Erro ao registrar palpite.', 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar Palpite →';
  }
};

// ── Ticket modal ──────────────────────────────────────────────
// Mapa de status → [classe CSS, ícone FA, texto]
const TICKET_STATUS_MAP = {
  preview:    ['preview',    'fa-eye',              'Palpite'],
  pendente:   ['pendente',   'fa-clock',            'Aguardando Pagamento'],
  pago:       ['pago',       'fa-credit-card',      'Pago · Aguardando Jogo'],
  confirmado: ['confirmado', 'fa-circle-check',     'Confirmada'],
  ganhou:     ['ganhou',     'fa-trophy',           'Aposta Vencedora!'],
  perdido:    ['perdido',    'fa-circle-xmark',     'Aposta Perdida'],
};

const fillTicket = (bet) => {
  const game    = S.selectedGame;
  const isGuest = !bet.id;
  const oddRaw  = parseFloat(bet.odd ?? 0);
  const oddFmt  = oddRaw > 0 ? (Number.isInteger(oddRaw) ? `${oddRaw}×` : `${oddRaw.toFixed(1)}×`) : '—';
  const status  = isGuest ? 'preview' : (bet.status ?? 'pendente');

  // Resetar seção de pagamento e stepper
  document.getElementById('tkFooterConfirm')?.classList.remove('hidden');
  document.getElementById('tkPaySection')?.classList.add('hidden');
  const _s2 = document.getElementById('flowStep2');
  if (_s2) { _s2.className = 'flow-step flow-step--active'; _s2.querySelector('.flow-step__badge').textContent = '2'; }
  document.getElementById('flowLine3')?.classList.remove('flow-step__line--done');
  const _s3 = document.getElementById('flowStep3');
  if (_s3) _s3.className = 'flow-step';


  // Jogo
  const gameLabel = game ? `${game.time_casa} × ${game.time_fora}` : '—';
  document.getElementById('ticketGame').textContent  = gameLabel;
  const ticketMultEl = document.getElementById('ticketMult');
  if (ticketMultEl) ticketMultEl.textContent = oddFmt;
  document.getElementById('ticketValor').textContent = fmtMoney(bet.valor);
  document.getElementById('ticketPremio').textContent = fmtMoney(bet.possivel_ganho);

  // Matchup visual com bandeiras e placar apostado
  const flagCasaEl  = document.getElementById('ticketFlagCasa');
  const flagForaEl  = document.getElementById('ticketFlagFora');
  const timeCasaEl  = document.getElementById('ticketTimeCasa');
  const timeForaEl  = document.getElementById('ticketTimeFora');
  const scoreCasaEl = document.getElementById('ticketScoreCasa');
  const scoreForaEl = document.getElementById('ticketScoreFora');
  if (game) {
    const fH = game.logo_casa
      ? `<img src="${game.logo_casa}" alt="${game.time_casa}">`
      : `<span>${flagEmoji(game.bandeira_casa || '')}</span>`;
    const fA = game.logo_fora
      ? `<img src="${game.logo_fora}" alt="${game.time_fora}">`
      : `<span>${flagEmoji(game.bandeira_fora || '')}</span>`;
    if (flagCasaEl) flagCasaEl.innerHTML = fH;
    if (flagForaEl) flagForaEl.innerHTML = fA;
    if (timeCasaEl) timeCasaEl.textContent = game.time_casa;
    if (timeForaEl) timeForaEl.textContent = game.time_fora;
  }
  if (scoreCasaEl) scoreCasaEl.textContent = bet.placar_casa ?? '—';
  if (scoreForaEl) scoreForaEl.textContent = bet.placar_fora ?? '—';

  // Liga + data do jogo
  const lgEl = document.getElementById('ticketLeague');
  const dtEl = document.getElementById('ticketDate');
  if (lgEl) lgEl.textContent = game ? (leagueShortName(game.liga_nome || '') || game.liga_nome || '—') : '—';
  let gameDateStr = '—';
  if (game) {
    const d = new Date(game.data_hora);
    gameDateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (dtEl) dtEl.textContent = gameDateStr;
  }
  const dtRowEl = document.getElementById('ticketDateTime');
  if (dtRowEl) dtRowEl.textContent = gameDateStr;

  // Timestamp de registro — só exibe após pagamento
  const regEl = document.getElementById('ticketRegistered');
  const regRow = regEl?.closest('.tk__row');
  const showReg = ['pago','confirmado','ganhou','perdido'].includes(status);
  if (regRow) regRow.style.display = showReg ? '' : 'none';
  if (regEl && showReg && !isGuest) {
    const ts = bet.criado_em ? new Date(bet.criado_em) : new Date();
    regEl.textContent = ts.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      + ' às ' + ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // Status banner
  const statusEl   = document.getElementById('ticketStatus');
  const statusIcon = document.getElementById('ticketStatusIcon');
  const statusText = document.getElementById('ticketStatusText');
  if (statusEl) {
    const [cls, icon, label] = TICKET_STATUS_MAP[status] ?? TICKET_STATUS_MAP.pendente;
    statusEl.className  = `tk__status tk__status--${cls}`;
    if (statusIcon) statusIcon.innerHTML = `<i class="fa-solid fa-${icon}"></i>`;
    if (statusText) statusText.textContent = label;
  }

  // Botão de pagamento
  const payBtn = document.getElementById('btnSimulatePay');
  if (payBtn) {
    const paid = ['pago','confirmado','ganhou','perdido'].includes(status);
    payBtn.style.display = paid ? 'none' : '';
    payBtn.innerHTML = isGuest
      ? '<i class="fa-solid fa-lock"></i> Confirmar e continuar'
      : 'Confirmar palpite <i class="fa-solid fa-arrow-right"></i>';
  }
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

  // Valor
  const pixAmt = S._depositId ? (S._depositAmt || 0) : (S.selectedBet?.valor || 0);
  document.getElementById('pixAmount').textContent = fmtMoney(pixAmt);

  // Status
  document.getElementById('pixStatusText').textContent = 'Aguardando pagamento…';

  // Botão copiar código completo
  document.getElementById('btnPixCopyFull').onclick = () => {
    navigator.clipboard.writeText(pixKey).then(() => toast('Código copiado!', 'success'));
  };
  document.getElementById('btnPixCopy').onclick = () => {
    navigator.clipboard.writeText(pixKey).then(() => toast('Chave copiada!', 'success'));
  };

  // Countdown: máximo 30 min independente do que o gateway retorna
  const _maxDeadline = Date.now() + 30 * 60 * 1000;
  const _apiDeadline = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  let deadline = _apiDeadline > Date.now() ? Math.min(_apiDeadline, _maxDeadline) : _maxDeadline;
  clearInterval(_pixTimerInterval);
  const timerEl  = document.getElementById('pixTimerCount');
  const timerWrap = document.getElementById('pixTimer');
  _pixTimerInterval = setInterval(() => {
    const left = deadline - Date.now();
    if (left <= 0) {
      clearInterval(_pixTimerInterval);
      clearInterval(_pixPollingInterval);
      timerEl.textContent = '00:00';
      timerWrap.classList.add('pix-timer--expired');
      trackEvent('error', 'PIX expirou sem pagamento');
      return;
    }
    const m = String(Math.floor(left / 60000)).padStart(2, '0');
    const s = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
    timerWrap.classList.toggle('pix-timer--urgent', left < 2 * 60 * 1000);
  }, 1000);

  // Modo depósito vs aposta: ajusta hint e botão de confirmar
  const isDeposit      = !!S._depositId;
  const hintEl         = document.getElementById('pixModalHint');
  const depositConfBtn = document.getElementById('btnDepositConfirm');
  if (hintEl) hintEl.textContent = isDeposit
    ? 'Após pagar, o saldo é creditado automaticamente ou clique em Confirmar.'
    : 'Após pagar, clique em Confirmar Pagamento na aba Meus Palpites.';
  depositConfBtn?.classList.toggle('hidden', !isDeposit);

  // Polling de status
  clearInterval(_pixPollingInterval);
  if (isDeposit) {
    _pixPollingInterval = setInterval(async () => {
      try {
        const r = await api(`/api/user/depositar/${S._depositId}/status`);
        if (r.status === 'confirmado') {
          clearInterval(_pixPollingInterval);
          clearInterval(_pixTimerInterval);
          trackEvent('payment', `Depósito PIX confirmado · R$${(S._depositAmt || 0).toFixed(2)}`);
          document.getElementById('pixStatusText').textContent = '✓ Depósito confirmado!';
          await loadUser();
          setTimeout(() => closePixModal(), 2000);
        }
      } catch { /* silencioso */ }
    }, 5000);
  } else if (S.selectedBet?.id) {
    const _betId = Number(S.selectedBet.id);
    _pixPollingInterval = setInterval(async () => {
      try {
        const r = await api(`/api/apostas/${_betId}/status`);
        if (r.status && ['pago', 'confirmado', 'ganhou'].includes(r.status)) {
          clearInterval(_pixPollingInterval);
          clearInterval(_pixTimerInterval);
          trackEvent('payment', `PIX confirmado · R$${(S.selectedBet?.valor || 0).toFixed(2)}`);
          document.getElementById('pixStatusText').textContent = '✓ Pagamento confirmado!';
          await loadUser();
          await loadBets();
          setTimeout(() => { closePixModal(); navigate('palpites'); }, 2000);
        }
      } catch { /* silencioso */ }
    }, 4000);
  }

  document.getElementById('modalPixOverlay').classList.remove('hidden');
};

const closePixModal = () => {
  clearInterval(_pixTimerInterval);
  clearInterval(_pixPollingInterval);
  S._depositId  = null;
  S._depositAmt = 0;
  document.getElementById('modalPixOverlay').classList.add('hidden');
};

const _selectPayMethod = (method) => {
  if (S._payMethod !== method) {
    const _ml = { saldo: 'Saldo/Bônus', pix: 'PIX', expay: 'ExPay' };
    trackEvent('action', `Selecionou método de pagamento: ${_ml[method] || method}`);
  }
  S._payMethod = method;
  document.querySelectorAll('.pay-opt-card').forEach(c => c.classList.remove('pay-opt-card--active'));
  const _cardId = method === 'saldo' ? 'payOptSaldo' : method === 'expay' ? 'payOptExpay' : 'payOptPix';
  const card = document.getElementById(_cardId);
  if (card) card.classList.add('pay-opt-card--active');
  const btn = document.getElementById('btnFinalizePayment');
  if (!btn) return;
  const amt = fmtMoney(S.selectedBet?.valor ?? 0);
  if (method === 'saldo') {
    btn.innerHTML = `<i class="fa-solid fa-wallet"></i> Pagar ${amt} com Saldo`;
  } else if (method === 'expay') {
    btn.innerHTML = `<i class="fa-solid fa-bolt"></i> Pagar ${amt} com ExPay`;
  } else {
    btn.innerHTML = `<i class="fa-brands fa-pix"></i> Pagar ${amt} com PIX`;
  }
};

const openPreLogin = () => {
  const g  = S.selectedGame;
  const pb = S.pendingBet;
  if (!g || !pb) { navigate('auth'); return; }

  document.getElementById('plTeamHome').textContent = g.time_casa ?? '—';
  document.getElementById('plTeamAway').textContent = g.time_fora ?? '—';
  document.getElementById('plScore').textContent    = `${pb.scoreHome} × ${pb.scoreAway}`;
  // Lê o prêmio já calculado corretamente pelo updateBetPreview
  const prizeText = document.getElementById('betWinAmount')?.textContent;
  document.getElementById('plPrize').textContent = prizeText || fmtMoney(pb.stake);

  const mkFlag = (logo, code, name) => logo
    ? `<img src="${logo}" alt="${name}">`
    : (code ? `<img src="https://flagcdn.com/w40/${code.toLowerCase()}.png" alt="${name}">` : '');
  document.getElementById('plFlagHome').innerHTML = mkFlag(g.logo_casa, g.bandeira_casa, g.time_casa);
  document.getElementById('plFlagAway').innerHTML = mkFlag(g.logo_fora, g.bandeira_fora, g.time_fora);

  closeModal('modalTicket');
  openModal('modalPreLogin');
};

const simulatePay = () => {
  trackEvent('action', 'Avançou para pagamento');
  if (!S.user) {
    openPreLogin();
    return;
  }
  const saldo    = parseFloat(S.user?.saldo ?? 0);
  const betValor = S.selectedBet?.valor ?? 0;
  const saldoEl  = document.getElementById('payOptSaldoDisp');
  if (saldoEl) saldoEl.textContent = saldo < betValor
    ? `⚠ Saldo insuficiente (${fmtMoney(saldo)})`
    : fmtMoney(saldo) + ' disponível';
  // Mostra/oculta métodos de pagamento conforme config do admin
  const pixEl   = document.getElementById('payOptPix');
  const expayEl = document.getElementById('payOptExpay');
  const showPix   = S.pixAtivo   !== false;
  const showExpay = S.expayAtivo !== false;
  if (pixEl)   { pixEl.classList.toggle('hidden', !showPix);   pixEl.style.gridColumn   = (showPix && !showExpay) ? '1/-1' : ''; }
  if (expayEl) { expayEl.classList.toggle('hidden', !showExpay); expayEl.style.gridColumn = (!showPix && showExpay) ? '1/-1' : ''; }

  // Seleciona o primeiro método ativo como padrão
  const defaultMethod = showPix ? 'pix' : showExpay ? 'expay' : 'saldo';
  _selectPayMethod(defaultMethod);
  document.getElementById('tkFooterConfirm')?.classList.add('hidden');
  document.getElementById('tkPaySection')?.classList.remove('hidden');
  // Avança stepper para passo 3
  const _s2p = document.getElementById('flowStep2');
  if (_s2p) { _s2p.className = 'flow-step flow-step--done'; _s2p.querySelector('.flow-step__badge').textContent = '✓'; }
  document.getElementById('flowLine3')?.classList.add('flow-step__line--done');
  document.getElementById('flowStep3')?.classList.add('flow-step--active');
};

const confirmBalancePayment = async () => {
  trackEvent('action', 'Tentou pagar com Saldo/Bônus');
  const saldo    = parseFloat(S.user?.saldo ?? 0);
  const betValor = S.selectedBet?.valor ?? 0;
  if (saldo < betValor) {
    trackEvent('error', `Saldo insuficiente · tem R$${saldo.toFixed(2)}, precisa R$${betValor.toFixed(2)}`);
    toast('Saldo insuficiente. Recarregue seu bônus para continuar.', 'warning');
    closeModal('modalTicket');
    openDepositModal();
    return;
  }
  const btn = document.getElementById('btnFinalizePayment');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
  try {
    await api(`/api/apostas/${S.selectedBet.id}/pagar-saldo`, 'POST', {});
    trackEvent('payment', `Pagou com Saldo · R$${betValor.toFixed(2)}`);
    closeModal('modalTicket');
    await Promise.all([loadUser(), loadBets()]);
    toast('Aposta confirmada! Saldo debitado.', 'success');
    navigate('palpites');
  } catch (err) {
    trackEvent('error', `Falha ao pagar com Saldo: ${err.message || 'desconhecido'}`);
    toast(err.message || 'Erro ao processar pagamento.', 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-wallet"></i> Pagar com Bônus';
  }
};

const confirmPixPayment = async () => {
  trackEvent('action', `Gerou PIX · R$${(S.selectedBet?.valor ?? 0).toFixed(2)}`);
  const btn = document.getElementById('btnFinalizePayment');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
  try {
    const data = await api(`/api/apostas/${S.selectedBet.id}/pagar`, 'POST', {});
    S.selectedBet.valor = S.selectedBet.valor || data.valor;
    closeModal('modalTicket');
    openPixModal(data);
    await loadBets();
  } catch (err) {
    trackEvent('error', `Falha ao gerar PIX: ${err.message || 'desconhecido'}`);
    toast(err.message || 'Erro ao processar pagamento.', 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-brands fa-pix"></i> Pagar com PIX';
  }
};

const confirmExpayPayment = async () => {
  trackEvent('action', 'Iniciou pagamento ExPay');
  const btn = document.getElementById('btnFinalizePayment');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
  try {
    const data = await api(`/api/apostas/${S.selectedBet.id}/pagar-expay`, 'POST', {});
    S.selectedBet.valor = S.selectedBet.valor || data.valor;
    closeModal('modalTicket');
    openPixModal(data);
    await loadBets();
  } catch (err) {
    toast(err.message || 'Erro ao processar pagamento.', 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Pagar com ExPay';
  }
};


// ── Resultado modal ───────────────────────────────────────────
const showResultado = (bet, won) => {
  const content = document.getElementById('resultadoContent');
  const nextGame = S.games.find(g => g.status === 'aberto' && g.id !== (S.selectedGame?.id));

  if (won) {
    // Confetti comemorativo
    if (typeof confetti === 'function') {
      confetti({ particleCount: 150, spread: 80, colors: ['#59ff15', '#FFD700', '#ffffff'], origin: { y: 0.6 } });
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
  trackEvent('form', 'Enviou formulário de login');
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Entrando...';
  try {
    await api('/api/login', 'POST', {
      email: document.getElementById('loginEmail').value,
      senha: document.getElementById('loginPassword').value,
    });
    await loadUser();
    await loadBets();
    trackEvent('auth', `Login: ${S.user?.email || 'usuário'}`);

    if (S.pendingBet) {
      const pb = S.pendingBet;
      clearPendingBet();
      navigate('jogos');
      showAlert(`Bem-vindo, ${S.user.nome.split(' ')[0]}! Finalizando seu palpite…`, 'success');
      e.target.reset();
      setTimeout(async () => {
        try {
          const result = await api('/api/apostas', 'POST', {
            jogo_id:     pb.gameId,
            placar_casa: pb.scoreHome,
            placar_fora: pb.scoreAway,
            valor:       pb.stake,
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
      navigate(_isAdmin() ? 'admin' : 'jogos');
      showAlert(`Bem-vindo, ${S.user.nome.split(' ')[0]}!`, 'success');
      e.target.reset();
    }
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.textContent = 'ACESSAR';
  }
};

const submitRegister = async (e) => {
  e.preventDefault();
  trackEvent('form', 'Enviou formulário de cadastro');
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Criando conta...';
  try {
    await api('/api/register', 'POST', {
      nome:          document.getElementById('registerName').value,
      email:         document.getElementById('registerEmail').value,
      senha:         document.getElementById('registerPassword').value,
      referral_code: sessionStorage.getItem('refCode') || '',
    });
    trackEvent('auth', 'Cadastro realizado');
    showAlert(S.pendingBet ? 'Conta criada! Faça login para confirmar seu palpite.' : 'Conta criada! Faça login para começar.', 'success');
    switchAuthTab('login');
    e.target.reset();
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.textContent = 'CADASTRAR';
  }
};

const logout = async () => {
  trackEvent('auth', 'Logout');
  _flushEvents();
  try { await api('/api/logout', 'POST'); } catch {}
  S.user = null; S.bets = [];
  renderHeader();
  renderBets();
  renderGames();
  navigate('jogos');
  showAlert('Até logo!', 'info');
};

const switchAuthTab = (tab) => {
  ['login', 'register', 'forgot', 'reset'].forEach(t => {
    const el = document.getElementById(`auth${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (!el) return;
    if (t === tab) { el.classList.remove('hidden'); } else { el.classList.add('hidden'); }
  });
  const tabs = document.querySelector('.auth-tabs');
  if (tabs) {
    if (tab === 'forgot' || tab === 'reset') { tabs.classList.add('hidden'); } else { tabs.classList.remove('hidden'); }
  }
  document.querySelectorAll('.auth-tab').forEach(btn => {
    if (btn.dataset.authTab === tab) {
      btn.classList.add('auth-tab--active');
    } else {
      btn.classList.remove('auth-tab--active');
    }
  });
};

// ── Google Sign-In ──────────────────────────────────────────
const googleCallback = async (response) => {
  try {
    const res = await api('/api/auth/google', 'POST', { credential: response.credential });
    await loadUser();
    await loadBets();
    trackEvent('auth', `Login Google: ${S.user?.email || 'usuário'}`);

    // Fecha qualquer modal de login rápido/pré-login aberto
    closeModal('modalPreLogin');

    if (S.pendingBet) {
      const pb = S.pendingBet;
      clearPendingBet();
      navigate('jogos');
      showAlert(`Bem-vindo, ${S.user.nome.split(' ')[0]}!`, 'success');
      setTimeout(async () => {
        try {
          const result = await api('/api/apostas', 'POST', {
            jogo_id:     pb.gameId,
            placar_casa: pb.scoreHome,
            placar_fora: pb.scoreAway,
            valor:       pb.stake,
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
      navigate(_isAdmin() ? 'admin' : 'jogos');
      showAlert(`Bem-vindo, ${res.user.nome.split(' ')[0]}!`, 'success');
    }
  } catch (err) {
    showAlert(err.message || 'Erro ao autenticar com Google.', 'danger');
  }
};

const initGoogleButtons = (clientId) => {
  if (!window.google?.accounts?.id) return;
  google.accounts.id.initialize({
    client_id: clientId,
    callback:  googleCallback,
  });
  ['googleBtnLogin', 'googleBtnRegister', 'googleBtnPreLogin'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    google.accounts.id.renderButton(el, {
      theme: 'filled_black',
      size:  'large',
      width: el.parentElement?.offsetWidth || 320,
      text:  id === 'googleBtnRegister' || id === 'googleBtnPreLogin' ? 'signup_with' : 'signin_with',
      locale: 'pt-BR',
    });
  });
};

const submitForgotPassword = async (e) => {
  e.preventDefault();
  const btn   = e.target.querySelector('button[type=submit]');
  const email = document.getElementById('forgotEmail').value.trim();
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    const res = await api('/api/auth/forgot', 'POST', { email });
    showAlert(res.message, 'success');
    e.target.reset();
    // Em dev, exibe o link de reset diretamente
    if (res.reset_url) {
      showAlert(`Link de reset (dev): <a href="${res.reset_url}" style="color:var(--primary)">${res.reset_url}</a>`, 'info');
    }
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar instruções';
  }
};

const submitResetPassword = async (e) => {
  e.preventDefault();
  const btn      = e.target.querySelector('button[type=submit]');
  const token    = document.getElementById('resetToken').value;
  const nova     = document.getElementById('resetPassword').value;
  const confirm  = document.getElementById('resetPasswordConfirm').value;

  if (nova !== confirm) { showAlert('As senhas não coincidem.', 'danger'); return; }

  btn.disabled = true; btn.textContent = 'Redefinindo...';
  try {
    const res = await api('/api/auth/reset', 'POST', { token, nova_senha: nova });
    showAlert(res.message, 'success');
    // Remove token da URL e vai para o login
    history.replaceState(null, '', '/#auth');
    switchAuthTab('login');
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.textContent = 'Redefinir senha →';
  }
};

// ── Admin ─────────────────────────────────────────────────────
const ADMIN_PAGE_SIZE = 8;
let adminGamesPage = 0;

// ── Bulk delete de jogos ──────────────────────────────────────
const _selectedGames = new Set();

const _syncBulkBar = () => {
  const bar     = document.getElementById('bulkActionBar');
  const countEl = document.getElementById('bulkSelCount');
  if (!bar) return;
  const n = _selectedGames.size;
  bar.classList.toggle('hidden', n === 0);
  if (countEl) countEl.textContent = n;
};

const _toggleGameSel = (id, checked) => {
  checked ? _selectedGames.add(id) : _selectedGames.delete(id);
  _syncBulkBar();
};

const _selectAllGames = (checked) => {
  document.querySelectorAll('#adminGamesList .game-row-chk').forEach(chk => {
    chk.checked = checked;
    _toggleGameSel(Number(chk.dataset.id), checked);
  });
};

const bulkDeleteGames = async () => {
  if (!_selectedGames.size) return;
  const ids = [..._selectedGames];
  const ok  = await confirm({
    title:        `Excluir ${ids.length} jogo(s)?`,
    message:      'Todos os jogos selecionados serão excluídos. Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    confirmColor: '#FF4757',
  });
  if (!ok) return;

  const btn = document.getElementById('btnBulkDelete');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Excluindo...';
  try {
    const res = await api('/api/admin/jogos/excluir/lote', 'POST', { ids });
    toast(res.message, 'success');
    _selectedGames.clear();
    _syncBulkBar();
    await loadGames();
    renderAdminGames();
  } catch (err) {
    toast(err.message || 'Erro ao excluir.', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-trash"></i> Excluir selecionados';
  }
};

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

  const _sOrd = { aberto: 0, encerrado: 1, finalizado: 2 };
  const all = [...filtered].sort((a, b) => {
    const sd = (_sOrd[a.status] ?? 3) - (_sOrd[b.status] ?? 3);
    if (sd !== 0) return sd;
    const da = new Date(a.data_hora), db = new Date(b.data_hora);
    return a.status === 'finalizado' ? db - da : da - db;
  });
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
        <th style="width:2rem"><input type="checkbox" id="chkAllGames" title="Selecionar todos"></th>
        <th>Confronto</th>
        <th>Data</th>
        <th>Status</th>
        <th>Placar</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${page.map(g => `
          <tr>
            <td><input type="checkbox" class="game-row-chk" data-id="${g.id}" ${_selectedGames.has(g.id) ? 'checked' : ''}></td>
            <td><strong>${flagThumb(g.bandeira_casa)}${g.time_casa} × ${flagThumb(g.bandeira_fora)}${g.time_fora}</strong></td>
            <td class="text--muted" style="font-size:.82rem;white-space:nowrap">${fmtDate(g.data_hora)}</td>
            <td>${statusBadge(g)}</td>
            <td>${placar(g)}</td>
            <td style="white-space:nowrap;display:flex;gap:.25rem;align-items:center">
              ${g.status !== 'finalizado'
                ? `<button class="btn btn--ghost btn--sm" data-action="abrir-resultado" data-id="${g.id}" data-label="${g.time_casa} × ${g.time_fora}">Resultado</button>`
                : ''}
              <button class="btn btn--danger btn--sm" data-action="excluir-jogo" data-id="${g.id}" data-label="${g.time_casa} × ${g.time_fora}" title="Excluir jogo"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  document.getElementById('chkAllGames')?.addEventListener('change', e => _selectAllGames(e.target.checked));

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

// ── Resultado em lote ─────────────────────────────────────────
const _flagThumbBulk = code =>
  code && /^[a-z]{2}(-[a-z]+)?$/i.test(code)
    ? `<img src="${flagUrl(code)}" alt="" style="width:1.1rem;height:auto;border-radius:2px;vertical-align:middle;margin-right:.25rem" loading="lazy">`
    : '';

const updateBulkCount = () => {
  const count = document.querySelectorAll('#bulkResultList .bulk-chk:checked').length;
  const countEl = document.getElementById('bulkResultCount');
  const btn     = document.getElementById('btnBulkResult');
  if (countEl) countEl.textContent = count;
  if (btn)     btn.disabled = count === 0;
};

const renderBulkResultList = () => {
  const el = document.getElementById('bulkResultList');
  if (!el) return;

  const pending = (S.games || []).filter(g => g.status !== 'finalizado' && g.status !== 'encerrado');
  if (!pending.length) {
    el.innerHTML = '<p class="text--muted" style="padding:.5rem 0">Nenhum jogo aguardando resultado.</p>';
    return;
  }

  el.innerHTML = `
    <table class="admin-table" style="margin-top:.5rem">
      <thead><tr>
        <th style="width:2rem"></th>
        <th>Jogo</th>
        <th>Data</th>
        <th>Placar</th>
      </tr></thead>
      <tbody>
        ${pending.map(g => `
          <tr>
            <td><input type="checkbox" class="bulk-chk" data-id="${g.id}"></td>
            <td><strong>${_flagThumbBulk(g.bandeira_casa)}${g.time_casa} × ${_flagThumbBulk(g.bandeira_fora)}${g.time_fora}</strong></td>
            <td class="text--muted" style="font-size:.82rem;white-space:nowrap">${fmtDate(g.data_hora)}</td>
            <td>
              <div class="bulk-score-row">
                <input type="number" class="bulk-score" id="bsc-${g.id}" min="0" max="99" placeholder="0" disabled>
                <span>×</span>
                <input type="number" class="bulk-score" id="bsf-${g.id}" min="0" max="99" placeholder="0" disabled>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  updateBulkCount();
};

const submitBulkResult = async () => {
  const checked = [...document.querySelectorAll('#bulkResultList .bulk-chk:checked')];
  if (!checked.length) { toast('Selecione ao menos um jogo.', 'warning'); return; }

  const resultados = checked.map(chk => ({
    id:          Number(chk.dataset.id),
    placar_casa: Number(document.getElementById(`bsc-${chk.dataset.id}`)?.value ?? 0),
    placar_fora: Number(document.getElementById(`bsf-${chk.dataset.id}`)?.value ?? 0),
  }));

  const ok = await confirm({
    icon:         'warning',
    title:        `Registrar ${resultados.length} resultado${resultados.length !== 1 ? 's' : ''}?`,
    html:         `<small style="color:#888">Esta ação processará todas as apostas e <b>não pode ser desfeita</b>.</small>`,
    confirmText:  'Sim, registrar',
    cancelText:   'Cancelar',
    confirmColor: '#59ff15',
  });
  if (!ok) return;

  const btn = document.getElementById('btnBulkResult');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando...';

  try {
    const { processados, erros } = await api('/api/admin/jogos/resultado/lote', 'POST', { resultados });

    if (erros.length) {
      toast(`${processados} registrado(s). ${erros.length} com erro.`, 'warning');
    } else {
      toast(`${processados} resultado(s) registrado(s) com sucesso!`, 'success');
    }

    await loadGames();
    await loadBets();
    await renderRanking();
    renderAdminGames();
    renderBulkResultList();
    const allChk = document.getElementById('checkAllBulk');
    if (allChk) allChk.checked = false;
  } catch (err) {
    toast(err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Registrar selecionados (<span id="bulkResultCount">0</span>)';
    updateBulkCount();
  }
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

const flagImg = (code, size = '2rem') =>
  code && /^[a-z]{2}(-[a-z]+)?$/i.test(code)
    ? `<img src="${flagUrl(code)}" alt="" style="width:${size};height:auto;border-radius:3px;display:block" loading="lazy" />`
    : '<span style="font-size:1.4rem">&#127937;</span>';

const importFromApi = async () => {
  const btn      = document.getElementById('btnImport');
  const resultEl = document.getElementById('importResult');
  const leagueId = Number(document.getElementById('importLeague').value);
  const status   = document.getElementById('importStatus').value;

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando...';
  resultEl.innerHTML = `
    <div class="import-progress">
      <div class="import-progress__bar-wrap">
        <div class="import-progress__bar" id="importProgressBar" style="width:0%"></div>
      </div>
      <p class="import-progress__label" id="importProgressLabel">Buscando jogos na API…</p>
    </div>`;

  const setProgress = (current, total, game = '') => {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const bar = document.getElementById('importProgressBar');
    const lbl = document.getElementById('importProgressLabel');
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = game
      ? `Importando ${current} de ${total}: ${game}`
      : `${current} de ${total} jogos importados`;
  };

  try {
    const response = await fetch('/api/admin/import', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': S.csrf || '' },
      body:    JSON.stringify({ league_id: leagueId, status }),
    });

    const contentType = response.headers.get('content-type') || '';

    // Resposta normal (erro ou nenhum jogo encontrado)
    if (!contentType.includes('x-ndjson')) {
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      resultEl.innerHTML = `<div class="alert alert--${data.importados > 0 ? 'success' : 'warning'}">${data.message}</div>`;
      if (data.importados > 0) { await loadGames(); populateAdminSelect(); ; }
      return;
    }

    // Stream NDJSON com progresso
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';
    let doneData  = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let data;
        try { data = JSON.parse(line); } catch { continue; }
        if (data.type === 'total') {
          setProgress(0, data.total);
          const lbl = document.getElementById('importProgressLabel');
          if (lbl) lbl.textContent = `0 de ${data.total} jogos…`;
        } else if (data.type === 'progress') {
          setProgress(data.current, data.total, data.game);
          btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${data.current}/${data.total}`;
        } else if (data.type === 'done') {
          doneData = data;
        } else if (data.error) {
          throw new Error(data.error);
        }
      }
    }

    const count = doneData?.count ?? 0;
    resultEl.innerHTML = `<div class="alert alert--success"><i class="fa-solid fa-check"></i> ${count} partida(s) importada(s) com sucesso.</div>`;
    await loadGames();
    populateAdminSelect();
    ;
  } catch (err) {
    resultEl.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> Importar Jogos';
  }
};

const deleteByLeague = async () => {
  const sel        = document.getElementById('importLeague');
  const leagueId   = Number(sel.value);
  const leagueName = sel.selectedOptions[0]?.text ?? 'Liga selecionada';
  const ok = await confirm({
    title:        `Excluir jogos de "${leagueName}"?`,
    message:      'Todos os jogos desta competição serão removidos permanentemente e não poderão ser recuperados.',
    confirmLabel: 'Excluir',
    confirmColor: '#FF4757',
  });
  if (!ok) return;
  const btn = document.getElementById('btnDeleteByLeague');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  try {
    const res = await api('/api/admin/jogos/excluir/liga', 'POST', { league_id: leagueId });
    toast(res.message, 'success');
    _selectedGames.clear(); _syncBulkBar();
    await loadGames();
    renderAdminGames();
  } catch (e) {
    toast(e.message || 'Erro ao excluir jogos da liga.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Excluir por Liga';
  }
};

const syncImages = async () => {
  const btn      = document.getElementById('btnSyncImages');
  const resultEl = document.getElementById('importResult');

  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Baixando imagens...';
  if (resultEl) resultEl.innerHTML = '';

  try {
    const res = await api('/api/admin/sync-images', 'POST', {});
    toast(res.message ?? 'Imagens sincronizadas!', 'success');
    if (resultEl) resultEl.innerHTML = `<p class="text--muted" style="font-size:.85rem;margin-top:.5rem">${res.message}</p>`;
    await loadGames();
  } catch (err) {
    toast(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-images"></i> Sincronizar Imagens';
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

const seedRanking = async () => {
  const btn = document.getElementById('btnSeedRanking');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';
  try {
    const res = await api('/api/admin/ranking/seed', 'POST', {});
    toast(
      `Ganhadores gerados! ${res.jogos} jogo(s), ${res.apostas} aposta(s) criadas.`,
      'success'
    );
    renderRanking();
  } catch (err) {
    toast(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Gerar Ganhadores';
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
    confirmColor: '#59ff15',
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
  renderHeroBonusBadge();
};

const prefetchGameImages = () => {
  if (!S.games?.length) return;
  const urls = new Set();
  S.games.forEach(g => {
    if (g.bandeira_casa) urls.add(flagUrl(g.bandeira_casa));
    if (g.bandeira_fora) urls.add(flagUrl(g.bandeira_fora));
    if (g.logo_casa)     urls.add(g.logo_casa);
    if (g.logo_fora)     urls.add(g.logo_fora);
  });
  urls.forEach(src => { const i = new Image(); i.src = src; });
};

const loadGames = async () => {
  const skel = document.getElementById('gamesSkeletons');
  const grid = document.getElementById('gamesGrid');
  if (skel) skel.classList.remove('hidden');
  if (grid) grid.innerHTML = '';
  try {
    const r = await api('/api/jogos');
    S.games = (r.jogos || [])
      .map(g => ({
        ...g,
        time_casa: teamNamePt(g.time_casa),
        time_fora: teamNamePt(g.time_fora),
        liga_nome: LEAGUE_SHORT[g.liga_nome] || g.liga_nome,
      }))
      .filter(g => {
        const a = (g.time_casa || '').trim();
        const b = (g.time_fora || '').trim();
        return a && b && a !== '?' && b !== '?';
      });
  } catch {
    S.games = [];
  }
  _activeLeague = 'all'; // reset filter on full reload
  if (skel) skel.classList.add('hidden');
  renderGames();
  renderTicker();
  if (!document.getElementById('view-resultados')?.classList.contains('hidden')) renderResultados();
  prefetchGameImages();
  renderDrawer();
};

let _betsPage  = 1;
let _betsTotal = 0;
const BETS_LIMIT = 10;

const loadBets = async (page = _betsPage) => {
  _betsPage = page;
  if (!S.user) { S.bets = []; _betsTotal = 0; renderBets(); return; }
  try {
    const r    = await api(`/api/apostas?page=${page}&limit=${BETS_LIMIT}`);
    const prev = S.bets || [];
    S.bets     = r.apostas;
    _betsTotal = r.total ?? 0;

    // Detecta mudanças para 'ganhou' ou 'perdido' e mostra resultado
    S.bets.forEach(b => {
      const old = prev.find(p => p.id === b.id);
      if (old && old.status !== b.status && (b.status === 'ganhou' || b.status === 'perdido')) {
        showResultado(b, b.status === 'ganhou');
      }
    });

    // Auto-verifica apostas em status 'pago' — confirma silenciosamente se PIX já foi pago
    const pagoBets = S.bets.filter(b => b.status === 'pago');
    if (pagoBets.length) {
      let anyConfirmed = false;
      await Promise.allSettled(pagoBets.map(async b => {
        try {
          await api(`/api/apostas/${b.id}/confirmar`, 'POST', {});
          anyConfirmed = true;
        } catch { /* pagamento ainda pendente — silencioso */ }
      }));
      if (anyConfirmed) {
        const r2  = await api(`/api/apostas?page=${page}&limit=${BETS_LIMIT}`);
        S.bets    = r2.apostas;
        _betsTotal = r2.total ?? 0;
        toast('Pagamento confirmado! Você está concorrendo.', 'success');
        await loadUser();
      }
    }
  } catch {
    S.bets = []; _betsTotal = 0;
  }
  renderBets();
};

// ── Depósito ───────────────────────────────────────────────────
const openDepositModal = () => {
  if (!S.user) { navigate('auth'); return; }
  document.getElementById('depositValor').value = '';
  document.querySelectorAll('.dq-btn').forEach(b => b.classList.remove('dq-btn--active'));
  document.getElementById('modalDepositOverlay').classList.remove('hidden');
};

const closeDepositModal = () => {
  document.getElementById('modalDepositOverlay').classList.add('hidden');
};

const submitDeposit = async () => {
  const btn   = document.getElementById('btnDepositSubmit');
  const valor = parseFloat(document.getElementById('depositValor').value);
  if (!valor || valor < 5) { toast('Valor mínimo: R$ 5,00', 'danger'); return; }
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando PIX...';
  try {
    const data = await api('/api/user/depositar', 'POST', { valor });
    closeDepositModal();
    S._depositId  = data.deposit_id;
    S._depositAmt = data.valor;
    S.selectedBet = null;
    openPixModal(data);
  } catch (err) {
    toast(err.message || 'Erro ao criar depósito.', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-brands fa-pix"></i> Gerar PIX';
  }
};

const confirmDeposit = async () => {
  const btn = document.getElementById('btnDepositConfirm');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirmando...';
  try {
    const r = await api(`/api/user/depositar/${S._depositId}/confirmar`, 'POST', {});
    document.getElementById('pixStatusText').textContent = '✓ ' + (r.message || 'Depósito confirmado!');
    clearInterval(_pixPollingInterval);
    clearInterval(_pixTimerInterval);
    await loadUser();
    setTimeout(() => closePixModal(), 2000);
  } catch (err) {
    toast(err.message || 'Pagamento ainda não confirmado.', 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Depósito';
  }
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

// ═══════════════════════════════════════════════════════════════
// PWA — install prompt
// ═══════════════════════════════════════════════════════════════
let _installPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _installPrompt = e;
  document.getElementById('btnInstallPwa')?.classList.remove('hidden');
  document.getElementById('drawerBtnPwa')?.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  _installPrompt = null;
  document.getElementById('btnInstallPwa')?.classList.add('hidden');
  document.getElementById('drawerBtnPwa')?.classList.add('hidden');
});

// ═══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
let _notifPoll = null;

const _notifIcons = {
  ticket_reply:      'fa-headset',
  bet_won:           'fa-trophy',
  bet_lost:          'fa-xmark',
  saque_aprovado:    'fa-money-bill-wave',
  saque_rejeitado:   'fa-ban',
};

const updateNotifBadge = (count) => {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : count;
  badge.classList.toggle('hidden', count === 0);
};

const renderNotifList = (notifications) => {
  const list = document.getElementById('notifList');
  if (!list) return;
  if (!notifications.length) {
    list.innerHTML = `<div class="notif-empty">
      <i class="fa-solid fa-bell-slash"></i><span>Nenhuma notificação</span>
    </div>`;
    return;
  }
  list.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.lida ? '' : 'notif-item--unread'}"
         data-notif-id="${n.id}" data-notif-url="${escHtml(n.url || '')}">
      <div class="notif-item__icon notif-item__icon--${n.tipo}">
        <i class="fa-solid ${_notifIcons[n.tipo] || 'fa-bell'}"></i>
      </div>
      <div class="notif-item__body">
        <div class="notif-item__title">${escHtml(n.titulo)}</div>
        ${n.corpo ? `<div class="notif-item__text">${escHtml(n.corpo)}</div>` : ''}
        <div class="notif-item__time">${fmtTicketDate(n.criado_em)}</div>
      </div>
      ${!n.lida ? '<span class="notif-item__dot"></span>' : ''}
    </div>`).join('');
};

const loadNotifications = async () => {
  if (!S.user) return;
  try {
    const { notifications, unread } = await api('/api/notifications');
    updateNotifBadge(unread);
    renderNotifList(notifications);
  } catch { /* ignore poll errors */ }
};

const startNotifPoll = () => {
  loadNotifications();
  _notifPoll = setInterval(loadNotifications, 30_000);
};

const stopNotifPoll = () => {
  if (_notifPoll) { clearInterval(_notifPoll); _notifPoll = null; }
};

// ═══════════════════════════════════════════════════════════════
// TICKETS / SUPORTE
// ═══════════════════════════════════════════════════════════════
let _ticketPoll       = null;
let _activeTicketId   = null;
let _lastMsgId        = 0;
let _ticketSide       = 'user';
let _allTickets       = [];
let _adminTicketFilter = 'todos';

const escHtml = s => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const fmtTicketDate = dt => {
  const d = new Date(dt);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const ticketStatusBadge = status => {
  const map = { aberto: 'Aberto', em_atendimento: 'Em atendimento', fechado: 'Fechado' };
  return `<span class="ticket-status ticket-status--${status}">${map[status] || status}</span>`;
};

const stopTicketPoll = () => {
  if (_ticketPoll) { clearInterval(_ticketPoll); _ticketPoll = null; }
};

const appendMessages = (msgs, container, asAdmin) => {
  msgs.forEach(msg => {
    const isAdminMsg = msg.remetente_tipo === 'admin';
    const div = document.createElement('div');
    div.className = `chat-bubble ${isAdminMsg ? 'chat-bubble--admin' : 'chat-bubble--user'}`;
    const authorHtml = isAdminMsg && asAdmin
      ? `<div class="chat-bubble__author"><i class="fa-solid fa-headset"></i> Suporte</div>`
      : !isAdminMsg && asAdmin
        ? `<div class="chat-bubble__author" style="color:var(--text-muted)"><i class="fa-solid fa-user"></i> ${escHtml(msg.user_nome || 'Usuário')}</div>`
        : isAdminMsg && !asAdmin
          ? `<div class="chat-bubble__author"><i class="fa-solid fa-headset"></i> Suporte</div>`
          : '';
    div.innerHTML = `${authorHtml}
      <div class="chat-bubble__body">${escHtml(msg.mensagem).replace(/\n/g,'<br>')}</div>
      <div class="chat-bubble__time">${fmtTicketDate(msg.criado_em)}</div>`;
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
};

const renderUserTicketList = (tickets) => {
  const list  = document.getElementById('userTicketList');
  const empty = document.getElementById('userTicketEmpty');
  if (!list) return;
  if (!tickets.length) {
    list.innerHTML = '';
    if (empty) list.appendChild(empty);
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = tickets.map(t => `
    <div class="ticket-item ${t.id === _activeTicketId ? 'ticket-item--active' : ''}"
         data-ticket-id="${t.id}" data-ticket-side="user">
      <div class="ticket-item__row">
        <span class="ticket-item__subject">${escHtml(t.assunto)}</span>
        ${ticketStatusBadge(t.status)}
      </div>
      <div class="ticket-item__meta">
        <span>${fmtTicketDate(t.criado_em)}</span>
        <span>${t.total_msgs || 0} msg</span>
      </div>
      ${t.ultima_mensagem ? `<div class="ticket-item__preview">${escHtml(t.ultima_mensagem)}</div>` : ''}
    </div>`).join('');
};

const renderAdminTicketList = (tickets, filter) => {
  const list = document.getElementById('adminTicketList');
  if (!list) return;
  const shown = filter === 'todos' ? tickets : tickets.filter(t => t.status === filter);
  if (!shown.length) {
    list.innerHTML = '<p class="empty-state" style="padding:2rem;text-align:center">Nenhum ticket.</p>';
    return;
  }
  list.innerHTML = shown.map(t => `
    <div class="ticket-item ${t.id === _activeTicketId ? 'ticket-item--active' : ''}"
         data-ticket-id="${t.id}" data-ticket-side="admin">
      <div class="ticket-item__row">
        <span class="ticket-item__subject">${escHtml(t.assunto)}</span>
        ${ticketStatusBadge(t.status)}
      </div>
      <div class="ticket-item__meta">
        <span>${escHtml(t.user_nome || '')}</span>
        <span>${fmtTicketDate(t.atualizado_em)}</span>
      </div>
      ${t.ultima_mensagem ? `<div class="ticket-item__preview">${escHtml(t.ultima_mensagem)}</div>` : ''}
    </div>`).join('');
};

const updateAdminTicketBadge = () => {
  const open  = _allTickets.filter(t => t.status !== 'fechado').length;
  const badge = document.getElementById('adminTicketBadge');
  if (!badge) return;
  badge.textContent = open;
  badge.classList.toggle('hidden', open === 0);
};

const renderUserChat = (ticket, msgs) => {
  document.getElementById('userTicketChat')?.classList.remove('hidden');
  const header = document.getElementById('userChatHeader');
  if (header) header.innerHTML = `
    <div class="ticket-chat-header__subject">${escHtml(ticket.assunto)}</div>
    <div class="ticket-chat-header__meta">
      ${ticketStatusBadge(ticket.status)}
      <span>Aberto em ${fmtTicketDate(ticket.criado_em)}</span>
      <button class="btn btn--ghost btn--sm" id="btnBackTickets" style="margin-left:auto">
        <i class="fa-solid fa-arrow-left"></i> Voltar
      </button>
    </div>`;
  document.getElementById('btnBackTickets')?.addEventListener('click', closeTicketChat);
  const container = document.getElementById('userChatMessages');
  if (container) { container.innerHTML = ''; appendMessages(msgs, container, false); }
  const closed = ticket.status === 'fechado';
  const inp = document.getElementById('userChatInput');
  const snd = document.getElementById('userChatSend');
  if (inp) { inp.disabled = closed; inp.placeholder = closed ? 'Ticket fechado.' : 'Escreva sua mensagem…'; }
  if (snd) snd.disabled = closed;
};

const renderAdminChat = (ticket, msgs) => {
  document.getElementById('adminTicketChat')?.classList.remove('hidden');
  const header = document.getElementById('adminChatHeader');
  if (header) header.innerHTML = `
    <div class="ticket-chat-header__subject">${escHtml(ticket.assunto)}</div>
    <div class="ticket-chat-header__meta">
      ${ticketStatusBadge(ticket.status)}
      <span>${escHtml(ticket.user_nome || '')} · ${escHtml(ticket.user_email || '')}</span>
    </div>`;
  const container = document.getElementById('adminChatMessages');
  if (container) { container.innerHTML = ''; appendMessages(msgs, container, true); }
  const actions = document.getElementById('adminChatActions');
  if (actions) actions.innerHTML = `
    <span style="font-size:.78rem;color:var(--text-muted);margin-right:auto">Status:</span>
    ${['aberto','em_atendimento','fechado'].map(s => `
      <button class="btn btn--ghost btn--sm ${ticket.status === s ? 'btn--active-status' : ''}"
              data-status-action="${s}" data-ticket-id="${ticket.id}">
        ${s === 'aberto' ? 'Aberto' : s === 'em_atendimento' ? 'Em atendimento' : 'Fechado'}
      </button>`).join('')}`;
  const closed = ticket.status === 'fechado';
  const inp = document.getElementById('adminChatInput');
  const snd = document.getElementById('adminChatSend');
  if (inp) { inp.disabled = closed; inp.placeholder = closed ? 'Ticket fechado.' : 'Escreva sua resposta…'; }
  if (snd) snd.disabled = closed;
};

const openTicketChat = async (id, side) => {
  stopTicketPoll();
  _activeTicketId = id;
  _lastMsgId      = 0;
  _ticketSide     = side;
  // Highlight active item
  document.querySelectorAll('.ticket-item').forEach(el =>
    el.classList.toggle('ticket-item--active', Number(el.dataset.ticketId) === id));
  try {
    const { ticket, messages } = await api(`/api/tickets/${id}`);
    if (messages.length) _lastMsgId = messages[messages.length - 1].id;
    if (side === 'user')  renderUserChat(ticket, messages);
    else                  renderAdminChat(ticket, messages);
    _ticketPoll = setInterval(async () => {
      if (!_activeTicketId) return;
      try {
        const d = await api(`/api/tickets/${_activeTicketId}?after=${_lastMsgId}`);
        const newMsgs = d.messages || [];
        if (!newMsgs.length) return;
        _lastMsgId = newMsgs[newMsgs.length - 1].id;
        const cid = _ticketSide === 'user' ? 'userChatMessages' : 'adminChatMessages';
        const c = document.getElementById(cid);
        if (c) appendMessages(newMsgs, c, _ticketSide === 'admin');
        if (_ticketSide === 'user') loadUserTickets();
        else loadAdminTickets();
      } catch { /* ignore poll errors */ }
    }, 4000);
  } catch (err) {
    toast(err.message || 'Erro ao carregar ticket.', 'danger');
  }
};

const closeTicketChat = () => {
  stopTicketPoll();
  _activeTicketId = null;
  document.getElementById('userTicketChat')?.classList.add('hidden');
  document.getElementById('adminTicketChat')?.classList.add('hidden');
  document.querySelectorAll('.ticket-item').forEach(el => el.classList.remove('ticket-item--active'));
};

const sendTicketMessage = async (ticketId, text, side) => {
  const trimmed = text.trim();
  if (!trimmed) return;
  const inp = document.getElementById(side === 'user' ? 'userChatInput' : 'adminChatInput');
  const snd = document.getElementById(side === 'user' ? 'userChatSend' : 'adminChatSend');
  if (snd) snd.disabled = true;
  try {
    await api(`/api/tickets/${ticketId}/messages`, 'POST', { mensagem: trimmed });
    if (inp) inp.value = '';
    // Refresh chat to get server timestamp
    const { ticket, messages } = await api(`/api/tickets/${ticketId}`);
    if (messages.length) _lastMsgId = messages[messages.length - 1].id;
    if (side === 'user')  renderUserChat(ticket, messages);
    else                  renderAdminChat(ticket, messages);
    if (side === 'user') loadUserTickets();
    else loadAdminTickets();
  } catch (err) {
    toast(err.message || 'Erro ao enviar mensagem.', 'danger');
  } finally {
    if (snd) snd.disabled = false;
  }
};

const loadUserTickets = async () => {
  try {
    const { tickets } = await api('/api/tickets');
    _allTickets = tickets || [];
    renderUserTicketList(_allTickets);
  } catch { /* ignore */ }
};

const loadAdminTickets = async () => {
  try {
    const { tickets } = await api('/api/admin/tickets');
    _allTickets = tickets || [];
    updateAdminTicketBadge();
    renderAdminTicketList(_allTickets, _adminTicketFilter);
  } catch { /* ignore */ }
};

const createTicket = async (assunto, mensagem) => {
  const { ticket_id } = await api('/api/tickets', 'POST', { assunto, mensagem });
  toast('Ticket aberto com sucesso!', 'success');
  document.getElementById('modalNewTicket')?.classList.add('hidden');
  document.getElementById('formNewTicket')?.reset();
  await loadUserTickets();
  openTicketChat(ticket_id, 'user');
};

// ── Event binding ─────────────────────────────────────────────
const bind = () => {
  // Nav — cobre header, drawer e qualquer outro elemento com data-nav
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    navigate(btn.dataset.nav);
    if (btn.dataset.nav === 'palpites')    loadBets(1);
    if (btn.dataset.nav === 'ganhadores')  renderRanking();
    if (btn.dataset.nav === 'resultados')  renderResultados();
    if (btn.dataset.nav === 'grupos')      loadGrupos();
    if (btn.dataset.nav === 'admin')       { populateAdminSelect(); switchAdminTab('dashboard'); }
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
    if (view === 'palpites')    loadBets(1);
    if (view === 'ganhadores')  renderRanking();
    if (view === 'resultados')  renderResultados();
    if (view === 'admin')       { populateAdminSelect(); switchAdminTab('dashboard'); }
  });

  document.addEventListener('click', e => {
    if (e.target.closest('#dropdownLogout')) logout();
    if (e.target.closest('#udropBtnDeposit') || e.target.closest('#perfilBtnDeposit')) { closeAllModals?.(); openDepositModal(); }
    if (e.target.closest('#drawerBtnDeposit')) { closeMobileMenu(); openDepositModal(); }
    if (e.target.closest('#udropBtnSaque')) { openSaqueModal(); }
    if (e.target.closest('#udropBtnReferral')) {
      document.getElementById('userDropdown')?.classList.remove('udrop--open');
      openReferralModal();
    }
    if (e.target.closest('#heroBtnReferral')) { openReferralModal(); }
  });

  // Paginação "Meus Palpites"
  document.getElementById('betsList')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'my-bets-prev') loadBets(_betsPage - 1);
    if (btn.dataset.action === 'my-bets-next') loadBets(_betsPage + 1);
  });

  // Card-level click: qualquer área do card ou do slide abre o modal de palpite
  document.addEventListener('click', e => {
    if (e.target.closest('[data-action]')) return;
    const card  = e.target.closest('.game-card[data-game-id]:not([data-blocked])');
    const slide = e.target.closest('.mb-slide[data-game-id]');
    const target = card || slide;
    if (!target) return;
    const id = target.dataset.gameId;
    if (id) openBetModal(id);
  });

  // Game grid actions (bet / pay / confirm) via delegation
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'bet')        openBetModal(id);
    if (action === 'share')      openShareModal(id);
    if (action === 'share-game') shareGameLink(id);
    if (action === 'pay') {
      const betId   = Number(id);
      const betData = S.bets?.find(b => Number(b.id) === betId);
      if (!betData) return;
      S.selectedBet  = betData;
      S.selectedGame = S.games.find(g => Number(g.id) === Number(betData.jogo_id)) || {
        time_casa: betData.time_casa, time_fora: betData.time_fora,
        data_hora: betData.data_hora, liga_nome: betData.liga_nome,
        bandeira_casa: betData.bandeira_casa, bandeira_fora: betData.bandeira_fora,
        logo_casa: betData.logo_casa, logo_fora: betData.logo_fora,
      };
      fillTicket(betData);
      openModal('modalTicket');
    }
    if (action === 'repay') {
      const betId   = Number(id);
      const betData = S.bets?.find(b => Number(b.id) === betId);
      if (!betData) return;
      S.selectedBet = betData;
      api(`/api/apostas/${betId}/pagar`, 'POST', {})
        .then(data => openPixModal(data))
        .catch(err => toast(err.message || 'Erro ao gerar PIX.', 'danger'));
    }
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

  // League tab filter
  document.addEventListener('click', e => {
    const tab = e.target.closest('.league-tab[data-league]');
    if (!tab) return;
    _activeLeague = tab.dataset.league;
    document.querySelectorAll('.league-tab').forEach(t => {
      const active = t.dataset.league === _activeLeague;
      t.classList.toggle('league-tab--active', active);
      t.setAttribute('aria-selected', active);
    });
    renderGames();
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
    if (target.dataset.close) {
      closeModal(target.dataset.close);
      if (target.dataset.close === 'modalPalpite' && _betCountdownTimer) {
        clearInterval(_betCountdownTimer); _betCountdownTimer = null;
      }
    }
    if (target.classList.contains('modal__backdrop') && !target.dataset.close) {
      closeAllModals();
      if (_betCountdownTimer) { clearInterval(_betCountdownTimer); _betCountdownTimer = null; }
    }
  });

  // Score counter buttons
  const stepScore = (val, dir) => {
    if (val === null) return dir > 0 ? 0 : 10;
    if (val === 0 && dir < 0) return null;
    return Math.max(0, val + dir);
  };
  let _scoreTrackTimer = null;
  const _trackScoreDebounced = () => {
    clearTimeout(_scoreTrackTimer);
    _scoreTrackTimer = setTimeout(() => {
      if (S.selectedGame && S.scoreHome !== null && S.scoreAway !== null) {
        trackEvent('bet', `Selecionou placar: ${S.selectedGame.time_casa} ${S.scoreHome}×${S.scoreAway} ${S.selectedGame.time_fora}`);
      }
    }, 1500);
  };
  document.getElementById('modalPalpite').addEventListener('click', e => {
    const btn = e.target.closest('.score-btn');
    if (!btn) return;
    const dir = Number(btn.dataset.dir);
    if (btn.dataset.score === 'home') S.scoreHome = stepScore(S.scoreHome, dir);
    if (btn.dataset.score === 'away') S.scoreAway = stepScore(S.scoreAway, dir);
    renderScore('scoreHome', S.scoreHome);
    renderScore('scoreAway', S.scoreAway);
    updateBetPreview();
    _trackScoreDebounced();
  });

  document.getElementById('modalPalpite').addEventListener('input', e => {
    const inp = e.target;
    if (!inp.classList.contains('score-value')) return;
    const raw = inp.value.replace(/\D/g, '');
    const n   = raw === '' ? null : Math.min(99, Math.max(0, parseInt(raw, 10)));
    if (inp.id === 'scoreHome') S.scoreHome = n;
    if (inp.id === 'scoreAway') S.scoreAway = n;
    inp.classList.toggle('score-value--empty', n === null);
    updateBetPreview();
  });

  // Stake slider
  document.getElementById('stakeSlider').addEventListener('input', e => {
    S.stake = Number(e.target.value);
    updateBetPreview();
  });

  // Confirm bet button
  document.getElementById('btnConfirmBet').addEventListener('click', submitBet);

  // Ticket payment buttons
  document.getElementById('btnSimulatePay').addEventListener('click', simulatePay);
  const _handleEditBet = async () => {
    trackEvent('action', 'Clicou em Alterar Palpite');
    if (S.selectedBet?.id && S.selectedBet.status === 'pendente') {
      try { await api(`/api/apostas/${S.selectedBet.id}/cancelar`, 'POST', {}); } catch { /* ignora */ }
    }
    closeModal('modalTicket');
    openBetModal(S.selectedGame.id);
  };
  document.getElementById('btnEditBet')?.addEventListener('click', _handleEditBet);
  document.getElementById('btnEditBetPay')?.addEventListener('click', _handleEditBet);
  document.getElementById('btnFinalizePayment')?.addEventListener('click', () => {
    if (S._payMethod === 'saldo') confirmBalancePayment();
    else if (S._payMethod === 'expay') confirmExpayPayment();
    else confirmPixPayment();
  });
  document.getElementById('payOptSaldo')?.addEventListener('click',  () => _selectPayMethod('saldo'));
  document.getElementById('payOptPix')?.addEventListener('click',    () => _selectPayMethod('pix'));
  document.getElementById('payOptExpay')?.addEventListener('click',  () => _selectPayMethod('expay'));

  // PIX modal
  document.getElementById('btnPixClose')?.addEventListener('click', closePixModal);
  document.getElementById('modalPixOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modalPixOverlay')) closePixModal();
  });

  // Deposit modal
  document.getElementById('btnDepositClose')?.addEventListener('click', closeDepositModal);
  document.getElementById('modalDepositOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modalDepositOverlay')) closeDepositModal();
  });
  document.getElementById('btnDepositSubmit')?.addEventListener('click', submitDeposit);
  document.getElementById('btnDepositConfirm')?.addEventListener('click', confirmDeposit);
  document.querySelectorAll('.dq-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('depositValor').value = btn.dataset.val;
      document.querySelectorAll('.dq-btn').forEach(b => b.classList.remove('dq-btn--active'));
      btn.classList.add('dq-btn--active');
    });
  });

  // Saque modal
  document.getElementById('btnSaqueClose')?.addEventListener('click', closeSaqueModal);
  document.getElementById('modalSaqueOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modalSaqueOverlay')) closeSaqueModal();
  });
  document.getElementById('formSaque')?.addEventListener('submit', submitSaque);
  document.getElementById('formPerfil')?.addEventListener('submit', submitPerfil);

  // ── Ticket: list item clicks ──────────────────────────────
  document.addEventListener('click', e => {
    const item = e.target.closest('.ticket-item[data-ticket-id]');
    if (!item) return;
    openTicketChat(Number(item.dataset.ticketId), item.dataset.ticketSide);
  });

  // ── Ticket: admin filter buttons ──────────────────────────
  document.addEventListener('click', e => {
    const btn = e.target.closest('.ticket-filter-btn[data-ticket-filter]');
    if (!btn) return;
    _adminTicketFilter = btn.dataset.ticketFilter;
    document.querySelectorAll('.ticket-filter-btn').forEach(b =>
      b.classList.toggle('ticket-filter-btn--active', b === btn));
    renderAdminTicketList(_allTickets, _adminTicketFilter);
  });

  // ── Ticket: admin status change ───────────────────────────
  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-status-action]');
    if (!btn) return;
    const { statusAction, ticketId } = btn.dataset;
    try {
      await api(`/api/admin/tickets/${ticketId}/status`, 'POST', { status: statusAction });
      toast('Status atualizado.', 'success');
      await loadAdminTickets();
      if (_activeTicketId === Number(ticketId)) openTicketChat(Number(ticketId), 'admin');
    } catch (err) { toast(err.message || 'Erro.', 'danger'); }
  });

  // ── Ticket: new ticket modal ──────────────────────────────
  document.getElementById('btnNewTicket')?.addEventListener('click', () =>
    document.getElementById('modalNewTicket')?.classList.remove('hidden'));
  document.getElementById('btnNewTicketClose')?.addEventListener('click', () =>
    document.getElementById('modalNewTicket')?.classList.add('hidden'));
  document.getElementById('modalNewTicket')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modalNewTicket'))
      document.getElementById('modalNewTicket')?.classList.add('hidden');
  });
  document.getElementById('formNewTicket')?.addEventListener('submit', async e => {
    e.preventDefault();
    const assunto  = document.getElementById('ticketAssunto').value.trim();
    const mensagem = document.getElementById('ticketMensagem').value.trim();
    if (!assunto || !mensagem) return;
    const btn = document.getElementById('btnSubmitTicket');
    btn.disabled = true;
    try { await createTicket(assunto, mensagem); }
    catch (err) { toast(err.message || 'Erro ao criar ticket.', 'danger'); }
    finally { btn.disabled = false; }
  });

  // ── Ticket: user chat send ────────────────────────────────
  document.getElementById('userChatSend')?.addEventListener('click', () => {
    const inp = document.getElementById('userChatInput');
    if (inp && _activeTicketId) sendTicketMessage(_activeTicketId, inp.value, 'user');
  });
  document.getElementById('userChatInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('userChatSend')?.click(); }
  });

  // ── Ticket: admin chat send ───────────────────────────────
  document.getElementById('adminChatSend')?.addEventListener('click', () => {
    const inp = document.getElementById('adminChatInput');
    if (inp && _activeTicketId) sendTicketMessage(_activeTicketId, inp.value, 'admin');
  });
  document.getElementById('adminChatInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('adminChatSend')?.click(); }
  });

  // Share modal
  document.getElementById('btnShareClose')?.addEventListener('click', closeShareModal);
  document.getElementById('modalShareOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modalShareOverlay')) closeShareModal();
  });
  document.getElementById('btnShareWhatsApp')?.addEventListener('click', () => {
    const bet  = S.bets.find(b => Number(b.id) === _shareBetId);
    window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(getShareText(bet))}`, '_blank');
  });
  document.getElementById('btnShareTelegram')?.addEventListener('click', () => {
    const bet = S.bets.find(b => Number(b.id) === _shareBetId);
    const url = bet?.id ? `${location.origin}/share/bet/${bet.id}` : location.origin;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(getShareText(bet))}`, '_blank');
  });
  document.getElementById('btnShareFacebook')?.addEventListener('click', () => {
    const bet = S.bets.find(b => Number(b.id) === _shareBetId);
    const url = bet?.id ? `${location.origin}/share/bet/${bet.id}` : location.origin;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  });
  document.getElementById('btnShareTwitter')?.addEventListener('click', () => {
    const bet = S.bets.find(b => Number(b.id) === _shareBetId);
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(getShareText(bet))}`, '_blank');
  });
  document.getElementById('btnShareNative')?.addEventListener('click', () => {
    const canvas = document.getElementById('shareCanvas');
    const bet    = S.bets.find(b => Number(b.id) === _shareBetId);
    if (!canvas || !navigator.share) return;
    canvas.toBlob(async blob => {
      try {
        const file = new File([blob], 'palpite-betcopa.png', { type: 'image/png' });
        await navigator.share({ title: 'BetCopa', text: getShareText(bet), files: [file] });
      } catch { /* user cancelled */ }
    }, 'image/png');
  });
  document.getElementById('btnShareCopyLink')?.addEventListener('click', () => {
    const bet = S.bets.find(b => Number(b.id) === _shareBetId);
    const url = bet?.id ? `${location.origin}/share/bet/${bet.id}` : location.origin;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('btnShareCopyLink');
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Copiado!</span>';
      btn.style.color = 'var(--primary)';
      setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 2000);
    }).catch(() => toast('Não foi possível copiar o link.', 'danger'));
  });

  // Game share modal
  document.getElementById('btnGameShareClose')?.addEventListener('click', closeGameShareModal);
  document.getElementById('modalGameShareOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modalGameShareOverlay')) closeGameShareModal();
  });
  document.getElementById('btnGameShareWhatsApp')?.addEventListener('click', () => {
    const game = S.games.find(g => Number(g.id) === _shareGameId);
    const text = getGameShareText(game);
    window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  });
  document.getElementById('btnGameShareTwitter')?.addEventListener('click', () => {
    const game = S.games.find(g => Number(g.id) === _shareGameId);
    const text = getGameShareText(game);
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
  });
  document.getElementById('btnGameShareFacebook')?.addEventListener('click', () => {
    const url = `${location.origin}/share/game/${_shareGameId}`;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  });
  document.getElementById('btnGameShareTelegram')?.addEventListener('click', () => {
    const game = S.games.find(g => Number(g.id) === _shareGameId);
    const text = getGameShareText(game);
    const url  = `${location.origin}/share/game/${_shareGameId}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
  });
  document.getElementById('btnGameShareNative')?.addEventListener('click', () => {
    const game   = S.games.find(g => Number(g.id) === _shareGameId);
    const canvas = document.getElementById('gameShareCanvas');
    if (!canvas || !navigator.share) return;
    canvas.toBlob(async blob => {
      try {
        const file = new File([blob], 'jogo-betcopa.png', { type: 'image/png' });
        await navigator.share({ title: 'BetCopa', text: getGameShareText(game), files: [file] });
      } catch { /* user cancelled */ }
    }, 'image/png');
  });
  document.getElementById('btnGameShareCopyLink')?.addEventListener('click', () => {
    const url = `${location.origin}/share/game/${_shareGameId}`;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('btnGameShareCopyLink');
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
      btn.style.color = 'var(--primary)';
      setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 2000);
    }).catch(() => toast('Não foi possível copiar o link.', 'danger'));
  });

  // ── Guest bet modal ───────────────────────────────────────
  const closeGuestBetModal = () => document.getElementById('modalGuestBet')?.classList.add('hidden');
  document.getElementById('closeModalGuestBet')?.addEventListener('click', closeGuestBetModal);
  document.getElementById('modalGuestBet')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modalGuestBet')) closeGuestBetModal();
  });
  document.getElementById('guestBetRegisterBtn')?.addEventListener('click', () => {
    closeGuestBetModal();
    switchAuthTab('register');
    navigate('auth');
  });
  document.getElementById('guestBetLoginBtn')?.addEventListener('click', () => {
    closeGuestBetModal();
    switchAuthTab('login');
    navigate('auth');
  });

  document.getElementById('refBtnCopy')?.addEventListener('click', () => {});

  // ── Pre-login prize preview modal ─────────────────────────
  document.getElementById('plBtnRegister')?.addEventListener('click', () => {
    closeModal('modalPreLogin');
    switchAuthTab('register');
    navigate('auth');
  });
  document.getElementById('plBtnLogin')?.addEventListener('click', () => {
    closeModal('modalPreLogin');
    switchAuthTab('login');
    navigate('auth');
  });

  // ── PWA install ───────────────────────────────────────────
  document.getElementById('btnInstallPwa')?.addEventListener('click', async () => {
    if (!_installPrompt) return;
    _installPrompt.prompt();
    const { outcome } = await _installPrompt.userChoice;
    if (outcome === 'accepted') {
      _installPrompt = null;
      document.getElementById('btnInstallPwa')?.classList.add('hidden');
    }
  });

  // ── Notification bell toggle ──────────────────────────────
  document.getElementById('btnNotifBell')?.addEventListener('click', e => {
    e.stopPropagation();
    const panel = document.getElementById('notifPanel');
    if (panel?.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      loadNotifications();
    } else {
      panel?.classList.add('hidden');
    }
  });

  // Close notification panel on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#notifBell'))
      document.getElementById('notifPanel')?.classList.add('hidden');
  });

  // Mark all notifications as read
  document.getElementById('btnNotifReadAll')?.addEventListener('click', async () => {
    await api('/api/notifications/read-all', 'POST', {}).catch(() => {});
    await loadNotifications();
  });

  // Click individual notification: mark read + navigate
  document.addEventListener('click', e => {
    const item = e.target.closest('.notif-item[data-notif-id]');
    if (!item) return;
    const { notifId, notifUrl } = item.dataset;
    api(`/api/notifications/${notifId}/read`, 'POST', {}).catch(() => {});
    document.getElementById('notifPanel')?.classList.add('hidden');
    if (notifUrl) navigate(notifUrl.replace('/#', '').replace('/', '') || 'jogos');
    loadNotifications();
  });

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
  document.getElementById('forgotForm')?.addEventListener('submit', submitForgotPassword);
  document.getElementById('resetForm')?.addEventListener('submit', submitResetPassword);
  document.getElementById('btnForgotPassword')?.addEventListener('click', () => switchAuthTab('forgot'));
  document.getElementById('btnBackToLogin')?.addEventListener('click', () => switchAuthTab('login'));

  // Drawer auth buttons (static in template)
  document.getElementById('drawerBtnRegister')?.addEventListener('click', () => {
    closeMobileMenu(); navigate('auth'); switchAuthTab('register');
  });

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

  // Payment logo upload inputs
  document.getElementById('pixLogoInput')?.addEventListener('change', e => {
    const f = e.target.files?.[0]; if (f) uploadPaymentLogo('pix', f); e.target.value = '';
  });
  document.getElementById('expayLogoInput')?.addEventListener('change', e => {
    const f = e.target.files?.[0]; if (f) uploadPaymentLogo('expay', f); e.target.value = '';
  });

  // Admin forms
  document.getElementById('adminResultForm').addEventListener('submit', submitAdminResult);

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

  // Grupos: botão refresh
  document.getElementById('btnRefreshGrupos')?.addEventListener('click', () => loadGrupos(true));

  // Resultados: search with debounce
  let _resSearchTimer;
  document.getElementById('resSearch')?.addEventListener('input', e => {
    clearTimeout(_resSearchTimer);
    _resSearchTimer = setTimeout(() => { _resSearch = e.target.value; renderResultados(); }, 250);
  });

  // Resultados: filtro de data
  document.getElementById('resDateTabs')?.addEventListener('click', e => {
    const tab = e.target.closest('[data-filter]');
    if (!tab) return;
    _resDateFilter = tab.dataset.filter;
    document.querySelectorAll('#resDateTabs .res-date-tab').forEach(t =>
      t.classList.toggle('res-date-tab--active', t === tab)
    );
    renderResultados();
  });

  // Admin sidebar tabs
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-admin-tab]');
    if (btn) switchAdminTab(btn.dataset.adminTab);
  });

  // Admin games list — editar + resultado + paginação + seleção + excluir
  document.getElementById('adminGamesList')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="abrir-resultado"]');
    if (btn) openAdminResultado(Number(btn.dataset.id), btn.dataset.label);
    const delBtn = e.target.closest('[data-action="excluir-jogo"]');
    if (delBtn) { deleteGame(Number(delBtn.dataset.id), delBtn.dataset.label); return; }
  });
  document.getElementById('adminGamesList')?.addEventListener('change', e => {
    const chk = e.target.closest('.game-row-chk');
    if (chk) _toggleGameSel(Number(chk.dataset.id), chk.checked);
  });
  document.getElementById('btnBulkDelete')?.addEventListener('click', bulkDeleteGames);
  document.getElementById('btnDeleteByLeague')?.addEventListener('click', deleteByLeague);
  document.getElementById('btnBulkClear')?.addEventListener('click', () => {
    _selectedGames.clear();
    _syncBulkBar();
    document.querySelectorAll('#adminGamesList .game-row-chk').forEach(c => c.checked = false);
    const all = document.getElementById('chkAllGames');
    if (all) all.checked = false;
  });

  // Lote de resultados
  const bulkPanel = document.getElementById('bulkResultPanel');
  if (bulkPanel) {
    bulkPanel.addEventListener('toggle', () => { if (bulkPanel.open) renderBulkResultList(); });
    bulkPanel.addEventListener('change', e => {
      if (e.target.id === 'checkAllBulk') {
        document.querySelectorAll('#bulkResultList .bulk-chk').forEach(chk => {
          chk.checked = e.target.checked;
          const id = chk.dataset.id;
          const c = document.getElementById(`bsc-${id}`);
          const f = document.getElementById(`bsf-${id}`);
          if (c) c.disabled = !e.target.checked;
          if (f) f.disabled = !e.target.checked;
        });
        updateBulkCount();
      } else if (e.target.classList.contains('bulk-chk')) {
        const id = e.target.dataset.id;
        const c = document.getElementById(`bsc-${id}`);
        const f = document.getElementById(`bsf-${id}`);
        if (c) c.disabled = !e.target.checked;
        if (f) f.disabled = !e.target.checked;
        updateBulkCount();
      }
    });
    document.getElementById('btnBulkResult')?.addEventListener('click', submitBulkResult);
  }
  document.getElementById('adminGamesPagination')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="admin-page"]');
    if (btn && !btn.disabled) { adminGamesPage = Number(btn.dataset.page); renderAdminGames(); }
  });
  document.addEventListener('click', e => {
    if (e.target.closest('[data-close="modalAdminResultado"]')) closeAdminResultado();
  });

  // Block / unblock user + pagination via event delegation
  document.getElementById('adminUsersList')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'users-prev') { loadAdminUsers(_adminUsersPage - 1); return; }
    if (btn.dataset.action === 'users-next') { loadAdminUsers(_adminUsersPage + 1); return; }
    if (btn.dataset.action === 'block' || btn.dataset.action === 'unblock')
      handleBlockUser(Number(btn.dataset.uid), btn.dataset.action === 'block');
    if (btn.dataset.action === 'make-admin' || btn.dataset.action === 'remove-admin')
      handleToggleAdmin(Number(btn.dataset.uid), btn.dataset.action === 'make-admin');
    if (btn.dataset.action === 'change-password')
      handleChangeUserPassword(Number(btn.dataset.uid), btn.dataset.nome || '');
    if (btn.dataset.action === 'adjust-bonus')
      handleUserBonus(Number(btn.dataset.uid), btn.dataset.nome || '');
  });
  document.getElementById('adminUsersList')?.addEventListener('change', e => {
    const chk = e.target.closest('.user-row-chk');
    if (chk) _toggleUserSel(Number(chk.dataset.id), chk.checked);
  });
  document.getElementById('btnBulkDeleteUsers')?.addEventListener('click', bulkDeleteUsers);
  document.getElementById('btnBulkClearUsers')?.addEventListener('click', () => {
    _selectedUsers.clear();
    _syncUsersBulkBar();
    document.querySelectorAll('#adminUsersList .user-row-chk').forEach(c => c.checked = false);
    const all = document.getElementById('chkAllUsers');
    if (all) all.checked = false;
  });
  document.getElementById('btnDeleteAllUsers')?.addEventListener('click', async () => {
    const ok = await confirm({
      title:        'Excluir todos os usuários?',
      message:      'A conta admin será preservada. Esta ação não pode ser desfeita.',
      confirmText:  'Excluir tudo',
      cancelText:   'Cancelar',
      confirmColor: '#FF4757',
    });
    if (!ok) return;
    const btn = document.getElementById('btnDeleteAllUsers');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
      const res = await api('/api/admin/usuarios/excluir/todos', 'POST', {});
      toast(res.message, 'success');
      _selectedUsers.clear(); _syncUsersBulkBar();
      await loadAdminUsers(1);
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Excluir tudo';
    }
  });

  // Filtro de apostas
  document.getElementById('btnFilterBets')?.addEventListener('click', () => { _adminBetsPage = 1; fetchAdminBets(); });
  document.getElementById('btnClearBetFilter')?.addEventListener('click', () => {
    const g = document.getElementById('filterBetGame');
    const s = document.getElementById('filterBetStatus');
    if (g) g.value = ''; if (s) s.value = '';
    _adminBetsPage = 1; fetchAdminBets();
  });

  // Paginação de apostas via event delegation
  document.getElementById('adminBetsList')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'bets-prev') { fetchAdminBets(_adminBetsPage - 1); return; }
    if (btn.dataset.action === 'bets-next') { fetchAdminBets(_adminBetsPage + 1); return; }
    if (btn.dataset.action === 'bet-delete') {
      const id = Number(btn.dataset.id);
      const ok = await confirm({
        title:        `Excluir aposta #${id}?`,
        message:      'Esta ação não pode ser desfeita.',
        confirmText:  'Excluir',
        cancelText:   'Cancelar',
        confirmColor: '#FF4757',
      });
      if (!ok) return;
      btn.disabled = true;
      try {
        const res = await api(`/api/admin/apostas/${id}/excluir`, 'POST', {});
        toast(res.message, 'success');
        _selectedBets.delete(id);
        _syncBetsBulkBar();
        await fetchAdminBets(_adminBetsPage);
      } catch (err) {
        toast(err.message || 'Erro ao excluir aposta.', 'danger');
        btn.disabled = false;
      }
    }
  });
  document.getElementById('adminBetsList')?.addEventListener('change', e => {
    const chk = e.target.closest('.bet-row-chk');
    if (chk) _toggleBetSel(Number(chk.dataset.id), chk.checked);
  });
  document.getElementById('btnBulkDeleteBets')?.addEventListener('click', bulkDeleteBets);
  document.getElementById('btnBulkClearBets')?.addEventListener('click', () => {
    _selectedBets.clear();
    _syncBetsBulkBar();
    document.querySelectorAll('#adminBetsList .bet-row-chk').forEach(c => c.checked = false);
    const all = document.getElementById('chkAllBets');
    if (all) all.checked = false;
  });
  document.getElementById('btnSeedExampleBets')?.addEventListener('click', async () => {
    const ok = await confirm({
      title:       'Carregar apostas de exemplo?',
      message:     'Serão criados 10 usuários de teste com apostas nos jogos já finalizados. Apostas anteriores desses usuários serão substituídas.',
      confirmText: 'Carregar',
      cancelText:  'Cancelar',
    });
    if (!ok) return;
    const btn = document.getElementById('btnSeedExampleBets');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Carregando…';
    try {
      const res = await api('/api/admin/apostas/seed', 'POST', {});
      toast(res.message, 'success');
      loadAdminBets();
    } catch (e) {
      toast(e.message || 'Erro ao carregar apostas de exemplo.', 'error');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-flask"></i> Carregar apostas de exemplo';
    }
  });

  document.getElementById('btnDeleteAllBets')?.addEventListener('click', async () => {
    const ok = await confirm({
      title:        'Excluir todas as apostas?',
      message:      'Todas as apostas serão removidas permanentemente. Esta ação não pode ser desfeita.',
      confirmText:  'Excluir tudo',
      cancelText:   'Cancelar',
      confirmColor: '#FF4757',
    });
    if (!ok) return;
    const btn = document.getElementById('btnDeleteAllBets');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
      const res = await api('/api/admin/apostas/excluir/todos', 'POST', {});
      toast(res.message, 'success');
      _selectedBets.clear(); _syncBetsBulkBar();
      await fetchAdminBets(1);
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Excluir tudo';
    }
  });

  // Paginação do dashboard
  document.getElementById('dashRecentes')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'dash-bets-prev') loadAdminDashboard({ betsPage: _dashBetsPage - 1 });
    if (btn.dataset.action === 'dash-bets-next') loadAdminDashboard({ betsPage: _dashBetsPage + 1 });
  });
  document.getElementById('dashPorJogo')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'dash-games-prev') loadAdminDashboard({ gamesPage: _dashGamesPage - 1 });
    if (btn.dataset.action === 'dash-games-next') loadAdminDashboard({ gamesPage: _dashGamesPage + 1 });
  });
  document.getElementById('dashPorJogo')?.addEventListener('change', e => {
    const chk = e.target.closest('.dash-game-chk');
    if (!chk) return;
    chk.checked ? _selectedDashGames.add(Number(chk.dataset.id)) : _selectedDashGames.delete(Number(chk.dataset.id));
    _syncDashGamesBulkBar();
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

  // Hero CTA — rola para os jogos
  document.getElementById('btnHeroCta')?.addEventListener('click', () => {
    navigate('jogos');
    setTimeout(() => {
      const target = document.getElementById('leagueTabs') || document.getElementById('gamesGrid');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  });

  // Botão refresh dashboard
  document.getElementById('btnRefreshDash')?.addEventListener('click', loadAdminDashboard);
  document.getElementById('btnRefreshOnline')?.addEventListener('click', loadAdminOnline);

  // IP history modal
  let _ipHistoryCurrent = '';
  document.getElementById('anVisitsTable')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.an-eye-btn[data-ip]');
    if (!btn || !btn.dataset.ip) return;
    const ip     = btn.dataset.ip;
    _ipHistoryCurrent = ip;
    const listEl = document.getElementById('ipHistoryList');
    const sub    = document.getElementById('ipHistorySubtitle');
    if (sub)    sub.textContent = ip;
    if (listEl) listEl.innerHTML = '<p class="text--muted">Carregando…</p>';
    document.getElementById('modalIPHistory')?.classList.remove('hidden');
    try {
      const { sessions } = await api(`/api/admin/analytics/ip?ip=${encodeURIComponent(ip)}`);
      if (!listEl) return;
      if (!sessions || !sessions.length) {
        listEl.innerHTML = '<p class="text--muted" style="text-align:center;padding:2rem 0">Nenhuma sessão encontrada.</p>';
        return;
      }
      const s0   = sessions[0];
      const flag = _countryFlag(s0.country || '');
      const geo  = [s0.city, s0.region, s0.country_name].filter(Boolean).join(', ');
      if (sub) sub.textContent = `${ip}${geo ? '  ·  ' + flag + ' ' + geo : ''}`;

      const logged = sessions.filter(s => s.user_id);
      const anon   = sessions.filter(s => !s.user_id);

      const _EVT_IC = {
        navigate:    { icon: 'fa-solid fa-arrow-right',        color: '#60a5fa' },
        modal_open:  { icon: 'fa-solid fa-window-maximize',    color: '#34d399' },
        modal_close: { icon: 'fa-solid fa-window-minimize',    color: '#f87171' },
        action:      { icon: 'fa-solid fa-bolt',                color: '#fbbf24' },
        form:        { icon: 'fa-solid fa-pen-to-square',       color: '#a78bfa' },
        bet:         { icon: 'fa-solid fa-futbol',              color: '#59ff15' },
        payment:     { icon: 'fa-solid fa-credit-card',         color: '#f59e0b' },
        auth:        { icon: 'fa-solid fa-user-check',          color: '#818cf8' },
        error:       { icon: 'fa-solid fa-circle-exclamation',  color: '#f87171' },
      };

      const renderEventsTimeline = (events, sess) => {
        if (!events || !events.length) return '';

        // colapsa eventos consecutivos com mesmo label
        const collapsed = events.reduce((acc, ev) => {
          const last = acc[acc.length - 1];
          if (last && last.label === ev.label && last.event_type === ev.event_type) {
            last._count = (last._count || 1) + 1;
            last._last_at = ev.created_at;
          } else {
            acc.push({ ...ev, _count: 1 });
          }
          return acc;
        }, []);

        const steps = collapsed.map((ev, idx) => {
          const m      = _EVT_IC[ev.event_type] || { icon: 'fa-solid fa-circle', color: '#9ca3af' };
          const ts     = new Date(ev.created_at).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
          const isLast = idx === collapsed.length - 1;
          const countBadge = ev._count > 1 ? `<span class="evts-flow__count">×${ev._count}</span>` : '';

          let delta = '';
          if (!isLast) {
            const diffS = Math.round((new Date(collapsed[idx + 1].created_at) - new Date(ev._last_at || ev.created_at)) / 1000);
            delta = diffS < 60
              ? `+${diffS}s`
              : `+${Math.floor(diffS / 60)}m${diffS % 60 ? String(diffS % 60).padStart(2, '0') + 's' : ''}`;
          }

          const step = `<div class="evts-flow__step">
            <div class="evts-flow__icon" style="--ic:${m.color}"><i class="${m.icon}"></i>${countBadge}</div>
            <div class="evts-flow__info">
              <span class="evts-flow__label">${ev.label}</span>
              <span class="evts-flow__ts">${ts}</span>
            </div>
          </div>`;

          const arrow = !isLast
            ? `<div class="evts-flow__arrow"><span class="evts-flow__delta">${delta}</span><i class="fa-solid fa-chevron-right"></i></div>`
            : '';

          return step + arrow;
        }).join('');

        const collapseInfo = collapsed.length < events.length ? ` · ${events.length} total` : '';
        return `<div class="ip-evts-path">
          <div class="ip-evts-path__hdr"><i class="fa-solid fa-route"></i> Caminho · ${collapsed.length} passos${collapseInfo}</div>
          <div class="evts-flow">${steps}</div>
        </div>`;
      };

      const renderGroup = (title, iconCls, items) => {
        if (!items.length) return '';
        return `<div class="ip-hist-group">
          <h4 class="ip-hist-group__title"><i class="${iconCls}"></i> ${title} <span class="ip-hist-group__cnt">${items.length}</span></h4>
          ${items.map(s => {
            const dur  = _fmtDuration2(+s.duration_sec || 0);
            const dt   = _fmtDateTime(s.last_seen);
            const stBadge = s.is_new == 1
              ? '<span class="an-status an-status--new"><i class="fa-solid fa-star"></i> Novo</span>'
              : '<span class="an-status an-status--ret"><i class="fa-solid fa-rotate-left"></i> Retornou</span>';
            return `<div class="ip-hist-row">
              <div class="ip-hist-row__head">
                ${s.nome ? `<strong class="ip-hist-row__nome">${s.nome}</strong>` : ''}
                ${_brBadge(s.browser, s.os)}
                ${stBadge}
                <span class="ip-hist-row__page"><i class="fa-solid fa-location-dot" style="opacity:.5"></i> ${s.current_page || s.landing_page || '—'}</span>
              </div>
              <div class="ip-hist-row__meta">
                <span class="ip-hist-row__date">${dt}</span>
                <span class="ip-hist-row__dur"><i class="fa-regular fa-clock"></i> ${dur}</span>
                <span class="ip-hist-row__pv">${s.page_views||1}× págs</span>
              </div>
              ${renderEventsTimeline(s.events, s)}
            </div>`;
          }).join('')}
        </div>`;
      };

      listEl.innerHTML =
        renderGroup('Logado', 'fa-solid fa-user-check', logged) +
        renderGroup('Anônimo', 'fa-solid fa-user-secret', anon);
    } catch (err) {
      if (listEl) listEl.innerHTML = `<p class="text--muted">${err.message}</p>`;
    }
  });
  document.getElementById('btnIPHistoryClose')?.addEventListener('click', () =>
    document.getElementById('modalIPHistory')?.classList.add('hidden')
  );
  document.getElementById('modalIPHistoryBackdrop')?.addEventListener('click', () =>
    document.getElementById('modalIPHistory')?.classList.add('hidden')
  );
  document.getElementById('btnIPHistoryDelete')?.addEventListener('click', async () => {
    if (!_ipHistoryCurrent) return;
    const confirmed = await Swal.fire({
      title: 'Excluir histórico?',
      html: `Todo o histórico de visitas do IP <code>${_ipHistoryCurrent}</code> será removido permanentemente.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sim, excluir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
    });
    if (!confirmed.isConfirmed) return;
    try {
      await api(`/api/admin/analytics/ip?ip=${encodeURIComponent(_ipHistoryCurrent)}`, 'DELETE');
      document.getElementById('modalIPHistory')?.classList.add('hidden');
      loadAdminAnalytics();
    } catch (err) {
      Swal.fire('Erro', err.message, 'error');
    }
  });
  document.getElementById('btnRunAllMigrations')?.addEventListener('click', runAllPendingMigrations);
  document.getElementById('btnRefreshSaques')?.addEventListener('click', loadAdminSaques);

  // Filtro de status de saques
  document.getElementById('filterSaqueStatus')?.addEventListener('change', renderAdminSaques);

  // Aprovar / Rejeitar saques (delegação)
  document.getElementById('adminSaquesList')?.addEventListener('click', e => {
    const btnAprovar  = e.target.closest('[data-saque-aprovar]');
    const btnRejeitar = e.target.closest('[data-saque-rejeitar]');
    if (btnAprovar)  _adminSaqueAprovar(parseInt(btnAprovar.dataset.saqueAprovar));
    if (btnRejeitar) _adminSaqueRejeitar(parseInt(btnRejeitar.dataset.saqueRejeitar));
  });

  // Config form
  document.getElementById('adminConfigForm')?.addEventListener('submit', submitAdminConfig);

  // Import / Sync (botões dentro da aba Jogos)
  document.getElementById('btnImport')?.addEventListener('click', importFromApi);
  document.getElementById('btnSync')?.addEventListener('click', syncResults);
  document.getElementById('btnSyncImages')?.addEventListener('click', syncImages);
  document.getElementById('btnSeedRanking')?.addEventListener('click', seedRanking);


  document.getElementById('leaguePreviewBadges')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-fetch-league]');
    if (!btn) return;
    const id = btn.dataset.fetchLeague;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
      const { count } = await api(`/api/admin/jogos/preview-league?id=${id}`);
      _leagueCounts[id] = count;
      _renderLeagueBadges();
      const meta = document.getElementById('leaguePreviewMeta');
      if (meta) meta.textContent = 'Atualizado agora';
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i>';
      toast(err.message || 'Erro ao consultar a API', 'danger');
    }
  });

  // Limpar cache
  document.getElementById('btnClearCache')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnClearCache');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Limpando...';
    try {
      const r = await api('/api/admin/cache/clear', 'POST', {});
      toast(`Cache limpo! Versão ${r.version} — visitantes receberão os arquivos atualizados.`, 'success');
      // Limpa SW cache local do navegador admin também
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (err) {
      toast(err.message || 'Erro ao limpar cache.', 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Limpar Cache';
    }
  });
};

// ── Admin helpers ─────────────────────────────────────────────
const fmtR$ = (n) => `R$ ${parseFloat(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const _payMethodBadge = (method) => {
  if (!method) return '<span style="color:var(--text-muted);font-size:.75rem">—</span>';
  const map = {
    mercadopago: { icon: 'fa-brands fa-pix',   label: 'PIX',   color: '#00bfa5' },
    expay:       { icon: 'fa-solid fa-bolt',    label: 'ExPay', color: '#1565c0' },
    saldo:       { icon: 'fa-solid fa-wallet',  label: 'Bônus', color: '#f59e0b' },
  };
  const m = map[method] || { icon: 'fa-solid fa-credit-card', label: method, color: '#888' };
  return `<span style="display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;font-weight:600;color:${m.color}">
    <i class="${m.icon}"></i>${m.label}</span>`;
};

const statusPill = (s) => {
  const labels = {
    pendente: 'Pendente', pago: 'Pago', confirmado: 'Confirmado',
    ganhou: 'Ganhou <i class="fa-solid fa-check"></i>', perdido: 'Perdeu <i class="fa-solid fa-x"></i>',
    ativo: 'Ativo', bloqueado: 'Bloqueado',
  };
  return `<span class="status-pill status-pill--${s}">${labels[s] || s}</span>`;
};

// ── League preview (escopo global para switchAdminTab acessar) ─
const _LEAGUE_NAMES = {
  2000: 'Copa do Mundo',   2013: 'Brasileirão',      2001: 'Champions League',
  2021: 'Premier League',  2014: 'La Liga',           2019: 'Serie A',
  2002: 'Bundesliga',      2015: 'Ligue 1',           2003: 'Eredivisie',
  2017: 'Primeira Liga',   2152: 'Libertadores',
};
let _leagueCounts = {};

const _renderLeagueBadges = () => {
  const el = document.getElementById('leaguePreviewBadges');
  if (!el) return;
  el.innerHTML = Object.entries(_LEAGUE_NAMES).map(([id, name]) => {
    const n = _leagueCounts[id];
    const hasCount = n !== undefined && n !== null;
    const cls = hasCount ? (n > 0 ? 'league-badge--ok' : 'league-badge--zero') : '';
    return `<span class="league-badge ${cls}" data-league-badge="${id}">
      ${name}
      ${hasCount ? `<strong>${n}</strong>` : ''}
      <button class="league-badge__fetch" data-fetch-league="${id}" title="Buscar da API">
        <i class="fa-solid fa-rotate"></i>
      </button>
    </span>`;
  }).join('');
};

const renderLeaguePreview = async () => {
  const el   = document.getElementById('leaguePreviewBadges');
  const meta = document.getElementById('leaguePreviewMeta');
  if (!el) return;
  try {
    const { counts, cached_at } = await api('/api/admin/jogos/preview-all?cache_only=1');
    _leagueCounts = counts || {};
    _renderLeagueBadges();
    if (meta && cached_at) {
      const age = Math.round((Date.now() / 1000 - cached_at) / 60);
      meta.textContent = age < 2 ? 'Cache recente' : `Cache de ${age} min atrás`;
    } else if (meta) {
      meta.textContent = 'Clique em ↺ para buscar da API';
    }
  } catch { _leagueCounts = {}; _renderLeagueBadges(); }
};

// ── Admin tab navigation ──────────────────────────────────────
const switchAdminTab = (tab) => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  clearInterval(_onlineInterval);        _onlineInterval        = null;
  clearInterval(_onlineCountdownInterval); _onlineCountdownInterval = null;
  clearInterval(_liveAgoInterval);       _liveAgoInterval       = null;
  document.querySelectorAll('.admin-tab').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.admin-nav__btn').forEach(btn => {
    btn.classList.toggle('admin-nav__btn--active', btn.dataset.adminTab === tab);
  });
  document.getElementById(`atab-${tab}`)?.classList.remove('hidden');

  history.replaceState(null, '', `/#admin/${tab}`);

  if (tab === 'dashboard') loadAdminDashboard();
  if (tab === 'usuarios')  loadAdminUsers();
  if (tab === 'apostas')   loadAdminBets();
  if (tab === 'saques')    loadAdminSaques();
  if (tab === 'config')    loadAdminConfig();
  if (tab === 'jogos')     { populateAdminSelect(); renderLeaguePreview(); }
  if (tab === 'suporte')   { _allTickets = []; _activeTicketId = null; stopTicketPoll(); loadAdminTickets(); }
  if (tab === 'online')    {
    loadAdminAnalytics('today', 1);
    loadAdminOnline();
    _onlineInterval = setInterval(() => { loadAdminAnalytics(_analyticsPeriod, _analyticsPage); loadAdminOnline(); }, 30000);
    _startOnlineCountdown();
  }
  if (tab === 'migrations') loadMigrations();
};

// ── Dashboard bulk delete de jogos ────────────────────────────
const _selectedDashGames = new Set();

const _syncDashGamesBulkBar = () => {
  const bar     = document.getElementById('bulkDashGamesBar');
  const countEl = document.getElementById('bulkDashGamesCount');
  if (!bar) return;
  bar.classList.toggle('hidden', _selectedDashGames.size === 0);
  if (countEl) countEl.textContent = _selectedDashGames.size;
};

const bulkDeleteDashGames = async () => {
  if (!_selectedDashGames.size) return;
  const ids = [..._selectedDashGames];
  const ok  = await confirm({
    title:        `Excluir ${ids.length} jogo(s)?`,
    message:      'Todos os jogos selecionados serão excluídos. Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    confirmColor: '#FF4757',
  });
  if (!ok) return;

  const btn = document.getElementById('btnBulkDeleteDashGames');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Excluindo...'; }
  try {
    const res = await api('/api/admin/jogos/excluir/lote', 'POST', { ids });
    toast(res.message, 'success');
    _selectedDashGames.clear();
    await loadGames();
    loadAdminDashboard();
  } catch (err) {
    toast(err.message || 'Erro ao excluir.', 'danger');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Excluir selecionados'; }
  }
};

// ── Dashboard ─────────────────────────────────────────────────
let _dashBetsPage  = 1;
let _dashGamesPage = 1;

const loadAdminDashboard = async ({ betsPage = _dashBetsPage, gamesPage = _dashGamesPage } = {}) => {
  _dashBetsPage  = betsPage;
  _dashGamesPage = gamesPage;

  const statsEl       = document.getElementById('dashStats');
  const recentEl      = document.getElementById('dashRecentes');
  const byGameEl      = document.getElementById('dashPorJogo');
  const newUsersEl    = document.getElementById('dashNewUsers');
  const topSpendEl    = document.getElementById('dashTopSpenders');
  const topWinEl      = document.getElementById('dashTopWinners');
  if (!statsEl) return;

  if (betsPage === 1 && gamesPage === 1) {
    statsEl.innerHTML = '<p class="text--muted">Carregando...</p>';
  }

  try {
    const url = `/api/admin/dashboard?bets_page=${betsPage}&games_page=${gamesPage}`;
    const { stats, recentes, total_bets, por_jogo, total_jogos, limit,
            novos_usuarios, top_gastadores, top_ganhadores } = await api(url);

    // Cards de stats (só atualiza na primeira carga)
    if (betsPage === 1 && gamesPage === 1) {
      statsEl.innerHTML = [
        { label: 'Usuários',              value: stats.total_usuarios,                  cls: '' },
        { label: 'Total apostas',         value: stats.total_apostas,                   cls: '' },
        { label: 'Apostado (dinheiro)',   value: fmtR$(stats.volume_apostado_dinheiro), cls: 'info' },
        { label: 'Apostado (bônus)',      value: fmtR$(stats.volume_apostado_bonus),    cls: 'info' },
        { label: 'Apostas c/ bônus',      value: stats.apostas_bonus,                   cls: 'gold' },
        { label: 'Prêmios pagos',         value: fmtR$(stats.volume_pago),              cls: 'danger' },
        { label: 'Margem da casa',        value: fmtR$(stats.margem_casa),              cls: 'green' },
        { label: 'Apostas ganhas',        value: stats.apostas_ganhas,                  cls: 'green' },
        { label: 'Pendentes pag.',        value: stats.apostas_pendentes,               cls: 'gold' },
        { label: 'Jogos abertos',         value: stats.jogos_abertos,                   cls: '' },
      ].map(c => `
        <div class="dash-card ${c.cls ? `dash-card--${c.cls}` : ''}">
          <div class="dash-card__label">${c.label}</div>
          <div class="dash-card__value ${c.cls ? `dash-card__value--${c.cls}` : ''}">${c.value}</div>
        </div>`).join('');
    }

    // Apostas recentes paginadas
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
         </table>
         ${_pager(betsPage, total_bets, limit, 'dash-bets')}`
      : '<p class="text--muted">Nenhuma aposta ainda.</p>';

    // Por jogo paginado
    if (por_jogo.length) {
      byGameEl.innerHTML =
        `<div class="bulk-action-bar hidden" id="bulkDashGamesBar">
           <span id="bulkDashGamesCount">0</span> jogo(s) selecionado(s)
           <button class="btn btn--danger btn--sm" id="btnBulkDeleteDashGames"><i class="fa-solid fa-trash"></i> Excluir selecionados</button>
           <button class="btn btn--ghost btn--sm" id="btnBulkClearDashGames">Limpar</button>
         </div>
         <table class="admin-table">
           <thead><tr>
             <th style="width:2rem"><input type="checkbox" id="chkAllDashGames" title="Selecionar todos"></th>
             <th>Jogo</th><th>Apostas</th><th>Arrecadado</th><th>Pago</th><th>Pendentes</th>
           </tr></thead>
           <tbody>${por_jogo.map(g => {
              return `<tr>
               <td><input type="checkbox" class="dash-game-chk" data-id="${g.id}" ${_selectedDashGames.has(g.id) ? 'checked' : ''}></td>
               <td>${g.time_casa} × ${g.time_fora}</td>
               <td>${g.total_apostas}</td>
               <td>${fmtR$(g.arrecadado)}</td>
               <td>${fmtR$(g.pago)}</td>
               <td>${g.pendentes > 0 ? `<span class="status-pill status-pill--pendente">${g.pendentes}</span>` : '0'}</td>
             </tr>`;
           }).join('')}
           </tbody>
         </table>
         ${_pager(gamesPage, total_jogos, limit, 'dash-games')}`;

      // Reanexa listeners após re-render
      document.getElementById('chkAllDashGames')?.addEventListener('change', e => {
        document.querySelectorAll('#dashPorJogo .dash-game-chk').forEach(chk => {
          chk.checked = e.target.checked;
          e.target.checked ? _selectedDashGames.add(Number(chk.dataset.id)) : _selectedDashGames.delete(Number(chk.dataset.id));
        });
        _syncDashGamesBulkBar();
      });
      document.getElementById('btnBulkDeleteDashGames')?.addEventListener('click', bulkDeleteDashGames);
      document.getElementById('btnBulkClearDashGames')?.addEventListener('click', () => {
        _selectedDashGames.clear();
        _syncDashGamesBulkBar();
        document.querySelectorAll('#dashPorJogo .dash-game-chk').forEach(c => c.checked = false);
        const all = document.getElementById('chkAllDashGames');
        if (all) all.checked = false;
      });
    } else {
      byGameEl.innerHTML = '<p class="text--muted">Nenhum jogo com palpites ainda.</p>';
    }

    // Novos usuários
    if (newUsersEl) {
      newUsersEl.innerHTML = novos_usuarios?.length
        ? `<table class="admin-table">
             <thead><tr><th>Nome</th><th>Email</th><th>Cadastro</th></tr></thead>
             <tbody>${novos_usuarios.map(u => `
               <tr>
                 <td>${u.nome}</td>
                 <td class="text--muted" style="font-size:.8rem">${u.email}</td>
                 <td class="text--muted" style="font-size:.8rem">${new Date(u.criado_em).toLocaleDateString('pt-BR')}</td>
               </tr>`).join('')}
             </tbody>
           </table>`
        : '<p class="text--muted">Nenhum usuário ainda.</p>';
    }

    // Top gastadores
    if (topSpendEl) {
      topSpendEl.innerHTML = top_gastadores?.length
        ? `<table class="admin-table">
             <thead><tr><th>Nome</th><th>Apostas</th><th>Total</th></tr></thead>
             <tbody>${top_gastadores.map((u, i) => `
               <tr>
                 <td><span class="text--muted" style="font-size:.75rem">#${i+1}</span> ${u.nome}</td>
                 <td>${u.total_apostas}</td>
                 <td style="font-weight:600">${fmtR$(u.total_apostado)}</td>
               </tr>`).join('')}
             </tbody>
           </table>`
        : '<p class="text--muted">Sem dados.</p>';
    }

    // Top ganhadores
    if (topWinEl) {
      topWinEl.innerHTML = top_ganhadores?.length
        ? `<table class="admin-table">
             <thead><tr><th>Nome</th><th>Acertos</th><th>Ganho</th></tr></thead>
             <tbody>${top_ganhadores.map((u, i) => `
               <tr>
                 <td><span class="text--muted" style="font-size:.75rem">#${i+1}</span> ${u.nome}</td>
                 <td>${u.apostas_ganhas}</td>
                 <td style="font-weight:600;color:var(--win-text)">${fmtR$(u.total_ganho)}</td>
               </tr>`).join('')}
             </tbody>
           </table>`
        : '<p class="text--muted">Sem dados.</p>';
    }

  } catch (err) {
    statsEl.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  }
};

// ── Usuários ──────────────────────────────────────────────────
let _adminUsersPage = 1;
const ADMIN_PAGE_LIMIT = 20;

const _pager = (page, total, limit, action) => {
  if (total <= limit) return '';
  const pages = Math.ceil(total / limit);
  const from  = (page - 1) * limit + 1;
  const to    = Math.min(page * limit, total);
  return `<div class="admin-pagination">
    <button class="btn btn--ghost btn--sm" data-action="${action}-prev" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
    <span class="text--muted">${from}–${to} de ${total}</span>
    <button class="btn btn--ghost btn--sm" data-action="${action}-next" ${page >= pages ? 'disabled' : ''}>Próxima →</button>
  </div>`;
};

const loadAdminUsers = async (page = _adminUsersPage) => {
  _adminUsersPage = page;
  const el = document.getElementById('adminUsersList');
  el.innerHTML = '<p class="text--muted">Carregando...</p>';
  try {
    const { usuarios, total, limit } = await api(`/api/admin/usuarios?page=${page}&limit=${ADMIN_PAGE_LIMIT}`);
    const countEl = document.getElementById('usersRealCount');
    if (countEl) countEl.textContent = total;
    if (!usuarios.length) { el.innerHTML = '<p class="text--muted">Nenhum usuário.</p>'; return; }

    el.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="chkAllUsers" title="Selecionar todos"></th>
            <th>#</th><th>Nome</th><th>Email</th><th>Saldo</th><th>Apostas</th><th>Ganhas</th><th>Status</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${usuarios.map(u => `
            <tr data-status="${u.bloqueado == 1 ? 'bloqueado' : 'ativo'}">
              <td><input type="checkbox" class="user-row-chk" data-id="${u.id}" ${_selectedUsers.has(u.id) ? 'checked' : ''}></td>
              <td>${u.id}</td>
              <td>${u.nome} ${u.is_admin == 1 ? '<span class="badge-admin">Admin</span>' : ''}</td>
              <td>${u.email}</td>
              <td>${fmtR$(u.saldo)}</td>
              <td>${u.total_apostas}</td>
              <td>${u.apostas_ganhas}</td>
              <td>${statusPill(u.bloqueado == 1 ? 'bloqueado' : 'ativo')}</td>
              <td style="display:flex;gap:.35rem;flex-wrap:wrap">
                ${u.bloqueado == 1
                  ? `<button class="btn btn--primary btn--sm" data-action="unblock" data-uid="${u.id}">Desbloquear</button>`
                  : `<button class="btn btn--danger  btn--sm" data-action="block"   data-uid="${u.id}">Bloquear</button>`
                }
                ${u.is_admin == 1
                  ? `<button class="btn btn--ghost btn--sm" data-action="remove-admin" data-uid="${u.id}">Remover Admin</button>`
                  : `<button class="btn btn--warning btn--sm" data-action="make-admin"  data-uid="${u.id}">Tornar Admin</button>`
                }
                <button class="btn btn--ghost btn--sm" data-action="change-password" data-uid="${u.id}" data-nome="${u.nome}" title="Trocar senha"><i class="fa-solid fa-key"></i></button>
                <button class="btn btn--ghost btn--sm" data-action="adjust-bonus" data-uid="${u.id}" data-nome="${u.nome}" title="Ajustar bônus"><i class="fa-solid fa-coins"></i></button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${_pager(page, total, limit, 'users')}`;

    document.getElementById('chkAllUsers')?.addEventListener('change', e => _selectAllUsers(e.target.checked));
  } catch (err) {
    el.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  }
};

let _adminSeedUsersPage = 1;
const loadAdminSeedUsers = async (page = _adminSeedUsersPage) => {
  _adminSeedUsersPage = page;
  const el = document.getElementById('adminSeedUsersList');
  if (!el) return;
  el.innerHTML = '<p class="text--muted">Carregando...</p>';
  try {
    const { usuarios, total, limit } = await api(`/api/admin/usuarios/seed?page=${page}&limit=${ADMIN_PAGE_LIMIT}`);
    const countEl = document.getElementById('usersSeedCount');
    if (countEl) countEl.textContent = total;
    if (!usuarios.length) { el.innerHTML = '<p class="text--muted">Nenhum usuário fake.</p>'; return; }
    el.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr><th>#</th><th>Nome</th><th>Email</th><th>Saldo</th><th>Apostas</th><th>Ganhas</th><th>Cadastro</th></tr>
        </thead>
        <tbody>
          ${usuarios.map(u => `
            <tr>
              <td>${u.id}</td>
              <td>${u.nome}</td>
              <td class="text--muted" style="font-size:.8rem">${u.email}</td>
              <td>${fmtR$(u.saldo)}</td>
              <td>${u.total_apostas}</td>
              <td>${u.apostas_ganhas}</td>
              <td class="text--muted" style="font-size:.8rem">${new Date(u.criado_em).toLocaleDateString('pt-BR')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${_pager(page, total, limit, 'seed-users')}`;
  } catch (err) {
    el.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  }
};

const _switchUsersSubTab = (tab) => {
  document.querySelectorAll('.users-subtab').forEach(btn => {
    btn.classList.toggle('users-subtab--active', btn.dataset.usersTab === tab);
  });
  ['reais', 'fake'].forEach(t => {
    document.getElementById(`usersPanel-${t}`)?.classList.toggle('hidden', t !== tab);
  });
  if (tab === 'reais') loadAdminUsers(1);
  if (tab === 'fake')  loadAdminSeedUsers(1);
};

document.addEventListener('click', async e => {
  const subTabBtn = e.target.closest('.users-subtab');
  if (subTabBtn) { _switchUsersSubTab(subTabBtn.dataset.usersTab); return; }

  if (e.target.closest('#btnDeleteAllSeedUsers')) {
    const ok = await confirm({
      title:        'Excluir todos os usuários fake?',
      message:      'Todos os usuários seed/mock serão removidos. Esta ação não pode ser desfeita.',
      confirmText:  'Excluir tudo',
      cancelText:   'Cancelar',
      confirmColor: '#FF4757',
    });
    if (!ok) return;
    const btn = document.getElementById('btnDeleteAllSeedUsers');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
      const res = await api('/api/admin/usuarios/seed/excluir/todos', 'POST', {});
      toast(`${res.deleted} usuário(s) fake excluído(s)`, 'success');
      await loadAdminSeedUsers(1);
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Excluir todos os fake';
    }
    return;
  }

  if (e.target.closest('[data-action="seed-users-prev"]')) { loadAdminSeedUsers(_adminSeedUsersPage - 1); return; }
  if (e.target.closest('[data-action="seed-users-next"]')) { loadAdminSeedUsers(_adminSeedUsersPage + 1); return; }
});

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
    confirmColor: block ? '#e63946' : '#59ff15',
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

const handleToggleAdmin = async (uid, makeAdmin) => {
  const ok = await confirm({
    icon:        makeAdmin ? 'warning' : 'question',
    title:       makeAdmin ? 'Tornar este usuário admin?' : 'Remover permissão de admin?',
    html:        makeAdmin
      ? 'O usuário terá <b>acesso total ao painel administrativo</b>.'
      : 'O usuário perderá o acesso ao painel administrativo.',
    confirmText:  makeAdmin ? 'Tornar Admin' : 'Remover Admin',
    cancelText:  'Cancelar',
    confirmColor: makeAdmin ? '#f59e0b' : '#6b7280',
  });
  if (!ok) return;
  try {
    const r = await api(`/api/admin/usuarios/${uid}/toggle-admin`, 'POST', { is_admin: makeAdmin });
    toast(r.message, 'success');
    loadAdminUsers();
  } catch (err) {
    toast(err.message, 'danger');
  }
};

const handleChangeUserPassword = async (uid, nome) => {
  const { value: senha, isConfirmed } = await Swal.fire({
    title: `Trocar senha — ${nome}`,
    input: 'password',
    inputLabel: 'Nova senha (mín. 6 caracteres)',
    inputPlaceholder: '••••••••',
    inputAttributes: { autocomplete: 'new-password', minlength: 6 },
    showCancelButton: true,
    confirmButtonText: 'Salvar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#59ff15',
    reverseButtons: true,
    inputValidator: (v) => (!v || v.length < 6) ? 'Mínimo 6 caracteres.' : null,
  });
  if (!isConfirmed || !senha) return;
  try {
    const r = await api(`/api/admin/usuarios/${uid}/senha`, 'POST', { senha });
    toast(r.message, 'success');
  } catch (err) {
    toast(err.message || 'Erro ao trocar senha.', 'danger');
  }
};

const handleUserBonus = async (uid, nome) => {
  const { value: formValues, isConfirmed } = await Swal.fire({
    title: `Ajustar bônus — ${nome}`,
    html: `
      <div style="display:flex;flex-direction:column;gap:.75rem;text-align:left;margin-top:.5rem">
        <label style="font-size:.85rem;color:#aaa">Tipo de ajuste</label>
        <div style="display:flex;gap:.5rem">
          <button type="button" id="bonusTipoAdd" class="btn btn--primary btn--sm" style="flex:1">+ Adicionar</button>
          <button type="button" id="bonusTipoRem" class="btn btn--ghost btn--sm" style="flex:1">− Remover</button>
        </div>
        <label style="font-size:.85rem;color:#aaa">Valor (R$)</label>
        <input id="bonusValor" type="number" min="0.01" step="0.01" placeholder="0,00"
          style="width:100%;padding:.5rem .75rem;background:#1e1e2e;border:1px solid #333;border-radius:8px;color:#fff;font-size:1rem">
        <label style="font-size:.85rem;color:#aaa">Observação (opcional)</label>
        <input id="bonusObs" type="text" placeholder="Ex: bônus de boas-vindas"
          style="width:100%;padding:.5rem .75rem;background:#1e1e2e;border:1px solid #333;border-radius:8px;color:#fff;font-size:.9rem">
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'Confirmar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#59ff15',
    reverseButtons: true,
    didOpen: () => {
      let tipo = 'add';
      const btnAdd = document.getElementById('bonusTipoAdd');
      const btnRem = document.getElementById('bonusTipoRem');
      btnAdd.addEventListener('click', () => {
        tipo = 'add';
        btnAdd.classList.replace('btn--ghost', 'btn--primary');
        btnRem.classList.replace('btn--primary', 'btn--ghost');
        btnAdd._tipo = tipo;
      });
      btnRem.addEventListener('click', () => {
        tipo = 'rem';
        btnRem.classList.replace('btn--ghost', 'btn--primary');
        btnAdd.classList.replace('btn--primary', 'btn--ghost');
        btnAdd._tipo = tipo;
      });
      btnAdd._tipo = 'add';
    },
    preConfirm: () => {
      const valor = parseFloat(document.getElementById('bonusValor').value);
      const obs   = document.getElementById('bonusObs').value.trim();
      const tipo  = document.getElementById('bonusTipoAdd')._tipo ?? 'add';
      if (!valor || valor <= 0) { Swal.showValidationMessage('Informe um valor válido.'); return false; }
      return { valor: tipo === 'rem' ? -valor : valor, obs };
    },
  });
  if (!isConfirmed || !formValues) return;
  try {
    const r = await api(`/api/admin/usuarios/${uid}/bonus`, 'POST', formValues);
    toast(r.message, 'success');
    loadAdminUsers(_adminUsersPage);
  } catch (err) {
    toast(err.message || 'Erro ao ajustar bônus.', 'danger');
  }
};

// ── Admin Usuários bulk ───────────────────────────────────────
const _selectedUsers = new Set();

const _syncUsersBulkBar = () => {
  const bar     = document.getElementById('bulkUsersActionBar');
  const countEl = document.getElementById('bulkUsersSelCount');
  if (!bar) return;
  bar.classList.toggle('hidden', _selectedUsers.size === 0);
  if (countEl) countEl.textContent = _selectedUsers.size;
};

const _toggleUserSel = (id, checked) => {
  checked ? _selectedUsers.add(id) : _selectedUsers.delete(id);
  _syncUsersBulkBar();
};

const _selectAllUsers = (checked) => {
  document.querySelectorAll('#adminUsersList .user-row-chk').forEach(c => {
    c.checked = checked;
    _toggleUserSel(Number(c.dataset.id), checked);
  });
};

const bulkDeleteUsers = async () => {
  if (!_selectedUsers.size) return;
  const ids = [..._selectedUsers];
  const ok  = await confirm({
    title:        `Excluir ${ids.length} usuário(s)?`,
    message:      'A conta admin será preservada. Esta ação não pode ser desfeita.',
    confirmText:  'Excluir',
    cancelText:   'Cancelar',
    confirmColor: '#FF4757',
  });
  if (!ok) return;

  const btn = document.getElementById('btnBulkDeleteUsers');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Excluindo...';
  try {
    const res = await api('/api/admin/usuarios/excluir/lote', 'POST', { ids });
    toast(res.message, 'success');
    _selectedUsers.clear();
    _syncUsersBulkBar();
    await loadAdminUsers(_adminUsersPage);
  } catch (err) {
    toast(err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-trash"></i> Excluir selecionados';
  }
};

// ── Admin Apostas ─────────────────────────────────────────────
const _selectedBets = new Set();
const BET_DELETABLE = new Set(['pendente', 'confirmado']);

const _syncBetsBulkBar = () => {
  const bar     = document.getElementById('bulkBetsActionBar');
  const countEl = document.getElementById('bulkBetsSelCount');
  if (!bar) return;
  bar.classList.toggle('hidden', _selectedBets.size === 0);
  if (countEl) countEl.textContent = _selectedBets.size;
};

const _toggleBetSel = (id, checked) => {
  checked ? _selectedBets.add(id) : _selectedBets.delete(id);
  _syncBetsBulkBar();
};

const _selectAllBets = (checked) => {
  document.querySelectorAll('#adminBetsList .bet-row-chk').forEach(chk => {
    chk.checked = checked;
    _toggleBetSel(Number(chk.dataset.id), checked);
  });
};

const bulkDeleteBets = async () => {
  if (!_selectedBets.size) return;
  const ids = [..._selectedBets];
  const ok  = await confirm({
    title:        `Excluir ${ids.length} aposta(s)?`,
    message:      'Apostas com status pago, ganhou ou perdido serão ignoradas. Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    confirmColor: '#FF4757',
  });
  if (!ok) return;

  const btn = document.getElementById('btnBulkDeleteBets');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Excluindo...';
  try {
    const res = await api('/api/admin/apostas/excluir/lote', 'POST', { ids });
    toast(res.message, 'success');
    _selectedBets.clear();
    _syncBetsBulkBar();
    await fetchAdminBets(_adminBetsPage);
  } catch (err) {
    toast(err.message || 'Erro ao excluir.', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-trash"></i> Excluir selecionadas';
  }
};

let _adminBetsPage = 1;

const loadAdminBets = async () => {
  const sel = document.getElementById('filterBetGame');
  if (sel && S.games.length) {
    sel.innerHTML = '<option value="">Todos os jogos</option>' +
      S.games.map(g => `<option value="${g.id}">${g.time_casa} × ${g.time_fora}</option>`).join('');
  }
  _adminBetsPage = 1;
  await fetchAdminBets();
};

const fetchAdminBets = async (page = _adminBetsPage) => {
  _adminBetsPage   = page;
  const el     = document.getElementById('adminBetsList');
  const jogoId = document.getElementById('filterBetGame')?.value || '';
  const status = document.getElementById('filterBetStatus')?.value || '';
  el.innerHTML = '<p class="text--muted">Carregando...</p>';

  const params = new URLSearchParams();
  if (jogoId) params.set('jogo_id', jogoId);
  if (status) params.set('status', status);
  params.set('page',  page);
  params.set('limit', ADMIN_PAGE_LIMIT);

  try {
    const { apostas, total, limit } = await api(`/api/admin/apostas?${params}`);
    const countEl = document.getElementById('adminBetsCount');
    if (countEl) countEl.textContent = `${total} aposta${total !== 1 ? 's' : ''}`;
    if (!apostas.length) { el.innerHTML = '<p class="text--muted">Nenhuma aposta encontrada.</p>'; return; }

    el.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width:2rem"><input type="checkbox" id="chkAllBets" title="Selecionar todos"></th>
            <th>#</th><th>Usuário</th><th>Jogo</th><th>Palpite</th><th>Valor</th><th>Mult.</th><th>Prêmio</th><th>Pagamento</th><th>Status</th><th style="width:2.5rem"></th>
          </tr>
        </thead>
        <tbody>
          ${apostas.map(b => {
            const canDel = BET_DELETABLE.has(b.status);
            return `<tr>
              <td>${canDel
                ? `<input type="checkbox" class="bet-row-chk" data-id="${b.id}" ${_selectedBets.has(b.id) ? 'checked' : ''}>`
                : `<span title="Não pode ser excluída" style="opacity:.25;font-size:.8rem">—</span>`}
              </td>
              <td>#${b.id}</td>
              <td>${b.usuario}</td>
              <td>${b.time_casa} × ${b.time_fora}</td>
              <td>${b.placar_casa} × ${b.placar_fora}</td>
              <td>${fmtR$(b.valor)}</td>
              <td>${parseFloat(b.multiplicador).toFixed(0)}×</td>
              <td>${fmtR$(b.possivel_ganho)}</td>
              <td>${_payMethodBadge(b.metodo_pagamento)}</td>
              <td>${statusPill(b.status)}</td>
              <td><button class="btn btn--sm btn--danger" data-action="bet-delete" data-id="${b.id}" title="Excluir aposta" style="padding:.25rem .45rem;font-size:.75rem;box-shadow:none"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${_pager(page, total, limit, 'bets')}`;

    document.getElementById('chkAllBets')?.addEventListener('change', e => _selectAllBets(e.target.checked));
  } catch (err) {
    el.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  }
};

// ── Saques ────────────────────────────────────────────────────
let _saquesAll = [];

const loadAdminSaques = async () => {
  const el = document.getElementById('adminSaquesList');
  el.innerHTML = '<p class="text--muted">Carregando...</p>';
  try {
    const { saques } = await api('/api/admin/saques');
    _saquesAll = saques || [];
    _updateAdminSaquesBadge();
    renderAdminSaques();
  } catch (err) {
    el.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  }
};

const _updateAdminSaquesBadge = () => {
  const pendentes = _saquesAll.filter(s => s.status === 'pendente').length;
  const badge = document.getElementById('adminSaquesBadge');
  if (!badge) return;
  badge.textContent = pendentes;
  badge.classList.toggle('hidden', pendentes === 0);
};

const renderAdminSaques = () => {
  const el     = document.getElementById('adminSaquesList');
  const filter = document.getElementById('filterSaqueStatus')?.value || '';
  const list   = filter ? _saquesAll.filter(s => s.status === filter) : _saquesAll;

  if (!list.length) {
    el.innerHTML = '<p class="text--muted">Nenhum pedido de saque encontrado.</p>';
    return;
  }

  const statusLabel = { pendente: 'Pendente', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };
  const statusCls   = { pendente: 'pill--warning', aprovado: 'pill--success', rejeitado: 'pill--danger' };

  el.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Usuário</th>
          <th>Valor</th>
          <th>Chave PIX</th>
          <th>Tipo</th>
          <th>Status</th>
          <th>Solicitado em</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(s => `
          <tr>
            <td>#${s.id}</td>
            <td>
              <strong>${s.user_nome}</strong><br>
              <small class="text--muted">${s.user_email}</small>
            </td>
            <td><strong>${fmtR$(s.valor)}</strong></td>
            <td><code>${s.chave_pix}</code></td>
            <td>${s.tipo_pix}</td>
            <td><span class="pill ${statusCls[s.status] || ''}">${statusLabel[s.status] || s.status}</span></td>
            <td><small>${fmtDate(s.criado_em)}</small></td>
            <td>
              ${s.status === 'pendente' ? `
                <div style="display:flex;gap:.4rem">
                  <button class="btn btn--sm btn--primary" data-saque-aprovar="${s.id}">
                    <i class="fa-solid fa-check"></i> Aprovar
                  </button>
                  <button class="btn btn--sm btn--danger" data-saque-rejeitar="${s.id}">
                    <i class="fa-solid fa-xmark"></i> Rejeitar
                  </button>
                </div>
              ` : s.obs ? `<small class="text--muted">${s.obs}</small>` : '—'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
};

const _adminSaqueAprovar = async (id) => {
  const ok = await confirm({
    title: 'Aprovar saque?',
    message: 'O pagamento será marcado como aprovado. Certifique-se de que o valor já foi transferido.',
    confirmLabel: 'Aprovar',
    confirmColor: 'var(--primary)',
  });
  if (!ok) return;
  try {
    await api(`/api/admin/saques/${id}/aprovar`, 'POST');
    toast('Saque aprovado.', 'success');
    loadAdminSaques();
  } catch (err) { toast(err.message, 'danger'); }
};

const _adminSaqueRejeitar = async (id) => {
  const obs = prompt('Motivo da rejeição (opcional):') ?? '';
  try {
    await api(`/api/admin/saques/${id}/rejeitar`, 'POST', { obs });
    toast('Saque rejeitado e saldo estornado.', 'success');
    loadAdminSaques();
  } catch (err) { toast(err.message, 'danger'); }
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
    set('cfg_bonus_cadastro',            'bonus_cadastro');
    set('cfg_odd_padrao',                'odd_padrao');
    set('cfg_stake_min',                 'stake_min');
    set('cfg_stake_max',                 'stake_max');
    set('cfg_max_ganho',                 'max_ganho');
    set('cfg_saques_ativos',             'saques_ativos');
    set('cfg_mp_access_token',           'mp_access_token');
    set('cfg_mp_webhook_secret',         'mp_webhook_secret');
    set('cfg_gateway_ativo',             'gateway_ativo');
    set('cfg_expay_merchant_key',        'expay_merchant_key');
    set('cfg_google_client_id',          'google_client_id');

    // Payment method toggles (checkboxes)
    const elPixAtivo   = document.getElementById('cfg_pix_ativo');
    const elExpayAtivo = document.getElementById('cfg_expay_ativo');
    if (elPixAtivo)   elPixAtivo.checked   = (config['pix_ativo']?.valor   ?? '1') === '1';
    if (elExpayAtivo) elExpayAtivo.checked = (config['expay_ativo']?.valor  ?? '1') === '1';

    // Payment logo previews in admin
    const pixLogoUrl   = config['pix_logo']?.valor   || '/assets/logos/pix.png';
    const expayLogoUrl = config['expay_logo']?.valor  || '/assets/logos/expay.png';
    const prevPix   = document.getElementById('previewPixLogo');
    const prevExpay = document.getElementById('previewExpayLogo');
    if (prevPix)   prevPix.src   = pixLogoUrl;
    if (prevExpay) prevExpay.src = expayLogoUrl;

    // Inicia botões Google se client id já estiver salvo
    const googleClientId = config['google_client_id']?.valor ?? '';
    if (googleClientId) initGoogleButtons(googleClientId);
    const whEl    = document.getElementById('webhookUrl');
    const whExpay = document.getElementById('webhookUrlExpay');
    const whGoogle = document.getElementById('googleOriginUrl');
    if (whEl)     whEl.textContent     = `${location.origin}/api/webhooks/mercadopago`;
    if (whExpay)  whExpay.textContent  = `${location.origin}/api/webhooks/expay`;
    if (whGoogle) whGoogle.textContent = location.origin;

    // Mostra os campos do gateway selecionado
    toggleGatewayFields();
  } catch (err) {
    statusEl && (statusEl.innerHTML = `<div class="alert alert--danger">${err.message}</div>`);
  }
};

const toggleGatewayFields = () => {
  const gw = document.getElementById('cfg_gateway_ativo')?.value ?? '';
  document.querySelectorAll('.gateway-fields').forEach(el => (el.style.display = 'none'));
  if (gw === 'mercadopago') {
    const el = document.getElementById('fields_mercadopago');
    if (el) el.style.display = '';
  } else if (gw === 'expay') {
    const el = document.getElementById('fields_expay');
    if (el) el.style.display = '';
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
      bonus_cadastro:            get('cfg_bonus_cadastro'),
      odd_padrao:                get('cfg_odd_padrao'),
      stake_min:                 get('cfg_stake_min'),
      stake_max:                 get('cfg_stake_max'),
      max_ganho:                 get('cfg_max_ganho'),
      saques_ativos:             get('cfg_saques_ativos'),
      gateway_ativo:             get('cfg_gateway_ativo'),
      mp_access_token:           get('cfg_mp_access_token'),
      mp_webhook_secret:         get('cfg_mp_webhook_secret'),
      expay_merchant_key:        get('cfg_expay_merchant_key'),
      google_client_id:          get('cfg_google_client_id'),
      pix_ativo:   document.getElementById('cfg_pix_ativo')?.checked   ? '1' : '0',
      expay_ativo: document.getElementById('cfg_expay_ativo')?.checked ? '1' : '0',
    });
    toast(res.message ?? 'Configurações salvas!', 'success');
    applyBrandName(get('cfg_site_nome'));
    // O logo já foi aplicado no momento do upload — não precisa refazer aqui
  } catch (err) {
    toast(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Configurações';
  }
};

// ── Live polling ──────────────────────────────────────────────
const POLL_INTERVAL = 30_000; // 30s

// Poll leve: busca só jogos ao vivo e faz merge no S.games
const loadGamesSilent = async () => {
  try {
    const r = await api('/api/jogos/live');
    if (r.jogos) {
      const byId = Object.fromEntries(r.jogos.map(g => [g.id, {
        ...g,
        time_casa: teamNamePt(g.time_casa),
        time_fora: teamNamePt(g.time_fora),
        liga_nome: LEAGUE_SHORT[g.liga_nome] || g.liga_nome,
      }]));
      S.games = S.games.map(g => byId[g.id] ?? g);
    }
    renderGames();
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

const uploadPaymentLogo = async (method, file) => {
  const previewId = method === 'pix' ? 'previewPixLogo' : 'previewExpayLogo';
  const modalImgId = method === 'pix' ? 'payOptPixImg' : 'payOptExpayImg';
  try {
    const formData = new FormData();
    formData.append('logo', file);
    formData.append('method', method);
    formData.append('csrf_token', S.csrf || '');
    const res  = await fetch('/api/admin/upload-payment-logo', { method: 'POST', body: formData, credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao enviar logo');
    const prev = document.getElementById(previewId);
    if (prev) prev.src = data.url;
    const modalImg = document.getElementById(modalImgId);
    if (modalImg) modalImg.src = data.url;
    toast('Logo atualizado!', 'success');
  } catch (err) {
    toast(err.message, 'danger');
  }
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

const applyBrandName = (name) => {
  if (!name) return;
  document.querySelectorAll('.brand-logo-text').forEach(el => {
    el.innerHTML = `<i class="fa-solid fa-futbol"></i> ${name}`;
  });
  document.title = name;
};

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

// ── Hero urgency bar — próximo jogo ───────────────────────────
let _heroUrgencyTimer = null;
const renderHeroUrgency = () => {
  const el      = document.getElementById('heroUrgency');
  const cdEl    = document.getElementById('heroUrgencyCd');
  const teamsEl = document.getElementById('heroUrgencyTeams');
  const btn     = document.getElementById('heroUrgencyBtn');
  if (!el) return;

  const now  = Date.now();
  const next = S.games
    .filter(g => g.status === 'aberto' && !isGameLive(g) && new Date(g.data_hora) > now)
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))[0];

  if (!next) { el.classList.add('hidden'); return; }

  el.classList.remove('hidden');
  if (teamsEl) teamsEl.textContent = `${next.time_casa} × ${next.time_fora}`;
  if (btn) btn.onclick = () => openBetModal(next.id);

  if (_heroUrgencyTimer) clearInterval(_heroUrgencyTimer);

  const tick = () => {
    const diff = new Date(next.data_hora) - Date.now();
    if (diff <= 0) { renderHeroUrgency(); return; }

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const str = h > 0
      ? `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`
      : `${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
    if (cdEl) cdEl.textContent = str;

    // Menos de 1h: modo vermelho urgente
    el.classList.toggle('hero-urgency--hot', diff < 3_600_000);
  };

  tick();
  _heroUrgencyTimer = setInterval(tick, 1000);
  S.timers.push(_heroUrgencyTimer);
};

// ── Hero bonus badge ──────────────────────────────────────────
const renderHeroBonusBadge = () => {
  const badge = document.getElementById('heroBonusBadge');
  if (!badge) return;
  if (S.user || !S.bonusCadastro) { badge.classList.add('hidden'); return; }
  const amt = document.getElementById('heroBonusAmt');
  if (amt) amt.textContent = fmtMoney(S.bonusCadastro);
  badge.classList.remove('hidden');
};

// ── Guest bet preview modal ───────────────────────────────────
const openGuestBetModal = (gameId) => {
  const g = S.games.find(g => g.id === Number(gameId));
  if (!g) return;

  const emblemH = g.logo_casa
    ? `<img src="${g.logo_casa}" class="res-emblem" alt="${g.time_casa}">`
    : `<span class="guest-bet-flag">${flagEmoji(g.bandeira_casa || '')}</span>`;
  const emblemA = g.logo_fora
    ? `<img src="${g.logo_fora}" class="res-emblem" alt="${g.time_fora}">`
    : `<span class="guest-bet-flag">${flagEmoji(g.bandeira_fora || '')}</span>`;

  const matchup = document.getElementById('guestBetMatchup');
  if (matchup) matchup.innerHTML = `
    <div class="guest-bet-teams">
      <div class="guest-bet-team">${emblemH}<span>${g.time_casa}</span></div>
      <div class="guest-bet-vs">VS</div>
      <div class="guest-bet-team">${emblemA}<span>${g.time_fora}</span></div>
    </div>
    <time class="guest-bet-date">${fmtGameDate(g.data_hora)}</time>`;

  const updateMax = () => {
    const val = parseFloat(document.getElementById('guestBetValue')?.value) || 0;
    const el  = document.getElementById('guestBetMax');
    if (el) el.textContent = fmtMoney(val * S.oddPadrao);
  };
  const input = document.getElementById('guestBetValue');
  if (input) { input.value = 50; input.oninput = updateMax; }
  updateMax();

  const registerLabel = document.getElementById('guestBetRegisterLabel');
  if (registerLabel) {
    registerLabel.innerHTML = S.bonusCadastro > 0
      ? `Criar conta e ganhar <strong>${fmtMoney(S.bonusCadastro)}</strong> de bônus`
      : 'Criar conta gratuita e apostar';
  }

  document.getElementById('modalGuestBet')?.classList.remove('hidden');
};

// ── Activity feed / ticker ────────────────────────────────────
const loadFeed = async () => {
  try {
    const { feed } = await api('/api/feed');
    if (!feed || !feed.length) return;
    const ticker = document.getElementById('activityTicker');
    const track  = document.getElementById('tickerTrack');
    if (!ticker || !track) return;
    const items = feed.map(w => {
      const score = w.placar_real ? ` (${w.placar_real.replace('x', '×')})` : '';
      return `<span class="ticker-item">
        <i class="fa-solid fa-trophy" style="color:var(--gold)"></i>
        <strong>${w.nome}</strong> acertou ${w.time_casa} × ${w.time_fora}${score}
        e ganhou <strong class="ticker-prize">${fmtMoney(w.valor_ganho)}</strong>
      </span>`;
    }).join('');
    track.innerHTML = items + items; // duplicar para loop contínuo
    ticker.classList.remove('hidden');
    // Alimenta o winner toast com dados reais
    if (typeof window._initWinnerToastPool === 'function') {
      window._initWinnerToastPool(feed);
    }
  } catch (_) {}
};

// ── Dynamic meta-tag updater ──────────────────────────────
const updateMetaTags = (title, description) => {
  if (title) {
    document.title = title;
    const els = ['ogTitle', 'twitterTitle'];
    els.forEach(id => { const el = document.getElementById(id); if (el) el.setAttribute('content', title); });
    document.getElementById('pageTitle')?.setAttribute('content', title);
  }
  if (description) {
    const els = [
      { id: 'metaDescription', attr: 'content' },
      { id: 'ogDescription',   attr: 'content' },
      { id: 'twitterDescription', attr: 'content' },
    ];
    els.forEach(({ id, attr }) => {
      const el = document.getElementById(id);
      if (el) el.setAttribute(attr, description);
    });
  }
};

const loadBetConfig = async () => {
  try {
    const cfg = await api('/api/config/bets');
    S.stakeMin  = cfg.stake_min  || 5;
    S.stakeMax  = cfg.stake_max  || 500;
    S.oddPadrao   = cfg.odd_padrao || 5;
    if (cfg.admin_email) S.adminEmail = cfg.admin_email;
    S.bonusCadastro = cfg.bonus_cadastro || 0;
    S.siteName    = cfg.site_nome || 'BetCopa';
    S.pixAtivo    = cfg.pix_ativo   !== 0;
    S.expayAtivo  = cfg.expay_ativo !== 0;
    // Apply custom payment logos to the modal
    if (cfg.pix_logo)   { const el = document.getElementById('payOptPixImg');   if (el) el.src = cfg.pix_logo; }
    if (cfg.expay_logo) { const el = document.getElementById('payOptExpayImg'); if (el) el.src = cfg.expay_logo; }
    S.siteLogo = cfg.site_logo || '';
    applyBrandLogo(S.siteLogo);
    if (S.siteName) applyBrandName(S.siteName);
    renderHeroBonusBadge();
    // Atualiza title e meta description com valores do banco
    updateMetaTags(cfg.site_title || null, cfg.site_description || null);
  } catch (_) { /* usa defaults do HTML estático */ }
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

  // Deep link: /share/game/ID redireciona para /?jogo=ID e abre o modal automaticamente
  const _dlParam = new URLSearchParams(location.search).get('jogo');
  console.log('[deep-link] param:', _dlParam, '| search:', location.search, '| games:', S.games.length);
  if (_dlParam) {
    const _dlGameId = Number(_dlParam);
    history.replaceState(null, '', location.pathname);
    if (_dlGameId) {
      const _dlGame = S.games.find(g => Number(g.id) === _dlGameId);
      console.log('[deep-link] game found:', _dlGame);
      if (_dlGame) {
        setTimeout(() => { console.log('[deep-link] abrindo modal', _dlGame.id); openBetModal(_dlGame.id); }, 600);
      } else {
        console.warn('[deep-link] jogo', _dlGameId, 'não encontrado. IDs disponíveis:', S.games.map(g => g.id));
      }
    }
  }

  // Restaura palpite pendente salvo no localStorage
  restorePendingBet();
  if (S.user && S.pendingBet) {
    const pb = S.pendingBet;
    clearPendingBet();
    setTimeout(async () => {
      try {
        S.selectedGame = S.games.find(g => g.id === pb.gameId) ?? S.selectedGame;
        const result = await api('/api/apostas', 'POST', {
          jogo_id:     pb.gameId,
          placar_casa: pb.scoreHome,
          placar_fora: pb.scoreAway,
          valor:       pb.stake,
        });
        S.selectedBet = result.aposta;
        fillTicket(result.aposta);
        openModal('modalTicket');
        await loadBets();
      } catch (err) {
        toast(err.message || 'Não foi possível recuperar seu palpite.', 'danger');
      }
    }, 600);
  }
  pingOnline();
  setInterval(pingOnline, 30000);
  _exitIntentInit();

  // Inicializa botões Google com o client_id público da API
  try {
    const cfg = await api('/api/admin/config-public');
    const googleClientId = cfg?.google_client_id ?? '';
    if (googleClientId) {
      if (window.google?.accounts?.id) {
        initGoogleButtons(googleClientId);
      } else {
        // GSI ainda não carregou — aguarda
        window.addEventListener('load', () => initGoogleButtons(googleClientId));
      }
    }
  } catch { /* silencioso — login com Google simplesmente não aparece */ }

  // Captura código de indicação da URL (?ref=CODE)
  const refCode = new URLSearchParams(location.search).get('ref');
  if (refCode) sessionStorage.setItem('refCode', refCode.toUpperCase());

  // Detecção de link de reset de senha (?reset=TOKEN na query string)
  const resetToken = new URLSearchParams(location.search).get('reset');
  if (resetToken) {
    document.getElementById('resetToken').value = resetToken;
    navigate('auth');
    switchAuthTab('reset');
    return; // não restaura hash neste caso
  }

  // Restaura rota do hash após tudo carregado
  const hash = location.hash.replace('#', '') || location.pathname.replace(/^\//, '');
  if (hash.startsWith('admin/') || hash === 'admin') {
    if (!_isAdmin()) {
      navigate(S.user ? 'jogos' : 'auth');
    } else {
      const tab = hash.replace('admin/', '') || 'dashboard';
      const validTabs = ['dashboard', 'jogos', 'apostas', 'usuarios', 'saques', 'config', 'suporte', 'online'];
      navigate('admin');
      switchAdminTab(validTabs.includes(tab) ? tab : 'dashboard');
    }
  } else if (hash) {
    const validViews = ['jogos', 'palpites', 'ganhadores', 'resultados', 'grupos', 'admin', 'auth', 'termos', 'privacidade', 'jogo-responsavel', 'suporte', 'perfil'];
    if (validViews.includes(hash)) {
      navigate(hash);
      if (hash === 'ganhadores')  renderRanking();
      if (hash === 'resultados')  renderResultados();
      if (hash === 'grupos')      loadGrupos();
    }
  }
};

/* ═══════════════════════════════════════════════════════════════
   PERFIL DO USUÁRIO
   ═══════════════════════════════════════════════════════════════ */
let _perfilPage = 1;
let _perfilTotalTrans = 0;

const loadPerfil = async () => {
  if (!S.user) { navigate('auth'); return; }
  try {
    const data = await api('/api/user/perfil');

    // Header
    const initials = data.user.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const avatarEl = document.getElementById('perfilAvatar');
    if (avatarEl) avatarEl.textContent = initials;
    const nomeEl = document.getElementById('perfilNome');
    if (nomeEl) nomeEl.textContent = data.user.nome;
    const emailEl = document.getElementById('perfilEmail');
    if (emailEl) emailEl.textContent = data.user.email;
    const saldoEl = document.getElementById('perfilSaldo');
    if (saldoEl) saldoEl.textContent = fmtMoney(parseFloat(data.user.saldo || 0));

    // Stats
    const st = data.stats || {};
    const q = id => document.getElementById(id);
    if (q('statTotalApostas'))   q('statTotalApostas').textContent   = st.total_apostas   || 0;
    if (q('statTotalApostado'))  q('statTotalApostado').textContent  = fmtMoney(parseFloat(st.total_apostado  || 0));
    if (q('statTotalGanho'))     q('statTotalGanho').textContent     = fmtMoney(parseFloat(st.total_ganho     || 0));
    if (q('statApostasGanhas'))  q('statApostasGanhas').textContent  = st.apostas_ganhas  || 0;
    if (q('statApostasPerdidas')) q('statApostasPerdidas').textContent = st.apostas_perdidas || 0;

    // Form
    const inputNome     = document.getElementById('perfilInputNome');
    const inputEmail    = document.getElementById('perfilInputEmail');
    const inputTelefone = document.getElementById('perfilInputTelefone');
    const selTipo       = document.getElementById('perfilTipoPix');
    const inputChave    = document.getElementById('perfilChavePix');
    if (inputNome)     inputNome.value     = data.user.nome      || '';
    if (inputEmail)    inputEmail.value    = data.user.email     || '';
    if (inputTelefone) inputTelefone.value = data.user.telefone  || '';
    if (selTipo)       selTipo.value       = data.user.tipo_pix  || '';
    if (inputChave)    inputChave.value    = data.user.chave_pix || '';

    // Transactions
    _perfilTotalTrans = data.total_trans || 0;
    _perfilPage = data.page || 1;
    _renderPerfilTransacoes(data.transacoes || []);
    _renderPerfilPagination();

    // Saques
    _renderPerfilSaques(data.saques || []);

  } catch (err) {
    console.error('loadPerfil error', err);
  }
};

const _renderPerfilTransacoes = (list) => {
  const el = document.getElementById('perfilTransacoes');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<div class="perfil-empty"><i class="fa-solid fa-inbox"></i> Nenhuma transação encontrada.</div>';
    return;
  }
  el.innerHTML = list.map(t => {
    const isCredito = t.tipo === 'credito';
    const icon = isCredito ? 'fa-arrow-down' : 'fa-arrow-up';
    const cls  = isCredito ? 'credito' : 'debito';
    const sign = isCredito ? '+' : '-';
    const date = new Date(t.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="perfil-trans-item">
        <div class="perfil-trans-item__icon perfil-trans-item__icon--${cls}">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div class="perfil-trans-item__body">
          <div class="perfil-trans-item__desc">${escHtml(t.descricao || '—')}</div>
          <div class="perfil-trans-item__date">${date}</div>
        </div>
        <span class="perfil-trans-item__val perfil-trans-item__val--${cls}">${sign}${fmtMoney(parseFloat(t.valor))}</span>
      </div>`;
  }).join('');
};

const _renderPerfilPagination = () => {
  const el = document.getElementById('perfilPagination');
  if (!el) return;
  const totalPages = Math.ceil(_perfilTotalTrans / 20);
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  let html = '';
  const start = Math.max(1, _perfilPage - 2);
  const end   = Math.min(totalPages, _perfilPage + 2);
  if (start > 1) html += `<button data-page="1">1</button>`;
  if (start > 2) html += `<span style="padding:.3rem .4rem;color:var(--text-muted)">…</span>`;
  for (let p = start; p <= end; p++) {
    html += `<button class="${p === _perfilPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
  }
  if (end < totalPages - 1) html += `<span style="padding:.3rem .4rem;color:var(--text-muted)">…</span>`;
  if (end < totalPages) html += `<button data-page="${totalPages}">${totalPages}</button>`;
  el.innerHTML = html;
  el.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => _loadPerfilPage(parseInt(btn.dataset.page)));
  });
};

const _loadPerfilPage = async (page) => {
  if (!S.user) return;
  try {
    const data = await api(`/api/user/perfil?page=${page}`);
    _perfilPage = data.page || page;
    _perfilTotalTrans = data.total_trans || _perfilTotalTrans;
    _renderPerfilTransacoes(data.transacoes || []);
    _renderPerfilPagination();
    document.getElementById('view-perfil')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) { console.error('_loadPerfilPage error', err); }
};

const _renderPerfilSaques = (list) => {
  const el = document.getElementById('perfilSaques');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<div class="perfil-empty"><i class="fa-solid fa-inbox"></i> Nenhum saque solicitado.</div>';
    return;
  }
  const statusLabel = { pendente: 'Pendente', aprovado: 'Aprovado', rejeitado: 'Rejeitado', processando: 'Processando' };
  el.innerHTML = list.map(s => {
    const lbl  = statusLabel[s.status] || s.status;
    const date = new Date(s.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    return `
      <div class="perfil-saque-item">
        <div class="perfil-saque-item__info">
          <div class="perfil-saque-item__val">${fmtMoney(parseFloat(s.valor))}</div>
          <div class="perfil-saque-item__date">${date} · ${escHtml(s.tipo_pix || '')} ${escHtml(s.chave_pix || '')}</div>
        </div>
        <span class="perfil-saque-item__badge perfil-saque-item__badge--${s.status}">${lbl}</span>
      </div>`;
  }).join('');
};

const submitPerfil = async (e) => {
  e.preventDefault();
  const msgEl = document.getElementById('perfilMsg');
  const btn   = document.getElementById('btnPerfilSave');
  const showMsg = (text, ok) => {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = `perfil-msg ${ok ? 'perfil-msg--ok' : 'perfil-msg--err'}`;
    msgEl.classList.remove('hidden');
    setTimeout(() => msgEl.classList.add('hidden'), 4000);
  };
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; }
  try {
    const body = {
      nome:      document.getElementById('perfilInputNome')?.value.trim()  || '',
      telefone:  document.getElementById('perfilInputTelefone')?.value.trim() || '',
      tipo_pix:  document.getElementById('perfilTipoPix')?.value           || '',
      chave_pix: document.getElementById('perfilChavePix')?.value.trim()  || '',
    };
    const res = await api('/api/user/perfil', 'PUT', body);
    showMsg(res.message || 'Perfil atualizado!', true);
    // Refresh user in state
    const updated = await api('/api/user');
    if (updated.user) { S.user = { ...S.user, ...updated.user }; renderHeader(); }
  } catch (err) {
    showMsg(err.message || 'Erro ao salvar perfil.', false);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar alterações'; }
  }
};

/* ═══════════════════════════════════════════════════════════════
   EXIT INTENT — gatilho de saída psicológico
   ═══════════════════════════════════════════════════════════════ */
function _exitIntentInit() {
  if (_isAdmin()) return;

  let fired = false;
  let armed = false;

  // Arma no primeiro movimento real do mouse (sem delay artificial)
  document.addEventListener('mousemove', () => { armed = true; }, { once: true });
  document.addEventListener('scroll',    () => { armed = true; }, { once: true });
  document.addEventListener('click',     () => { armed = true; }, { once: true });

  function _hasActiveBet() {
    return S.bets.some(b => b.status === 'pendente' || b.status === 'confirmado');
  }

  // Views onde o exit intent nunca deve aparecer
  const BLOCKED_VIEWS = ['auth', 'pagamento', 'admin', 'perfil'];
  function _isBlockedView() {
    return BLOCKED_VIEWS.some(v => !document.getElementById(`view-${v}`)?.classList.contains('hidden'));
  }

  function _fire() {
    if (fired || !armed) return;
    if (_hasActiveBet()) return;
    if (_isBlockedView()) return;
    // Não dispara se qualquer modal estiver aberto
    if (document.querySelectorAll('.modal:not(.hidden), .modal-overlay:not(.hidden)').length > 0) return;
    fired = true;

    // Timer de 10 min por visita (em memória, reinicia a cada acesso)
    const exp = Date.now() + 10 * 60 * 1000;

    // Contagem social com número aleatório por sessão
    const CNT_KEY = '_eiCnt';
    let cnt = sessionStorage.getItem(CNT_KEY);
    if (!cnt) {
      cnt = String(180 + Math.floor(Math.random() * 140));
      sessionStorage.setItem(CNT_KEY, cnt);
    }
    document.getElementById('exitModalCount').textContent = cnt;

    // Mostra modal com animação de entrada
    const modal = document.getElementById('modalExitIntent');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('exit-modal--in')));

    // Contador regressivo
    const timerEl = document.getElementById('exitModalTimer');
    (function tick() {
      const rem = Math.max(0, exp - Date.now());
      const m = Math.floor(rem / 60000);
      const s = Math.floor((rem % 60000) / 1000);
      timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      if (rem <= 60000) timerEl.classList.add('exit-modal__timer--urgent');
      if (rem > 0) setTimeout(tick, 500);
    })();

    // Incrementa sutilmente o contador social a cada ~20s (efeito "live")
    setInterval(() => {
      const el = document.getElementById('exitModalCount');
      if (el) el.textContent = String(parseInt(el.textContent) + 1);
    }, 22000);
  }

  function _close() {
    const modal = document.getElementById('modalExitIntent');
    modal.classList.remove('exit-modal--in');
    setTimeout(() => modal.classList.add('hidden'), 350);
  }

  // ── Desktop: cursor sai pelo topo (rumbo à barra do navegador) ──
  document.addEventListener('mouseleave', e => {
    if (e.clientY < 5) _fire();
  });

  // ── Mobile: scroll rápido para cima quando já está no topo ──
  let _prevY = window.scrollY;
  let _prevT = Date.now();
  window.addEventListener('scroll', () => {
    const now = Date.now();
    const dy  = window.scrollY - _prevY;
    const dt  = now - _prevT;
    // Scroll up veloz (>60px em <400ms) estando perto do topo
    if (dy < -60 && dt < 400 && window.scrollY < 120) _fire();
    _prevY = window.scrollY;
    _prevT = now;
  }, { passive: true });

  // popstate removido — o sentinel causava disparos falsos no SPA

  // ── Listeners dos botões do modal ──
  document.getElementById('exitModalX').addEventListener('click', _close);
  document.getElementById('exitModalOverlay').addEventListener('click', _close);
  document.getElementById('exitModalDismiss').addEventListener('click', _close);
  document.getElementById('exitModalCta').addEventListener('click', () => {
    _close();
    if (!S.user) {
      navigate('auth');
      setTimeout(() => switchAuthTab('register'), 150);
    } else {
      navigate('jogos');
    }
  });
}

// ── Winner Toast — notificações flutuantes de ganhadores ──────
(function initWinnerToast() {
  const wrap = document.getElementById('winnerToastWrap');
  if (!wrap) return;

  // Dados de fallback enquanto a API não responde
  const fallback = [
    { nome: 'Lucas S.', time_casa: 'Brasil',    time_fora: 'Argentina', valor_ganho: 'R$&nbsp;320,00' },
    { nome: 'Ana C.',   time_casa: 'França',     time_fora: 'Espanha',   valor_ganho: 'R$&nbsp;150,00' },
    { nome: 'Pedro R.', time_casa: 'Alemanha',   time_fora: 'Portugal',  valor_ganho: 'R$&nbsp;500,00' },
    { nome: 'Maria L.', time_casa: 'Inglaterra', time_fora: 'Itália',    valor_ganho: 'R$&nbsp;240,00' },
    { nome: 'Carlos M.',time_casa: 'México',     time_fora: 'EUA',       valor_ganho: 'R$&nbsp;180,00' },
  ];

  let pool = [];
  let idx  = 0;
  let toastTimer = null;

  const agos = ['há 1 min', 'há 2 min', 'há 4 min', 'há 6 min', 'há 8 min', 'há 10 min'];

  const showToast = (entry) => {
    const toast = document.createElement('div');
    toast.className = 'winner-toast';
    toast.innerHTML = `
      <div class="winner-toast__icon">🏆</div>
      <div class="winner-toast__body">
        <div class="winner-toast__name">${entry.nome} acertou ${entry.time_casa} × ${entry.time_fora}</div>
        <div class="winner-toast__detail">Ganhou ${entry.valor_ganho}</div>
        <div class="winner-toast__ago">${agos[Math.floor(Math.random() * agos.length)]}</div>
      </div>`;
    wrap.appendChild(toast);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('winner-toast--in'));
    });
    setTimeout(() => {
      toast.classList.remove('winner-toast--in');
      setTimeout(() => toast.remove(), 450);
    }, 4200);
  };

  const next = () => {
    if (!pool.length) return;
    const entry = pool[idx % pool.length];
    idx++;
    showToast(entry);
    const delay = 9000 + Math.random() * 8000;
    toastTimer = setTimeout(next, delay);
  };

  // Aguarda a API carregar; usa fallback se não houver dados
  window._initWinnerToastPool = (feed) => {
    pool = feed && feed.length ? feed : fallback;
    idx = 0;
    clearTimeout(toastTimer);
    // Primeira exibição após 6-10s (não incomodar na chegada)
    toastTimer = setTimeout(next, 6000 + Math.random() * 4000);
  };

  // Inicia com fallback imediatamente (a API pode sobrescrever depois)
  setTimeout(() => {
    if (!pool.length) window._initWinnerToastPool(null);
  }, 3000);
})();

// ── Bottom nav: botões que precisam de lógica especial ────────
document.addEventListener('click', (e) => {
  // Conta: perfil se logado, auth se não
  if (e.target.closest('#bottomNavConta')) {
    e.stopPropagation();
    navigate(S.user ? 'perfil' : 'auth');
    return;
  }
  // Palpites: exige login e carrega lista
  if (e.target.closest('#bottomNavPalpites')) {
    e.stopPropagation();
    if (!S.user) { navigate('auth'); return; }
    navigate('palpites');
    loadBets(1);
  }
}, true);

document.addEventListener('DOMContentLoaded', init);
