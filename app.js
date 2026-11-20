(() => {
  const D = window.DATA;
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");
  const money = (n, d = 2) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const money0 = (n) => money(Math.round(n), 0);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const FREE_SHIP = 75, SHIP_FEE = 7.95;
  const CAT_COLORS = { popcorn: "#c98a1b", baja: "#2f9e44", coffee: "#5b3a29", snacks: "#7a9a2e", gear: "#0b1d33", donation: "#00a36c", gift: "#3ddc97" };

  // In-memory state only (no browser storage)
  const state = {
    view: "home", param: null, filter: "all",
    cart: [], player: null, orders: [],
    team: { ...D.team },
    players: D.players.map((p) => ({ ...p })),
    sales: { ...D.seedSales },
  };
  const allItems = [...D.products, D.donation, ...D.gifts];
  const prod = (id) => allItems.find((p) => p.id === id);
  const supplierOf = (p) => (p.cat === "gift" ? "gift" : p.id === "d1" ? "donation" : p.cat);
  const noShip = (s) => s === "donation" || s === "gift";
  const playerById = (id) => state.players.find((p) => p.id === id);

  /* ---------- router (memory) ---------- */
  function go(view, param = null) {
    state.view = view; state.param = param;
    render();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    app.focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-go]");
    if (g) { e.preventDefault(); go(g.dataset.go, g.dataset.param || null); }
  });

  /* ---------- cart math ---------- */
  function totals() {
    let sub = 0, team = 0, shippable = 0;
    state.cart.forEach((l) => { const p = prod(l.id); sub += p.price * l.qty; team += p.price * l.qty * p.share; if (!noShip(supplierOf(p))) shippable += p.price * l.qty; });
    const ship = shippable === 0 || sub >= FREE_SHIP ? 0 : SHIP_FEE;
    return { sub, team, ship, total: sub + ship, count: state.cart.reduce((a, l) => a + l.qty, 0) };
  }
  function addToCart(id, opt = null, qty = 1) {
    const key = id + "|" + (opt || "");
    const ex = state.cart.find((l) => l.key === key);
    if (ex) ex.qty += qty; else state.cart.push({ key, id, opt, qty });
    updateCartBadge(true);
    const p = prod(id);
    toast(`Added ${p.name}. Team keeps ${money(p.price * p.share)}.`);
    if ($("#drawer").classList.contains("open")) renderDrawer();
  }
  function updateCartBadge(bump) {
    $("#cartCount").textContent = totals().count;
    if (bump) { const b = $("#cartBtn"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
  }

  /* ---------- shared bits ---------- */
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2400);
  }
  function setNav() {
    const map = { home: "home", shop: "shop", players: "players", player: "players", admin: "admin" };
    document.querySelectorAll(".nav button").forEach((b) => b.setAttribute("aria-current", map[state.view] === b.dataset.go ? "page" : "false"));
  }
  function renderCredit() {
    const bar = $("#creditBar");
    if (!state.player) { bar.hidden = true; return; }
    const p = playerById(state.player);
    bar.hidden = false;
    bar.innerHTML = `<div class="wrap"><span>Shopping for <b>${esc(p.name)} #${p.num}</b>. Every order is credited to ${esc(p.name)}'s goal.</span><button id="clearCredit">Switch player</button></div>`;
    $("#clearCredit").onclick = () => go("players");
  }
  function countdownHTML() {
    const ms = Math.max(0, new Date(state.team.endsAt) - Date.now());
    const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
    return `<div class="countdown" aria-label="Time left"><div><b class="num">${d}</b><span>days</span></div><div><b class="num">${h}</b><span>hrs</span></div><div><b class="num">${m}</b><span>min</span></div></div>`;
  }
  function animateBars(root = app) {
    requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll("[data-w]").forEach((el) => (el.style.width = el.dataset.w + "%"))));
  }
  function countUp(el, to, fmt) {
    const from = 0, dur = 900, t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  const supplierName = (cat) => (cat === "gift" ? "Tax deductible donation" : cat === "donation" ? "Snack box donation" : D.suppliers[cat].name);

  function productCard(p) {
    return `<article class="card">
      <div class="card-img" data-open="${p.id}" role="button" tabindex="0" aria-label="View ${esc(p.name)}">
        <img src="${p.img}" alt="${esc(p.name)}" loading="lazy" width="700" height="700">
        ${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ""}
        ${p.pending ? `<span class="tag pending">Pending club approval</span>` : ""}
      </div>
      <div class="card-body">
        <span class="supplier">${esc(D.suppliers[p.cat].name)}</span>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.desc)}</p>
        <div class="price-row">
          <div><div class="price num">${money(p.price)}</div><span class="keeps">Team keeps ${money(p.price * p.share)}</span></div>
          <button class="add" data-add="${p.id}">${p.opts ? "Choose" : "Add"}</button>
        </div>
      </div>
    </article>`;
  }
  function bindProductActions(root = app) {
    root.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => { const p = prod(b.dataset.add); p.opts ? openProduct(p.id) : addToCart(p.id); }));
    root.querySelectorAll("[data-open]").forEach((b) => {
      b.onclick = () => openProduct(b.dataset.open);
      b.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProduct(b.dataset.open); } };
    });
  }
  const IG_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/></svg>';
  function igLink(label, cls) { const ig = D.instagram; return `<a class="${cls || "btn btn-ig"}" href="${ig.url}" target="_blank" rel="noopener">${IG_ICON}<span>${label || "Follow @" + ig.handle}</span></a>`; }
  function instagramHTML() {
    const ig = D.instagram;
    const tiles = [["assets/ig-3.jpg", "Team photo day"], ["assets/hero.jpg", "Snack boxes are here"], ["assets/hoodie-crest.jpg", "New team hoodie"], ["assets/coffee.jpg", "Breakaway Blend is back"], ["assets/popcorn-tin.jpg", "Road trip snacks"], ["assets/holiday-box.jpg", "Holiday boxes ship Dec 1"]];
    return `<div class="ig-sec">
      <div class="ig-head">
        <img class="ig-avatar" src="assets/team-crest.svg" alt="" width="72" height="72">
        <div class="ig-who"><div class="eyebrow">Follow the team</div><h2>@${ig.handle}</h2><p class="muted small">Game days, tournament photos and fundraiser updates from the DSE 2017 families. Follow along and cheer the team on all season.</p></div>
        ${igLink("Follow on Instagram")}
      </div>
      <div class="ig-grid">${tiles.map(([src, cap]) => `<a class="ig-tile" href="${ig.url}" target="_blank" rel="noopener" aria-label="${cap} on Instagram"><img src="${src}" alt="" loading="lazy"><span>${cap}</span></a>`).join("")}</div>
      <p class="muted small" style="margin:10px 0 0">Preview tiles for the demo. At launch the latest posts from @${ig.handle} can show here automatically.</p>
    </div>`;
  }
  function fanaticsHTML() {
    return `<div class="fan">
      <div class="sec-head" style="margin:0"><div><div class="eyebrow" style="color:#3ddc97">Official NHL merchandise</div><h2>Official Stars gear via Fanatics</h2>
      <p class="small" style="color:#c4d3df;margin:6px 0 0;max-width:60ch">Jerseys, hats and the new Hometown Remix collection ship directly from Fanatics. Purchases through these links earn the team an affiliate commission.</p></div></div>
      <div class="fan-grid">
        ${D.fanatics.map((f) => `<a class="fan-card" href="${D.fanaticsUrl}" target="_blank" rel="noopener sponsored" data-fan>
          <h3>${esc(f.name)}</h3><p>${esc(f.desc)}</p><p class="xs">${esc(f.from)}</p><span class="go">Shop on Fanatics &rarr;</span></a>`).join("")}
      </div>
      <p class="disclosure">Affiliate disclosure: the team may earn a commission (about 10% in this demo) on qualifying Fanatics purchases at no extra cost to you. Fanatics handles payment, shipping and returns. Rally Pantry is not affiliated with the NHL or the Dallas Stars.</p>
    </div>`;
  }
  function bindFanatics(root = app) {
    root.querySelectorAll("[data-fan]").forEach((a) => a.addEventListener("click", () => toast("Opening Fanatics in a new tab. The team's affiliate link is tracked.")));
  }
  function donateHTML() {
    const d = D.donation;
    return `<div class="donate"><div><div class="eyebrow">Can't use snacks?</div><h3>${esc(d.name)} · ${money(d.price, 0)}</h3><p>${esc(d.desc)} Half goes straight to the team.</p></div>
      <button class="btn btn-primary" data-donate>Donate a box</button></div>`;
  }
  function bindDonate(root = app) { root.querySelectorAll("[data-donate]").forEach((b) => (b.onclick = () => addToCart("d1"))); }

  function aboutHTML() {
    const o = D.org;
    return `<div class="about">
      <div class="about-main">
        <div class="eyebrow">About this fundraiser</div>
        <h2>Help support the 2017 Dallas Stars Elite team</h2>
        <p>${esc(o.name)} is a 501(c)(3) nonprofit travel hockey club based in ${esc(o.city)}. This site raises money for our team to help offset the expenses of travel hockey and to help award financial assistance to players who otherwise could not play.</p>
        <p>We are committed to developing young players who are dedicated athletes, ready to work hard on and off the ice, and committed to the kind of effort that leads to success in life.</p>
        <p>Our purpose is to build character and sportsmanship in every player, for the betterment of their physical and social well being, and to keep raising the standard of hockey in North Texas.</p>
        <p>No amount is too small. Your ongoing backing and support are truly appreciated. Thanks in advance for your support.</p>
      </div>
      <div class="about-side">
        <div class="np-badge"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 2l7 3v6c0 5-3.4 9.4-7 11-3.6-1.6-7-6-7-11V5l7-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div><b>501(c)(3) nonprofit</b><span>EIN ${esc(o.ein)} · Donations are tax deductible</span></div></div>
        <div><div class="small" style="font-weight:700;margin-bottom:6px">Your support helps pay for</div>
          <ul class="ticks"><li>Ice costs for team practices</li><li>Tournament expenses</li><li>Financial aid for players who otherwise could not play</li></ul></div>
        <div class="gift"><div class="small" style="font-weight:700">Make a tax deductible donation</div>
          <div class="gift-amts">${D.gifts.map((g) => `<button class="chip" data-gift="${g.id}">${money0(g.price)}</button>`).join("")}</div></div>
        <p class="xs muted" style="margin:0">Verify status with the <a href="${o.irsUrl}" target="_blank" rel="noopener">IRS Tax Exempt Organization Search</a> or <a href="${o.propublicaUrl}" target="_blank" rel="noopener">ProPublica Nonprofit Explorer</a>. For product purchases, only the amount above the value of the item may be deductible.</p>
      </div>
    </div>`;
  }
  function bindGifts(root = app) { root.querySelectorAll("[data-gift]").forEach((b) => (b.onclick = () => addToCart(b.dataset.gift))); }

  function leaderboardHTML(limit = 8) {
    const list = [...state.players].sort((a, b) => b.raised - a.raised).slice(0, limit);
    return `<ol class="lb">${list.map((p, i) => `<li>
      <span class="rank">${i + 1}</span><span class="jersey">${p.num}</span>
      <div><button class="name" data-go="player" data-param="${p.id}">${esc(p.name)}</button>
      <div class="mini-bar"><span style="width:${Math.min(100, (p.raised / p.goal) * 100)}%"></span></div></div>
      <span class="num small"><b>${money0(p.raised)}</b></span></li>`).join("")}</ol>`;
  }

  /* ---------- views ---------- */
  function viewHome() {
    const t = state.team, pct = Math.min(100, (t.raised / t.goal) * 100);
    const featured = ["b1", "p1", "c1", "s3", "g1", "b4", "s1", "p2"].map(prod);
    const catTiles = [
      ["popcorn", "Popcorn", "assets/popcorn.jpg", "Your supplier"],
      ["baja", "Baja Vida jerky", "assets/bv-2.5oz_Variety-Fiesta_Front.jpg", "Nitrate free"],
      ["coffee", "Coffee", "assets/coffee.jpg", "Team label"],
      ["snacks", "Healthy snacks", "assets/granola.jpg", "Texas made"],
      ["gear", "Team gear", "assets/hoodie.jpg", "Pending approval"],
      ["fanatics", "Official Stars gear", null, "Via Fanatics"],
    ];
    app.innerHTML = `<div class="view">
      <section class="hero" style="padding:0">
        <div class="hero-img" role="img" aria-label="Snack gift box on rink ice beside a hockey stick and puck"></div>
        <div class="wrap hero-in">
          <div class="hero-left">
          <div class="hero-id"><img class="crest" src="assets/team-crest.svg" alt="DSE 2017 team crest (placeholder)" width="64" height="73"><span class="team-chip"><i></i>${esc(t.name)} · ${esc(t.sub)} · 501(c)(3) nonprofit</span></div>
          <h1>Snacks, coffee and gear that get the team to the next tournament.</h1>
          <p class="lead">${esc(t.purpose)} Shop five categories in one cart, and every order is credited to the player you choose.</p>
          <div class="goal-card">
            <div class="goal-top"><div><span class="goal-raised num" id="raisedNum">${money0(t.raised)}</span> <span class="small" style="color:#c9d7e3">raised of ${money0(t.goal)}</span></div>${countdownHTML()}</div>
            <div class="bar"><span data-w="${pct.toFixed(1)}"></span></div>
            <div class="goal-meta"><span><b class="num">${pct.toFixed(0)}%</b> of goal</span><span><b class="num">${t.supporters}</b> supporters</span><span><b>${state.players.length}</b> players</span></div>
          </div>
          <div class="hero-cta"><button class="btn btn-light" data-go="shop">Shop the fundraiser</button><button class="btn btn-ghost" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.35)" data-go="players">Find a player</button>${igLink("@" + D.instagram.handle, "btn btn-ghost btn-ig-hero")}</div>
                  </div>
          <div class="hero-right">
            <figure class="hero-team"><img src="assets/team-hero.jpg" alt="DSE 2017 players and coaches on the ice" width="1100" height="667">
              <figcaption><b>${esc(t.name)}</b><span>${state.players.length} players · 2026–27 season</span></figcaption></figure>
            <div class="hero-feat">
              <div class="hero-feat-h"><span>Featured this week</span><button data-go="shop">Shop all</button></div>
              <div class="hero-feat-grid">${["b1", "p1", "c1", "s3"].map(prod).map((p) => `<div class="hf">
                <button class="hf-img" data-open="${p.id}" aria-label="View ${esc(p.name)}"><img src="${p.img}" alt="" loading="eager"></button>
                <div class="hf-body"><b>${esc(p.name)}</b><span class="num">${money(p.price)}</span><em class="num">Team keeps ${money(p.price * p.share)}</em></div>
                <button class="hf-add" data-add="${p.id}" aria-label="Add ${esc(p.name)}">${p.opts ? "Choose" : "Add"}</button></div>`).join("")}</div>
            </div>
          </div>
        </div>
      </section>

      <section><div class="wrap">${aboutHTML()}</div></section>

      <section style="padding-top:0"><div class="wrap">
        <div class="sec-head"><div><div class="eyebrow">One store, five partners</div><h2>Shop by category</h2></div></div>
        <div class="cats">${catTiles.map(([id, l, img, s]) => `<button class="cat" data-cat="${id}">${img ? `<img src="${img}" alt="" loading="lazy">` : `<div class="ph">Official Stars gear</div>`}<b>${l}</b><small>${s}</small></button>`).join("")}</div>
      </div></section>

      <section style="padding-top:0"><div class="wrap">
        <div class="sec-head"><div><div class="eyebrow">Most popular</div><h2>Team favorites</h2></div><button class="btn btn-ghost" data-go="shop">See all products</button></div>
        <div class="grid">${featured.map(productCard).join("")}</div>
      </div></section>

      <section style="padding-top:0"><div class="wrap">${donateHTML()}</div></section>

      <section style="padding-top:0"><div class="wrap">
        <div class="team-sec" style="grid-template-columns:1fr">
          <div class="team-info">
            <div class="team-title"><img class="crest-sm" src="assets/team-crest.svg" alt="" width="44" height="50"><div><div class="eyebrow">Meet the team</div>
            <h2>${esc(t.name)}</h2></div></div>
            <p class="muted small" style="margin:4px 0 14px">${esc(t.sub)} · ${state.players.length} players · ${D.staff.map((s) => `${esc(s.title)} ${esc(s.name)}`).join(" · ")}</p>
            <div class="roster">${[...state.players].sort((a, b) => a.num - b.num).map((p) => `<button class="roster-chip" data-go="player" data-param="${p.id}"><span class="jersey">${p.num}</span><span><b>${esc(p.name)}</b>${p.pos === "G" ? `<small>Goalie</small>` : ""}</span></button>`).join("")}</div>
          </div>
        </div>
      </div></section>

      <section style="padding-top:0"><div class="wrap">${instagramHTML()}</div></section>

      <section style="padding-top:0"><div class="wrap two-col">
        <div class="panel"><div class="sec-head" style="margin-bottom:8px"><div><div class="eyebrow">Live standings</div><h2>Player leaderboard</h2></div><button class="btn btn-ghost" data-go="players">All players</button></div>${leaderboardHTML(8)}</div>
        <div class="panel how">
          <div><div class="eyebrow">Where your money goes</div><h2>How it works</h2></div>
          <div class="how-step"><b class="n">1</b><div><b>Pick a player</b><p>Each player has a personal store link to text to family and friends.</p></div></div>
          <div class="how-step"><b class="n">2</b><div><b>Shop one cart</b><p>Order popcorn, jerky, coffee, snacks and gear together. Each partner ships its items directly.</p></div></div>
          <div class="how-step"><b class="n">3</b><div><b>The team keeps 30% to 50%</b><p>The team's share is shown on every product before you buy.</p></div></div>
          <div>
            <div class="small"><b>Example: $18 bag of Breakaway Blend</b></div>
            <div class="split" aria-label="Price split"><span style="width:40%;background:var(--green)"></span><span style="width:52%;background:#5b3a29"></span><span style="width:8%;background:#9fb3c2"></span></div>
            <div class="legend"><span><i style="background:var(--green)"></i>Team $7.20</span><span><i style="background:#5b3a29"></i>Roaster $9.36</span><span><i style="background:#9fb3c2"></i>Payments and platform $1.44</span></div>
          </div>
        </div>
      </div></section>

      <section style="padding-top:0"><div class="wrap">${fanaticsHTML()}</div></section>
    </div>`;
    app.querySelectorAll("[data-cat]").forEach((b) => (b.onclick = () => { state.filter = b.dataset.cat; go("shop"); }));
    bindProductActions(); bindDonate(); bindGifts(); bindFanatics(); animateBars();
    countUp($("#raisedNum"), t.raised, money0);
  }

  function viewShop() {
    const f = state.filter;
    const list = f === "all" ? D.products : D.products.filter((p) => p.cat === f);
    const sup = f !== "all" && f !== "fanatics" ? D.suppliers[f] : null;
    app.innerHTML = `<div class="view"><section><div class="wrap">
      <div class="sec-head"><div><div class="eyebrow">${esc(state.team.name)} fundraiser</div><h2>Shop the fundraiser</h2>
      <p class="muted small" style="margin:4px 0 0">Free shipping on orders over ${money0(FREE_SHIP)}. Otherwise a flat ${money(SHIP_FEE)} per order, no matter how many partners ship it.</p></div></div>
      <div class="filters" role="group" aria-label="Filter by category">${D.categories.map((c) => `<button class="chip" aria-pressed="${c.id === f}" data-f="${c.id}">${c.label}</button>`).join("")}</div>
      ${sup ? `<p class="small muted" style="margin:-8px 0 16px">${esc(sup.name)} · ${esc(sup.ship)} · ${esc(sup.note)}</p>` : ""}
      ${f === "gear" ? `<div class="notice" style="margin-bottom:16px">Dallas Stars Elite gear is a placeholder. Final designs need written approval from the club before anything is printed. No NHL or Dallas Stars marks are used.</div>` : ""}
      ${f === "fanatics" ? "" : `<div class="grid" id="grid">${list.map(productCard).join("")}</div>`}
      ${f === "all" || f === "fanatics" ? `<div style="margin-top:${f === "all" ? "32px" : "0"}">${fanaticsHTML()}</div>` : ""}
      <div style="margin-top:24px">${donateHTML()}</div>
    </div></section></div>`;
    app.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { state.filter = b.dataset.f; viewShop(); }));
    bindProductActions(); bindDonate(); bindFanatics();
  }

  function viewPlayers() {
    const list = [...state.players].sort((a, b) => a.name.localeCompare(b.name));
    app.innerHTML = `<div class="view"><section><div class="wrap">
      <div class="sec-head"><div><div class="eyebrow">Roster</div><h2>Who are you supporting?</h2><p class="muted small" style="margin:4px 0 0">First names and jersey numbers from the 2026–27 roster. Each player has a personal store link.</p></div></div>
      <div class="players-grid">${list.map((p) => `<button class="pcard" data-go="player" data-param="${p.id}">
        <div class="pcard-top"><span class="jersey">${p.num}</span><div><b>${esc(p.name)}</b><div class="xs muted">${(p.pos === "G" ? "Goalie" : "Skater")}</div></div></div>
        <div><div class="row small"><span class="num"><b>${money0(p.raised)}</b> raised</span><span class="muted num">${Math.round((p.raised / p.goal) * 100)}%</span></div>
        <div class="mini-bar"><span style="width:${Math.min(100, (p.raised / p.goal) * 100)}%"></span></div></div>
      </button>`).join("")}</div>
    </div></section></div>`;
  }

  function viewPlayer(id) {
    const p = playerById(id);
    if (!p) return go("players");
    state.player = p.id; renderCredit();
    const pct = Math.min(100, (p.raised / p.goal) * 100);
    const link = `rallypantry.com/dse2017/${p.id}`;
    const picks = ["b1", "p1", "c1", "s3", "b4", "g1"].map(prod);
    app.innerHTML = `<div class="view"><section><div class="wrap">
      <div class="player-hero">
        <span class="jersey">${p.num}</span>
        <div><div class="eyebrow" style="color:#3ddc97">${esc(state.team.name)} · ${(p.pos === "G" ? "Goalie" : "Skater")}</div>
          <h1>Support ${esc(p.name)}'s season</h1>
          <p>"Thanks for supporting DSE 2017. Every order helps us get to our next tournament."</p>
          <div class="bar" style="max-width:420px"><span data-w="${pct.toFixed(1)}"></span></div>
          <p class="small num"><b style="color:#fff">${money0(p.raised)}</b> of ${money0(p.goal)} personal goal</p>
        </div>
        <div class="share-box"><code>${link}</code><button class="btn btn-light" id="copyLink" style="padding:8px 14px">Copy link</button></div>
      </div>
    </div></section>
    <section style="padding-top:0"><div class="wrap">
      <div class="sec-head"><div><div class="eyebrow">${esc(p.name)}'s picks</div><h2>Start here</h2></div><button class="btn btn-ghost" data-go="shop">Shop everything</button></div>
      <div class="grid">${picks.map(productCard).join("")}</div>
      <div style="margin-top:24px">${donateHTML()}</div>
    </div></section></div>`;
    $("#copyLink").onclick = () => {
      const done = () => toast("Store link copied. Text it to family and friends.");
      if (navigator.clipboard) navigator.clipboard.writeText("https://" + link).then(done, done); else done();
    };
    bindProductActions(); bindDonate(); animateBars();
  }

  function groupCart() {
    const groups = {};
    state.cart.forEach((l) => { const s = supplierOf(prod(l.id)); (groups[s] = groups[s] || []).push(l); });
    return groups;
  }

  function viewCheckout() {
    if (!state.cart.length) return go("shop");
    const t = totals();
    const groups = groupCart();
    app.innerHTML = `<div class="view"><section><div class="wrap">
      <div class="steps"><span>Cart</span><span class="on">Details and payment</span><span>Done</span></div>
      <div class="checkout">
        <form class="panel form" id="coForm" novalidate>
          <h2>Checkout</h2>
          <label>Credit this order to
            <select id="coPlayer"><option value="">General team fund</option>${[...state.players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => `<option value="${p.id}" ${state.player === p.id ? "selected" : ""}>${esc(p.name)} #${p.num}</option>`).join("")}</select></label>
          <div class="two"><label>Full name<input id="coName" autocomplete="name" placeholder="Pat Smith"><span class="err" data-err="coName"></span></label>
          <label>Email<input id="coEmail" type="email" autocomplete="email" placeholder="pat@example.com"><span class="err" data-err="coEmail"></span></label></div>
          <label>Street address<input id="coAddr" autocomplete="street-address" placeholder="123 Main St"><span class="err" data-err="coAddr"></span></label>
          <div class="two"><label>City<input id="coCity" autocomplete="address-level2" value="Dallas"></label>
          <label>ZIP<input id="coZip" inputmode="numeric" autocomplete="postal-code" placeholder="75201"><span class="err" data-err="coZip"></span></label></div>
          <div><div class="small" style="font-weight:500;margin-bottom:6px">Payment (demo, no charge)</div>
          <div class="pay" role="group">${["Card", "Apple Pay", "PayPal"].map((m, i) => `<button type="button" class="chip" aria-pressed="${i === 0}" data-pay="${m}">${m}</button>`).join("")}</div></div>
          <label id="cardRow">Card number<input id="coCard" inputmode="numeric" value="4242 4242 4242 4242"></label>
          <button class="btn btn-primary btn-block" type="submit">Place order · ${money(t.total)}</button>
          <p class="xs muted" style="margin:0">In the live version, payment runs through Shopify Checkout and each partner receives only its own items to ship.</p>
        </form>
        <div class="panel">
          <h2 style="margin-bottom:12px">Order summary</h2>
          ${Object.entries(groups).map(([s, lines]) => `<div class="group"><div class="group-h"><span>${esc(supplierName(s))}</span><span class="ship">${s === "gift" ? "No shipping" : s === "donation" ? "Delivered by the team" : esc(D.suppliers[s].ship)}</span></div>
            ${lines.map((l) => { const p = prod(l.id); return `<div class="row" style="padding:3px 0"><span>${l.qty} × ${esc(p.name)}${l.opt ? ` <span class="muted">(${esc(l.opt)})</span>` : ""}</span><span class="num">${money(p.price * l.qty)}</span></div>`; }).join("")}</div>`).join("")}
          <div style="border-top:1px solid var(--line);padding-top:12px;display:grid;gap:6px">
            <div class="row"><span>Subtotal</span><span class="num">${money(t.sub)}</span></div>
            <div class="row"><span>Shipping</span><span class="num">${t.ship ? money(t.ship) : "Free"}</span></div>
            <div class="row total"><span>Total</span><span class="num">${money(t.total)}</span></div>
            <div class="row team"><span>Team keeps</span><span class="num">${money(t.team)}</span></div>
          </div>
        </div>
      </div>
    </div></section></div>`;
    app.querySelectorAll("[data-pay]").forEach((b) => (b.onclick = () => {
      app.querySelectorAll("[data-pay]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      $("#cardRow").hidden = b.dataset.pay !== "Card";
    }));
    $("#coForm").onsubmit = (e) => {
      e.preventDefault();
      const v = (id) => $("#" + id).value.trim();
      const errs = {};
      if (v("coName").length < 2) errs.coName = "Enter your name.";
      if (!/^\S+@\S+\.\S+$/.test(v("coEmail"))) errs.coEmail = "Enter a valid email.";
      if (v("coAddr").length < 4) errs.coAddr = "Enter a street address.";
      if (!/^\d{5}$/.test(v("coZip"))) errs.coZip = "Enter a 5 digit ZIP.";
      app.querySelectorAll("[data-err]").forEach((el) => (el.textContent = errs[el.dataset.err] || ""));
      if (Object.keys(errs).length) { $("#" + Object.keys(errs)[0]).focus(); return; }
      placeOrder(v("coPlayer"), v("coName"));
    };
  }

  function placeOrder(playerId, name) {
    const t = totals();
    const groups = groupCart();
    const hasGift = state.cart.some((l) => prod(l.id).cat === "gift");
    const order = { hasGift, id: "RP-" + (1041 + state.orders.length), name: name.split(" ")[0], player: playerId || null, total: t.total, team: t.team, groups: Object.keys(groups), at: new Date() };
    state.cart.forEach((l) => { const p = prod(l.id); state.sales[supplierOf(p)] += p.price * l.qty; });
    state.orders.unshift(order);
    state.team.raised += t.team; state.team.supporters += 1;
    if (playerId) playerById(playerId).raised += t.team;
    if (playerId) state.player = playerId;
    state.cart = []; updateCartBadge(false);
    go("confirm", order.id);
  }

  function viewConfirm(id) {
    const o = state.orders.find((x) => x.id === id);
    if (!o) return go("home");
    const p = o.player ? playerById(o.player) : null;
    const pct = Math.min(100, (state.team.raised / state.team.goal) * 100);
    app.innerHTML = `<div class="view"><div class="confirm">
      <div class="check"><svg viewBox="0 0 24 24" width="38" height="38"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div class="eyebrow">Order ${o.id}</div>
      <h1 style="font-size:clamp(1.6rem,3vw,2.2rem);font-weight:800;margin:6px 0 10px">Thank you, ${esc(o.name)}.</h1>
      <p class="muted">You just added <b style="color:var(--green)">${money(o.team)}</b> to ${p ? `${esc(p.name)}'s goal` : "the team fund"}. Your order is handled by ${o.groups.length} partner${o.groups.length > 1 ? "s" : ""}, and you'll get a tracking email from each.${o.hasGift ? ` A tax receipt for your donation from ${esc(D.org.name)} (EIN ${D.org.ein}) will be emailed to you.` : ""}</p>
      <div class="panel" style="text-align:left;margin:24px 0">
        <div class="row small"><span>${esc(state.team.name)} total</span><span class="num"><b>${money0(state.team.raised)}</b> of ${money0(state.team.goal)}</span></div>
        <div class="bar light"><span data-w="${pct.toFixed(1)}"></span></div>
        ${p ? `<div class="row small"><span>${esc(p.name)}</span><span class="num"><b>${money0(p.raised)}</b> of ${money0(p.goal)}</span></div><div class="bar light" style="height:8px"><span data-w="${Math.min(100, (p.raised / p.goal) * 100).toFixed(1)}"></span></div>` : ""}
      </div>
      <div class="hero-cta" style="justify-content:center"><button class="btn btn-primary" data-go="shop">Keep shopping</button><button class="btn btn-ghost" data-go="admin">See the organizer view</button></div>
      <div class="ig-confirm"><img src="assets/team-crest.svg" alt="" width="40" height="46"><div><b>See your support in action</b><span class="muted small">Follow @${D.instagram.handle} for game photos and fundraiser updates.</span></div>${igLink("Follow")}</div>
    </div></div>`;
    animateBars(); confetti();
  }

  function viewAdmin() {
    const s = state.sales;
    const shares = { popcorn: 0.45, baja: 0.3, coffee: 0.4, snacks: 0.36, gear: 0.3, donation: 0.5, gift: 1 };
    const fan = D.seedFanatics, fanComm = fan.gross * 0.1;
    const rows = Object.keys(s).map((k) => ({ k, gross: s[k], team: s[k] * shares[k] }));
    const gross = rows.reduce((a, r) => a + r.gross, 0);
    const team = rows.reduce((a, r) => a + r.team, 0) + fanComm;
    const ordersCount = 236 + state.orders.length;
    const fees = gross * 0.029 + ordersCount * 0.3;
    const status = { popcorn: ["ok", "Active"], baja: ["wait", "Terms pending"], coffee: ["ok", "Active"], snacks: ["ok", "Active"], gear: ["wait", "Club approval pending"], donation: ["ok", "Active"], gift: ["ok", "Receipts sent"] };
    const seedOrders = [
      { id: "RP-1040", name: "Karen", player: "hawkins27", total: 69.9, team: 22.67, groups: ["baja", "popcorn"] },
      { id: "RP-1039", name: "Mike", player: "kodiak19", total: 55, team: 20.9, groups: ["snacks"] },
      { id: "RP-1038", name: "Dana", player: "damyon29", total: 43.95, team: 15.2, groups: ["coffee", "baja"] },
      { id: "RP-1037", name: "Luis", player: null, total: 25, team: 12.5, groups: ["donation"] },
    ];
    const recent = [...state.orders, ...seedOrders].slice(0, 8);
    app.innerHTML = `<div class="view"><section><div class="wrap">
      <div class="sec-head"><div><div class="eyebrow">Team manager view</div><h2>Organizer dashboard</h2><p class="muted small" style="margin:4px 0 0">What the team manager and treasurer would see. Sample numbers.</p></div>
      <button class="btn btn-ghost" id="exportBtn">Export payout report</button></div>
      <div class="kpis">
        <div class="kpi"><span>Gross sales</span><b class="num">${money0(gross)}</b><small class="muted xs">Store orders, excluding Fanatics</small></div>
        <div class="kpi"><span>Team earnings</span><b class="num" style="color:var(--green)">${money0(team)}</b><small class="muted xs">Includes ${money0(fanComm)} Fanatics commission</small></div>
        <div class="kpi"><span>Orders</span><b class="num">${ordersCount}</b><small class="muted xs">${state.team.supporters} supporters</small></div>
        <div class="kpi"><span>Avg order</span><b class="num">${money(gross / ordersCount)}</b><small class="muted xs">Goal ${money0(state.team.goal)}</small></div>
      </div>
    </div></section>
    <section style="padding-top:0"><div class="wrap two-col">
      <div class="panel"><h2 style="margin-bottom:10px">Sales by partner</h2><div class="table-wrap"><table>
        <thead><tr><th>Partner</th><th class="r">Gross</th><th class="r">Team share</th><th class="r">Owed to partner</th><th>Status</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${CAT_COLORS[r.k]};margin-right:8px"></i>${esc(supplierName(r.k))}</td><td class="r num">${money0(r.gross)}</td><td class="r num">${money0(r.team)}</td><td class="r num">${r.k === "gift" ? "None" : r.k === "donation" ? "Snack box cost" : money0(r.gross - r.team)}</td><td><span class="pill ${status[r.k][0]}">${status[r.k][1]}</span></td></tr>`).join("")}
        <tr><td>Fanatics (affiliate)</td><td class="r num">${money0(fan.gross)}</td><td class="r num">${money0(fanComm)}</td><td class="r muted">Paid by Fanatics</td><td><span class="pill">${fan.clicks} clicks · ${fan.orders} orders</span></td></tr></tbody>
      </table></div>
      <div class="split" style="margin-top:16px">${rows.map((r) => `<span style="width:${(r.gross / gross) * 100}%;background:${CAT_COLORS[r.k]}"></span>`).join("")}</div>
      <div class="legend">${rows.map((r) => `<span><i style="background:${CAT_COLORS[r.k]}"></i>${esc({ baja: "Baja Vida", gift: "Donations", donation: "Snack boxes" }[r.k] || r.k[0].toUpperCase() + r.k.slice(1))} ${Math.round((r.gross / gross) * 100)}%</span>`).join("")}</div>
      </div>
      <div class="panel"><h2 style="margin-bottom:10px">Payout estimate</h2>
        <div style="display:grid;gap:8px">
          <div class="row"><span>Team earnings</span><span class="num">${money(team)}</span></div>
          <div class="row"><span>Card processing (2.9% + 30¢)</span><span class="num">−${money(fees)}</span></div>
          <div class="row"><span>Shopify Basic, 1 month</span><span class="num">−${money(39)}</span></div>
          <div class="row total" style="border-top:1px solid var(--line);padding-top:8px"><span>Est. deposit to team account</span><span class="num" style="color:var(--green)">${money(team - fees - 39)}</span></div>
        </div>
        <p class="xs muted">Paid out after the campaign closes and partner invoices are settled. Fanatics commissions follow their affiliate payment schedule.</p>
      </div>
    </div></section>
    <section style="padding-top:0"><div class="wrap two-col">
      <div class="panel"><h2 style="margin-bottom:10px">Recent orders</h2><div class="table-wrap"><table>
        <thead><tr><th>Order</th><th>Buyer</th><th>Player</th><th>Ships from</th><th class="r">Total</th><th class="r">Team</th></tr></thead>
        <tbody>${recent.map((o) => `<tr${state.orders.includes(o) ? ' style="background:var(--green-soft)"' : ""}><td>${o.id}</td><td>${esc(o.name)}</td><td>${o.player ? esc(playerById(o.player).name) : "Team fund"}</td><td class="xs">${o.groups.map((g) => esc(supplierName(g))).join(", ")}</td><td class="r num">${money(o.total)}</td><td class="r num">${money(o.team)}</td></tr>`).join("")}</tbody>
      </table></div></div>
      <div class="panel"><h2 style="margin-bottom:8px">Player standings</h2>${leaderboardHTML(12)}</div>
    </div></section></div>`;
    $("#exportBtn").onclick = () => openInfo("Payout report", "In the live version this downloads a CSV for the treasurer with every order, the player it was credited to, and the amount owed to each partner. It is disabled in this demo.");
  }

  /* ---------- drawer ---------- */
  function renderDrawer() {
    const dr = $("#drawer");
    const t = totals();
    const groups = groupCart();
    const left = Math.max(0, FREE_SHIP - t.sub);
    dr.innerHTML = `<div class="drawer-head"><h2>Your cart</h2><button class="x" id="closeDrawer" aria-label="Close cart">&times;</button></div>
      <div class="drawer-body">${!state.cart.length ? `<div class="empty"><svg width="56" height="56" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><p><b>Your cart is empty</b></p><p class="small">Jerky, popcorn and coffee are the team's best sellers.</p><button class="btn btn-primary" data-go="shop" id="emptyShop">Start shopping</button></div>` : `
        ${state.player ? `<div class="ship-meter" style="background:var(--green-soft);margin-bottom:12px">Credited to <b>${esc(playerById(state.player).name)}</b></div>` : ""}
        ${Object.entries(groups).map(([s, lines]) => `<div class="group"><div class="group-h"><span>Ships from ${esc(supplierName(s))}</span><span class="ship">${noShip(s) ? "No shipping" : esc(D.suppliers[s].ship.replace(/^Ships from /, ""))}</span></div>
          ${lines.map((l) => { const p = prod(l.id); return `<div class="line">${p.img ? `<img src="${p.img}" alt="">` : `<span class="dimg">$${p.price}</span>`}
            <div><h4>${esc(p.name)}</h4>${l.opt ? `<div class="xs muted">${esc(l.opt)}</div>` : ""}<div class="qty"><button aria-label="Decrease" data-q="${l.key}" data-d="-1">−</button><span class="num">${l.qty}</span><button aria-label="Increase" data-q="${l.key}" data-d="1">+</button></div></div>
            <div style="text-align:right"><div class="num"><b>${money(p.price * l.qty)}</b></div><div class="xs" style="color:var(--green)">+${money(p.price * l.qty * p.share)} team</div></div></div>`; }).join("")}</div>`).join("")}
        <div class="ship-meter">${left > 0 ? `Add <b>${money(left)}</b> for free shipping.` : `<b>Free shipping unlocked.</b>`}<div class="bar"><span style="width:${Math.min(100, (t.sub / FREE_SHIP) * 100)}%"></span></div></div>`}
      </div>
      ${state.cart.length ? `<div class="drawer-foot">
        <div class="row"><span>Subtotal</span><span class="num">${money(t.sub)}</span></div>
        <div class="row"><span>Shipping (one flat fee)</span><span class="num">${t.ship ? money(t.ship) : "Free"}</span></div>
        <div class="row total"><span>Total</span><span class="num">${money(t.total)}</span></div>
        <div class="row team"><span>Team keeps</span><span class="num">${money(t.team)}</span></div>
        <button class="btn btn-primary btn-block" id="toCheckout">Checkout</button></div>` : ""}`;
    $("#closeDrawer").onclick = closeDrawer;
    const es = $("#emptyShop"); if (es) es.addEventListener("click", closeDrawer);
    dr.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => {
      const l = state.cart.find((x) => x.key === b.dataset.q);
      l.qty += +b.dataset.d; if (l.qty <= 0) state.cart = state.cart.filter((x) => x !== l);
      updateCartBadge(false); renderDrawer();
    }));
    const tc = $("#toCheckout"); if (tc) tc.onclick = () => { closeDrawer(); go("checkout"); };
  }
  function openDrawer() {
    renderDrawer();
    const s = $("#scrim"); s.hidden = false; requestAnimationFrame(() => s.classList.add("show"));
    $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false");
    setTimeout(() => $("#closeDrawer").focus(), 50);
  }
  function closeDrawer() {
    const s = $("#scrim"); s.classList.remove("show"); setTimeout(() => (s.hidden = true), 250);
    $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true");
  }
  $("#cartBtn").onclick = openDrawer;
  $("#scrim").onclick = () => { closeDrawer(); };

  /* ---------- modal ---------- */
  function openProduct(id) {
    const p = prod(id), sup = D.suppliers[p.cat];
    let opt = p.opts ? p.opts[0] : null, qty = 1;
    const m = $("#modal");
    m.innerHTML = `<div class="modal-card"><button class="x" id="mClose" aria-label="Close">&times;</button>
      <img src="${p.img}" alt="${esc(p.name)}">
      <div class="modal-info"><span class="supplier">${esc(sup.name)}</span><h2 id="mTitle">${esc(p.name)}</h2>
        <p class="muted" style="margin:0">${esc(p.desc)}</p>
        <div><span class="price num" style="font-size:1.6rem">${money(p.price)}</span> <span class="keeps">Team keeps ${money(p.price * p.share)} (${Math.round(p.share * 100)}%)</span></div>
        ${p.opts ? `<div><div class="small" style="font-weight:500;margin-bottom:6px">${p.cat === "gear" ? "Size" : "Grind"}</div><div class="opts">${p.opts.map((o, i) => `<button class="chip" aria-pressed="${i === 0}" data-o="${esc(o)}">${esc(o)}</button>`).join("")}</div></div>` : ""}
        ${p.pending ? `<div class="notice">Pending club approval. Orders in the live store open only after Dallas Stars Elite approves the final artwork in writing.</div>` : ""}
        <div class="small muted">${esc(sup.ship)}</div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:auto"><div class="qty"><button data-mq="-1" aria-label="Decrease">−</button><span class="num" id="mQty">1</span><button data-mq="1" aria-label="Increase">+</button></div>
        <button class="btn btn-primary" style="flex:1" id="mAdd">Add to cart</button></div>
      </div></div>`;
    m.setAttribute("aria-labelledby", "mTitle");
    m.hidden = false;
    m.querySelectorAll("[data-o]").forEach((b) => (b.onclick = () => { opt = b.dataset.o; m.querySelectorAll("[data-o]").forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
    m.querySelectorAll("[data-mq]").forEach((b) => (b.onclick = () => { qty = Math.max(1, qty + +b.dataset.mq); $("#mQty").textContent = qty; }));
    $("#mAdd").onclick = () => { addToCart(p.id, opt, qty); closeModal(); };
    $("#mClose").onclick = closeModal;
    m.onclick = (e) => { if (e.target === m) closeModal(); };
    setTimeout(() => $("#mAdd").focus(), 30);
  }
  function openInfo(title, body) {
    const m = $("#modal");
    m.innerHTML = `<div class="modal-card" style="grid-template-columns:1fr;max-width:460px"><button class="x" id="mClose" aria-label="Close">&times;</button><div class="modal-info"><h2 id="mTitle">${esc(title)}</h2><p class="muted" style="margin:0">${esc(body)}</p><button class="btn btn-primary" id="mOk">Got it</button></div></div>`;
    m.setAttribute("aria-labelledby", "mTitle"); m.hidden = false;
    $("#mClose").onclick = closeModal; $("#mOk").onclick = closeModal;
    m.onclick = (e) => { if (e.target === m) closeModal(); };
  }
  function closeModal() { $("#modal").hidden = true; $("#modal").innerHTML = ""; }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!$("#modal").hidden) closeModal(); else if ($("#drawer").classList.contains("open")) closeDrawer(); } });

  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = document.createElement("div"); c.className = "confetti";
    const cols = ["#006847", "#3ddc97", "#0b1d33", "#c9d7e3", "#a15c07"];
    for (let i = 0; i < 70; i++) { const s = document.createElement("i"); s.style.left = Math.random() * 100 + "%"; s.style.background = cols[i % cols.length]; s.style.animationDelay = Math.random() * 0.6 + "s"; s.style.animationDuration = 1.8 + Math.random() * 1.4 + "s"; c.appendChild(s); }
    document.body.appendChild(c); setTimeout(() => c.remove(), 4000);
  }

  /* ---------- render ---------- */
  function render() {
    setNav(); renderCredit();
    const v = state.view;
    if (v === "home") viewHome();
    else if (v === "shop") viewShop();
    else if (v === "players") viewPlayers();
    else if (v === "player") viewPlayer(state.param);
    else if (v === "checkout") viewCheckout();
    else if (v === "confirm") viewConfirm(state.param);
    else if (v === "admin") viewAdmin();
  }
  render();
  setInterval(() => { if (state.view === "home") { const c = app.querySelector(".countdown"); if (c) c.outerHTML = countdownHTML(); } }, 30000);
})();
