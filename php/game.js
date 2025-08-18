// Minimal client for room game flow
const qs = s => document.querySelector(s);
const api = async (path, opts={}) => {
  const res = await fetch(path, { headers:{'Content-Type':'application/json'}, credentials:'same-origin', ...opts });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
};

// 从URL获取 roomId ?room=...
const url = new URL(location.href);
const roomId = url.searchParams.get('room');
let state = null, version = 0, seat = null;

if (!roomId) {
  alert('缺少 room 参数'); location.href = '/';
}

// 当前登录用户ID（用于判定我方座位）
let myUserId = null;
async function loadMe() {
  try {
    const me = await api('/api/me');
    myUserId = me.user ? Number(me.user.id) : null;
  } catch (e) {
	  alert(e);
    myUserId = null;
  }
}

async function refreshState() {
  const s = await api(`/api/rooms/${encodeURIComponent(roomId)}/state`);
  state = s.state; version = s.version;
  renderAll();
  schedulePoll();
}

let pollTimer = null;
function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    try {
      const s = await api(`/api/rooms/${encodeURIComponent(roomId)}/state`);
      if (s.version !== version) {
        state = s.state; version = s.version; renderAll();
      }
    } catch (e) { /* ignore */ }
    schedulePoll();
  }, 1500);
}

function renderAll() {
  const my = guessMySeat();
  const opp = my === 'p1' ? 'p2' : 'p1';

  // 资源
  setPoints('my', state.players[my]);
  setPoints('e',  state.players[opp]);

  // 手牌
  renderHand('myHand', state.hands[my], true);
  renderHand('enemyHand', state.hands[opp], false);

  // 支援/前线
  renderZone('mySupportCards', state.support[my], true, 'support');
  renderZone('frontlineMe', state.frontline[my], true, 'frontline');
  renderZone('enemySupportCards', state.support[opp], false, 'support');
  renderZone('frontlineEnemy', state.frontline[opp], false, 'frontline');

  // 抽牌选择
  if (state.status === 'active' && state.turn === my && state.phase === 'draw_choice') {
    qs('#drawChoice').classList.remove('hidden');
  } else {
    qs('#drawChoice').classList.add('hidden');
  }
}

function guessMySeat() {
  try {
    if (!state || !state.players) return 'p1';
    const p1 = state.players.p1 || {};
    const p2 = state.players.p2 || {};
    // 优先：使用登录用户ID匹配
    if (myUserId != null) {
      if (Number(p1.user_id) === myUserId) return 'p1';
      if (Number(p2.user_id) === myUserId) return 'p2';
    }

    // 可选：URL 指定 seat=p1|p2 时覆盖（便于调试/观战）
    const seatParam = url.searchParams.get('seat');
    if (seatParam === 'p1' || seatParam === 'p2') return seatParam;

    // 兜底：默认视角为 p1
    return 'p1';
  } catch {
    return 'p1';
  }
}

function setPoints(prefix, p) {
  qs(`#${prefix}-cmd-rem`).textContent  = p.command.remain;
  qs(`#${prefix}-cmd-tot`).textContent  = p.command.total;
  qs(`#${prefix}-prod-rem`).textContent = p.produce.remain;
  qs(`#${prefix}-prod-tot`).textContent = p.produce.total;
}

