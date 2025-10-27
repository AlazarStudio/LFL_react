import React from 'react';

export default function PosterCal({ posterRef, posterData }) {
  return (
    <div style={{ position: 'fixed', left: -99999, top: 0 }}>
      {posterData && (
        <div
          ref={posterRef}
          style={{
            width: 1080,
            // height: 1350,
            minHeight: 600,
            color: '#fff',
            fontFamily:
              '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif',
            backgroundImage: `url(/images/calBg.png)`,
            backgroundSize: 'cover', // на всю область (без полей)
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            display: 'flex',

            flexDirection: 'column',
            padding: '48px 40px',
            // paddingBottom: '100px',
            position: 'relative',
          }}
        >
          {/* header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <div>
              <div style={{ fontSize: 28, letterSpacing: '2px' }}>
                СЕЗОН {posterData.season}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 44,
                  fontWeight: 800,
                  lineHeight: 1,
                  marginTop: 20,
                  width: '100%',
                  whiteSpace: 'nowrap', // ⬅️ не переносить
                  //   overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                КАЛЕНДАРЬ МАТЧЕЙ
              </div>
              <div style={{ marginTop: 8, fontSize: 24 }}>
                {posterData.titleVenue} • {posterData.titleDay}
              </div>
            </div>
            <div style={{ fontWeight: 900, fontSize: 32, opacity: 0.85 }}>
              <img src="/images/calLogoMLF.svg" />
            </div>
          </div>

          {/* list */}
          <div
            style={{
              marginTop: 60,
              marginBottom: 60,
              display: 'grid',
              gap: 30,
            }}
          >
            {posterData.matches.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 220px 1fr',
                  alignItems: 'center',
                  background: '#2A0054',
                  height: '80px',
                  padding: '',
                  // borderRadius: 12,
                }}
              >
                {/* home */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {m.home.logo && (
                    <img
                      src={m.home.logo}
                      alt=""
                      style={{
                        width: 80,
                        height: 80,
                        objectFit: 'cover',
                        // borderRadius: 8,
                        background: '#fff',
                      }}
                    />
                  )}
                  <div style={{ fontSize: 28, fontWeight: 700 }}>
                    {m.home.name}
                  </div>
                </div>
                {/* time */}
                <div
                  style={{
                    placeSelf: 'center', // центр в колонке грида (и по X, и по Y)
                    display: 'flex', // центрируем содержимое внутри «пилюли»
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#ff158a',
                    height: 64, // фиксированная высота — проще центрировать
                    minWidth: 10, // чтобы не было узко и не переносило "2-0"
                    padding: '0 24px', // вертикальный паддинг 0 — без смещения по baseline
                    borderRadius: 10,
                    fontSize: 28,
                    fontWeight: 800,
                    lineHeight: 1, // чёткая вертикальная центровка текста
                    textAlign: 'center',
                    whiteSpace: 'nowrap', // запрет переноса "2-0" на столбик
                  }}
                >
                  {m.time}
                </div>
                {/* away */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      textAlign: 'right',
                    }}
                  >
                    {m.away.name}
                  </div>
                  {m.away.logo && (
                    <img
                      src={m.away.logo}
                      alt=""
                      style={{
                        width: 80,
                        height: 80,
                        objectFit: 'cover',
                        // borderRadius: 8,
                        background: '#fff',
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* footer (опционально логотипы партнёров) */}
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
      )}
    </div>
  );
}
