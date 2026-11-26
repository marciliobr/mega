(() => {
  "use strict";

  const MAX_DRAWS = 100_000;
  const POOL_SIZE = 60;
  const PICK = 6;
  const EXPECTED_RATE = PICK / POOL_SIZE; // 0.1
  const THEORETICAL_MEAN_SUM = (PICK * (POOL_SIZE + 1)) / 2; // 183

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
  const hotcold = document.getElementById("hotcold");
  const statsBody = document.getElementById("stats-body");
  const neverSection = document.getElementById("never-section");
  const neverList = document.getElementById("never-list");

  let running = false;

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
    const cold = [...rows].sort(
      (a, b) => a.frequency - b.frequency || a.number - b.number
    ).slice(0, 6);

    const avgEven = tracker.evenTotal / totalDraws;
    const avgOdd = tracker.oddTotal / totalDraws;
    const avgLow = tracker.lowTotal / totalDraws;
    const avgHigh = tracker.highTotal / totalDraws;
    const avgSum = tracker.sumTotal / totalDraws;

    return {
      rows,
      neverDrawn,
      hot,
      cold,
      avgEven,
      avgOdd,
      avgLow,
      avgHigh,
      avgSum,
      expected,
      totalDraws,
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
        value: String(stats.hot[0].number).padStart(2, "0"),
        hint: `${formatInt(stats.hot[0].frequency)} vezes`,
      },
      {
        label: "Mais frio",
        value: String(stats.cold[0].number).padStart(2, "0"),
        hint: `${formatInt(stats.cold[0].frequency)} vezes`,
      },
      {
        label: "Maior sequência",
        value: formatInt(Math.max(...stats.rows.map((r) => r.maxStreak))),
        hint: "sorteios seguidos com o mesmo nº",
      },
      {
        label: "Maior seca",
        value: formatInt(Math.max(...stats.rows.map((r) => r.maxDrought))),
        hint: "sorteios seguidos sem o nº",
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
    // cold dark green → hot bright mint
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
          ${String(n).padStart(2, "0")}
          <span class="ball-count">${formatInt(row.frequency)}</span>
        </div>`);
    }
    ballGrid.innerHTML = html.join("");
  }

  function renderHotCold(stats) {
    const col = (title, list) => `
      <div class="hotcold-col">
        <h3>${title}</h3>
        ${list
          .map(
            (r) => `
          <div class="hotcold-row">
            <span class="mini-ball">${String(r.number).padStart(2, "0")}</span>
            <div class="meta">${formatInt(r.frequency)} vezes<br /><span>${formatNum(r.percent, 2)}% dos sorteios</span></div>
          </div>`
          )
          .join("")}
      </div>`;

    hotcold.innerHTML =
      col("Quentes", stats.hot) + col("Frios", stats.cold);
  }

  function renderTable(stats) {
    statsBody.innerHTML = stats.rows
      .map((r, i) => {
        const deltaClass =
          r.delta > 0.5 ? "delta-pos" : r.delta < -0.5 ? "delta-neg" : "delta-zero";
        return `
        <tr style="animation-delay:${Math.min(i, 20) * 20}ms">
          <td class="pos">${i + 1}</td>
          <td class="num-cell">${String(r.number).padStart(2, "0")}</td>
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
      .map((n) => `<span class="mini-ball">${String(n).padStart(2, "0")}</span>`)
      .join("");
  }

  function renderAll(stats) {
    renderSummary(stats);
    renderBallGrid(stats);
    renderHotCold(stats);
    renderTable(stats);
    renderNever(stats);
    resultsEl.hidden = false;
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
