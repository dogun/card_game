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
  <img class="card-img" src="pic/${c.country_code}-${c.id}.png" alt="${c.name}" />
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
	await loadDecksForRoomSelect(); // 更新房间用下拉
  } catch (e) { alert("5"); alert(e.message); }
};

document.getElementById('btnListDecks').onclick = loadDecks;
async function loadDecks() {
  try {
    const decks = await api('/api/decks');
    const box = document.getElementById('decksList');
    box.innerHTML = decks.map(d =>
      `<div class="card">
         <div>Deck: <code>${d.id}</code>${d.name} @ ${d.country}/${d.country1} ${d.headquarters}</div>
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
	await loadDecksForRoomSelect(); // 更新房间用下拉
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
	await loadDecksForRoomSelect(); // 更新房间用下拉
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
      `<div>${c.country}.${c.card_def_id} - ${c.card_name || '(未知)'} x ${c.card_count}</div>`
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
      const [country, card_def_id, countStr] = tok.split(':');
      const card_count = parseInt(countStr || '1', 10);
      if (country && card_def_id && card_count >= 0) items.push({ card_def_id, country, card_count });
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

/* ---------------- 房间/对战相关 ---------------- */

let currentRoomId = '';

function getRoomIdInput() {
  return document.getElementById('roomIdInput').value.trim();
}
function setRoomIdInput(v) {
  document.getElementById('roomIdInput').value = v;
  currentRoomId = v;
}

function clearDecksForRoomSelect() {
  const sel = document.getElementById('roomDeckSelect');
  sel.innerHTML = `<option value="">请选择卡组…(需先登录并创建卡组)</option>`;
}
async function loadDecksForRoomSelect() {
  try {
    const decks = await api('/api/decks');
    const sel = document.getElementById('roomDeckSelect');
    sel.innerHTML = '';
    if (!decks.length) {
      sel.innerHTML = `<option value="">（暂无卡组）</option>`;
      return;
    }
    for (const d of decks) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.id}（种类:${d.lines} 总:${d.total_cards}）`;
      sel.appendChild(opt);
    }
  } catch (e) {
    // 未登录或错误，不刷选项
  }
}

async function refreshRoomStatus() {
  const roomId = getRoomIdInput();
  const statusBox = document.getElementById('roomStatus');
  if (!roomId) {
    statusBox.textContent = '房间状态：未选择';
    return;
  }
  try {
    const s = await api(`/api/rooms/${encodeURIComponent(roomId)}/state`);
    const st = s.state;
    const p1 = st.players.p1 || {};
    const p2 = st.players.p2 || {};
    const lines = [
      `房间ID：${roomId}`,
      `状态：${st.status}；回合：${st.turn || '-' }；阶段：${st.phase || '-'}`,
      `P1 用户：${p1.user_id ?? '-'}，卡组：${p1.deck_id ?? '-'}`,
      `P2 用户：${p2.user_id ?? '-'}，卡组：${p2.deck_id ?? '-'}`,
      st.status === 'active' ? `已开始，可点击“进入游戏界面”` : '等待开始'
    ];
    statusBox.textContent = lines.join(' | ');
  } catch (e) {
    statusBox.textContent = `房间状态获取失败：${e.message}`;
  }
}

document.getElementById('btnCreateRoom').onclick = async () => {
  try {
    const res = await api('/api/rooms', { method: 'POST' });
    setRoomIdInput(res.room_id);
    await refreshRoomStatus();
    alert('已创建房间：' + res.room_id);
  } catch (e) { alert(e.message); }
};

document.getElementById('btnJoinRoom').onclick = async () => {
  const roomId = getRoomIdInput();
  if (!roomId) return alert('请先填写房间ID');
  try {
    await api(`/api/rooms/${encodeURIComponent(roomId)}/join`, { method: 'POST' });
    await refreshRoomStatus();
    alert('已加入房间');
  } catch (e) { alert(e.message); }
};

document.getElementById('btnSetRoomDeck').onclick = async () => {
  const roomId = getRoomIdInput();
  const deckSel = document.getElementById('roomDeckSelect');
  const deckId = deckSel.value;
  if (!roomId) return alert('请先填写房间ID');
  if (!deckId) return alert('请选择卡组');
  try {
    await api(`/api/rooms/${encodeURIComponent(roomId)}/deck`, {
      method: 'PUT',
      body: JSON.stringify({ deck_id: deckId }),
    });
    await refreshRoomStatus();
    alert('卡组已设置');
  } catch (e) { alert(e.message); }
};

document.getElementById('btnStartGame').onclick = async () => {
  const roomId = getRoomIdInput();
  if (!roomId) return alert('请先填写房间ID');
  try {
    await api(`/api/rooms/${encodeURIComponent(roomId)}/start`, { method: 'POST' });
    await refreshRoomStatus();
    if (confirm('对局已开始，是否进入游戏界面？')) {
      location.href = `/game.html?room=${encodeURIComponent(roomId)}`;
    }
  } catch (e) { alert(e.message); }
};

document.getElementById('btnEnterGame').onclick = () => {
  const roomId = getRoomIdInput();
  if (!roomId) return alert('请先填写房间ID');
  location.href = `/game.html?room=${encodeURIComponent(roomId)}`;
};

document.getElementById('btnRefreshRoom').onclick = refreshRoomStatus;


(async () => {
  await refreshMe();
})();