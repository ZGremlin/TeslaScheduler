import React, { useEffect, useState } from "react";
import * as api from "../../services/api";

const FIELDS = [
	{
		key: "readings_minutes",
		label: "Live readings",
		help: "site_info + live_status · 2 Tesla calls each",
	},
	{
		key: "energy_minutes",
		label: "Energy history",
		help: "Daily totals (calendar_history) · 1 call each",
	},
	{
		key: "backup_minutes",
		label: "Outage history",
		help: "Grid outages (calendar_history) · 1 call each",
	},
	{
		key: "weather_minutes",
		label: "Outdoor weather",
		help: "Open-Meteo, not Tesla · fetched only alongside a reading",
	},
	{
		key: "view_refresh_minutes",
		label: "Refresh while viewing",
		help: "Fetch a new reading when the dashboard is open and the latest is older than this · 0 = off",
	},
];

// Same formula as the backend: readings are 2 calls, history fetches 1 each
function estimate(values, siteCount) {
	const perDay = (minutes) => (minutes > 0 ? Math.ceil(1440 / minutes) : 0);
	return (
		(perDay(values.readings_minutes) * 2 +
			perDay(values.energy_minutes) +
			perDay(values.backup_minutes)) *
		siteCount
	);
}

function PollingSettings({ onSaved }) {
	const [config, setConfig] = useState(null);
	const [values, setValues] = useState(null);
	const [status, setStatus] = useState(null); // { tone, text }
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		api
			.getPollingSettings()
			.then((response) => {
				setConfig(response.data);
				setValues(response.data.settings);
			})
			.catch((err) =>
				setStatus({ tone: "critical", text: err.response?.data?.error || "Couldn't load polling settings" }),
			);
	}, []);

	if (!values) {
		return status ? <p className="polling-status tone-text-critical">{status.text}</p> : null;
	}

	const changed = Object.keys(values).some((key) => values[key] !== config.settings[key]);
	const invalidKey = FIELDS.find(({ key }) => {
		const { min, max } = config.limits[key];
		return !Number.isInteger(values[key]) || values[key] < min || values[key] > max;
	})?.key;

	const handleChange = (key, raw) => {
		setValues({ ...values, [key]: raw === "" ? NaN : Number(raw) });
		setStatus(null);
	};

	const handleSave = async () => {
		try {
			setSaving(true);
			const response = await api.savePollingSettings(values);
			setConfig(response.data);
			setValues(response.data.settings);
			setStatus({ tone: "good", text: "Saved — new intervals apply right away" });
			onSaved?.();
		} catch (err) {
			setStatus({ tone: "critical", text: err.response?.data?.error || "Couldn't save polling settings" });
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="polling-settings">
			<h4 className="widget-subheading">Polling frequency</h4>
			<div className="polling-grid">
				{FIELDS.map(({ key, label, help }) => {
					const { min, max } = config.limits[key];
					const disabled = key === "weather_minutes" && !config.weather_enabled;
					return (
						<label key={key} className={`polling-field ${invalidKey === key ? "invalid" : ""}`}>
							<span className="polling-label">{label}</span>
							<span className="polling-input">
								<span>every</span>
								<input
									type="number"
									min={min}
									max={max}
									step={1}
									value={Number.isNaN(values[key]) ? "" : values[key]}
									onChange={(event) => handleChange(key, event.target.value)}
									disabled={disabled}
								/>
								<span>min</span>
							</span>
							<span className="polling-help">
								{disabled ? "Set SITE_LATITUDE and SITE_LONGITUDE to enable" : help}
								{invalidKey === key && ` · must be ${min}–${max}`}
							</span>
						</label>
					);
				})}
			</div>

			<div className="polling-footer">
				<span className="polling-estimate">
					≈ <strong>{estimate(values, config.site_count).toLocaleString()}</strong> Tesla calls/day
					{config.site_count > 1 ? ` across ${config.site_count} sites` : ""} in the background, plus
					dashboard views
				</span>
				{status && <span className={`polling-status tone-text-${status.tone}`}>{status.text}</span>}
				<button
					className="btn btn-primary btn-small"
					onClick={handleSave}
					disabled={!changed || !!invalidKey || saving}
				>
					{saving ? "Saving…" : "Save polling"}
				</button>
			</div>
		</div>
	);
}

export default PollingSettings;
