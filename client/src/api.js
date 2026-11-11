const BASE_URL = 'http://localhost:4000';

async function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error('Something went wrong. Try again.');
  }

  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }

  if (!res.ok) {
    throw new Error(body.error || 'Something went wrong. Try again.');
  }

  return body;
}

export function get(path) {
  return request(path, { method: 'GET' });
}

export function post(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}
