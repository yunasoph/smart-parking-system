import React, { useEffect, useState, useCallback } from 'react';
import { get, post, patch } from '../api';
import { useAuth } from '../AuthContext';
import { formatTitleWord } from '../format';
import StatusBadge from '../components/StatusBadge';

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add staff form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formErr, setFormErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      setError('');
      const res = await get('/api/users');
      setUsers(res);
    } catch (err) {
      setError(err.message || 'Could not load user accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (adding) return;

    if (!name.trim()) {
      setFormErr('Enter the staff member name.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormErr('Enter a valid email address.');
      return;
    }
    if (!password || password.length < 8) {
      setFormErr('Temporary password must be at least 8 characters.');
      return;
    }

    setAdding(true);
    setFormErr('');
    try {
      await post('/api/users', {
        name: name.trim(),
        email: email.trim(),
        password
      });
      setName('');
      setEmail('');
      setPassword('');
      await loadUsers();
    } catch (err) {
      setFormErr(err.message || 'Could not add staff account.');
    } finally {
      setAdding(false);
    }
  };

  const handleToggleActive = async (u) => {
    if (togglingId) return;
    setTogglingId(u.id);
    setError('');
    try {
      await patch(`/api/users/${u.id}`, { active: !u.active });
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Could not update account status.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <>
      <header className="head">
        <div>
          <h1>Users</h1>
          <p className="sub">
            Manage gate operator accounts and view registered parkers.
          </p>
        </div>
      </header>

      <div className="stack-lg">
        <section className="card stack" aria-label="Add staff">
          <h2>Add staff</h2>
          <form
            className="row"
            style={{ alignItems: 'flex-end' }}
            onSubmit={handleAddStaff}
            noValidate
          >
            <div className="field" style={{ flex: '1 1 200px' }}>
              <label htmlFor="staff-name">Full name</label>
              <input
                id="staff-name"
                className="input"
                type="text"
                placeholder="Rohan Verma"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFormErr('');
                }}
              />
            </div>

            <div className="field" style={{ flex: '1 1 220px' }}>
              <label htmlFor="staff-email">Email</label>
              <input
                id="staff-email"
                className="input"
                type="email"
                placeholder="rohan@parksmart.test"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFormErr('');
                }}
              />
            </div>

            <div className="field" style={{ flex: '1 1 200px' }}>
              <label htmlFor="staff-pass">Temporary password</label>
              <input
                id="staff-pass"
                className="input"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFormErr('');
                }}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={adding}
            >
              {adding ? 'Adding…' : 'Add staff'}
            </button>
          </form>

          {formErr && (
            <div className="err" role="alert">
              {formErr}
            </div>
          )}
        </section>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <section className="card stack" aria-label="User accounts">
            <h2>All accounts</h2>
            {error && (
              <div className="err" role="alert">
                {error}
              </div>
            )}
            <div className="table-wrap">
              <table style={{ minWidth: '580px' }}>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = currentUser && currentUser.id === u.id;
                    return (
                      <tr key={u.id}>
                        <td>
                          <b>{u.name}</b>
                        </td>
                        <td className="mono">{u.email}</td>
                        <td>{formatTitleWord(u.role)}</td>
                        <td>
                          <StatusBadge
                            status={u.active ? 'Active' : 'Disabled'}
                          />
                        </td>
                        <td className="num">
                          <button
                            type="button"
                            className="btn"
                            style={{ minHeight: '34px', padding: '6px 12px' }}
                            disabled={isSelf || togglingId === u.id}
                            onClick={() => handleToggleActive(u)}
                          >
                            {u.active ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
