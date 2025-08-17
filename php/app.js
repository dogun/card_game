async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function refreshMe() {
  const me = await api('/api/me');
  const userInfo = document.getElementById('userInfo');
  const btnLogout = document.getElementById('btnLogout');
  if (me.user) {
    userInfo.textContent = `已登录：${me.user.username}（${me.user.nickname}）`;
    btnLogout.classList.remove('hidden');
  } else {
    userInfo.textContent = '未登录';
    btnLogout.classList.add('hidden');
  }
  return me.user;
}

document.getElementById('btnRegister').onclick = async () => {
  const username = document.getElementById('username').value.trim();
  const nickname = document.getElementById('nickname').value.trim();
  const password = document.getElementById('password').value;
  const msg = document.getElementById('authMsg');
  try {
    await api('/api/users/register', { method: 'POST', body: JSON.stringify({ username, nickname, password }) });
    msg.textContent = '注册并登录成功';
    await refreshMe();
  } catch (e) { msg.textContent = e.message; }
};

document.getElementById('btnLogin').onclick = async () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const msg = document.getElementById('authMsg');
  try {
    await api('/api/users/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    msg.textContent = '登录成功';
    await refreshMe();
  } catch (e) { msg.textContent = e.message; }
};

document.getElementById('btnLogout').onclick = async () => {
  await api('/api/users/logout', { method: 'POST' });
  await refreshMe();
};

document.getElementById('btnLoadCards').onclick = async () => {
  const list = document.getElementById('cardList');
  list.textContent = '加载中...';
  try {
    const cards = await api('/api/cards');
    list.textContent = '';
    for (const c of cards) {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `
<div class="card-h">
  <img class="card-img" src="pic/${c.id}.png" alt="${c.name}" />
  <div class="card-info">
    <div><strong>${c.name}</strong> <span class="badge">${c.id}</span></div>
    <div>国家: <code>${c.country_code}</code> 等级: <code>${c.card_level_code}</code></div>
    <div>攻/血: <code>${c.attack}/${c.health}</code> | 费用: 部署 <code>${c.deploy_cost}</code> 行动 <code>${c.action_cost}</code></div>
    <div>类型: ${c.card_types.map(t=>`<span class="badge">${t}</span>`).join(' ')}</div>
    <div>效果: ${c.effects.map(e=>`<span class="badge">${e.effect}:{e.num}</span>`).join(' ')}</div>
  </div>
</div>
      `;
      list.appendChild(el);
    }
  } catch (e) {
    list.textContent = e.message;
  }
};

document.getElementById('btnCreateDeck').onclick = async () => {
  try {
	const name = document.getElementById('deckName').value;
    const res = await api('/api/decks', { method: 'POST', body: JSON.stringify({ name }) });
    alert('已创建卡组：' + res.deck_id);
    await loadDecks();
    openDeckEditor(res.deck_id);
  } catch (e) { alert("5"); alert(e.message); }
};

document.getElementById('btnListDecks').onclick = loadDecks;
async function loadDecks() {
  try {
    const decks = await api('/api/decks');
    const box = document.getElementById('decksList');
    box.innerHTML = decks.map(d =>
      `<div class="card">
         <div>Deck: <code>${d.id}</code>(${d.name})</div>
         <div>创建时间: ${d.created_at}</div>
         <div>种类: ${d.lines} | 总张数: ${d.total_cards}</div>
         <div class="row">
           <button data-open="${d.id}">打开</button>
           <button data-del="${d.id}">删除</button>
         </div>
       </div>`
    ).join('') || '暂无卡组';
    box.querySelectorAll('[data-open]').forEach(btn => btn.onclick = () => openDeckEditor(btn.dataset.open));
    box.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => deleteDeck(btn.dataset.del));
  } catch (e) {
	  alert("4");
    alert(e.message);
  }
}

async function deleteDeck(id) {
  if (!confirm('确定删除卡组 ' + id + ' ?')) return;
  try {
    await api('/api/decks/' + encodeURIComponent(id), { method: 'DELETE' });
    await loadDecks();
    document.getElementById('deckEditor').classList.add('hidden');
  } catch (e) { alert("3"); alert(e.message); }
}

async function openDeckEditor(deckId) {
  const editor = document.getElementById('deckEditor');
  editor.classList.remove('hidden');
  document.getElementById('deckId').textContent = deckId;
  await refreshDeckDetail(deckId);
}

async function refreshDeckDetail(deckId) {
  try {
    const deck = await api('/api/decks/' + encodeURIComponent(deckId));
    const detail = document.getElementById('deckDetail');
    detail.innerHTML = deck.card_defs.map(c =>
      `<div>${c.card_def_id} - ${c.card_name || '(未知)'} x ${c.card_count}</div>`
    ).join('') || '卡组为空';
  } catch (e) {
	  alert("1");
    alert(e.message);
  }
}

document.getElementById('btnSaveDeckCards').onclick = async () => {
  const deckId = document.getElementById('deckId').textContent;
  const raw = document.getElementById('deckCardsInput').value.trim(); // format: sa:2 factory:1
  const items = [];
  if (raw) {
    for (const tok of raw.split(/\s+/)) {
      const [card_def_id, countStr] = tok.split(':');
      const card_count = parseInt(countStr || '1', 10);
      if (card_def_id && card_count >= 0) items.push({ card_def_id, card_count });
    }
  }
  try {
    await api('/api/decks/' + encodeURIComponent(deckId) + '/cards', {
      method: 'PUT',
      body: JSON.stringify({ items }),
    });
    await refreshDeckDetail(deckId);
    await loadDecks();
    alert('已保存');
  } catch (e) { alert("2"); alert(e.message); }
};

(async () => {
  await refreshMe();
})();