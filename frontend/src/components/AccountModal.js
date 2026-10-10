import React, { useState, useEffect } from "react";
import * as api from "../services/api";

function AccountModal({ onClose, onSaved, onLogout, onReauthenticate }) {
	const [accessToken, setAccessToken] = useState("");
	const [refreshToken, setRefreshToken] = useState("");
	const [siteId, setSiteId] = useState("");
	const [siteName, setSiteName] = useState("");
	const [expiresAt, setExpiresAt] = useState(null);
	const [showTokens, setShowTokens] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		loadCredentials();
	}, []);

	const loadCredentials = async () => {
		try {
			setLoading(true);
			const response = await api.getCredentials();
			setAccessToken(response.data.access_token);
			setRefreshToken(response.data.refresh_token);
			setSiteId(response.data.site_id);
			setSiteName(response.data.site_name);
			setExpiresAt(response.data.expires_at);
			setError(null);
		} catch (err) {
			setError("Failed to load credentials: " + (err.response?.data?.error || err.message));
		} finally {
			setLoading(false);
		}
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		try {
			setSaving(true);
			setError(null);
			await api.updateCredentials({
				access_token: accessToken,
				refresh_token: refreshToken,
				site_id: siteId,
			});
			await onSaved();
		} catch (err) {
			setError("Failed to save credentials: " + (err.response?.data?.error || err.message));
		} finally {
			setSaving(false);
		}
	};

	const handleLogout = async () => {
		if (
			!window.confirm(
				"Log out of Tesla? Stored tokens will be removed and scheduled tasks will fail until you authenticate again.",
			)
		) {
			return;
		}

		try {
			setSaving(true);
			await api.logout();
			await onLogout();
		} catch (err) {
			setError("Failed to log out: " + (err.response?.data?.error || err.message));
			setSaving(false);
		}
	};

	const getExpiryDisplay = () => {
		if (!expiresAt) return "No token stored";
		const expiry = new Date(expiresAt).toLocaleString();
		return Date.now() < expiresAt ? `Expires ${expiry}` : `Expired ${expiry}`;
	};

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2>Tesla Account</h2>
					<button className="btn-close" onClick={onClose}>
						×
					</button>
				</div>

				{loading ? (
					<div className="modal-body">
						<div className="loading-container">
							<div className="loading-spinner"></div>
							<p>Loading credentials...</p>
						</div>
					</div>
				) : (
					<form onSubmit={handleSubmit}>
						<div className="modal-body">
							{error && <div className="alert alert-error">{error}</div>}

							<div className="form-group">
								<label htmlFor="access_token">Access Token</label>
								<input
									id="access_token"
									type={showTokens ? "text" : "password"}
									value={accessToken}
									onChange={(e) => setAccessToken(e.target.value)}
									autoComplete="off"
									spellCheck="false"
								/>
								<small>{getExpiryDisplay()}</small>
							</div>

							<div className="form-group">
								<label htmlFor="refresh_token">Refresh Token</label>
								<input
									id="refresh_token"
									type={showTokens ? "text" : "password"}
									value={refreshToken}
									onChange={(e) => setRefreshToken(e.target.value)}
									autoComplete="off"
									spellCheck="false"
								/>
								<small>Used to renew the access token automatically. Leave blank to keep the current one.</small>
							</div>

							<div className="form-group">
								<label className="checkbox-label">
									<input
										type="checkbox"
										checked={showTokens}
										onChange={(e) => setShowTokens(e.target.checked)}
									/>
									<span>Show tokens</span>
								</label>
							</div>

							<div className="form-group">
								<label htmlFor="site_id">Site ID</label>
								<input
									id="site_id"
									type="text"
									value={siteId}
									onChange={(e) => setSiteId(e.target.value)}
									autoComplete="off"
								/>
								<small>
									{siteName ? `Active site: ${siteName}. ` : ""}
									Entering another known site's ID switches to it; any other ID replaces this
									site's ID and moves its tasks with it.
								</small>
							</div>
						</div>

						<div className="modal-footer">
							<button
								type="button"
								className="btn btn-danger"
								onClick={handleLogout}
								disabled={saving || !accessToken}
							>
								🚪 Logout
							</button>
							<button
								type="button"
								className="btn btn-secondary"
								onClick={onReauthenticate}
								disabled={saving}
							>
								🔐 Re-authenticate
							</button>
							<button type="button" className="btn btn-secondary" onClick={onClose}>
								Cancel
							</button>
							<button type="submit" className="btn btn-primary" disabled={saving}>
								{saving ? "Saving..." : "Save Changes"}
							</button>
						</div>
					</form>
				)}
			</div>
		</div>
	);
}

export default AccountModal;
