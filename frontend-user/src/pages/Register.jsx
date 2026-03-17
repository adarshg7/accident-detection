import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast, { Toaster } from 'react-hot-toast';

const Register = () => {
  const [form,    setForm]    = useState({ name: '', email: '', password: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async e => {
    e.preventDefault();
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const r = await api.post('/auth/user/register', form);
      toast.success('Account created!');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const ch = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg)' }}>
      <Toaster position="top-center" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' } }} />

      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Create Account</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Join the SafeRoute community</p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Full Name',     name: 'name',     type: 'text',     placeholder: 'Your name'      },
              { label: 'Email Address', name: 'email',    type: 'email',    placeholder: 'your@email.com' },
              { label: 'Phone Number',  name: 'phone',    type: 'tel',      placeholder: '+91 9876543210' },
              { label: 'Password',      name: 'password', type: 'password', placeholder: 'Min 8 characters' },
            ].map(f => (
              <div key={f.name}>
                <label className="label">{f.label}</label>
                <input className="input" {...f} value={form[f.name]} onChange={ch} required={f.name !== 'phone'} />
              </div>
            ))}

            <button type="submit" disabled={loading} className="btn btn-accent" style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 600, marginTop: 4 }}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--muted)' }}>
            Already have an account? <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Sign In</Link>
          </p>
        </div>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          By registering you agree to receive accident alerts and help notifications for your area.
        </p>
      </div>
    </div>
  );
};

export default Register;