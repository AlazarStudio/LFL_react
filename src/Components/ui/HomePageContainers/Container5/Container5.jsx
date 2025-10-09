import React from 'react';
import classes from './Container5.module.css';

export default function Container5() {
  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        <div className={classes.title}>ОФИЦИАЛЬНЫЕ СПОНСОРЫ</div>
        <div className={classes.containerBlockArr}>
          <div className={classes.spon}>
            <img src="../images/spon11.png" />
          </div>
          <div className={classes.spon}>
            <img src="../images/spon22.png" />
          </div>
          <div className={classes.spon}>
            <img src="../images/spon33.png" />
          </div>
          <div className={classes.spon}>
            <img src="../images/spon44.png" />
          </div>
          <div className={classes.spon}>
            <img src="../images/spon55.png" />
          </div>
          <div className={classes.spon}>
            <img src="../images/spon66.png" />
          </div>
        </div>
      </div>
    </div>
  );
}
