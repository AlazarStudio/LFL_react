import React, { useEffect, useState, useCallback } from 'react';
import classes from './Header.module.css';
import { Link } from 'react-router-dom';

function Header() {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Закрытие по Esc + блокировка скролла подменю
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, close]);

  // Закрывать меню по клику на пункт
  const onNavClick = () => close();

  return (
    <header className={classes.header}>
      <div className={classes.inner}>
        {/* Десктоп-меню */}
        <nav className={classes.navDesktop}>
          <Link to="/" className={classes.brand} aria-label="На главную">
            <img src="/images/logoLFL.svg" alt="LFL" />
          </Link>
          <Link to="/about">О ЛИГЕ</Link>
          <Link to="/tournaments">ТУРНИРЫ</Link>
          <Link to="/participants">УЧАСТНИКИ</Link>
          <Link to="/news">НОВОСТИ</Link>
          <Link to="/media">МЕДИА</Link>
          {/* <a href="tel:7777777" className={classes.tel}>
            777777
          </a> */}
        </nav>
        <Link to="/" className={classes.brand1} aria-label="На главную">
          <img src="/images/logoLFL.svg" alt="LFL" />
        </Link>
        {/* Кнопка-бургер — видна только < 768px */}
        <button
          className={classes.menuBtn}
          onClick={toggle}
          aria-label="Открыть меню"
          aria-expanded={open}
          aria-controls="mobile-drawer"
        >
          <img src="../images/menuLFL.svg" />
        </button>
      </div>

      {/* Оверлей */}
      <div
        className={`${classes.overlay} ${open ? classes.overlayShow : ''}`}
        onClick={close}
      />

      {/* Мобильный выезжающий drawer справа */}
      <nav
        id="mobile-drawer"
        className={`${classes.drawer} ${open ? classes.drawerOpen : ''}`}
        role="dialog"
        aria-modal="true"
      >
        <div className={classes.drawerHeader}>
          <span className={classes.drawerTitle}>Меню</span>
          <button
            className={classes.closeBtn}
            onClick={close}
            aria-label="Закрыть меню"
          >
            ✕
          </button>
        </div>
        <ul className={classes.mobileList} onClick={onNavClick}>
          <li>
            <Link to="/about">О ЛИГЕ</Link>
          </li>
          <li>
            <Link to="/tournaments">ТУРНИРЫ</Link>
          </li>
          <li>
            <Link to="/participants">УЧАСТНИКИ</Link>
          </li>
          <li>
            <Link to="/news">НОВОСТИ</Link>
          </li>
          <li>
            <Link to="/media">МЕДИА</Link>
          </li>
          <li>
            {/* <a href="tel:7777777" className={classes.tel}>
              Позвонить: 777777
            </a> */}
          </li>
        </ul>
      </nav>
    </header>
  );
}

export default Header;
