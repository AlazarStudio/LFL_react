// src/admin/Leagues/Tabs/posters/PosterTable.jsx
import React from 'react';

export default function PosterTable({ posterRef, posterData }) {
  if (!posterData) return null;
  const { season, rows } = posterData;

  return (
    <div style={{ position: 'fixed', left: -99999, top: 0, zIndex: -1 }}>
      <div
        ref={posterRef}
        style={{
          width: 1080,
          minHeight: 650,
          color: '#fff',
          fontFamily:
            '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif',
          backgroundImage: 'url(/images/calBg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 40px',
          position: 'relative',
        }}
      >
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 28, letterSpacing: '2px' }}>
              СЕЗОН {season}
            </div>
            <div
              style={{
                fontSize: 44,
                fontWeight: 800,
                lineHeight: 1,
                marginTop: 6,
                whiteSpace: 'nowrap',
              }}
            >
              ТУРНИРНАЯ ТАБЛИЦА
            </div>
          </div>
          <div style={{ fontWeight: 900, fontSize: 32, opacity: 0.85 }}>
            <img src="/images/calLogoMLF.svg" alt="" />
          </div>
        </div>

        {/* table header */}
        <div
          style={{
            marginTop: 60,
            display: 'grid',
            gridTemplateColumns: '60px 10px 360px 90px 120px 170px 100px',
            alignItems: 'center',
            padding: '12px 16px',
            background: '#00000060',
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          <div>#</div>
          <div></div>
          <div>Команда</div>
          <div style={{ textAlign: 'center' }}>Игры</div>
          <div style={{ textAlign: 'center' }}>В-Н-П</div>
          <div style={{ textAlign: 'center' }}>Голы</div>
          <div style={{ textAlign: 'center' }}>Очки</div>
        </div>

        {/* rows */}
        <div style={{ display: 'grid', gap: 0 }}>
          {rows.map((r, i) => (
            <div
              key={r.teamId}
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 80px 300px 80px 120px 170px 100px',
                alignItems: 'center',
                minHeight: 74,
                background: i % 2 ? '#2A0054' : '#3a0a6d',
                borderBottom: '1px solid #6a1ea3',
                padding: '4px 16px',
              }}
            >
              <div style={{ fontWeight: 700 }}>{i + 1}</div>

              {/* logo */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {r.logo ? (
                  <img
                    src={r.logo}
                    alt=""
                    style={{ width: 58, height: 58, background: '#fff' }}
                  />
                ) : null}
              </div>

              {/* name */}
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={r.title}
              >
                {r.title}
              </div>

              {/* played */}
              <div style={{ textAlign: 'center', fontSize: 20 }}>
                {r.played}
              </div>

              {/* W-D-L */}
              <div style={{ textAlign: 'center', fontSize: 20 }}>
                {r.w}-{r.d}-{r.l}
              </div>

              {/* goals + diff pill */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontSize: 20,
                  whiteSpace: 'nowrap', // ← запрет переносов
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    lineHeight: 1,
                    whiteSpace: 'nowrap', // ← и здесь на всякий случай
                  }}
                >
                  {r.gf}-{r.ga}
                </span>

                <span
                  style={{
                    background: '#ff158a',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontWeight: 600,
                    lineHeight: 1,
                    flex: '0 0 auto', // ← не сжимать «пилюлю»
                  }}
                >
                  {r.diff >= 0 ? `+${r.diff}` : r.diff}
                </span>
              </div>

              {/* points */}
              <div
                style={{ textAlign: 'center', fontSize: 22, fontWeight: 800 }}
              >
                {r.pts}
              </div>
            </div>
          ))}
        </div>

        {/* footer — партнёры */}
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '40px 90px',
            background: '#00000090',
            width: '100%',
          }}
        >
          <img src="/images/partnerHIC.png" style={{ height: 74 }} alt="" />
          <img src="/images/partnerBAY.png" style={{ height: 42 }} alt="" />
          <img src="/images/partnerAQUA.png" style={{ height: 62 }} alt="" />
        </div>
      </div>
    </div>
  );
}
