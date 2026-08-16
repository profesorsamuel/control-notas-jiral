@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');

:root {
  --paper: #f7f4ec;
  --ink: #1e2536;
  --ink-soft: #4a5266;
  --ciencias: #3f7d58;
  --ciencias-dark: #2e5c40;
  --informatica: #2c5f8a;
  --informatica-dark: #204864;
  --coral: #e2603f;
  --muted: #8b8578;
  --card-bg: #fffdf8;
  --line: #ded7c4;
  --radius: 6px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: 'Inter', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.portal-wrap {
  max-width: 980px;
  margin: 0 auto;
  padding: 48px 24px 96px;
}

/* ---------- Encabezado ---------- */
.portal-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  border-bottom: 2px solid var(--ink);
  padding-bottom: 20px;
  margin-bottom: 40px;
  flex-wrap: wrap;
}

.portal-header .eyebrow {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 6px;
}

.portal-header h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(28px, 4vw, 40px);
  margin: 0;
  line-height: 1.05;
}

.portal-header a.volver-index {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13px;
  color: var(--ink-soft);
  text-decoration: none;
  border: 1px solid var(--line);
  padding: 8px 14px;
  border-radius: var(--radius);
  white-space: nowrap;
}
.portal-header a.volver-index:hover { border-color: var(--ink); color: var(--ink); }

/* ---------- Grupos por materia ---------- */
.materia-group { margin-bottom: 40px; }

.materia-group h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink-soft);
}

.materia-group h2::before {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--dot, var(--ciencias));
}
.materia-group[data-materia="Informática"] h2 { --dot: var(--informatica); }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 18px;
}

/* ---------- Tarjeta tipo "carpeta" ---------- */
.folder-card {
  position: relative;
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 22px 18px 18px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
  border-left: 5px solid var(--accent, var(--ciencias));
}

.folder-card:hover,
.folder-card:focus-visible {
  transform: translateY(-3px);
  box-shadow: 0 10px 24px -14px rgba(30, 37, 54, 0.35);
  border-color: var(--accent, var(--ciencias));
  outline: none;
}

.folder-card[data-materia="Informática"] { --accent: var(--informatica); }

.folder-card .tab {
  position: absolute;
  top: -11px;
  right: 16px;
  background: var(--accent, var(--ciencias));
  color: #fff;
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 600;
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 4px;
  letter-spacing: 0.03em;
}

.folder-card .materia-nombre {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 17px;
  font-weight: 600;
  margin: 6px 0 4px;
}

.folder-card .conteo {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--muted);
}

/* ---------- Vista de tareas de una clase ---------- */
.vista-tareas.oculto { display: none; }

#btn-volver {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13px;
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 8px 14px;
  cursor: pointer;
  color: var(--ink-soft);
  margin-bottom: 24px;
}
#btn-volver:hover { border-color: var(--ink); color: var(--ink); }

#vista-titulo {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 26px;
  margin: 0 0 24px;
}

.tarea-item {
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-left: 5px solid var(--accent, var(--ciencias));
  border-radius: var(--radius);
  padding: 18px 20px;
  margin-bottom: 14px;
}

.tarea-item h3 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 17px;
  margin: 0 0 6px;
}

.tarea-item p {
  margin: 0 0 12px;
  color: var(--ink-soft);
  font-size: 14.5px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.tarea-meta {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--muted);
}

.tarea-meta .entrega { color: var(--coral); font-weight: 600; }

.btn-descargar {
  display: inline-block;
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  color: #fff;
  background: var(--accent, var(--ciencias));
  padding: 8px 14px;
  border-radius: var(--radius);
}
.btn-descargar:hover { filter: brightness(1.08); }

.estado-vacio, .estado-cargando {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 13px;
  color: var(--muted);
  padding: 24px 0;
}

/* ---------- Responsive ---------- */
@media (max-width: 480px) {
  .portal-wrap { padding: 32px 16px 64px; }
  .grid { grid-template-columns: 1fr 1fr; }
}
