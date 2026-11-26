(() => {
  "use strict";

  const MAX_DRAWS = 100_000;
  const POOL_SIZE = 60;
  const PICK = 6;
  const EXPECTED_RATE = PICK / POOL_SIZE;
  const THEORETICAL_MEAN_SUM = (PICK * (POOL_SIZE + 1)) / 2;
  const DRAWS_PER_PAGE = 25;

  const form = document.getElementById("sim-form");
  const drawCountInput = document.getElementById("draw-count");
  const simBtn = document.getElementById("sim-btn");
  const progressEl = document.getElementById("progress");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");
  const resultsEl = document.getElementById("results");
  const summaryLead = document.getElementById("summary-lead");
  const summaryGrid = document.getElementById("summary-grid");
  const ballGrid = document.getElementById("ball-grid");
  const barChart = document.getElementById("bar-chart");
  const hotcold = document.getElementById("hotcold");
  const statsBody = document.getElementById("stats-body");
  const neverSection = document.getElementById("never-section");
  const neverList = document.getElementById("never-list");
  const drawsList = document.getElementById("draws-list");
  const drawsPager = document.getElementById("draws-pager");
  const drawJump = document.getElementById("draw-jump");

  let running = false;
  let lastDraws = [];
  let drawsPage = 0;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function drawOnce() {
    const pool = Array.from({ length: POOL_SIZE }, (_, i) => i + 1);
    for (let i = 0; i < PICK; i++) {
      const j = i + Math.floor(Math.random() * (POOL_SIZE - i));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool.slice(0, PICK).sort((a, b) => a - b);
  }

  function createTracker() {
    return {
      frequency: new Array(POOL_SIZE + 1).fill(0),
      maxStreak: new Array(POOL_SIZE + 1).fill(0),
      currentStreak: new Array(POOL_SIZE + 1).fill(0),
      maxDrought: new Array(POOL_SIZE + 1).fill(0),
      currentDrought: new Array(POOL_SIZE + 1).fill(0),
      lastSeenAt: new Array(POOL_SIZE + 1).fill(-1),
      draws: [],
      evenTotal: 0,
      oddTotal: 0,
      lowTotal: 0,
      highTotal: 0,
      sumTotal: 0,
    };
  }

  function applyDraw(tracker, draw, drawIndex) {
    const present = new Uint8Array(POOL_SIZE + 1);
    let sum = 0;
    let even = 0;
    let odd = 0;
    let low = 0;
    let high = 0;

    tracker.draws.push(draw);

    for (const n of draw) {
      present[n] = 1;
      tracker.frequency[n] += 1;
      tracker.lastSeenAt[n] = drawIndex;
      sum += n;
      if (n % 2 === 0) even += 1;
      else odd += 1;
      if (n <= 30) low += 1;
      else high += 1;
    }

    tracker.sumTotal += sum;
    tracker.evenTotal += even;
    tracker.oddTotal += odd;
    tracker.lowTotal += low;
    tracker.highTotal += high;

    for (let n = 1; n <= POOL_SIZE; n++) {
      if (present[n]) {
        tracker.currentStreak[n] += 1;
        if (tracker.currentStreak[n] > tracker.maxStreak[n]) {
          tracker.maxStreak[n] = tracker.currentStreak[n];
        }
        tracker.currentDrought[n] = 0;
      } else {
        tracker.currentDrought[n] += 1;
        if (tracker.currentDrought[n] > tracker.maxDrought[n]) {
          tracker.maxDrought[n] = tracker.currentDrought[n];
        }
        tracker.currentStreak[n] = 0;
      }
    }
  }

  function findLeaders(rows, key) {
    const best = Math.max(...rows.map((r) => r[key]));
    const numbers = rows
      .filter((r) => r[key] === best)
      .map((r) => r.number)
      .sort((a, b) => a - b);
    return { value: best, numbers };
  }

  function formatNumberList(numbers) {
    if (numbers.length <= 3) {
      return numbers.map(pad2).join(", ");
    }
    return `${numbers.slice(0, 3).map(pad2).join(", ")}…`;
  }

  function buildStats(tracker, totalDraws) {
    const expected = totalDraws * EXPECTED_RATE;
    const rows = [];

    for (let n = 1; n <= POOL_SIZE; n++) {
      const freq = tracker.frequency[n];
      const lastSeen = tracker.lastSeenAt[n];
      const currentDrought =
        lastSeen < 0 ? totalDraws : totalDraws - 1 - lastSeen;

      rows.push({
        number: n,
        frequency: freq,
        percent: totalDraws === 0 ? 0 : (freq / totalDraws) * 100,
        expected,
        delta: freq - expected,
        maxStreak: tracker.maxStreak[n],
        maxDrought: tracker.maxDrought[n],
        currentDrought,
      });
    }

    rows.sort((a, b) => b.frequency - a.frequency || a.number - b.number);

    const neverDrawn = rows.filter((r) => r.frequency === 0).map((r) => r.number);
    const hot = rows.slice(0, 6);
    const cold = [...rows]
      .sort((a, b) => a.frequency - b.frequency || a.number - b.number)
      .slice(0, 6);

    return {
      rows,
      neverDrawn,
      hot,
      cold,
      avgEven: tracker.evenTotal / totalDraws,
      avgOdd: tracker.oddTotal / totalDraws,
      avgLow: tracker.lowTotal / totalDraws,
      avgHigh: tracker.highTotal / totalDraws,
      avgSum: tracker.sumTotal / totalDraws,
      expected,
      totalDraws,
      draws: tracker.draws,
      bestStreak: findLeaders(rows, "maxStreak"),
      bestDrought: findLeaders(rows, "maxDrought"),
    };
  }

  function formatInt(n) {
    return Math.round(n).toLocaleString("pt-BR");
  }

  function formatNum(n, digits = 1) {
    return n.toLocaleString("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function formatDelta(n) {
    const rounded = Math.round(n * 10) / 10;
    const sign = rounded > 0 ? "+" : "";
    return sign + formatNum(rounded, 1);
  }

  function setProgress(done, total) {
    const pct = total === 0 ? 0 : Math.min(100, (done / total) * 100);
    progressBar.style.width = `${pct}%`;
    progressText.textContent = `${formatInt(done)} / ${formatInt(total)} sorteios (${formatNum(pct, 0)}%)`;
  }

  function runSimulation(totalDraws) {
    return new Promise((resolve) => {
      const tracker = createTracker();
      const chunkSize =
        totalDraws <= 2_000 ? totalDraws : totalDraws <= 20_000 ? 2_000 : 5_000;
      let done = 0;

      function step() {
        const end = Math.min(done + chunkSize, totalDraws);
        for (let i = done; i < end; i++) {
          applyDraw(tracker, drawOnce(), i);
        }
        done = end;
        setProgress(done, totalDraws);

        if (done < totalDraws) {
          requestAnimationFrame(step);
        } else {
          resolve(buildStats(tracker, totalDraws));
        }
      }

      requestAnimationFrame(step);
    });
  }

  function renderSummary(stats) {
    summaryLead.textContent = `${formatInt(stats.totalDraws)} sorteios · expectativa por número: ${formatNum(stats.expected, 1)} aparições`;

    const streakNums = formatNumberList(stats.bestStreak.numbers);
    const droughtNums = formatNumberList(stats.bestDrought.numbers);

    const tiles = [
      {
        label: "Soma média",
        value: formatNum(stats.avgSum, 1),
        hint: `teórico ≈ ${formatNum(THEORETICAL_MEAN_SUM, 0)}`,
      },
      {
        label: "Pares / ímpar",
        value: `${formatNum(stats.avgEven, 2)} / ${formatNum(stats.avgOdd, 2)}`,
        hint: "média por sorteio",
      },
      {
        label: "Baixos / altos",
        value: `${formatNum(stats.avgLow, 2)} / ${formatNum(stats.avgHigh, 2)}`,
        hint: "1–30 vs 31–60",
      },
      {
        label: "Mais quente",
        value: pad2(stats.hot[0].number),
        hint: `${formatInt(stats.hot[0].frequency)} vezes`,
      },
      {
        label: "Mais frio",
        value: pad2(stats.cold[0].number),
        hint: `${formatInt(stats.cold[0].frequency)} vezes`,
      },
      {
        label: "Maior sequência",
        value: pad2(stats.bestStreak.numbers[0]),
        hint: `${formatInt(stats.bestStreak.value)} seguidos${
          stats.bestStreak.numbers.length > 1 ? ` · também ${streakNums}` : ""
        }`,
      },
      {
        label: "Maior seca",
        value: pad2(stats.bestDrought.numbers[0]),
        hint: `${formatInt(stats.bestDrought.value)} sem sair${
          stats.bestDrought.numbers.length > 1 ? ` · também ${droughtNums}` : ""
        }`,
      },
      {
        label: "Nunca saíram",
        value: formatInt(stats.neverDrawn.length),
        hint: stats.neverDrawn.length ? "veja a seção abaixo" : "todos apareceram",
      },
    ];

    summaryGrid.innerHTML = tiles
      .map(
        (t, i) => `
      <article class="stat-tile" style="animation-delay:${i * 40}ms">
        <span class="label">${t.label}</span>
        <span class="value">${t.value}</span>
        <span class="hint">${t.hint}</span>
      </article>`
      )
      .join("");
  }

  function heatColor(freq, min, max) {
    if (max === min) {
      return { bg: "#2ecc71", text: "#042014" };
    }
    const t = (freq - min) / (max - min);
    const r = Math.round(26 + t * (125 - 26));
    const g = Math.round(77 + t * (255 - 77));
    const b = Math.round(51 + t * (176 - 51));
    const text = t > 0.55 ? "#042014" : "#d8f5e4";
    return { bg: `rgb(${r}, ${g}, ${b})`, text };
  }

  function renderBallGrid(stats) {
    const freqs = stats.rows.map((r) => r.frequency);
    const min = Math.min(...freqs);
    const max = Math.max(...freqs);
    const byNumber = new Map(stats.rows.map((r) => [r.number, r]));

    const html = [];
    for (let n = 1; n <= POOL_SIZE; n++) {
      const row = byNumber.get(n);
      const { bg, text } = heatColor(row.frequency, min, max);
      const delay = ((n - 1) % 10) * 18 + Math.floor((n - 1) / 10) * 12;
      html.push(`
        <div class="ball" style="background:${bg};color:${text};animation-delay:${delay}ms" title="Número ${n}: ${row.frequency} vezes">
          ${pad2(n)}
          <span class="ball-count">${formatInt(row.frequency)}</span>
        </div>`);
    }
    ballGrid.innerHTML = html.join("");
  }

  function renderBarChart(stats) {
    const byNumber = new Map(stats.rows.map((r) => [r.number, r]));
    const max = Math.max(...stats.rows.map((r) => r.frequency), 1);

    const html = [];
    for (let n = 1; n <= POOL_SIZE; n++) {
      const row = byNumber.get(n);
      const height = Math.max(2, (row.frequency / max) * 100);
      html.push(`
        <div class="bar-col" title="Número ${pad2(n)}: ${formatInt(row.frequency)} vezes">
          <span class="bar-value">${formatInt(row.frequency)}</span>
          <div class="bar" style="height:${height}%"></div>
          <span class="bar-label">${pad2(n)}</span>
        </div>`);
    }
    barChart.innerHTML = html.join("");
  }

  function renderHotCold(stats) {
    const col = (title, list) => `
      <div class="hotcold-col">
        <h3>${title}</h3>
        ${list
          .map(
            (r) => `
          <div class="hotcold-row">
            <span class="mini-ball">${pad2(r.number)}</span>
            <div class="meta">${formatInt(r.frequency)} vezes<br /><span>${formatNum(r.percent, 2)}% dos sorteios</span></div>
          </div>`
          )
          .join("")}
      </div>`;

    hotcold.innerHTML = col("Quentes", stats.hot) + col("Frios", stats.cold);
  }

  function renderTable(stats) {
    statsBody.innerHTML = stats.rows
      .map((r, i) => {
        const deltaClass =
          r.delta > 0.5 ? "delta-pos" : r.delta < -0.5 ? "delta-neg" : "delta-zero";
        return `
        <tr style="animation-delay:${Math.min(i, 20) * 20}ms">
          <td class="pos">${i + 1}</td>
          <td class="num-cell">${pad2(r.number)}</td>
          <td>${formatInt(r.frequency)}</td>
          <td>${formatNum(r.percent, 2)}%</td>
          <td class="${deltaClass}">${formatDelta(r.delta)}</td>
          <td>${formatInt(r.maxStreak)}</td>
          <td>${formatInt(r.maxDrought)}</td>
          <td>${formatInt(r.currentDrought)}</td>
        </tr>`;
      })
      .join("");
  }

  function renderNever(stats) {
    if (!stats.neverDrawn.length) {
      neverSection.hidden = true;
      neverList.innerHTML = "";
      return;
    }
    neverSection.hidden = false;
    neverList.innerHTML = stats.neverDrawn
      .map((n) => `<span class="mini-ball">${pad2(n)}</span>`)
      .join("");
  }

  function totalPages() {
    return Math.max(1, Math.ceil(lastDraws.length / DRAWS_PER_PAGE));
  }

  function renderDrawsPage() {
    if (!lastDraws.length) {
      drawsList.innerHTML = "";
      drawsPager.innerHTML = "";
      return;
    }

    const pages = totalPages();
    drawsPage = Math.max(0, Math.min(drawsPage, pages - 1));
    const start = drawsPage * DRAWS_PER_PAGE;
    const end = Math.min(start + DRAWS_PER_PAGE, lastDraws.length);
    const slice = lastDraws.slice(start, end);

    drawsList.innerHTML = slice
      .map((draw, i) => {
        const index = start + i + 1;
        return `
        <article class="draw-row" style="animation-delay:${i * 18}ms">
          <div class="draw-index">Sorteio ${formatInt(index)}</div>
          <div class="draw-balls">
            ${draw.map((n) => `<span class="mini-ball">${pad2(n)}</span>`).join("")}
          </div>
        </article>`;
      })
      .join("");

    drawsPager.innerHTML = `
      <button type="button" class="btn-ghost" id="draws-prev" ${drawsPage === 0 ? "disabled" : ""}>Anterior</button>
      <span>${formatInt(start + 1)}–${formatInt(end)} de ${formatInt(lastDraws.length)}</span>
      <button type="button" class="btn-ghost" id="draws-next" ${drawsPage >= pages - 1 ? "disabled" : ""}>Próxima</button>
    `;

    document.getElementById("draws-prev").addEventListener("click", () => {
      drawsPage -= 1;
      renderDrawsPage();
    });
    document.getElementById("draws-next").addEventListener("click", () => {
      drawsPage += 1;
      renderDrawsPage();
    });

    drawJump.max = String(lastDraws.length);
    if (!drawJump.value) drawJump.value = "1";
  }

  function jumpToDraw(n) {
    if (!lastDraws.length) return;
    const index = Math.max(1, Math.min(lastDraws.length, Math.floor(n)));
    drawsPage = Math.floor((index - 1) / DRAWS_PER_PAGE);
    drawJump.value = String(index);
    renderDrawsPage();
    const rows = drawsList.querySelectorAll(".draw-row");
    const offset = (index - 1) % DRAWS_PER_PAGE;
    if (rows[offset]) {
      rows[offset].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function renderAll(stats) {
    lastDraws = stats.draws;
    drawsPage = 0;
    drawJump.value = "1";
    drawJump.max = String(Math.max(1, lastDraws.length));

    renderSummary(stats);
    renderBallGrid(stats);
    renderBarChart(stats);
    renderHotCold(stats);
    renderTable(stats);
    renderDrawsPage();
    renderNever(stats);
    resultsEl.hidden = false;
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  drawJump.addEventListener("change", () => {
    jumpToDraw(Number(drawJump.value) || 1);
  });
  drawJump.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      jumpToDraw(Number(drawJump.value) || 1);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (running) return;

    const raw = Number(drawCountInput.value);
    if (!Number.isFinite(raw) || raw < 1) {
      drawCountInput.focus();
      return;
    }
    const total = Math.min(MAX_DRAWS, Math.floor(raw));
    drawCountInput.value = String(total);

    running = true;
    simBtn.disabled = true;
    resultsEl.hidden = true;
    progressEl.hidden = false;
    setProgress(0, total);

    try {
      const stats = await runSimulation(total);
      renderAll(stats);
    } finally {
      running = false;
      simBtn.disabled = false;
      progressEl.hidden = true;
      progressBar.style.width = "0%";
    }
  });
})();
