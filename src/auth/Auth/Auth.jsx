import axios from 'axios';
import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AuthContext } from '../../../../AuthContext';
import serverConfig from '../../../../serverConfig';

import styles from './Auth.module.css';

function Auth() {
  const [formData, setFormData] = useState({
    login: '',
    password: '',
  });
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      const response = await axios.post(
        `${serverConfig}/auth/login`,
        formData,
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const { token } = response.data;
      login(token);

      console.log('Успешная авторизация');
      navigate('/admin');
    } catch (err) {
      console.error('Ошибка авторизации:', err);
      setError('Неверный логин или пароль');
    }
  };

  return (
    <div className={styles.center_block}>
      <h1>Авторизация</h1>
      <form onSubmit={handleSubmit} className={styles.form_product}>
        <div className={styles.item}>
          <label htmlFor="login">Логин</label>
          <input
            type="text"
            name="login"
            id="login"
            value={formData.login}
            onChange={handleChange}
            required
            placeholder="Введите ваш логин"
          />
        </div>
        <div className={styles.item}>
          <label htmlFor="password">Пароль</label>
          <input
            type="password"
            name="password"
            id="password"
            value={formData.password}
            onChange={handleChange}
            required
            placeholder="Введите ваш пароль"
          />
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className={styles.submit_button}>
          Войти
        </button>
      </form>
    </div>
  );
}

export default Auth;