function renderHand(containerId, cards, isMine) {
  const box = document.querySelector('#' + containerId);
  box.innerHTML = '';
  const n = cards.length;
  const angleSpan = Math.min(80, 5 * n); // 弧形角度跨度
  const start = -angleSpan / 2;

  for (let i = 0; i < n; i++) {
    const angle = start + (angleSpan / (Math.max(1, n - 1))) * i;
    const div = document.createElement('div');
    div.className = 'card';

    if (isMine) {
      div.innerHTML = `<img src="/pic/${cards[i]}.png" alt="">`;
      div.onclick = () => zoomCard(cards[i]);
      enableDrag(div, { zone: 'hand', index: i, cardId: cards[i] });
    } else {
      div.classList.add('back');
    }

    // 弧形偏移：
    // - 我方：中间更高、两边更低 => 使用 bottom，中心偏移大
    // - 敌方：中间更低、两边更高 => 使用 top，中心偏移大
    const yOffset = -Math.abs(angle);
    div.style.left = `calc(50% - 55px + ${(i - (n - 1) / 2) * 60}px)`;
    if (isMine) {
      div.style.bottom = `${yOffset + 10}px`;
    } else {
      div.style.top = `${yOffset + 10}px`; // center 值更大（更低），两侧更小（更高）
    }

    // 旋转：中心0°，向两侧每张递增3°
    const mid = (n - 1) / 2;
    const offset = i - mid;
    const tilt = offset * 3;
    div.style.transformOrigin = isMine ? 'bottom center' : 'top center';
	div.style.transform = `rotate(${isMine ? tilt : -tilt}deg)`;

    const depth = 100 - Math.abs(offset);
    div.style.zIndex = String(1000 + i);

    box.appendChild(div);
  }
}

function renderZone(containerId, cards, isMine, zoneName) {
  const box = qs('#'+containerId);
  box.innerHTML = '';
  cards.forEach((cid, idx) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<img src="/pic/${cid}.png" alt="">`;
    if (isMine) {
      enableDrag(div, { zone:zoneName, index:idx, cardId:cid });
    }
    box.appendChild(div);
  });
}

function zoomCard(cardId){
  const z = qs('#zoom'); const img = qs('#zoomImg');
  img.src = `/pic/${cardId}.png`; img.alt = cardId;
  z.classList.remove('hidden');
  z.onclick = () => z.classList.add('hidden');
}

// 拖拽：将手牌拖到支援线；支援线拖到前线；（占位）对敌方卡攻击
function enableDrag(el, payload) {
  el.draggable = true;
  el.addEventListener('dragstart', ev => {
    ev.dataTransfer.setData('application/json', JSON.stringify(payload));
  });
}

['mySupportCards','frontlineMe','enemySupportCards','frontlineEnemy'].forEach(id=>{
  const zone = qs('#'+id);
  zone.addEventListener('dragover', ev => ev.preventDefault());
  zone.addEventListener('drop', async ev => {
    ev.preventDefault();
    const json = ev.dataTransfer.getData('application/json');
    if (!json) return;
    const p = JSON.parse(json);
    try {
      const my = guessMySeat();
      if (id === 'mySupportCards' && p.zone === 'hand') {
        await doAction('play_support', { hand_index: p.index });
      } else if (id === 'frontlineMe' && p.zone === 'support') {
        await doAction('support_to_front', { support_index: p.index });
      } else if ((id === 'enemySupportCards' || id === 'frontlineEnemy') && (p.zone === 'support' || p.zone === 'frontline')) {
        const targetFrom = id === 'enemySupportCards' ? 'support' : 'frontline';
        const targetIndex = 0; // 简化：攻击区域第一张（演示用）
        await doAction('attack', { from: p.zone, index: p.index, target_from: targetFrom, target_index: targetIndex });
      }
    } catch (e) {
      alert(e.message);
    }
  });
});

// 抽牌选择
qs('#drawChoice').addEventListener('click', async ev => {
  const btn = ev.target.closest('button[data-pile]');
  if (!btn) return;
  try {
    await doAction('choose_draw_pile', { pile: btn.dataset.pile });
    qs('#drawChoice').classList.add('hidden');
  } catch (e) { alert(e.message); }
});

// 结束回合
qs('#btnEndTurn').onclick = async () => {
  try { await doAction('end_turn', {}); }
  catch (e) { alert(e.message); }
};

async function doAction(type, payload) {
  const body = { type, version, ...payload };
  const res = await api(`/api/rooms/${encodeURIComponent(roomId)}/action`, {
    method:'POST', body: JSON.stringify(body)
  });
  state = res.state; version = res.version; renderAll();
}

// 初始化：先获取当前用户，再拉取房间状态
(async () => {
  try {
    await loadMe();
    await refreshState();
  } catch (e) {
    alert(e.message);
  }
})();