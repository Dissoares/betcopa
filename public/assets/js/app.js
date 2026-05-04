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
  scoreHome:    0,
  scoreAway:    0,
  multiplier:   5,
  timers:       [],        // countdown interval refs
  adminEmail:   'admin@betcopa.local',
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

// ── Format helpers ────────────────────────────────────────────
const fmtMoney = (n) => `R$ ${parseFloat(n).toFixed(2).replace('.', ',')}`;
const fmtDate  = (v) => new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const maskName = (name) => {
  if (!name) return 'Usuário';
  return name.split(' ').map((part, i) =>
    i === 0 ? part[0] + '*'.repeat(Math.max(2, part.length - 1)) : part[0] + '***'
  ).join(' ');
};

// ── Navigation ────────────────────────────────────────────────
const navigate = (view) => {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav__btn').forEach(btn => {
    btn.classList.toggle('nav__btn--active', btn.dataset.nav === view);
  });
};

// ── Header user chip ──────────────────────────────────────────
const renderHeader = () => {
  const wrap = document.getElementById('headerUser');
  if (S.user) {
    const initials = S.user.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const saldo    = parseFloat(S.user.saldo || 0);
    wrap.innerHTML = `
      <div class="user-chip">
        <div class="user-chip__avatar">${initials}</div>
        <span class="user-chip__name">${S.user.nome.split(' ')[0]}</span>
        <span class="user-chip__sep">·</span>
        <span class="user-chip__balance">${fmtMoney(saldo)}</span>
      </div>
      <button class="btn btn--ghost btn--sm" id="btnLogout">Sair</button>
    `;
    document.getElementById('btnLogout').addEventListener('click', logout);

    // show auth-only nav items
    document.querySelectorAll('.nav__btn--auth').forEach(b => b.style.display = '');
    document.getElementById('btnNavLogin') && document.getElementById('btnNavLogin').remove();

    // show admin nav if email matches
    if (S.user.email === S.adminEmail) {
      document.querySelectorAll('.nav__btn--admin').forEach(b => b.style.display = '');
    }
  } else {
    wrap.innerHTML = `<button class="btn btn--ghost btn--sm" id="btnNavLogin" data-nav="auth">Entrar</button>`;
    document.getElementById('btnNavLogin').addEventListener('click', () => navigate('auth'));
    document.querySelectorAll('.nav__btn--auth').forEach(b => b.style.display = 'none');
    document.querySelectorAll('.nav__btn--admin').forEach(b => b.style.display = 'none');
  }
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
  document.querySelectorAll('.theme-icon').forEach(el => el.textContent = isLight ? '☀️' : '🌙');
  localStorage.setItem('betcopaTheme', theme);
};

const toggleTheme = () => {
  setTheme(document.body.classList.contains('theme-light') ? 'dark' : 'light');
};

const loadTheme = () => {
  const stored = localStorage.getItem('betcopaTheme');
  setTheme(stored === 'light' ? 'light' : 'dark');
};

