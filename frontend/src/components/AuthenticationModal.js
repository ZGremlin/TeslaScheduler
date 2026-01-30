import React, { useState, useEffect } from 'react';

function AuthenticationModal({ onLogin, onClose }) {
  const [authUrl, setAuthUrl] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1); // 1: Get URL, 2: Enter code

  useEffect(() => {
    loadAuthUrl();
  }, []);

  const loadAuthUrl = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/url');
      const data = await response.json();
      setAuthUrl(data.authorization_url);
      setLoading(false);
    } catch (err) {
      setError('Failed to get authorization URL: ' + err.message);
      setLoading(false);
    }
  };

  const handleOpenAuthUrl = () => {
    window.open(authUrl, '_blank', 'width=600,height=800');
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    
    if (!authCode) {
      setError('Authorization code is required');
      return;
    }

    setLoading(true);
    
    try {
      await onLogin(authCode);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

          {step === 1 && (
            <div className="auth-step">
              <h3>Step 1: Authorize Access</h3>
              <p>Click the button below to open Tesla's login page in a new window. Log in with your Tesla account and authorize this application.</p>
              
              {loading ? (
                <div className="loading-container">
                  <div className="loading-spinner"></div>
                  <p>Loading authorization URL...</p>
                </div>
              ) : (
                <button 
                  className="btn btn-primary btn-large" 
                  onClick={handleOpenAuthUrl}
                  disabled={!authUrl}
                  style={{ width: '100%', marginTop: '1rem' }}
                >
                  🔐 Open Tesla Login
                </button>
              )}

              <div className="info-box" style={{ marginTop: '1.5rem' }}>
                <strong>What happens next:</strong>
                <ul>
                  <li>A new window will open with Tesla's login page</li>
                  <li>Log in with your Tesla account credentials</li>
                  <li>After authorization, you'll see a blank page with a URL</li>
                  <li>Copy the authorization code from the URL</li>
                  <li>Return here to paste it</li>
                </ul>
              </div>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit}>
              <div className="auth-step">
                <h3>Step 2: Enter Authorization Code</h3>
                <p>After authorizing in the popup window, you'll be redirected to a page. Look at the URL - it will contain a "code=" parameter. Copy everything after "code=" and paste it below.</p>

                <div className="form-group">
                  <label htmlFor="auth_code">Authorization Code *</label>
                  <textarea
                    id="auth_code"
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    placeholder="Paste the authorization code from the URL here..."
                    rows="4"
                    required
                    disabled={loading}
                    style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                  />
                  <small>Example: The URL will look like https://auth.tesla.com/void/callback?code=YOUR_CODE_HERE&state=...</small>
                </div>

                <div className="info-box">
                  <strong>Having trouble?</strong>
                  <ul>
                    <li>Make sure you completed the login in the popup window</li>
                    <li>Look for "code=" in the URL bar after authorization</li>
                    <li>Copy only the code value, not "code=" or anything after "&"</li>
                    <li>If the popup closed, click "Back" below to try again</li>
                  </ul>
                </div>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setStep(1)}
                  disabled={loading}
                >
                  ← Back
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={loading || !authCode}
                >
                  {loading ? 'Completing Authentication...' : 'Complete Authentication'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthenticationModal;
