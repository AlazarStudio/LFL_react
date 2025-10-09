import React from 'react';
import classes from './Footer.module.css';
import { Link } from 'react-router-dom';

function Footer({ children, ...props }) {
  return (
    <>
      <div className={classes.container}>
        <div className={classes.containerBlock}>
          <div className={classes.containerBlockTop}>
            <img
              src="../images/LFLlogoFooter.svg"
              className={classes.containerBlockTopLogo}
            />
            <div className={classes.containerBlockTopRight}>
              <img
                src="../images/Любительская футбольная лига.svg"
                className={classes.containerBlockTopTitle}
              />
              <span className={classes.containerBlockTopResp}>
                КАРАЧАЕВО-ЧЕРКЕССКОЙ РЕСПУБЛИКИ
              </span>
            </div>
          </div>
          <div className={classes.containerBlockCenter}>
            <Link to={'/about'}>О ЛИГЕ</Link>
            <Link to={'/tournaments'}>ТУРНИРЫ</Link>
            <Link to={'/participants'}>УЧАСТНИКИ</Link>
            <Link to={'/news'}>НОВОСТИ</Link>
            <Link to={'/media'}>МЕДИА</Link>
            {/* <a href="tel:7777777" className={classes.tel}>
              777777
            </a> */}
            <div className={classes.containerBlockCenterLink}>
              <Link to={''}>
                <img src="../images/nartBlackTg.svg" />
              </Link>
              <Link to={''}>
                <img src="../images/nartBlackVk.svg" />
              </Link>
              <Link to={''}>
                <img src="../images/nartBlackWa.svg" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Footer;