// ── Game cards ────────────────────────────────────────────────
const renderGames = () => {
  const grid   = document.getElementById('gamesGrid');
  const empty  = document.getElementById('gamesEmpty');
  if (!grid) return;

  S.timers.forEach(clearInterval);
  S.timers = [];

  if (!S.games.length) {
    grid.innerHTML = '';
    empty && empty.classList.remove('hidden');
    return;
  }
  empty && empty.classList.add('hidden');

  grid.innerHTML = S.games.map(g => {
    const emblemHome = getEmblem(g, 'home');
    const emblemAway = getEmblem(g, 'away');
    const isClosed   = g.status !== 'aberto';
    const isFinal    = g.status === 'finalizado';

    const badgeClass = isFinal ? 'badge--final' : isClosed ? 'badge--closed' : 'badge--open';
    const badgeLabel = isFinal ? '✓ Finalizado' : isClosed ? '⏹ Encerrado' : '● Aberto';

    const centerHtml = isFinal && g.placar_real
      ? `<div class="game-card__score-real">${g.placar_real.replace('x', ' × ')}</div>`
      : `<div class="game-card__countdown" id="cd-${g.id}">
           <div class="game-card__countdown-label">Começa em</div>
           <div class="game-card__countdown-time" id="cdtime-${g.id}">--:--:--</div>
         </div>`;

    const ligaHtml = g.liga_nome
      ? `<div class="game-card__league">
           ${g.liga_logo ? `<img src="${g.liga_logo}" alt="${g.liga_nome}" class="league-logo" />` : ''}
           <span>${g.liga_nome}${g.rodada ? ' · ' + g.rodada : ''}</span>
         </div>`
      : '';

    const stadiumHtml = g.estadio
      ? `<div class="game-card__stadium">📍 ${g.estadio}</div>`
      : '';

    const valorBase = parseFloat(g.valor_base || 1).toFixed(2).replace('.', ',');

    return `
      <article class="game-card ${isClosed ? 'game-card--closed' : ''} ${isFinal ? 'game-card--final' : ''}">
        <div class="game-card__top">
          <span class="badge ${badgeClass}">${badgeLabel}</span>
          <span class="game-card__date">${fmtDate(g.data_hora)}</span>
        </div>
        ${ligaHtml}
        <div class="game-card__matchup">
          <div class="game-card__team">
            <div class="game-card__emblem">${emblemHome}</div>
            <span class="game-card__name">${g.time_casa}</span>
          </div>
          <div class="game-card__center">
            <span class="game-card__vs">VS</span>
            ${centerHtml}
          </div>
          <div class="game-card__team">
            <div class="game-card__emblem">${emblemAway}</div>
            <span class="game-card__name">${g.time_fora}</span>
          </div>
        </div>
        ${stadiumHtml}
        <div class="game-card__btn">
          <button
            class="btn btn--primary btn--full"
            data-action="bet" data-id="${g.id}"
            ${isClosed ? 'disabled' : ''}>
            ${isClosed ? (isFinal ? '🏁 Finalizado' : '🔒 Encerrado') : '🎯 Fazer Palpite'}
          </button>
        </div>
        <div class="text--muted" style="font-size:.75rem;text-align:center;margin-top:.25rem">
          R$ ${valorBase}/palpite · ganhe até ${10 * 10}×
        </div>
      </article>`;
  }).join('');

  startCountdowns();
};

