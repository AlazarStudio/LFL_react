import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import serverConfig from '../../../../../serverConfig';
import './BracketTab.css';

const API = String(serverConfig || '');
const STAGE_ORDER = [
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTERFINAL',
  'SEMIFINAL',
  'FINAL',
  'THIRD_PLACE',
];
const STAGE_LABEL = {
  ROUND_OF_32: '1/16 финала',
  ROUND_OF_16: '1/8 финала',
  QUARTERFINAL: 'Четвертьфинал',
  SEMIFINAL: 'Полуфинал',
  FINAL: 'Финал',
  THIRD_PLACE: 'Матч за 3-е',
};

function teamTitle(tt) {
  return tt?.team?.title || `Команда #${tt?.teamId ?? tt?.id ?? '—'}`;
}
function tieTitle(t) {
  const a = teamTitle(t.team1TT);
  const b = teamTitle(t.team2TT);
  return `${a} — ${b}`;
}

export default function BracketTab() {
  const { tournamentId } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [tournament, setTournament] = useState(null);
  const [ties, setTies] = useState([]);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [gen, setGen] = useState({
    mode: 'seed', // seed | random
    legs: 1, // 1/2/3
    includeThirdPlace: false,
    createMatches: true,
    startDate: '',
    reset: false,
  });

  async function loadTournament() {
    setError('');
    try {
      const res = await fetch(
        `${API}/tournaments/${tournamentId}?include=teams,rounds,ties`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTournament(data);
    } catch (e) {
      console.error(e);
      setError('Не удалось загрузить турнир');
    }
  }
  async function loadTies() {
    try {
      const res = await fetch(`${API}/tournaments/${tournamentId}/ties`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTies(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError('Не удалось загрузить пары');
    }
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([loadTournament(), loadTies()]).finally(() =>
      setLoading(false)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const byStage = useMemo(() => {
    const map = {};
    for (const s of STAGE_ORDER) map[s] = [];
    for (const t of ties) {
      const stage = t.round?.stage || 'UNKNOWN';
      if (!map[stage]) map[stage] = [];
      map[stage].push(t);
    }
    // стабильный порядок внутри стадии
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => a.id - b.id);
    });
    return map;
  }, [ties]);

  const presentStages = useMemo(() => {
    // показываем только реально имеющиеся стадии, в правильном порядке
    return STAGE_ORDER.filter((s) => (byStage[s] || []).length > 0);
  }, [byStage]);

  async function generateBracket(e) {
    e?.preventDefault?.();
    try {
      setLoading(true);
      setError('');
      const body = {
        mode: gen.mode,
        legs: Number(gen.legs) || 1,
        includeThirdPlace: Boolean(gen.includeThirdPlace),
        createMatches: Boolean(gen.createMatches),
        startDate: gen.startDate || null,
        reset: Boolean(gen.reset),
      };
      const res = await fetch(
        `${API}/tournaments/${tournamentId}/bracket/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const txt = await res.text();
      if (!res.ok) {
        console.error('generate error:', res.status, txt);
        throw new Error(JSON.parse(txt)?.error || 'Ошибка генерации');
      }
      await loadTies();
      setGenerateOpen(false);
    } catch (e2) {
      console.error(e2);
      setError(e2.message || 'Не удалось сгенерировать сетку');
    } finally {
      setLoading(false);
    }
  }

  async function exportDocx() {
    try {
      setLoading(true);
      setError('');
      const [
        {
          Document,
          Packer,
          Paragraph,
          HeadingLevel,
          Table,
          TableRow,
          TableCell,
          WidthType,
          AlignmentType,
          BorderStyle,
        },
        { saveAs },
      ] = await Promise.all([import('docx'), import('file-saver')]);

      const title = tournament?.title || `Турнир #${tournamentId}`;
      const now = new Date();

      // колонки = стадии, строки = количество пар стартовой стадии
      const firstStage = presentStages[0];
      const rowsCount = (byStage[firstStage] || []).length || 1;

      // шапка
      const headerRow = new TableRow({
        children: presentStages.map(
          (s) =>
            new TableCell({
              children: [
                new Paragraph({
                  text: STAGE_LABEL[s] || s,
                  heading: HeadingLevel.HEADING_3,
                }),
              ],
            })
        ),
      });

      // строки с парами (просто “пара №i” в каждой стадии — понятно и читабельно в docx)
      const bodyRows = [];
      for (let i = 0; i < rowsCount; i++) {
        const cells = presentStages.map((s) => {
          const tie = (byStage[s] || [])[i];
          const text = tie
            ? `${teamTitle(tie.team1TT)} — ${teamTitle(tie.team2TT)}`
            : '—';
          const win =
            tie?.winnerTTId &&
            (tie.winnerTTId === tie.team1TTId
              ? `Поб: ${teamTitle(tie.team1TT)}`
              : `Поб: ${teamTitle(tie.team2TT)}`);
          return new TableCell({
            children: [
              new Paragraph({ text, alignment: AlignmentType.LEFT }),
              ...(win ? [new Paragraph({ text: win })] : []),
            ],
          });
        });
        bodyRows.push(new TableRow({ children: cells }));
      }

      const table = new Table({
        rows: [headerRow, ...bodyRows],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 2, color: 'cccccc' },
          bottom: { style: BorderStyle.SINGLE, size: 2, color: 'cccccc' },
          left: { style: BorderStyle.SINGLE, size: 2, color: 'cccccc' },
          right: { style: BorderStyle.SINGLE, size: 2, color: 'cccccc' },
          insideHorizontal: {
            style: BorderStyle.SINGLE,
            size: 1,
            color: 'dddddd',
          },
          insideVertical: {
            style: BorderStyle.SINGLE,
            size: 1,
            color: 'dddddd',
          },
        },
      });

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                text: `${title} — Сетка плей-офф`,
                heading: HeadingLevel.TITLE,
              }),
              new Paragraph({
                text: `Экспорт: ${now.toLocaleString()}`,
              }),
              table,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${title.replace(/[\\/:*?"<>|]+/g, '_')}_bracket.docx`);
    } catch (e) {
      console.error(e);
      setError(
        'Не удалось экспортировать DOCX. Убедись, что установлены пакеты "docx" и "file-saver".'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bracket">
      <div className="bracket__toolbar">
        <div className="bracket__title">
          {tournament
            ? `${tournament.title}${
                tournament.season ? ' — ' + tournament.season : ''
              }`
            : 'Турнир'}
        </div>
        <div className="bracket__actions">
          <button
            className="btn"
            onClick={() => setGenerateOpen((v) => !v)}
            disabled={loading}
          >
            Сгенерировать сетку
          </button>
          <button
            className="btn btn--primary"
            onClick={exportDocx}
            disabled={loading || !presentStages.length}
          >
            Экспорт в DOCX
          </button>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      {generateOpen && (
        <form className="card bracket__gen" onSubmit={generateBracket}>
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
                <option value="seed">По посевам (seed)</option>
                <option value="random">Случайно</option>
                {/* explicit пары можно позже добавить в UI */}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Матчей в паре</span>
              <select
                className="input"
                value={gen.legs}
                onChange={(e) =>
                  setGen((s) => ({ ...s, legs: e.target.value }))
                }
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">Дата стартовых матчей</span>
              <input
                className="input"
                type="datetime-local"
                value={gen.startDate}
                onChange={(e) =>
                  setGen((s) => ({ ...s, startDate: e.target.value }))
                }
              />
            </label>
          </div>

          <div className="form__row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={gen.includeThirdPlace}
                onChange={(e) =>
                  setGen((s) => ({ ...s, includeThirdPlace: e.target.checked }))
                }
              />
              <span>Добавить матч за 3-е место</span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={gen.createMatches}
                onChange={(e) =>
                  setGen((s) => ({ ...s, createMatches: e.target.checked }))
                }
              />
              <span>Создавать матчи сразу</span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={gen.reset}
                onChange={(e) =>
                  setGen((s) => ({ ...s, reset: e.target.checked }))
                }
              />
              <span>Удалить старую сетку этих стадий</span>
            </label>
          </div>

          <div className="form__actions">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={loading}
            >
              Сгенерировать
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setGenerateOpen(false)}
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {/* Сетка */}
      <section className="card bracket__grid">
        {!presentStages.length && (
          <div className="muted">Сетка пока не создана</div>
        )}
        {!!presentStages.length && (
          <div
            className="bracket__columns"
            style={{
              gridTemplateColumns: `repeat(${presentStages.length}, minmax(220px, 1fr))`,
            }}
          >
            {presentStages.map((stage) => {
              const list = byStage[stage] || [];
              return (
                <div className="bracket__col" key={stage}>
                  <div className="bracket__col-title">
                    {STAGE_LABEL[stage] || stage}
                  </div>
                  {list.map((t) => {
                    const winner =
                      t.winnerTTId &&
                      (t.winnerTTId === t.team1TTId
                        ? 'team1'
                        : t.winnerTTId === t.team2TTId
                        ? 'team2'
                        : null);
                    return (
                      <div className="bracket__tie" key={t.id}>
                        <div
                          className={`bracket__team ${
                            winner === 'team1' ? 'win' : ''
                          }`}
                        >
                          {teamTitle(t.team1TT)}
                        </div>
                        <div
                          className={`bracket__team ${
                            winner === 'team2' ? 'win' : ''
                          }`}
                        >
                          {teamTitle(t.team2TT)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
