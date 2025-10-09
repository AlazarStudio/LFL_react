import React from 'react';
import { Outlet } from 'react-router-dom';

import Header from '../../Blocks/Header/Header';
import Footer from '../../Blocks/Footer/Footer';

function Layout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1, padding: '0' }}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default Layout;
