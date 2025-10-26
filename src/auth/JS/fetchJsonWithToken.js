import { fetchUtils } from 'react-admin';

import getToken from '../../../../getToken';

export const fetchJsonWithToken = async (url, options = {}) => {
  // console.log(url, options)
  if (!options.headers) {
    options.headers = new Headers({ Accept: 'application/json' });
  }
  options.headers.set('Authorization', `Bearer ${getToken}`);

  try {
    const response = await fetchUtils.fetchJson(url, options);
    return response;
  } catch (error) {
    console.error('Fetch error:', JSON.stringify(error));
    throw error;
  }
};
