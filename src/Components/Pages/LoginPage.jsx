import React, { useContext, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../auth/AuthProvider'; // проверь относительный путь!
import serverConfig from '../../serverConfig'; // проверь путь!

export default function LoginPage() {
  const [loginVal, setLoginVal] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const { data } = await axios.post(
        `${serverConfig}/auth/login`,
        {
          login: loginVal,
          password,
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      // сервер должен вернуть { token }
      login(data.token);
      navigate('/admin', { replace: true });
    } catch (e) {
      setErr('Неверный логин или пароль');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: 360,
          padding: 24,
          border: '1px solid #eee',
          borderRadius: 12,
        }}
      >
        <h3>Вход</h3>
        <input
          placeholder="Логин"
          value={loginVal}
          onChange={(e) => setLoginVal(e.target.value)}
          style={{ width: '100%', margin: '8px 0', padding: 10 }}
        />
        <input
          placeholder="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', margin: '8px 0', padding: 10 }}
        />
        {err && <div style={{ color: '#d33', marginBottom: 8 }}>{err}</div>}
        <button type="submit" style={{ width: '100%', padding: 10 }}>
          Войти
        </button>
      </form>
    </div>
  );
}
