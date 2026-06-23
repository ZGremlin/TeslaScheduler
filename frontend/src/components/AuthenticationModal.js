import React, { useState, useEffect, useRef } from 'react';

function AuthenticationModal({ onLogin, onClose }) {
  const [authUrl, setAuthUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [waitingForAuth, setWaitingForAuth] = useState(false);
  const [error, setError] = useState(null);
  const listenerRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    loadAuthUrl();
    return () => cleanup();
  }, []);

  const cleanup = () => {
    if (listenerRef.current) {
      window.removeEventListener('message', listenerRef.current);
      listenerRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const loadAuthUrl = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/url');
      const data = await response.json();
      setAuthUrl(data.authorization_url);
    } catch (err) {
      setError('Failed to get authorization URL: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    setError(null);
    setWaitingForAuth(true);

    const popup = window.open(authUrl, 'tesla_auth', 'width=600,height=800');

    const handleMessage = async (event) => {
      if (!event.data || !event.data.type) return;
      if (event.data.type !== 'tesla_auth_success' && event.data.type !== 'tesla_auth_error') return;

      cleanup();
      setWaitingForAuth(false);

      if (event.data.type === 'tesla_auth_success') {
        try {
          await onLogin();
        } catch (err) {
          setError(err.message);
        }
      } else {
        setError(event.data.error || 'Authentication failed');
      }
    };

    listenerRef.current = handleMessage;
    window.addEventListener('message', handleMessage);

    // If user closes popup without completing auth, stop the waiting state
    pollRef.current = setInterval(() => {
      if (popup && popup.closed) {
        cleanup();
        setWaitingForAuth(false);
      }
    }, 500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Tesla Account Authentication</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          <div className="auth-step">
            <h3>Connect Your Tesla Account</h3>
            <p>Click the button below to open Tesla's login page. Log in with your Tesla account credentials and authorize this application. The window will close automatically when complete.</p>

            {loading ? (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading authorization URL...</p>
              </div>
            ) : waitingForAuth ? (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Waiting for Tesla authorization...</p>
                <button
                  className="btn btn-secondary"
                  onClick={() => { cleanup(); setWaitingForAuth(false); }}
                  style={{ marginTop: '1rem' }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-large"
                onClick={handleConnect}
                disabled={!authUrl}
                style={{ width: '100%', marginTop: '1rem' }}
              >
                🔐 Connect Tesla Account
              </button>
            )}

            {!waitingForAuth && !loading && (
              <div className="info-box" style={{ marginTop: '1.5rem' }}>
                <strong>What happens next:</strong>
                <ul>
                  <li>A popup will open with Tesla's login page</li>
                  <li>Log in with your Tesla account credentials</li>
                  <li>Authorize this application when prompted</li>
                  <li>The popup closes automatically and you're done</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthenticationModal;
