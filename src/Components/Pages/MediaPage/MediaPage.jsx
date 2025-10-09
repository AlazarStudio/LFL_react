import React from 'react';
import classes from './MediaPage.module.css';
import { images } from '../../../../bd';
import { useNavigate } from 'react-router-dom';

export default function MediaPage() {
  const navigate = useNavigate();

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        <div className={classes.containerBlockTitle}>АЛЬБОМЫ</div>
        <div className={classes.containerBlockAlbums}>
          {images.map((el) => (
            <div
              className={classes.card}
              key={el.id}
              onClick={() => navigate(`/media/${el.id}`)}
            >
              <img src={el.images[0]} />
              <div className={classes.cardInfo}>
                <span>{el.title}</span>
                <span>{el.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
