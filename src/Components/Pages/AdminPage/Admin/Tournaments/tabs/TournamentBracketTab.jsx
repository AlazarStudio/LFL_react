import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import serverConfig from '../../../../../../serverConfig';

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
} from 'docx';

const API_TOURN = `${serverConfig}/tournaments`;
const API_ROUND = `${serverConfig}/tournament-rounds`;
const API_TIE = `${serverConfig}/tournament-ties`;

const STAGES = [
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTERFINAL',
  'SEMIFINAL',
  'FINAL',
  'THIRD_PLACE',
];

// ----------- utils -----------
const RU_STAGE = {
  ROUND_OF_32: '1/16 финала',
  ROUND_OF_16: '1/8 финала',
  QUARTERFINAL: '1/4 финала',
  SEMIFINAL: '1/2 финала',
  FINAL: 'Финал',
  THIRD_PLACE: 'Матч за 3-е место',
};

const DE_STAGE = {
  // оставил, если когда-то понадобится немецкий
  ROUND_OF_32: 'Sechzehntelfinale',
  ROUND_OF_16: 'Achtelfinale',
  QUARTERFINAL: 'Viertelfinale',
  SEMIFINAL: 'Halbfinale',
  FINAL: 'Finale',
  THIRD_PLACE: 'Spiel um Platz 3',
};

function stageTitle(code, dict = RU_STAGE) {
  return dict[code] || code || '';
}

