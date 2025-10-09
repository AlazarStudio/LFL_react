import React, { useEffect, useState, useRef, useCallback } from 'react';

import { useNavigate, useLocation } from 'react-router-dom';
import classes from './Container2.module.css';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import serverConfig from '../../../serverConfig';
import uploadsConfig from '../../../uploadsConfig';

export default function Container2() {
  const [categories, setCategories] = useState([]);
  const [ais, setAis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('prices');

  /* Поиск ===================================*/
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredAis, setFilteredAis] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  const handleSearch = () => {
    const term = searchTerm.toLowerCase();

    const filtered = ais.filter((ai) => {
      const matchTerm =
        ai.title?.toLowerCase().includes(term) ||
        ai.descriptionSmall?.toLowerCase().includes(term) ||
        ai.advantages?.toLowerCase().includes(term) ||
        ai.flaws?.toLowerCase().includes(term) ||
        ai.use?.toLowerCase().includes(term) ||
        ai.process?.toLowerCase().includes(term) ||
        ai.advice?.toLowerCase().includes(term);

      const matchCategory =
        activeCategoryId === null || ai.categoryId === activeCategoryId;

      return matchTerm && matchCategory;
    });

    setFilteredAis(filtered);
    setPage(1);
  };

  /* Поиск ===================================*/

  const [selectedAi, setSelectedAi] = useState(null);

  const [page, setPage] = useState(1);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const perPage = isMobile ? 3 : 12;

  const colorMap = ['#3f00ff', '#3B00FF80', '#D155ED80'];

  const getColorById = (id) => {
    const index =
      Math.abs([...String(id)].reduce((acc, c) => acc + c.charCodeAt(0), 0)) %
      colorMap.length;
    return colorMap[index];
  };

  useEffect(() => {
    if (selectedAi) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [selectedAi]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resAis, resCategories] = await Promise.all([
          axios.get(`${serverConfig}/ais`),
          axios.get(`${serverConfig}/categories`),
        ]);
        setAis(resAis.data);
        setFilteredAis(resAis.data);
        setCategories(resCategories.data);
      } catch (err) {
        console.error('Ошибка при загрузке данных:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const { search } = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const aiTitle = params.get('ai');

    if (aiTitle && ais.length) {
      const found = ais.find((el) => el.title === aiTitle);
      if (found) setSelectedAi(found);
    }
  }, [ais, search]);

  const navigate = useNavigate();

  const handleOpen = (ai) => {
    setSelectedAi(ai);
    navigate(`?ai=${encodeURIComponent(ai.title)}`, { replace: true });
  };

  const handleClose = () => {
    setSelectedAi(null);
    navigate('', { replace: true });
  };

  const paginatedAis = filteredAis.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filteredAis.length / perPage);

  if (loading) return <div>Загрузка...</div>;
  if (!categories.length) return <div>Категории не найдены</div>;

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        <img src="../images/ai3.png" className={classes.water} />
        <div className={classes.containerBlockInput}>
          <input
            placeholder="Поиск AI-сервисов"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <button onClick={handleSearch}>
            <img src="../images/ai4.svg" />
          </button>
        </div>
        <div className={classes.containerBlockData}>
          <div className={classes.containerBlockDataCat}>
            <div
              className={`${classes.containerBlockDataCatEl} ${
                activeCategoryId === null ? classes.activeCat : ''
              }`}
              onClick={() => {
                setActiveCategoryId(null);
                setSearchTerm('');
                setFilteredAis(ais);
                setPage(1);
              }}
            >
              Все
            </div>

            {[...categories].reverse().map((cat) => (
              <div
                key={cat.id}
                className={`${classes.containerBlockDataCatEl} ${
                  activeCategoryId === cat.id ? classes.activeCat : ''
                }`}
                onClick={() => {
                  setActiveCategoryId(cat.id);
                  setSearchTerm('');
                  const filtered = ais.filter((ai) => ai.categoryId === cat.id);
                  setFilteredAis(filtered);
                  setPage(1);
                }}
              >
                {cat.title}
              </div>
            ))}
          </div>
          <div className={classes.containerBlockDataAi}>
            {paginatedAis.map((ai) => {
              const fixedColor = getColorById(ai.id);

              return (
                <div key={ai.id} className={classes.containerBlockDataAiEl}>
                  <img src={`${uploadsConfig}${ai.images[0]}`} />
                  <div
                    className={classes.containerBlockDataAiElBottom}
                    style={{ position: 'relative' }}
                  >
                    <div
                      className={classes.colorBlob}
                      style={{
                        backgroundColor: fixedColor,
                        top: '10px',
                        left: 'calc(50% - 70px)',
                      }}
                    />
                    <span style={{ zIndex: 1, position: 'relative' }}>
                      {ai.title}
                    </span>
                    <span style={{ zIndex: 1, position: 'relative' }}>
                      {ai.descriptionSmall}
                    </span>
                    <button onClick={() => handleOpen(ai)}>
                      <img src="../images/buy.svg" />
                      Купить
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className={classes.pagination}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className={page === i + 1 ? classes.activePage : ''}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
      {selectedAi && (
        <>
          <div className={classes.modalOverlay} onClick={handleClose} />

          <img
            src="/images/aiLogo.png"
            alt="logo"
            className={classes.modalLogo}
          />

          <div className={classes.modal}>
            <div className={classes.modalContent}>
              <button className={classes.modalClose} onClick={handleClose}>
                ✕
              </button>
              <div className={classes.modalContentTop}>
                <img src={`${uploadsConfig}${selectedAi.images[0]}`} />
                <div className={classes.modalContentTopRight}>
                  <span>{selectedAi.title}</span>
                  <span>{selectedAi.descriptionBig}</span>
                  <div className={classes.modalContentTopRightButtons}>
                    <button
                      className={`${classes.modalButton} ${
                        activeTab === 'details' ? classes.activeTab : ''
                      }`}
                      onClick={() => setActiveTab('details')}
                    >
                      <img src="../images/aiPodr.svg" />
                      Подробности
                    </button>

                    <button
                      className={`${classes.modalButton} ${
                        activeTab === 'prices' ? classes.activeTab : ''
                      }`}
                      onClick={() => setActiveTab('prices')}
                    >
                      <img src="../images/buy.svg" />
                      Тарифы
                    </button>
                  </div>
                </div>
              </div>
              {activeTab === 'details' && (
                <div className={classes.detailsBlock}>
                  <div className={classes.detailsBlockLeft}>
                    <div className={classes.detailsBlockEl}>
                      <span>Преимущества:</span>
                      <span>{selectedAi.advantages}</span>
                    </div>
                    <div className={classes.detailsBlockEl}>
                      <span>Недостатки:</span>
                      <span>{selectedAi.flaws}</span>
                    </div>{' '}
                    <div className={classes.detailsBlockEl}>
                      <span>Когда использовать:</span>
                      <span>{selectedAi.use}</span>
                    </div>
                  </div>
                  <div className={classes.detailsBlockRight}>
                    <div className={classes.detailsBlockEl}>
                      <span>Процесс использования</span>
                      <span>{selectedAi.process}</span>
                    </div>
                    <div className={classes.detailsBlockEl}>
                      <span>Советы по работе</span>
                      <span>{selectedAi.advice}</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'prices' && (
                <div className={classes.priceBlock}>
                  <div>
                    <span style={{ backgroundColor: '#8F6DFF' }}></span>
                    <span>STANDART</span>
                    <span>Пакет №1</span>
                    <span>{selectedAi.priceStandart} $/в месяц</span>
                  </div>
                  <div>
                    <span style={{ backgroundColor: '#0014F5' }}></span>
                    <span>PRO</span>
                    <span>Пакет №2</span>{' '}
                    <span>{selectedAi.pricePro} $/в месяц</span>
                  </div>
                  <div>
                    <span style={{ backgroundColor: '#D724FF' }}></span>
                    <span>PREMIUM</span>
                    <span>Пакет №3</span>{' '}
                    <span>{selectedAi.pricePremium} $/в месяц</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
