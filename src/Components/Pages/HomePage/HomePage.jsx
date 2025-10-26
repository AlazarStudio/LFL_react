import React from 'react';
import classes from './HomePage.module.css';
import Container1 from '../../ui/HomePageContainers/Container1/Container1';
import Container2 from '../../ui/HomePageContainers/Container2/Container2';
import Container3 from '../../ui/HomePageContainers/Container3/Container3';
import Container4 from '../../ui/HomePageContainers/Container4/Container4';
import Container5 from '../../ui/HomePageContainers/Container5/Container5';

export default function HomePage() {
  return (
    <>
      <Container1 /> {/* Шапка на главной */}
      <Container2 /> {/* Результаты, Статистика, Турнирная таблица */}
      <Container3 /> {/* Новости */}
      <Container4 /> {/* Фото и Видео */}
      {/* <Container5 /> Спонсоры */}
    </>
  );
}
