const state = {
  user: null,
  games: [],
  bets: [],
  selectedGame: null,
  selectedBet: null,
  csrf: null,
};

const ajax = async (url, method = 'GET', body = null) => {
  const headers = { 'Accept': 'application/json' };
  if (state.csrf) headers['X-CSRF-Token'] = state.csrf;
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Erro na requisição');
  }

  return response.json();
};

const setMessage = (selector, text, type = 'info') => {
  const el = document.querySelector(selector);
  if (!el) return;
  el.innerHTML = `<div class="alert alert--${type}">${text}</div>`;
};

const maskName = (name) => {
  if (!name) return 'Usuário';
  const first = name[0] || 'U';
  return `${first}${'*'.repeat(Math.max(2, name.length - 1))}`;
};

const formatDate = (value) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const renderGames = () => {
  const container = document.querySelector('#gamesGrid');
  if (!container) return;
  container.innerHTML = state.games.map(game => {
    const statusClass = game.status === 'finalizado' ? 'badge--final' : game.status === 'encerrado' ? 'badge--closed' : 'badge--open';
    const statusLabel = game.status === 'finalizado' ? 'Finalizado' : game.status === 'encerrado' ? 'Encerrado' : 'Aberto';
    return `
      <article class="card">
        <h3>${game.time_casa} x ${game.time_fora}</h3>
        <p class="meta">${formatDate(game.data_hora)} · Odd fixa ${game.odd.toFixed(2)}</p>
        <span class="badge ${statusClass}">${statusLabel}</span>
        <p class="notice">${game.placar_real ? `Placar real: ${game.placar_real}` : 'Aposte antes do início do jogo.'}</p>
        <button class="primary" ${game.status !== 'aberto' ? 'disabled' : ''} data-action="bet" data-id="${game.id}">Apostar</button>
      </article>
    `;
  }).join('');
};

const renderUserArea = () => {
  const status = document.querySelector('#userStatus');
  if (!status) return;
  if (state.user) {
    status.innerHTML = `<strong>${state.user.nome}</strong> · Saldo: R$ ${state.user.saldo.toFixed(2)}`;
  } else {
    status.innerHTML = 'Não conectado';
  }
};

const loadCsrf = async () => {
  try {
    const result = await ajax('/api/csrf');
    state.csrf = result.token;
  } catch (error) {
    console.warn('CSRF não carregado', error);
  }
};

const loadGames = async () => {
  const data = await ajax('/api/jogos');
  state.games = data.jogos;
  renderGames();
};

const loadUser = async () => {
  try {
    const data = await ajax('/api/user');
    state.user = data.user;
    renderUserArea();
  } catch (error) {
    state.user = null;
    renderUserArea();
  }
};

const openBetModal = (gameId) => {
  const game = state.games.find(item => item.id === Number(gameId));
  if (!game) return;
  state.selectedGame = game;
  document.querySelector('#betGameLabel').textContent = `${game.time_casa} x ${game.time_fora}`;
  document.querySelector('#betAmount').value = '10.00';
  document.querySelector('#betCasa').value = '1';
  document.querySelector('#betFora').value = '0';
  document.querySelector('#betModal').classList.remove('hidden');
};

const closeModal = () => {
  document.querySelectorAll('.modal').forEach(el => el.classList.add('hidden'));
};

const submitBet = async () => {
  const casa = Number(document.querySelector('#betCasa').value);
  const fora = Number(document.querySelector('#betFora').value);
  const valor = parseFloat(document.querySelector('#betAmount').value);
  if (!state.user) throw new Error('Faça login para apostar.');
  if (!state.selectedGame) throw new Error('Jogo não selecionado.');
  const payload = { jogo_id: state.selectedGame.id, placar_casa: casa, placar_fora: fora, valor };
  const result = await ajax('/api/apostas', 'POST', payload);
  state.selectedBet = result.aposta;
  closeModal();
  setMessage('#alerts', 'Aposta criada com sucesso. Vá pagar para confirmar.', 'success');
  renderBets();
};

const renderBets = async () => {
  if (!document.querySelector('#betsTable')) return;
  const data = await ajax('/api/apostas');
  const rows = data.apostas.map(aposta => {
    const action = aposta.status === 'pendente' ? `<button class="primary" data-action="pay" data-id="${aposta.id}">Pagar PIX</button>` : '<span class="status-chip">' + aposta.status + '</span>';
    return `<tr>
      <td>${aposta.time_casa} x ${aposta.time_fora}</td>
      <td>${aposta.placar_casa} x ${aposta.placar_fora}</td>
      <td>R$ ${parseFloat(aposta.valor).toFixed(2)}</td>
      <td>${parseFloat(aposta.odd).toFixed(2)}</td>
      <td>R$ ${parseFloat(aposta.possivel_ganho).toFixed(2)}</td>
      <td>${aposta.status}</td>
      <td>${action}</td>
    </tr>`;
  }).join('');
  document.querySelector('#betsTable tbody').innerHTML = rows;
};

