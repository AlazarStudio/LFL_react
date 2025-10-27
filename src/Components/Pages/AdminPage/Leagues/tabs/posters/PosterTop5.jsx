import React from 'react';
import uploadsConfig from '../../../../../../uploadsConfig';

// абсолютный URL для файлов из API
const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');
const buildSrc = (p) =>
  !p ? '' : /^https?:\/\//i.test(p) ? p : `${ASSETS_BASE}${p}`;

export default function PosterTop5({ posterRef, posterData }) {
  if (!posterData) return null;

  const seasonText = posterData.season ?? ''; // или число

  // общий стиль для картинок
  const imgStyle = {
    width: 64,
    height: 64,
    objectFit: 'cover',
    background: '#222',
  };

  const onImgError = (e) => {
    // убираем битую картинку, чтобы не портить верстку при экспорте
    e.currentTarget.style.display = 'none';
  };

  return (
    <div
      ref={posterRef}
      style={{
        width: 1080,
        minHeight: 600,
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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ opacity: 0.9 }}>
          <div style={{ fontSize: 28, letterSpacing: 1.2 }}>
            {posterData.roundLabel}
          </div>
          <div style={{ fontSize: 28, letterSpacing: '2px' }}>
            СЕЗОН {seasonText}
          </div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 32, opacity: 0.85 }}>
          <img src="/images/calLogoMLF.svg" alt="" />
        </div>
      </div>

      <div
        style={{
          fontWeight: 900,
          fontSize: 56,
          marginTop: 24,
          letterSpacing: 1,
        }}
      >
        {posterData.title || 'ТОП-5 БОМБАРДИРОВ'}
      </div>

      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '72px 72px 1fr 110px 110px', // ➜ 2 колонки под картинки
          columnGap: 16,
          marginTop: 60,
          padding: '12px 16px',
          //   background: 'rgba(255,255,255,.08)',
          borderRadius: 12,
          fontSize: 18,
        }}
      >
        <div /> {/* логотип команды */}
        <div /> {/* фото игрока */}
        <div /> {/* фото игрока */}
        <div style={{ textAlign: 'right' }}>Голы</div>
        <div style={{ textAlign: 'right' }}>Игры</div>
      </div>

      {/* list */}
      <div style={{ marginBottom: 60, display: 'grid', gap: 30 }}>
        {posterData.rows.map((r, i) => (
          <div
            key={r.playerId ?? i}
            style={{
              display: 'grid',
              gridTemplateColumns: '72px 72px 1fr 110px 110px', // ➜ 2 колонки под картинки
              columnGap: 16,
              alignItems: 'center',
              padding: '0',
              paddingRight: '40px',
              background: '#2A0054',
              borderRadius: 12,
            }}
          >
            {/* 1) логотип команды */}
            <div>
              {r.teamLogo ? (
                <img
                  src={buildSrc(r.teamLogo)}
                  alt=""
                  style={{
                    ...imgStyle,
                    // borderRadius: 8,
                    objectFit: 'contain',
                    background: '#140032',
                  }}
                  crossOrigin="anonymous"
                  onError={onImgError}
                />
              ) : (
                <div style={{ ...imgStyle, borderRadius: 8 }} />
              )}
            </div>

            {/* 2) фото игрока */}
            <div>
              {r.photo ? (
                <img
                  src={buildSrc(r.photo)}
                  alt={r.name}
                  style={{ ...imgStyle, borderRadius: '50%' }}
                  crossOrigin="anonymous"
                  onError={onImgError}
                />
              ) : (
                <div style={{ ...imgStyle, borderRadius: '50%' }} />
              )}
            </div>

            {/* имя и команда */}
            <div style={{ fontSize: 22, fontWeight: 600 }}>{r.name}</div>

            {/* голы / игры */}
            <div style={{ fontSize: 28, fontWeight: 800, textAlign: 'right' }}>
              {r.goals}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, textAlign: 'right' }}>
              {r.games}
            </div>
          </div>
        ))}
      </div>

      {/* Sponsors */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '40px 90px',
          background: '#00000090',
          //   position: 'absolute',
          width: '100%',
          bottom: '0',
          left: '0',
        }}
      >
        <img src="/images/partnerHIC.png" style={{ height: '74px' }} />
        <img src="/images/partnerBAY.png" style={{ height: '42px' }} />
        <img src="/images/partnerAQUA.png" style={{ height: '62px' }} />
      </div>
    </div>
  );
}