// ── Countdown timers ──────────────────────────────────────────
const startCountdowns = () => {
  S.games.forEach(g => {
    if (g.status !== 'aberto') return;
    const el = document.getElementById(`cdtime-${g.id}`);
    if (!el) return;

    const tick = () => {
      const diff = new Date(g.data_hora) - Date.now();
      if (diff <= 0) {
        el.textContent = 'Em breve!';
        el.classList.add('game-card__countdown-time--expired');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };
    tick();
    S.timers.push(setInterval(tick, 1000));
  });
};

// ── Bets list ─────────────────────────────────────────────────
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

  const statusLabel = {
    pendente:   ['⏳ Pendente',  ''],
    pago:       ['💳 Pago',      ''],
    confirmado: ['✓ Confirmado', ''],
    ganhou:     ['🏆 Ganhou!',   'badge--open'],
    perdido:    ['✗ Perdeu',     'badge--closed'],
  };

  list.innerHTML = S.bets.map(b => {
    const [slabel, sbadge] = statusLabel[b.status] || [b.status, ''];
    const isWin  = b.status === 'ganhou';
    const isLoss = b.status === 'perdido';

    const actionHtml = b.status === 'pendente'
      ? `<button class="btn btn--primary btn--sm" data-action="pay" data-id="${b.id}">Pagar PIX</button>`
      : b.status === 'pago'
      ? `<button class="btn btn--ghost btn--sm" data-action="confirm" data-id="${b.id}">Confirmar</button>`
      : `<span class="badge ${sbadge}">${slabel}</span>`;

    return `
      <div class="bet-card ${isWin ? 'bet-card--win' : ''} ${isLoss ? 'bet-card--loss' : ''}">
        <div class="bet-card__game">
          <div class="bet-card__game-name">${b.time_casa} × ${b.time_fora}</div>
          <div class="bet-card__palpite">Palpite: ${b.placar_casa} × ${b.placar_fora}</div>
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

  const spot    = document.getElementById('rankingWinnerSpot');
  const winsEl  = document.getElementById('rankingWinners');
  const nearEl  = document.getElementById('rankingNear');

  // Top winner highlight
  if (data.vencedores && data.vencedores.length) {
    const top = data.vencedores[0];
    spot.classList.remove('hidden');
    spot.innerHTML = `
      <div class="ranking-winner">
        <div class="ranking-winner__trophy">🏆</div>
        <div class="ranking-winner__name">${maskName(top.nome)}</div>
        <div class="ranking-winner__game">${top.jogo}</div>
        <div class="ranking-winner__amount">${fmtMoney(top.ganho)}</div>
      </div>`;

    winsEl.innerHTML = data.vencedores.map((r, i) => `
      <div class="ranking-row">
        <span class="ranking-row__pos">${i + 1}</span>
        <span class="ranking-row__name">${maskName(r.nome)}</span>
        <span class="ranking-row__val">${fmtMoney(r.ganho)}</span>
      </div>`).join('');
  } else {
    spot.classList.add('hidden');
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
const openBetModal = (gameId) => {
  const game = S.games.find(g => g.id === Number(gameId));
  if (!game) return;

  if (!S.user) {
    openModal('modalPalpite'); // will be blocked by auth check below
    closeModal('modalPalpite');
    showAuthGate(game);
    return;
  }

  S.selectedGame = game;
  S.scoreHome    = 0;
  S.scoreAway    = 0;
  S.multiplier   = 5;

  document.getElementById('betFlagHome').innerHTML    = getEmblem(game, 'home');
  document.getElementById('betNameHome').textContent  = game.time_casa;
  document.getElementById('betFlagAway').innerHTML    = getEmblem(game, 'away');
  document.getElementById('betNameAway').textContent  = game.time_fora;
  document.getElementById('scoreHome').textContent    = '0';
  document.getElementById('scoreAway').textContent    = '0';
  document.getElementById('multiplierSlider').value   = 5;

  updateBetPreview();
  openModal('modalPalpite');
};

const showAuthGate = (game) => {
  // Redirect to auth view with a message
  showAlert('Faça login ou cadastre-se para apostar.', 'info');
  navigate('auth');
};

const updateBetPreview = () => {
  const game      = S.selectedGame;
  if (!game) return;
  const mult      = S.multiplier;
  const base      = parseFloat(game.valor_base || 1);
  const valor     = base * mult;
  const premio    = valor * mult;

  document.getElementById('multiplierDisplay').textContent = `${mult}×`;
  document.getElementById('betPayAmount').textContent      = fmtMoney(valor);
  document.getElementById('betWinAmount').textContent      = fmtMoney(premio);
  document.getElementById('betPreviewScore').textContent   =
    `${game.time_casa} ${S.scoreHome} × ${S.scoreAway} ${game.time_fora}`;

  // Update slider track fill
  const slider = document.getElementById('multiplierSlider');
  const pct = ((mult - 2) / 8) * 100;
  slider.style.background = `linear-gradient(to right, var(--primary) ${pct}%, var(--surface-3) ${pct}%)`;
};

const submitBet = async () => {
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
    showAlert(err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar Palpite →';
  }
};

// ── Ticket modal ──────────────────────────────────────────────
const fillTicket = (bet) => {
  const game = S.selectedGame;
  document.getElementById('ticketId').textContent     = `#${String(bet.id).padStart(6, '0')}`;
  document.getElementById('ticketGame').textContent   = game ? `${game.time_casa} × ${game.time_fora}` : '—';
  document.getElementById('ticketPalpite').textContent = `${bet.placar_casa} × ${bet.placar_fora}`;
  document.getElementById('ticketValor').textContent  = fmtMoney(bet.valor);
  document.getElementById('ticketPremio').textContent = fmtMoney(bet.possivel_ganho);
};

const simulatePay = async () => {
  const btn = document.getElementById('btnSimulatePay');
  btn.disabled = true; btn.textContent = 'Processando PIX...';
  try {
    await api(`/api/apostas/${S.selectedBet.id}/pagar`, 'POST', {});
    btn.textContent = '✓ PIX enviado!';
    showAlert('PIX enviado! Clique em "Confirmar Pagamento" para ativar sua aposta.', 'success');
    await loadBets();
  } catch (err) {
    showAlert(err.message, 'danger');
    btn.disabled = false; btn.textContent = '💳 Pagar via PIX';
  }
};

const confirmPay = async () => {
  const btn = document.getElementById('btnConfirmPay');
  btn.disabled = true; btn.textContent = 'Confirmando...';
  try {
    await api(`/api/apostas/${S.selectedBet.id}/confirmar`, 'POST', {});
    closeModal('modalTicket');
    showAlert('Aposta confirmada! Boa sorte!', 'success');
    await loadUser();
    await loadBets();
  } catch (err) {
    showAlert(err.message, 'danger');
    btn.disabled = false; btn.textContent = '✓ Confirmar Pagamento';
  }
};

// ── Resultado modal ───────────────────────────────────────────
const showResultado = (bet, won) => {
  const content = document.getElementById('resultadoContent');
  const nextGame = S.games.find(g => g.status === 'aberto' && g.id !== (S.selectedGame?.id));

  if (won) {
    content.innerHTML = `
      <span class="resultado-win__icon">🎉</span>
      <div class="resultado-win__title">Você Acertou!</div>
      <span class="resultado-win__amount">${fmtMoney(bet.possivel_ganho)}</span>
      <p class="resultado-win__info">O valor foi adicionado ao seu saldo.</p>
      <div class="resultado-win__btns">
        <button class="btn btn--gold btn--full btn--large" id="btnSacar">💰 Sacar Saldo</button>
        <button class="btn btn--ghost btn--full" id="btnApostarNov">⚽ Apostar Novamente</button>
      </div>`;
    document.getElementById('btnSacar').addEventListener('click', () => {
      closeAllModals();
      showAlert('Função de saque em breve!', 'info');
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
         <button class="btn btn--primary btn--full btn--large" id="btnTentarNovamente">🎯 Palpitar no Próximo</button>`
      : `<button class="btn btn--primary btn--full btn--large" id="btnTentarNovamente">🎯 Ver Todos os Jogos</button>`;

    content.innerHTML = `
      <span class="resultado-loss__icon">😔</span>
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
    navigate('jogos');
    showAlert(`Bem-vindo, ${S.user.nome.split(' ')[0]}!`, 'success');
    e.target.reset();
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

  const statusBadge = s => {
    const map = { aberto: 'open', encerrado: 'closed', finalizado: 'final' };
    return `<span class="badge badge--${map[s] || 'closed'}">${s}</span>`;
  };

  const placar = g =>
    g.placar_casa !== null && g.placar_fora !== null
      ? `<strong>${g.placar_casa} × ${g.placar_fora}</strong>`
      : '<span class="text--dim">—</span>';

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
            <td><strong>${g.time_casa} × ${g.time_fora}</strong></td>
            <td class="text--muted" style="font-size:.82rem;white-space:nowrap">${fmtDate(g.data_hora)}</td>
            <td>${statusBadge(g.status)}</td>
            <td>${placar(g)}</td>
            <td>
              ${g.status !== 'finalizado'
                ? `<button class="btn btn--ghost btn--sm" data-action="abrir-resultado" data-id="${g.id}" data-label="${g.time_casa} × ${g.time_fora}">Resultado</button>`
                : ''}
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
  btn.disabled = true; btn.textContent = 'Cadastrando...';
  try {
    const homeOpt = document.getElementById('adminHome');
    const awayOpt = document.getElementById('adminAway');
    const homeCode = homeOpt.value;
    const awayCode = awayOpt.value;
    await api('/api/admin/jogos', 'POST', {
      time_casa:     homeOpt.options[homeOpt.selectedIndex]?.dataset.name || '',
      time_fora:     awayOpt.options[awayOpt.selectedIndex]?.dataset.name || '',
      bandeira_casa: homeCode || 'br',
      bandeira_fora: awayCode || 'br',
      data_hora:     document.getElementById('adminDate').value,
      status:        document.getElementById('adminCreateStatus').value,
      placar_casa:   document.getElementById('adminCreateScoreHome').value !== '' ? parseInt(document.getElementById('adminCreateScoreHome').value, 10) : null,
      placar_fora:   document.getElementById('adminCreateScoreAway').value !== '' ? parseInt(document.getElementById('adminCreateScoreAway').value, 10) : null,
      valor_base:    parseFloat(document.getElementById('adminValorBase').value),
      odd:           parseFloat(document.getElementById('adminCreateOdd').value),
    });
    showAlert('Jogo cadastrado!', 'success');
    e.target.reset();
    ['prevFlagHome','prevFlagAway','gfFlagPreviewHome','gfFlagPreviewAway'].forEach(id => {
      const el = document.getElementById(id); if (el) el.textContent = '🏳️';
    });
    document.getElementById('prevNameHome').textContent = 'Casa';
    document.getElementById('prevNameAway').textContent = 'Fora';
    await loadGames();
    populateAdminSelect();
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.textContent = 'Cadastrar Jogo';
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
    const fh = flagEmoji(homeCode);
    const fa = flagEmoji(awayCode);
    const nh = nameOf('adminHome');
    const na = nameOf('adminAway');
    if (el('prevFlagHome'))      el('prevFlagHome').textContent      = fh;
    if (el('prevFlagAway'))      el('prevFlagAway').textContent      = fa;
    if (el('prevNameHome'))      el('prevNameHome').textContent      = nh;
    if (el('prevNameAway'))      el('prevNameAway').textContent      = na;
    if (el('gfFlagPreviewHome')) el('gfFlagPreviewHome').textContent = fh;
    if (el('gfFlagPreviewAway')) el('gfFlagPreviewAway').textContent = fa;
  };
  ['adminHome', 'adminAway'].forEach(id => el(id)?.addEventListener('change', update));
};

const importFromApi = async () => {
  const btn      = document.getElementById('btnImport');
  const statusEl = document.getElementById('importStatus');
  const leagueId = Number(document.getElementById('importLeague').value);
  const season   = Number(document.getElementById('importSeason').value);
  const next     = Number(document.getElementById('importNext').value);

  btn.disabled = true; btn.textContent = '⏳ Importando...';
  statusEl.innerHTML = '';

  try {
    const res = await api('/api/admin/import', 'POST', { league_id: leagueId, season, next });
    statusEl.innerHTML = `<div class="alert alert--success">${res.message}</div>`;
    await loadGames();
    populateAdminSelect();
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '📡 Importar Jogos';
  }
};

const syncResults = async () => {
  const btn      = document.getElementById('btnSync');
  const statusEl = document.getElementById('importStatus');

  btn.disabled = true; btn.textContent = '⏳ Sincronizando...';
  statusEl.innerHTML = '';

  try {
    const res = await api('/api/admin/sync', 'POST', {});
    statusEl.innerHTML = `<div class="alert alert--success">${res.message}</div>`;
    await loadGames();
    await loadBets();
    await renderRanking();
    populateAdminSelect();
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '🔄 Sincronizar Resultados';
  }
};

const submitAdminResult = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  const id  = Number(document.getElementById('adminGameSelect').value);
  if (!id) { showAlert('Selecione um jogo.', 'danger'); return; }

  btn.disabled = true; btn.textContent = 'Registrando...';
  try {
    await api(`/api/admin/jogos/${id}/resultado`, 'POST', {
      placar_casa: Number(document.getElementById('adminScoreHome').value),
      placar_fora: Number(document.getElementById('adminScoreAway').value),
    });
    showAlert('Resultado registrado e apostas processadas!', 'success');
    closeAdminResultado();
    await loadGames();
    await loadBets();
    await renderRanking();
  } catch (err) {
    showAlert(err.message, 'danger');
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
  try {
    const r = await api('/api/jogos');
    S.games = r.jogos;
  } catch {
    S.games = [];
  }
  renderGames();
};

const loadBets = async () => {
  if (!S.user) { S.bets = []; renderBets(); return; }
  try {
    const r = await api('/api/apostas');
    S.bets = r.apostas;
  } catch {
    S.bets = [];
  }
  renderBets();
};

// ── Event binding ─────────────────────────────────────────────
const bind = () => {
  // Nav buttons
  document.getElementById('mainNav').addEventListener('click', e => {
    const btn = e.target.closest('[data-nav]');
    if (!btn) return;
    navigate(btn.dataset.nav);
    if (btn.dataset.nav === 'palpites') loadBets();
    if (btn.dataset.nav === 'ganhadores') renderRanking();
    if (btn.dataset.nav === 'admin') populateAdminSelect();
  });

  // Logo
  document.querySelector('.logo')?.addEventListener('click', e => { e.preventDefault(); navigate('jogos'); });

  // Game grid actions (bet / pay / confirm) via delegation
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'bet')     openBetModal(id);
    if (action === 'pay')     { S.selectedBet = { id: Number(id) }; openModal('modalTicket'); }
    if (action === 'confirm') { S.selectedBet = { id: Number(id) }; confirmPay(); }
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
  document.getElementById('btnConfirmPay').addEventListener('click', confirmPay);

  // Mobile drawer
  document.querySelectorAll('.btn-theme-toggle').forEach(btn => btn.addEventListener('click', toggleTheme));
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

  // Admin games list — resultado + paginação + fechar modal
  document.getElementById('adminGamesList')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="abrir-resultado"]');
    if (btn) openAdminResultado(Number(btn.dataset.id), btn.dataset.label);
  });
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
    ganhou: 'Ganhou ✓', perdido: 'Perdeu ✗',
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
      { label: 'Usuários',        value: stats.total_usuarios,   cls: '' },
      { label: 'Total apostas',   value: stats.total_apostas,    cls: '' },
      { label: 'Volume apostado', value: fmtR$(stats.volume_apostado), cls: 'info' },
      { label: 'Prêmios pagos',   value: fmtR$(stats.volume_pago),     cls: 'danger' },
      { label: 'Margem da casa',  value: fmtR$(stats.margem_casa),     cls: 'green' },
      { label: 'Apostas ganhas',  value: stats.apostas_ganhas,   cls: 'green' },
      { label: 'Pendentes pag.',  value: stats.apostas_pendentes, cls: 'gold' },
      { label: 'Jogos abertos',   value: stats.jogos_abertos,    cls: '' },
    ].map(c => `
      <div class="dash-card">
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
    if (!usuarios.length) { el.innerHTML = '<p class="text--muted">Nenhum usuário.</p>'; return; }

    el.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr><th>#</th><th>Nome</th><th>Email</th><th>Saldo</th><th>Apostas</th><th>Ganhas</th><th>Status</th><th>Ações</th></tr>
        </thead>
        <tbody>
          ${usuarios.map(u => `
            <tr>
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
  try {
    await api(`/api/admin/usuarios/${uid}/${action}`, 'POST', {});
    showAlert(block ? 'Usuário bloqueado.' : 'Usuário desbloqueado.', 'success');
    loadAdminUsers();
  } catch (err) {
    showAlert(err.message, 'danger');
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
      max_aposta:                get('cfg_max_aposta'),
      max_ganho:                 get('cfg_max_ganho'),
      saques_ativos:             get('cfg_saques_ativos'),
    });
    statusEl.innerHTML = `<div class="alert alert--success">${res.message}</div>`;
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '💾 Salvar Configurações';
  }
};

// ── Init ──────────────────────────────────────────────────────
const init = async () => {
  loadTheme();
  bind();
  await loadCsrf();
  await loadUser();
  await loadGames();
  if (S.user) await loadBets();
};

document.addEventListener('DOMContentLoaded', init);
