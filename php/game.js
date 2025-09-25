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
	alert('loadMe');
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
    } catch (e) {
	  alert('schedulePoll');
	  alert(e);
	}
    schedulePoll();
  }, 2000);
}

function renderAll() {
  const my = guessMySeat();
  const opp = my === 'p1' ? 'p2' : 'p1';

  // 资源
  setPoints('my', state.players[my]);
  setPoints('e',  state.players[opp]);
  
  // 牌堆
  renderPile('drawChoice', state.factory[my], true);
  renderPile('enemyPiles', state.factory[opp], false);

  // 手牌
  renderHand('myHand', state.hands[my], true);
  renderHand('enemyHand', state.hands[opp], false);

  // 支援/前线
  renderZone('mySupportCards', state.support[my], state.headquarters[my], true, 'support');
  renderZone('myFrontline', state.frontline[my], null, true, 'frontline');
  renderZone('enemyFrontline', state.frontline[opp], null, false, 'frontline');
  renderZone('enemySupportCards', state.support[opp], state.headquarters[opp], false, 'support');
  
  const e = qs('#myFrontlineC');
  const e1 = qs('#enemyFrontlineC');
  if (state.frontline[opp].length > 0) e1.style.display = 'block';
  else e.style.display = 'block';

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
  } catch(e) {
	alert('guessMySeat');
	alert(e);
    return 'p1';
  }
}

function setPoints(prefix, p) {
  qs(`#${prefix}-cmd-rem`).textContent  = p.command.remain;
  qs(`#${prefix}-cmd-tot`).textContent  = p.command.total;
  qs(`#${prefix}-prod-rem`).textContent = p.produce.remain;
  qs(`#${prefix}-prod-tot`).textContent = p.produce.total;
}

function renderPile(containerId, cards, isMine) {
	const box = document.querySelector('#' + containerId);
	box.innerHTML = '';
	if (isMine) {
		box.innerHTML = `
        <div class="pile" id="myPile"><img src="pic/back.png" style="width: 145px; " data-pile="player" /></div>
        <div class="pile" id="factoryPileBottom"><img src="pic/${cards[0].country}-${cards[0].card_def_id}.png" style="width: 145px; " data-pile="factory" /></div>
		`;
	}else {
		box.innerHTML = `
        <div class="pile" id="enemyPile"><img src="pic/back.png" style="width: 145px; "/></div>
        <div class="pile" id="factoryPileTop"><img src="pic/${cards[0].country}-${cards[0].card_def_id}.png" style="width: 145px; "/></div>
		`;
	}
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
        <img class="card-art" src="/pic/${cards[i]['country']}-${cards[i]['card_def_id']}.png" alt="">
        <span class="stat atk">${cards[i]['attack']}</span>
        <span class="stat def">${cards[i]['health']}</span>
      </div>
    </div>`;
      div.onclick = () => zoomCard(cards[i]);
      enableDrag(div, { zone: 'hand', index: i, card: cards[i] });
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
 
function renderZone(containerId, cards, headquarters, isMine, zoneName) {
  const box = qs('#'+containerId);
  box.innerHTML = '';
  
  const len = cards.length;
  const insertIdx =
    len === 0 ? 0 :
    len === 1 ? 1 :
    (len % 2 === 1 ? Math.floor(len / 2) + 1 : len / 2);

  const next = cards.slice();     // 复制
  if (zoneName != 'frontline') {
	next.splice(insertIdx, 0, headquarters);   // 插入
  } else {
	const C = qs('#' + containerId + 'C');
	if (len == 0) C.style.display = 'none';
  }
  
  r_idx = 0;
  next.forEach((cid, idx) => {
    const div = document.createElement('div');
    div.className = 'card';
	if (cid['card_def_id'].indexOf('headquarters') >= 0) {
		div.innerHTML = `
		<div class="col">
		  <div class="card-view" style="width: 145px;">
			<img class="card-art" src="/pic/${next[idx]['country']}-${next[idx]['card_def_id']}.png" alt="">
			<span class="stat headquarters">${next[idx]['health']}</span>
		  </div>
		</div>`;
	} else {
		div.innerHTML = `
		<div class="col">
		  <div class="card-view" style="width: 145px;">
			<img class="card-art" src="/pic/${next[idx]['country']}-${next[idx]['card_def_id']}.png" alt="">
			<span class="stat atk">${next[idx]['attack']}</span>
			<span class="stat def">${next[idx]['health']}</span>
		  </div>
		</div>`;
	}
	div.onclick = () => zoomCard(next[idx]);
    if (isMine && next[idx]['card_def_id'].indexOf('headquarters') < 0) {
      enableDrag(div, { zone:zoneName, index:r_idx, card:cid });
	  r_idx ++;
    }
    box.appendChild(div);

    div.style.left = `calc(50% - 55px + ${(idx - (next.length - 1) / 2) * 150}px)`;
	
  });
}

function zoomCard(card){
  const z = qs('#zoom'); const img = qs('#zoomImg');
img.src = `/pic/${card['country']}-${card['card_def_id']}.png`; img.alt = card['card_def_id'];
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

function getTargetIndexInZone(zoneEl, ev) {
  const CARD_SELECTOR = '.card, [data-card-index], [data-index]';
  const cards = Array.from(zoneEl.querySelectorAll(CARD_SELECTOR));

  if (cards.length === 0) return 0; // 区域为空，兜底为 0（如需“直击玩家”，可在这里改协议）

  // 先尝试：基于命中的元素
  const hit = ev.target && ev.target.closest(CARD_SELECTOR);
  if (hit && zoneEl.contains(hit)) {
    // 优先读取 data-* 上的显式索引
    const ds = hit.dataset || {};
    const raw =
      ds.index ??
      ds.cardIndex ??
      hit.getAttribute('data-index') ??
      hit.getAttribute('data-card-index');

    if (raw != null && raw !== '' && !Number.isNaN(Number(raw))) {
      return Number(raw);
    }
    // 否则退化为 DOM 顺序
    const idx = cards.indexOf(hit);
    if (idx !== -1) return idx;
  }

  // 未命中具体卡：选择距离指针最近的一张
  const { clientX: x, clientY: y } = ev;
  let bestIdx = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d2 = (cx - x) * (cx - x) + (cy - y) * (cy - y);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestIdx = i;
    }
  }
  return bestIdx;
}

['mySupportCards','enemySupportCards','myFrontline','enemyFrontline'].forEach(id=>{
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
      } else if (id === 'myFrontline' && p.zone === 'support') {
        await doAction('support_to_front', { support_index: p.index });
      } else if ((id === 'enemySupportCards' || id === 'enemyFrontline') && (p.zone === 'support' || p.zone === 'frontline')) {
        const targetFrom = id === 'enemySupportCards' ? 'support' : 'frontline';
        const targetIndex = getTargetIndexInZone(zone, ev);
		alert(targetIndex);
        await doAction('attack', { from: p.zone, index: p.index, target_from: targetFrom, target_index: targetIndex });
      } else {
		  alert("id" + id);
		  alert("zone" + p.zone);
	  }
    } catch (e) {
      alert('attack');
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
  } catch (e) {
	alert('drawChoice event');
    alert(e);
  }
});

// 结束回合
qs('#btnEndTurn').onclick = async () => {
  try { await doAction('end_turn', {}); }
  catch (e) {
    alert(e);
  }
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
	alert('async');
    alert(e);
  }
})();