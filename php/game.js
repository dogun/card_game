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
    //qs('#drawChoice').classList.remove('hidden');
  } else {
    //qs('#drawChoice').classList.add('hidden');
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
      div.innerHTML = `
    <div class="col">
      <div class="card-view" style="width: 145px;">
        <img class="card-art" src="/pic/${cards[i]}.png" alt="">
        <span class="stat atk">1</span>
        <span class="stat def">2</span>
      </div>
    </div>`;
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

// 修正：使用指针锚点 + 包含块偏移，避免 X 轴偏移几百像素的问题
function enableDrag(el, payload, opts = {}) {
  el.draggable = true;
  el.style.cursor = 'grab';

  const type = opts.type || 'application/json';
  const effectAllowed = opts.effectAllowed || 'move';
  const plainBackup = opts.plainBackup !== false;
  const useCustomGhost = opts.customGhost !== false;

  let ghostEl = null;
  let onDocDragOver = null;
  let pointerOffset = { x: 0, y: 0 }; // 鼠标按下点相对卡牌左上角的偏移

  function setInvisibleDragImage(dt) {
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    try { dt.setDragImage(img, 0, 0); } catch {}
  }

  function createGhost(el) {
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
	ghost.style.left = 0;
	ghost.style.top = 0;
    document.body.appendChild(ghost);
    return ghost;
  }
  
  function _log(str) {
	const log = document.getElementById('my-cmd-rem');
	log.innerHTML = str;
  }

  function moveGhostToClient(ghost, clientX, clientY) {
    // 关键补偿：用包含块(ghost.parentElement)的 rect 偏移进行修正
    const baseRect = (ghost.parentElement || document.documentElement).getBoundingClientRect();
    const left = Math.round(clientX - baseRect.left - pointerOffset.x);
    const top  = Math.round(clientY - baseRect.top  - pointerOffset.y);
    ghost.style.transform = `translate(${left}px, ${top}px)`;
  }

  el.addEventListener('dragstart', ev => {
    const dt = ev.dataTransfer;
    if (dt) {
      dt.effectAllowed = effectAllowed;
      const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
      try { dt.setData(type, str); } catch {}
      if (plainBackup) {
        try { dt.setData('text/plain', str); } catch {}
      }

      if (useCustomGhost) {
        setInvisibleDragImage(dt);

        // 计算“指针锚点”：鼠标按下位置相对卡牌左上角的偏移
        const r = el.getBoundingClientRect();
        // 有些浏览器 dragstart 可能拿不到精确 clientX/Y，做兜底
        const cx = (ev.clientX != null && ev.clientX !== 0) ? ev.clientX : r.left + r.width / 2;
        const cy = (ev.clientY != null && ev.clientY !== 0) ? ev.clientY : r.top  + r.height / 2;
        pointerOffset = { x: cx - r.left, y: cy - r.top };

        ghostEl = createGhost(el);
        // 初始化位置
        moveGhostToClient(ghostEl, cx, cy);

        onDocDragOver = e => {
          // 持续跟随鼠标
          moveGhostToClient(ghostEl, e.clientX, e.clientY);
        };
        document.addEventListener('dragover', onDocDragOver);
      } else {
        // 使用原生影像（注意：浏览器仍可能半透明）
        const imgEl = el.querySelector('img') || el;
        try {
          const r = imgEl.getBoundingClientRect();
          const cx = (ev.clientX != null) ? ev.clientX : r.left + r.width / 2;
          const cy = (ev.clientY != null) ? ev.clientY : r.top  + r.height / 2;
          const offX = cx - r.left;
          const offY = cy - r.top;
          dt.setDragImage(imgEl, offX, offY);
        } catch {}
      }
    }

    el.classList.add('dragging');
    el.style.cursor = 'grabbing';
  });

  el.addEventListener('dragend', () => {
    if (onDocDragOver) {
      document.removeEventListener('dragover', onDocDragOver);
      onDocDragOver = null;
    }
    if (ghostEl) {
      ghostEl.remove();
      ghostEl = null;
    }
    el.classList.remove('dragging');
    el.style.cursor = 'grab';
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
  const btn = ev.target.closest('img[data-pile]');
  if (!btn) return;
  try {
    await doAction('choose_draw_pile', { pile: btn.dataset.pile });
    //qs('#drawChoice').classList.add('hidden');
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