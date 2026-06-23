import React, { useState, useEffect, useRef } from "react";
import { getSites, switchSite } from "../services/api";

function SiteSwitcher({ onSiteChange }) {
	const [sites, setSites] = useState([]);
	const [activeSiteId, setActiveSiteId] = useState(null);
	const [isOpen, setIsOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const dropdownRef = useRef(null);

	useEffect(() => {
		fetchSites();

		// Close dropdown when clicking outside
		const handleClickOutside = (event) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
				setIsOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const fetchSites = async () => {
		try {
			const response = await getSites();
			setSites(response.data.sites);
			setActiveSiteId(response.data.active_site_id);
		} catch (error) {
			console.error("Failed to fetch sites:", error);
		}
	};

	const handleSwitchSite = async (siteId) => {
		if (siteId === activeSiteId) {
			setIsOpen(false);
			return;
		}

		setLoading(true);
		try {
			await switchSite(siteId);
			setActiveSiteId(siteId);
			setIsOpen(false);

			// Notify parent component to refresh tasks
			if (onSiteChange) {
				onSiteChange(siteId);
			}
		} catch (error) {
			console.error("Failed to switch site:", error);
			alert("Failed to switch site. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	const activeSite = sites.find((s) => s.site_id === activeSiteId);

	console.log("sites", sites);

	if (sites.length === 0) {
		return null; // No sites to display
	}

	if (sites.length === 1) {
		// Only one site, just display it (no dropdown needed)
		return (
			<div className="site-switcher-single">
				<span className="site-icon">🏠</span>
				<span className="site-name">{sites[0].site_name}</span>
			</div>
		);
	}

	return (
		<div className="site-switcher" ref={dropdownRef}>
			<button
				className="site-switcher-button"
				onClick={() => setIsOpen(!isOpen)}
				disabled={loading}
			>
				<span className="site-icon">🏠</span>
				<span className="site-name">{activeSite?.site_name || "Select Site"}</span>
				<span className="dropdown-arrow">{isOpen ? "▲" : "▼"}</span>
			</button>

			{isOpen && (
				<div className="site-switcher-dropdown">
					{sites.map((site) => (
						<button
							key={site.site_id}
							className={`site-option ${site.site_id === activeSiteId ? "active" : ""}`}
							onClick={() => handleSwitchSite(site.site_id)}
							disabled={loading}
						>
							<span className="site-option-icon">{site.site_id === activeSiteId ? "✓" : "🏠"}</span>
							<div className="site-option-info">
								<div className="site-option-name">{site.site_name}</div>
								<div className="site-option-id">ID: {site.site_id}</div>
							</div>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export default SiteSwitcher;
