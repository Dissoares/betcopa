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

// ── Flag map ─────────────────────────────────────────────────
const FLAGS = {
  'brasil': '🇧🇷', 'brazil': '🇧🇷',
  'argentina': '🇦🇷',
  'frança': '🇫🇷', 'france': '🇫🇷',
  'alemanha': '🇩🇪', 'germany': '🇩🇪',
  'espanha': '🇪🇸', 'spain': '🇪🇸',
  'portugal': '🇵🇹',
  'itália': '🇮🇹', 'italia': '🇮🇹', 'italy': '🇮🇹',
  'méxico': '🇲🇽', 'mexico': '🇲🇽',
  'noruega': '🇳🇴', 'norway': '🇳🇴',
  'japão': '🇯🇵', 'japan': '🇯🇵',
  'coreia': '🇰🇷', 'korea': '🇰🇷',
  'usa': '🇺🇸', 'estados unidos': '🇺🇸',
  'inglaterra': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'england': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'holanda': '🇳🇱', 'netherlands': '🇳🇱', 'países baixos': '🇳🇱',
  'bélgica': '🇧🇪', 'belgica': '🇧🇪', 'belgium': '🇧🇪',
  'croácia': '🇭🇷', 'croatia': '🇭🇷',
  'marrocos': '🇲🇦', 'morocco': '🇲🇦',
  'senegal': '🇸🇳',
  'gana': '🇬🇭', 'ghana': '🇬🇭',
  'uruguai': '🇺🇾', 'uruguay': '🇺🇾',
  'chile': '🇨🇱',
  'colômbia': '🇨🇴', 'colombia': '🇨🇴',
  'equador': '🇪🇨', 'ecuador': '🇪🇨',
  'austrália': '🇦🇺', 'australia': '🇦🇺',
  'suíça': '🇨🇭', 'switzerland': '🇨🇭',
  'polônia': '🇵🇱', 'poland': '🇵🇱',
  'dinamarca': '🇩🇰', 'denmark': '🇩🇰',
  'suécia': '🇸🇪', 'sweden': '🇸🇪',
  'sérvia': '🇷🇸', 'serbia': '🇷🇸',
  'turquia': '🇹🇷', 'turkey': '🇹🇷',
  'tunísia': '🇹🇳', 'tunisia': '🇹🇳',
  'camarões': '🇨🇲', 'cameroon': '🇨🇲',
};

// Retorna HTML do emblema — logo (img) se disponível, senão emoji/flag
const getEmblem = (game, side) => {
  const logo = side === 'home' ? game.logo_casa : game.logo_fora;
  if (logo) {
    const name = side === 'home' ? game.time_casa : game.time_fora;
    return `<img class="team-logo" src="${logo}" alt="${name}" loading="lazy" onerror="this.style.display='none'" />`;
  }
  const stored = side === 'home' ? game.bandeira_casa : game.bandeira_fora;
  if (stored && stored !== '⚽' && stored !== '') return `<span class="team-flag-emoji">${stored}</span>`;
  const name = (side === 'home' ? game.time_casa : game.time_fora).toLowerCase().trim();
  return `<span class="team-flag-emoji">${FLAGS[name] || '🏳️'}</span>`;
};

// ── API helper ────────────────────────────────────────────────
const api = async (url, method = 'GET', body = null) => {
  const headers = { Accept: 'application/json' };
  if (S.csrf) headers['X-CSRF-Token'] = S.csrf;
  if (body)   headers['Content-Type']  = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || 'Erro na requisição');
  }
  return res.json();
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
const populateAdminSelect = () => {
  const sel = document.getElementById('adminGameSelect');
  if (!sel) return;
  const openGames = S.games.filter(g => g.status !== 'finalizado');
  sel.innerHTML = '<option value="">— selecione um jogo —</option>' +
    openGames.map(g => `<option value="${g.id}">${g.time_casa} × ${g.time_fora} (${fmtDate(g.data_hora)})</option>`).join('');
};

const submitAdminGame = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Cadastrando...';
  try {
    await api('/api/admin/jogos', 'POST', {
      time_casa:     document.getElementById('adminHome').value.trim(),
      time_fora:     document.getElementById('adminAway').value.trim(),
      bandeira_casa: document.getElementById('adminFlagHome').value.trim() || '⚽',
      bandeira_fora: document.getElementById('adminFlagAway').value.trim() || '⚽',
      data_hora:     document.getElementById('adminDate').value,
      valor_base:    parseFloat(document.getElementById('adminValorBase').value),
    });
    showAlert('Jogo cadastrado!', 'success');
    e.target.reset();
    await loadGames();
    populateAdminSelect();
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally {
    btn.disabled = false; btn.textContent = 'Cadastrar Jogo';
  }
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
    e.target.reset();
    await loadGames();
    await loadBets();
    await renderRanking();
    populateAdminSelect();
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
  } catch {}
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

  // Auth forms
  document.getElementById('loginForm').addEventListener('submit', submitLogin);
  document.getElementById('registerForm').addEventListener('submit', submitRegister);

  // Auth tab switcher
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAuthTab(tab.dataset.authTab));
  });

  // Admin forms
  document.getElementById('adminGameForm').addEventListener('submit', submitAdminGame);
  document.getElementById('adminResultForm').addEventListener('submit', submitAdminResult);

  // Import / Sync
  document.getElementById('btnImport')?.addEventListener('click', importFromApi);
  document.getElementById('btnSync')?.addEventListener('click', syncResults);
};

// ── Init ──────────────────────────────────────────────────────
const init = async () => {
  bind();
  await loadCsrf();
  await loadUser();
  await loadGames();
  if (S.user) await loadBets();
};

document.addEventListener('DOMContentLoaded', init);
