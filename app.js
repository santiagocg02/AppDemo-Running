// ====== Utilidades ======
const $ = (id) => document.getElementById(id);

const STORAGE_KEYS = {
  profile: "aca3_profile",
  workouts: "aca3_workouts"
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function fmtPace(minutesPerKm) {
  if (!isFinite(minutesPerKm)) return "—";
  const totalSeconds = Math.round(minutesPerKm * 60);
  const mm = Math.floor(totalSeconds / 60);
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss} min/km`;
}

function parseDate(d) {
  // d: yyyy-mm-dd
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function daysAgo(n) {
  const t = new Date();
  t.setDate(t.getDate() - n);
  t.setHours(0,0,0,0);
  return t;
}

// ====== Estado ======
let profile = loadJSON(STORAGE_KEYS.profile, null);
let workouts = loadJSON(STORAGE_KEYS.workouts, []); // {id, date, distance, time, hr, pace}
let chart = null;

// ====== KPI Cálculos ======
function computeKpis(list) {
  if (!list.length) {
    return { avgPace: null, improvement: null, freq7d: 0, risk: "—" };
  }

  // promedio ritmo
  const avgPace = list.reduce((acc, w) => acc + w.pace, 0) / list.length;

  // mejora estimada: comparar promedio de últimos 3 vs primeros 3
  const sorted = [...list].sort((a,b) => parseDate(a.date) - parseDate(b.date));
  const first = sorted.slice(0, Math.min(3, sorted.length));
  const last = sorted.slice(Math.max(0, sorted.length - 3));

  const firstAvg = first.reduce((a,w)=>a+w.pace,0) / first.length;
  const lastAvg  = last.reduce((a,w)=>a+w.pace,0) / last.length;

  // En pace, bajar es mejorar. Mejora % = (first-last)/first
  let improvement = null;
  if (isFinite(firstAvg) && isFinite(lastAvg) && firstAvg > 0) {
    improvement = ((firstAvg - lastAvg) / firstAvg) * 100;
  }

  // frecuencia últimos 7 días
  const cutoff = daysAgo(7);
  const freq7d = list.filter(w => parseDate(w.date) >= cutoff).length;

  // riesgo lesión (simple por carga): freq alta + distancia alta en 7d
  const km7d = list
    .filter(w => parseDate(w.date) >= cutoff)
    .reduce((a,w)=>a+w.distance,0);

  let risk = "Bajo";
  if (freq7d >= 5 || km7d >= 35) risk = "Alto";
  else if (freq7d >= 3 || km7d >= 20) risk = "Medio";

  return { avgPace, improvement, freq7d, risk };
}

// ====== Render ======
function renderProfile() {
  $("name").value = profile?.name ?? "";
  $("age").value = profile?.age ?? "";
  $("level").value = profile?.level ?? "Recreativo";

  $("profileMsg").textContent = profile
    ? `Perfil guardado: ${profile.name} (${profile.level})`
    : "Guarda tu perfil para iniciar el seguimiento.";
}

function renderTable() {
  const tbody = $("workoutTable");
  tbody.innerHTML = "";

  const sorted = [...workouts].sort((a,b)=> parseDate(b.date) - parseDate(a.date));
  for (const w of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${w.date}</td>
      <td>${w.distance.toFixed(2)}</td>
      <td>${w.time.toFixed(1)}</td>
      <td>${fmtPace(w.pace)}</td>
      <td>${w.hr ?? "—"}</td>
      <td><button class="btn ghost" data-del="${w.id}">Eliminar</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      workouts = workouts.filter(w => w.id !== id);
      saveJSON(STORAGE_KEYS.workouts, workouts);
      updateDashboard();
    });
  });
}

function renderKpis() {
  const { avgPace, improvement, freq7d, risk } = computeKpis(workouts);

  $("kpiPace").textContent = fmtPace(avgPace);
  $("kpiImprove").textContent = (improvement === null)
    ? "—"
    : `${improvement.toFixed(1)}%`;

  $("kpiFreq").textContent = String(freq7d);

  const pill = $("kpiRisk");
  pill.textContent = risk;

  // color por clase (sin depender de colores exactos en texto)
  pill.classList.remove("risk-ok","risk-warn","risk-bad");
  if (risk === "Bajo") pill.classList.add("risk-ok");
  if (risk === "Medio") pill.classList.add("risk-warn");
  if (risk === "Alto") pill.classList.add("risk-bad");
}

function renderChart() {
  const ctx = $("paceChart");

  const sorted = [...workouts].sort((a,b)=> parseDate(a.date) - parseDate(b.date));
  const labels = sorted.map(w => w.date);
  const data = sorted.map(w => Number(w.pace.toFixed(3)));

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Ritmo (min/km) - menor es mejor",
        data,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: {
        y: { ticks: { callback: (v) => v.toFixed(2) } }
      }
    }
  });
}

function updateDashboard() {
  renderProfile();
  renderTable();
  renderKpis();
  renderChart();
}

// ====== Eventos ======
$("profileForm").addEventListener("submit", (e) => {
  e.preventDefault();
  profile = {
    name: $("name").value.trim(),
    age: Number($("age").value),
    level: $("level").value
  };
  saveJSON(STORAGE_KEYS.profile, profile);
  $("profileMsg").textContent = "Perfil actualizado ✅";
  updateDashboard();
});

$("workoutForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const date = $("date").value;
  const distance = Number($("distance").value);
  const time = Number($("time").value);
  const hrRaw = $("hr").value.trim();
  const hr = hrRaw ? Number(hrRaw) : null;

  if (!date || !isFinite(distance) || !isFinite(time) || distance <= 0 || time <= 0) {
    $("workoutMsg").textContent = "Revisa los datos del entrenamiento.";
    return;
  }

  const pace = time / distance; // min/km

  workouts.push({
    id: crypto.randomUUID(),
    date,
    distance,
    time,
    hr,
    pace
  });

  saveJSON(STORAGE_KEYS.workouts, workouts);
  $("workoutMsg").textContent = "Entrenamiento guardado ✅";
  e.target.reset();

  updateDashboard();
});

$("btnExport").addEventListener("click", () => {
  if (!workouts.length) return;

  const headers = ["date","distance_km","time_min","pace_min_km","hr"];
  const rows = workouts.map(w => [
    w.date, w.distance, w.time, w.pace.toFixed(4), (w.hr ?? "")
  ]);

  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "entrenamientos_running.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("btnReset").addEventListener("click", () => {
  const ok = confirm("¿Borrar perfil y entrenamientos guardados en este navegador?");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEYS.profile);
  localStorage.removeItem(STORAGE_KEYS.workouts);
  profile = null;
  workouts = [];
  updateDashboard();
});

// clases extra para riesgo
const style = document.createElement("style");
style.textContent = `
  .risk-ok{ border-color: rgba(34,197,94,.45) !important; }
  .risk-warn{ border-color: rgba(245,158,11,.45) !important; }
  .risk-bad{ border-color: rgba(239,68,68,.45) !important; }
`;
document.head.appendChild(style);

// Init
updateDashboard();
