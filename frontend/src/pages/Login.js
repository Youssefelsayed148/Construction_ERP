import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setUser, setError } from '../store/slices/authSlice';
import { authApi, authService } from '../services/api';
import { useLocale } from '../hooks/useLocale';
import { HardHat, Eye, EyeOff } from 'lucide-react';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t, locale, setLocale } = useLocale();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const response = await authApi.login(email, password);
      if (response.success) {
        authService.setSession(response.data.token, response.data.user);
        dispatch(setUser(response.data.user));
        navigate('/dashboard');
      } else {
        setErrorMsg(response.error || 'Login failed');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Login failed');
      dispatch(setError(err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-base)',
      padding: '20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
      }}>
        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <HardHat size={48} style={{ color: 'var(--color-accent)', marginBottom: '16px' }} />
          <h1 style={{ fontSize: '1.6rem', color: 'var(--color-text-primary)', letterSpacing: '0.02em' }}>
            {t('common.appName')}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px', fontSize: '0.9rem' }}>
            {locale === 'ar' ? 'نظام إدارة مشاريع الإنشاءات' : 'Construction Project Management System'}
          </p>
        </div>

        {/* Level line signature */}
        <div className="level-line" />

        {/* Login card */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-surface-raised)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
        }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">
                {locale === 'ar' ? 'البريد الإلكتروني' : 'Email'}
              </label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                {locale === 'ar' ? 'كلمة المرور' : 'Password'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="········"
                  required
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', padding: '12px', fontSize: '15px', marginTop: '8px' }}
            >
              {loading ? (
                <span className="spinner" />
              ) : locale === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
            </button>
          </form>

          {/* Language toggle (bottom of card) */}
          <div style={{
            marginTop: '24px',
            textAlign: 'center',
            paddingTop: '16px',
            borderTop: '1px solid var(--color-surface-raised)',
          }}>
            <button
              onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
              style={{
                background: 'none',
                border: '1px solid var(--color-surface-raised)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                padding: '6px 16px',
                fontSize: '13px',
                transition: 'all var(--transition-fast)',
              }}
            >
              {locale === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
            {t('common.footer')}
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