async function jsonSafe(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return {};
  const txt = await res.text();
  if (!txt) return {};
  try {
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

// ---------- DOCX helpers ----------
function DocP(text, align = AlignmentType.LEFT, bold = false) {
  return new Paragraph({
    alignment: align,
    children: [new TextRun({ text: String(text ?? ''), bold })],
  });
}
function DocCell(text, { align = AlignmentType.LEFT, bold = false } = {}) {
  return new TableCell({
    children: [DocP(text, align, bold)],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
    },
  });
}

// ---------------- Component ----------------
export default function TournamentBracketTab({ tournamentId }) {
  const { tournamentId: tournamentIdParam } = useParams();
  const tid = String(tournamentId ?? tournamentIdParam ?? '').trim();
  const hasTid = !!tid;

  const [rounds, setRounds] = useState([]);
  const [ties, setTies] = useState([]);
  const [teams, setTeams] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const [gen, setGen] = useState({
    mode: 'seed',
    legs: 1,
    includeThirdPlace: false,
    createMatches: true,
    startDate: '',
    reset: false,
  });

  // ---------- data ----------
  async function loadAll() {
    if (!hasTid) throw new Error('Нет tournamentId');
    const [rRes, tRes, ttRes] = await Promise.all([
      fetch(`${API_TOURN}/${tid}/rounds`),
      fetch(`${API_TOURN}/${tid}/ties`),
      fetch(`${API_TOURN}/${tid}/teams`),
    ]);

    const [rJson, tJson, ttJson] = await Promise.all([
      jsonSafe(rRes),
      jsonSafe(tRes),
      jsonSafe(ttRes),
    ]);
    if (!rRes.ok) throw new Error(rJson?.error || `HTTP ${rRes.status}`);
    if (!tRes.ok) throw new Error(tJson?.error || `HTTP ${tRes.status}`);
    if (!ttRes.ok) throw new Error(ttJson?.error || `HTTP ${ttRes.status}`);

    setRounds(Array.isArray(rJson) ? rJson : rJson?.data ?? []);
    setTies(Array.isArray(tJson) ? tJson : tJson?.data ?? []);
    setTeams(Array.isArray(ttJson) ? ttJson : ttJson?.data ?? []);
  }

  useEffect(() => {
    (async () => {
      if (!hasTid) {
        setErr('Не передан tournamentId');
        return;
      }
      try {
        setLoading(true);
        setErr('');
        await loadAll();
      } catch (e) {
        console.error(e);
        setErr(e.message || 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [hasTid, tid]);

  const roundById = useMemo(() => {
    const m = {};
    for (const r of rounds) m[String(r.id)] = r;
    return m;
  }, [rounds]);

  const tiesByStage = useMemo(() => {
    const obj = {};
    for (const s of STAGES) obj[s] = [];
    for (const t of ties) {
      const st = roundById[String(t.roundId)]?.stage || 'UNKNOWN';
      if (!obj[st]) obj[st] = [];
      obj[st].push(t);
    }
    for (const k of Object.keys(obj)) obj[k].sort((a, b) => a.id - b.id);
    return obj;
  }, [ties, roundById]);

  const presentStages = useMemo(() => {
    const list = STAGES.filter((s) => tiesByStage[s] && tiesByStage[s].length);
    return list.length
      ? list
      : ['ROUND_OF_16', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL'].filter(
          (s) => tiesByStage[s]?.length || s
        );
  }, [tiesByStage]);

  // ---------- actions ----------
  async function createRound() {
    const stage = window.prompt('Стадия (например SEMIFINAL):', 'SEMIFINAL');
    if (!stage) return;
    try {
      const res = await fetch(`${API_TOURN}/${tid}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      const data = await jsonSafe(res);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadAll();
    } catch (e) {
      console.error(e);
      alert('Не удалось создать раунд');
    }
  }

  async function deleteRound(roundId) {
    if (!window.confirm('Удалить раунд?')) return;
    try {
      let res = await fetch(`${API_TOURN}/${tid}/rounds/${roundId}`, {
        method: 'DELETE',
      });
      if (!res.ok)
        res = await fetch(`${API_ROUND}/${roundId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadAll();
    } catch (e) {
      console.error(e);
      alert('Не удалось удалить раунд');
    }
  }

  async function recalcTie(tieId) {
    try {
      const res = await fetch(`${API_TIE}/${tieId}/recalc`, { method: 'POST' });
      const data = await jsonSafe(res);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadAll();
    } catch (e) {
      console.error(e);
      alert('Не удалось пересчитать пару');
    }
  }

  async function removeTie(tieId) {
    if (!window.confirm('Удалить пару?')) return;
    try {
      const res = await fetch(`${API_TIE}/${tieId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadAll();
    } catch (e) {
      console.error(e);
      alert('Не удалось удалить пару');
    }
  }

  async function generateBracket() {
    try {
      setLoading(true);
      setErr('');
      const res = await fetch(`${API_TOURN}/${tid}/bracket/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: gen.mode,
          legs: Number(gen.legs) || 1,
          includeThirdPlace: !!gen.includeThirdPlace,
          createMatches: !!gen.createMatches,
          startDate: gen.startDate
            ? new Date(gen.startDate).toISOString()
            : null,
          reset: !!gen.reset,
        }),
      });
      const data = await jsonSafe(res);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadAll();
      alert('Сетка сгенерирована');
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось сгенерировать сетку');
    } finally {
      setLoading(false);
    }
  }

  // ---------- Export TABLES to DOCX ----------
  async function exportTablesDocx() {
    try {
      setErr('');
      setLoading(true);
      const children = [];

      children.push(
        new Paragraph({
          text: `Турнир #${tid} — Сетка (таблицы)`,
          heading: HeadingLevel.HEADING_1,
        })
      );

      // Раунды
      children.push(
        new Paragraph({ text: 'Раунды', heading: HeadingLevel.HEADING_2 })
      );
      const roundsHeader = new TableRow({
        children: [
          DocCell('№', { align: AlignmentType.CENTER, bold: true }),
          DocCell('ID', { bold: true }),
          DocCell('Стадия', { bold: true }),
          DocCell('Номер', { bold: true }),
          DocCell('Дата', { bold: true }),
        ],
      });
      const roundRows = [roundsHeader];
      rounds.forEach((r, i) => {
        roundRows.push(
          new TableRow({
            children: [
              DocCell(i + 1, { align: AlignmentType.CENTER }),
              DocCell(`#${r.id}`),
              DocCell(stageTitle(r.stage)),
              DocCell(r.number ?? '—', { align: AlignmentType.CENTER }),
              DocCell(r.date ? new Date(r.date).toLocaleString() : '—'),
            ],
          })
        );
      });
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: roundRows,
        })
      );

      // Пары по стадиям
      children.push(
        new Paragraph({ text: 'Пары (ties)', heading: HeadingLevel.HEADING_2 })
      );
      for (const st of presentStages) {
        const list = tiesByStage[st] || [];
        if (!list.length) continue;

        children.push(
          new Paragraph({
            text: stageTitle(st),
            heading: HeadingLevel.HEADING_3,
          })
        );
        const head = new TableRow({
          children: [
            DocCell('№', { align: AlignmentType.CENTER, bold: true }),
            DocCell('ID', { bold: true }),
            DocCell('Команда 1', { bold: true }),
            DocCell('Команда 2', { bold: true }),
            DocCell('Игр', { align: AlignmentType.CENTER, bold: true }),
            DocCell('Победитель', { bold: true }),
            DocCell('Счёт (сумма)', {
              align: AlignmentType.CENTER,
              bold: true,
            }),
          ],
        });
        const rows = [head];

        list.forEach((t, i) => {
          const t1 =
            t.team1TT?.team?.title ?? (t.team1TTId ? `TT#${t.team1TTId}` : '—');
          const t2 =
            t.team2TT?.team?.title ?? (t.team2TTId ? `TT#${t.team2TTId}` : '—');
          const legs = t.legs ?? 1;
          const agg =
            t.aggregate &&
            Number.isFinite(t.aggregate.team1) &&
            Number.isFinite(t.aggregate.team2)
              ? `${t.aggregate.team1}–${t.aggregate.team2}`
              : '—';
          const winner = t.winnerTTId
            ? t.winnerTTId === t.team1TT?.id
              ? t1
              : t.winnerTTId === t.team2TT?.id
              ? t2
              : `TT#${t.winnerTTId}`
            : '—';

          rows.push(
            new TableRow({
              children: [
                DocCell(i + 1, { align: AlignmentType.CENTER }),
                DocCell(`#${t.id}`),
                DocCell(t1),
                DocCell(t2),
                DocCell(legs, { align: AlignmentType.CENTER }),
                DocCell(winner),
                DocCell(agg, { align: AlignmentType.CENTER }),
              ],
            })
          );
        });

        children.push(
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
        );
      }

      const doc = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tournament_${tid}_tables.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось экспортировать DOCX');
    } finally {
      setLoading(false);
    }
  }

  // ---------- Export BRACKET SCHEME (Canvas) ----------
  function drawBracketToCanvas() {
    // ---- layout constants ----
    const headerH = 30;
    const leftPad = 24,
      rightPad = 24,
      topPad = 40,
      bottomPad = 30;
    const colGap = 100;
    const boxW = 250;
    const scoreW = 32;
    const stripeW = 16;
    const rowH = 22;
    const boxH = rowH * 2 + 6;
    const baseGapY = 26;
    const connectorW = 24;
    const nextLeftInset = 6;

    const stages = presentStages.filter((s) => s !== 'THIRD_PLACE');
    const firstList = tiesByStage[stages[0]] || [];
    const matches0 =
      firstList.length || Math.max(1, Math.floor((teams.length || 2) / 2));

    const colW = boxW + scoreW + colGap;
    const width = leftPad + stages.length * colW + rightPad;
    const height =
      topPad +
      headerH +
      matches0 * boxH +
      (matches0 - 1) * baseGapY +
      bottomPad;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // bg
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.font = '14px Arial, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';

    // ЗАГОЛОВКИ СТАДИЙ — НА РУССКОМ
    ctx.fillStyle = '#f3f4f6';
    ctx.strokeStyle = '#cbd5e1';
    for (let c = 0; c < stages.length; c++) {
      const x = leftPad + c * colW;
      ctx.fillRect(x, topPad, boxW + scoreW, headerH - 8);
      ctx.strokeRect(x, topPad, boxW + scoreW, headerH - 8);
      ctx.fillStyle = '#111827';
      ctx.textAlign = 'center';
      ctx.fillText(
        stageTitle(stages[c], RU_STAGE), // ← тут RU_STAGE
        x + (boxW + scoreW) / 2,
        topPad + (headerH - 8) / 2
      );
      ctx.fillStyle = '#f3f4f6';
    }

    // координаты центров матчей по стадиям
    const centers = [];
    const yStart = topPad + headerH + 6;
    let y = yStart;
    const colCenters0 = [];
    for (let i = 0; i < matches0; i++) {
      colCenters0.push(y + boxH / 2);
      y += boxH + baseGapY;
    }
    centers.push(colCenters0);

    for (let s = 1; s < stages.length; s++) {
      const prev = centers[s - 1];
      const here = [];
      for (let i = 0; i < Math.ceil(prev.length / 2); i++) {
        const c1 = prev[2 * i],
          c2 = prev[2 * i + 1] ?? prev[2 * i];
        here.push((c1 + c2) / 2);
      }
      centers.push(here);
    }

    function drawMatchBox(x, cy, t1, t2, agg) {
      const yTop = cy - boxH / 2;
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.fillRect(x, yTop, boxW + scoreW, boxH);
      ctx.strokeRect(x, yTop, boxW + scoreW, boxH);

      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(x, yTop, stripeW, boxH);

      ctx.strokeStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(x, yTop + boxH / 2);
      ctx.lineTo(x + boxW + scoreW, yTop + boxH / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + boxW, yTop);
      ctx.lineTo(x + boxW, yTop + boxH);
      ctx.stroke();

      ctx.fillStyle = '#111827';
      ctx.textAlign = 'left';
      ctx.font = '13px Arial, "Segoe UI", sans-serif';
      const pad = 8;
      ctx.fillText(t1 || '', x + stripeW + pad, yTop + boxH / 4);
      ctx.fillText(t2 || '', x + stripeW + pad, yTop + (3 * boxH) / 4);

      if (agg) {
        ctx.textAlign = 'center';
        ctx.font = '13px Arial, "Segoe UI", sans-serif';
        ctx.fillText(agg, x + boxW + scoreW / 2, yTop + boxH / 2);
      }
    }

    for (let s = 0; s < stages.length; s++) {
      const list = tiesByStage[stages[s]] || [];
      const x = leftPad + s * colW;

      for (let i = 0; i < centers[s].length; i++) {
        const cy = centers[s][i];
        const t = list[i];

        const t1 =
          t?.team1TT?.team?.title ?? (t?.team1TTId ? `TT#${t.team1TTId}` : '');
        const t2 =
          t?.team2TT?.team?.title ?? (t?.team2TTId ? `TT#${t.team2TTId}` : '');
        const agg =
          t?.aggregate &&
          Number.isFinite(t.aggregate.team1) &&
          Number.isFinite(t.aggregate.team2)
            ? `${t.aggregate.team1}–${t.aggregate.team2}`
            : '';

        drawMatchBox(x, cy, t1, t2, agg);

        if (s < stages.length - 1) {
          ctx.strokeStyle = '#111827';
          ctx.lineWidth = 2;

          const yMid = cy;
          const xRight = x + boxW + scoreW;
          const xJoint = xRight + connectorW;

          ctx.beginPath();
          ctx.moveTo(xRight, yMid);
          ctx.lineTo(xJoint, yMid);
          ctx.stroke();

          if (i % 2 === 1) {
            const upper = centers[s][i - 1];
            const y1 = upper,
              y2 = cy;
            ctx.beginPath();
            ctx.moveTo(xJoint, y1);
            ctx.lineTo(xJoint, y2);
            ctx.stroke();

            const xNext = leftPad + (s + 1) * colW;
            ctx.beginPath();
            ctx.moveTo(xJoint, (y1 + y2) / 2);
            ctx.lineTo(xNext - nextLeftInset, (y1 + y2) / 2);
            ctx.stroke();
          }
        }
      }
    }

    return canvas;
  }

  // PNG
  async function exportBracketPng() {
    try {
      setErr('');
      setLoading(true);
      const canvas = drawBracketToCanvas();
      const blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 1)
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tournament_${tid}_bracket.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось экспортировать PNG');
    } finally {
      setLoading(false);
    }
  }

  // DOCX (схема как картинка)
  async function exportBracketDocx() {
    try {
      setErr('');
      setLoading(true);
      const canvas = drawBracketToCanvas();

      const blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 1)
      );
      const arrBuf = await blob.arrayBuffer();

      const img = new ImageRun({
        data: arrBuf,
        transformation: {
          width: Math.min(1200, canvas.width),
          height: Math.round(
            (canvas.height * Math.min(1200, canvas.width)) / canvas.width
          ),
        },
      });

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                text: `Турнир #${tid} — Сетка (схема)`,
                heading: HeadingLevel.HEADING_1,
              }),
              new Paragraph({ children: [img] }),
            ],
          },
        ],
      });

      const out = await Packer.toBlob(doc);
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tournament_${tid}_bracket_scheme.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось экспортировать схему');
    } finally {
      setLoading(false);
    }
  }

  // ---------- UI ----------
  if (!hasTid) {
    return (
      <section className="card">
        <h3>Генерация сетки</h3>
        <div className="muted">Выберите турнир — tournamentId отсутствует.</div>
      </section>
    );
  }

  return (
    <div className="grid onecol">
      <section className="card">
        <h3>Генерация сетки</h3>
        {err && <div className="alert alert--error">{err}</div>}
        <div className="form">
          <div className="form__row">
            <label className="field">
              <span className="field__label">Режим</span>
              <select
                className="input"
                value={gen.mode}
                onChange={(e) =>
                  setGen((s) => ({ ...s, mode: e.target.value }))
                }
              >
                <option value="seed">Seed</option>
                <option value="random">Random</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">Игр в паре (legs)</span>
              <input
                className="input"
                type="number"
                min={1}
                value={gen.legs}
                onChange={(e) =>
                  setGen((s) => ({ ...s, legs: e.target.value }))
                }
              />
            </label>
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={gen.includeThirdPlace}
                onChange={(e) =>
                  setGen((s) => ({ ...s, includeThirdPlace: e.target.checked }))
                }
              />
              <span>Матч за 3-е место</span>
            </label>
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={gen.createMatches}
                onChange={(e) =>
                  setGen((s) => ({ ...s, createMatches: e.target.checked }))
                }
              />
              <span>Сразу создать матчи</span>
            </label>
          </div>
          <div className="form__row">
            <label className="field">
              <span className="field__label">Дата для создаваемых матчей</span>
              <input
                className="input"
                type="datetime-local"
                value={gen.startDate}
                onChange={(e) =>
                  setGen((s) => ({ ...s, startDate: e.target.value }))
                }
              />
            </label>
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={gen.reset}
                onChange={(e) =>
                  setGen((s) => ({ ...s, reset: e.target.checked }))
                }
              />
              <span>Сначала очистить существующие</span>
            </label>
            <div className="form__actions" style={{ alignSelf: 'flex-end' }}>
              <button
                className="btn btn--primary"
                onClick={generateBracket}
                disabled={loading}
              >
                Сгенерировать
              </button>
              <button
                className="btn"
                onClick={exportTablesDocx}
                disabled={loading}
                style={{ marginLeft: 8 }}
              >
                Экспорт таблиц (DOCX)
              </button>
              <button
                className="btn"
                onClick={exportBracketDocx}
                disabled={loading}
                style={{ marginLeft: 8 }}
              >
                Экспорт схемы (DOCX)
              </button>
              <button
                className="btn"
                onClick={exportBracketPng}
                disabled={loading}
                style={{ marginLeft: 8 }}
              >
                Экспорт схемы (PNG)
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Раунды</h3>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <button className="btn" onClick={createRound}>
            + Добавить раунд
          </button>
        </div>
        <div className="table">
          <div className="table__head">
            <div>ID</div>
            <div>Стадия</div>
            <div>Номер</div>
            <div>Дата</div>
            <div>Действия</div>
          </div>
          <div className="table__body">
            {rounds.map((r) => (
              <div className="table__row" key={r.id}>
                <div>#{r.id}</div>
                <div>{r.stage}</div>
                <div>{r.number ?? '—'}</div>
                <div>{r.date ? new Date(r.date).toLocaleString() : '—'}</div>
                <div className="table__actions">
                  <button
                    className="btn "
                    onClick={() => deleteRound(r.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
            {rounds.length === 0 && (
              <div className="table__row muted">Нет раундов</div>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Пары (ties)</h3>
        {presentStages.map((stageKey) => {
          const list = tiesByStage[stageKey] || [];
          if (!list.length) return null;
          return (
            <div key={stageKey} style={{ marginBottom: 12 }}>
              <h4 style={{ margin: '8px 0' }}>{stageTitle(stageKey)}</h4>
              <div className="table">
                <div className="table__head">
                  <div>ID</div>
                  <div>Команда 1</div>
                  <div>Команда 2</div>
                  <div>Игр (legs)</div>
                  <div>Победитель</div>
                  <div>Действия</div>
                </div>
                <div className="table__body">
                  {list.map((t) => (
                    <div className="table__row" key={t.id}>
                      <div>#{t.id}</div>
                      <div>{t.team1TT?.team?.title || '—'}</div>
                      <div>{t.team2TT?.team?.title || '—'}</div>
                      <div>{t.legs}</div>
                      <div>
                        {t.winnerTTId
                          ? t.team1TT?.id === t.winnerTTId
                            ? t.team1TT?.team?.title
                            : t.team2TT?.team?.title
                          : '—'}
                      </div>
                      <div className="table__actions">
                        <button
                          className="btn "
                          onClick={() => recalcTie(t.id)}
                        >
                          Пересчитать
                        </button>
                        <button
                          className="btn "
                          onClick={() => removeTie(t.id)}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {presentStages.every((s) => (tiesByStage[s] || []).length === 0) && (
          <div className="muted">Нет пар</div>
        )}
      </section>

      {loading && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          Загрузка…
        </div>
      )}
    </div>
  );
}