const openPayment = (betId) => {
  state.selectedBet = { id: Number(betId) };
  document.querySelector('#paymentModal').classList.remove('hidden');
};

const submitPayment = async () => {
  if (!state.selectedBet) return;
  await ajax(`/api/apostas/${state.selectedBet.id}/pagar`, 'POST', {});
  closeModal();
  setMessage('#alerts', 'Pagamento simulado como pago. Confirme para liberar a aposta.', 'success');
  renderBets();
};

const confirmPayment = async () => {
  if (!state.selectedBet) return;
  await ajax(`/api/apostas/${state.selectedBet.id}/confirmar`, 'POST', {});
  closeModal();
  setMessage('#alerts', 'Pagamento confirmado e aposta registrada.', 'success');
  await loadUser();
  renderBets();
};

const submitAdminGame = async () => {
  const time_casa = document.querySelector('#adminHome').value.trim();
  const time_fora = document.querySelector('#adminAway').value.trim();
  const data_hora = document.querySelector('#adminDate').value;
  const odd = Number(document.querySelector('#adminOdd').value);
  await ajax('/api/admin/jogos', 'POST', { time_casa, time_fora, data_hora, odd });
  setMessage('#alerts', 'Jogo criado com sucesso.', 'success');
  await loadGames();
};

const submitAdminResult = async () => {
  const jogoId = Number(document.querySelector('#adminGameId').value);
  const placar_casa = Number(document.querySelector('#adminScoreHome').value);
  const placar_fora = Number(document.querySelector('#adminScoreAway').value);
  await ajax(`/api/admin/jogos/${jogoId}/resultado`, 'POST', { placar_casa, placar_fora });
  setMessage('#alerts', 'Resultado registrado e apostas processadas.', 'success');
  await loadGames();
  renderBets();
  await loadRanking();
};

const loadRanking = async () => {
  const data = await ajax('/api/ranking');
  const winners = data.vencedores.map(row => `<tr><td>${row.nome}</td><td>${row.jogo}</td><td>${row.aposta}</td><td>R$ ${row.ganho.toFixed(2)}</td></tr>`).join('');
  const near = data.quase.map(row => `<tr><td>${row.nome}</td><td>${row.jogo}</td><td>${row.aposta}</td><td>${row.diferenca}</td></tr>`).join('');
  document.querySelector('#rankingWinners tbody').innerHTML = winners;
  document.querySelector('#rankingNear tbody').innerHTML = near;
};

const handleClick = (event) => {
  const action = event.target.dataset.action;
  if (!action) return;
  const id = event.target.dataset.id;

  if (action === 'bet') openBetModal(id);
  if (action === 'pay') openPayment(id);
};

const bind = () => {
  document.addEventListener('click', handleClick);
  document.querySelector('#betForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await submitBet(); } catch (error) { setMessage('#alerts', error.message, 'danger'); }
  });
  document.querySelector('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = event.querySelector('#loginEmail').value;
    const senha = event.querySelector('#loginPassword').value;
    try { await ajax('/api/login', 'POST', { email, senha }); await loadUser(); await loadGames(); setMessage('#alerts', 'Login realizado.', 'success'); } catch (error) { setMessage('#alerts', error.message, 'danger'); }
  });
  document.querySelector('#registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const nome = event.querySelector('#registerName').value;
    const email = event.querySelector('#registerEmail').value;
    const senha = event.querySelector('#registerPassword').value;
    try { await ajax('/api/register', 'POST', { nome, email, senha }); setMessage('#alerts', 'Cadastro realizado. Faça login.', 'success'); } catch (error) { setMessage('#alerts', error.message, 'danger'); }
  });
  document.querySelector('#logoutButton').addEventListener('click', async () => { await ajax('/api/logout', 'POST'); state.user = null; renderUserArea(); setMessage('#alerts', 'Logout concluído.'); });
  document.querySelector('#paymentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await submitPayment(); } catch (error) { setMessage('#alerts', error.message, 'danger'); }
  });
  document.querySelector('#confirmPaymentButton').addEventListener('click', async () => {
    try { await confirmPayment(); } catch (error) { setMessage('#alerts', error.message, 'danger'); }
  });
  document.querySelector('#adminGameForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await submitAdminGame(); } catch (error) { setMessage('#alerts', error.message, 'danger'); }
  });
  document.querySelector('#adminResultForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await submitAdminResult(); } catch (error) { setMessage('#alerts', error.message, 'danger'); }
  });
  document.querySelectorAll('.modal .close').forEach(btn => btn.addEventListener('click', closeModal));
};

const init = async () => {
  bind();
  await loadCsrf();
  await loadUser();
  await loadGames();
  await renderBets();
  await loadRanking();
};

window.addEventListener('DOMContentLoaded', init);
