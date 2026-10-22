import React, { useCallback, useEffect, useState } from "react";
import * as api from "../services/api";
import { LineChart, ColumnChart, Gauge, Sparkline } from "./dashboard/Charts";
import UpcomingTasks from "./dashboard/UpcomingTasks";
import RecentLogs from "./dashboard/RecentLogs";
import WidgetGrid from "./dashboard/WidgetGrid";
import { useDashboardLayout } from "./dashboard/useDashboardLayout";

// Validated categorical slots (see --series-* in App.css); each entity keeps its color everywhere
const COLORS = {
	home: "var(--series-home)",
	solar: "var(--series-solar)",
	battery: "var(--series-battery)",
	grid: "var(--series-grid)",
};

const IDLE_THRESHOLD_W = 50;

const MODE_LABELS = {
	self_consumption: "Self-Powered",
	autonomous: "Time-Based Control",
	backup: "Backup Only",
};

const HISTORY_RANGES = [
	{ hours: 24, label: "24h" },
	{ hours: 72, label: "3d" },
	{ hours: 168, label: "7d" },
	{ hours: 720, label: "30d" },
];

const ENERGY_RANGES = [7, 14, 30];

// ---------- formatting ----------

const kW = (watts) => `${(watts / 1000).toFixed(2)} kW`;
const kWh = (wh, digits = 1) => `${(wh / 1000).toFixed(digits)} kWh`;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function formatDuration(hours) {
	if (!isFinite(hours) || hours < 0) return "—";
	if (hours >= 48) return `${Math.round(hours / 24)} days`;
	const h = Math.floor(hours);
	const m = Math.round((hours - h) * 60);
	return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatAgo(ms) {
	const minutes = Math.round((Date.now() - ms) / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	return `${Math.round(minutes / 60)} h ago`;
}

function batteryColor(percentage) {
	if (percentage >= 50) return "var(--success)";
	if (percentage >= 25) return "var(--warning)";
	return "var(--error)";
}

// ---------- small building blocks ----------

function Widget({ title, className = "", actions, children }) {
	return (
		<section className={`widget ${className}`}>
			<div className="widget-header">
				<h3>{title}</h3>
				{actions}
			</div>
			{children}
		</section>
	);
}

function Segmented({ options, value, onChange, label }) {
	return (
		<div className="segmented" role="group" aria-label={label}>
			{options.map((option) => (
				<button
					key={option.value}
					className={option.value === value ? "active" : ""}
					onClick={() => onChange(option.value)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

function Stat({ label, value, sub, swatch }) {
	return (
		<div className="stat">
			<div className="dash-stat-label">
				{swatch && <span className="chart-legend-swatch" style={{ background: swatch }} />}
				{label}
			</div>
			<div className="dash-stat-value">{value}</div>
			{sub && <div className="dash-stat-sub">{sub}</div>}
		</div>
	);
}

function StatusRow({ label, value, tone }) {
	// Status colors always come with an icon; neutral values carry no state
	const icons = { good: "✓", warning: "⚠", critical: "✗" };
	const icon = icons[tone];
	return (
		<div className="status-row">
			<span className="status-row-label">{label}</span>
			<span className={`status-pill tone-${tone || "neutral"}`}>
				{icon && <span aria-hidden="true">{icon} </span>}
				{value}
			</span>
		</div>
	);
}

function TableView({ columns, rows }) {
	return (
		<div className="chart-table">
			<table className="logs-table">
				<thead>
					<tr>
						{columns.map((c) => (
							<th key={c}>{c}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, i) => (
						<tr key={i}>
							{row.map((cell, j) => (
								<td key={j}>{cell}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function TableToggle({ showTable, onToggle }) {
	return (
		<button className="widget-link" onClick={onToggle}>
			{showTable ? "Chart" : "Table"}
		</button>
	);
}

// ---------- widgets ----------

function BatteryWidget({ current, nameplateEnergy }) {
	const pct = current.percentage_charged ?? 0;
	const reserve = current.backup_reserve_percent ?? 0;
	const power = current.battery_power ?? 0; // negative = charging

	// Newer firmware omits energy_left/total_pack_energy from live_status; estimate from nameplate
	const capacity = isNum(current.total_pack_energy) && current.total_pack_energy > 0
		? current.total_pack_energy
		: nameplateEnergy;
	const energyLeft = isNum(current.energy_left) && isNum(current.total_pack_energy)
		? current.energy_left
		: isNum(capacity)
			? (capacity * pct) / 100
			: null;

	let state = "Idle";
	let eta = null;
	if (power < -IDLE_THRESHOLD_W) {
		state = `Charging at ${kW(-power)}`;
		if (isNum(energyLeft) && isNum(capacity)) {
			eta = `Full in ${formatDuration((capacity - energyLeft) / -power)}`;
		}
	} else if (power > IDLE_THRESHOLD_W) {
		state = `Discharging at ${kW(power)}`;
		if (isNum(energyLeft) && isNum(capacity)) {
			const toReserve = energyLeft - (capacity * reserve) / 100;
			eta = toReserve > 0 ? `Reserve in ${formatDuration(toReserve / power)}` : "At backup reserve";
		}
	}

	const load = current.load_power ?? 0;
	const runtime = isNum(energyLeft) && load > IDLE_THRESHOLD_W ? energyLeft / load : null;

	return (
		<Widget title="Battery">
			<div className="battery-hero">
				<div className="battery-hero-value" style={{ color: batteryColor(pct) }}>
					{pct.toFixed(1)}
					<span>%</span>
				</div>
				<div className="battery-hero-state">{state}</div>
				{eta && <div className="battery-hero-eta">{eta}</div>}
			</div>

			<div className="battery-meter" aria-label={`Charge ${pct.toFixed(0)}%, reserve ${reserve}%`}>
				<div className="battery-meter-fill" style={{ width: `${pct}%`, background: batteryColor(pct) }} />
				<div className="battery-meter-reserve" style={{ left: `${reserve}%` }} title={`Backup reserve ${reserve}%`} />
			</div>
			<div className="battery-meter-labels">
				<span>0%</span>
				<span>Reserve {reserve}%</span>
				<span>100%</span>
			</div>

			<div className="stat-grid stat-grid-2">
				<Stat
					label="Stored"
					value={isNum(energyLeft) ? kWh(energyLeft) : "—"}
					sub={isNum(capacity) ? `of ${kWh(capacity)}` : null}
				/>
				<Stat
					label="Backup runtime"
					value={runtime ? formatDuration(runtime) : "—"}
					sub="at current home load"
				/>
			</div>
		</Widget>
	);
}

// Round a gauge's full scale up to the next 5 kW so it stays put between refreshes
const gaugeScale = (...watts) =>
	Math.max(5000, Math.ceil(Math.max(...watts.map((w) => Math.abs(w || 0))) / 5000) * 5000);

function direction(watts, positive, negative) {
	if (watts > IDLE_THRESHOLD_W) return positive;
	if (watts < -IDLE_THRESHOLD_W) return negative;
	return "Idle";
}

function StatusTile({ label, value, tone }) {
	const icons = { good: "✓", warning: "⚠", critical: "✗" };
	return (
		<div className="status-tile">
			<div className="dash-stat-label">{label}</div>
			<div className={`status-tile-value tone-text-${tone || "neutral"}`}>
				{icons[tone] && <span aria-hidden="true">{icons[tone]} </span>}
				{value}
			</div>
		</div>
	);
}

function LivePowerWidget({ current, site, daySeries }) {
	const solar = current.solar_power ?? 0;
	const load = current.load_power ?? 0;
	const battery = current.battery_power ?? 0; // positive = discharging
	const grid = current.grid_power ?? 0; // positive = importing
	const pct = current.percentage_charged ?? 0;

	// Scales: battery from rated power; the rest from the busiest reading in the last 24h
	const ratedBattery = site.batteries.reduce((sum, b) => sum + (b.nameplate_max_discharge_power || 0), 0);
	const batteryMax = gaugeScale(ratedBattery || site.nameplate_power || 0, battery);
	const peak = (key) => daySeries.map((d) => d[key] || 0);
	const solarMax = gaugeScale(solar, ...peak("solar_power"));
	const loadMax = gaugeScale(load, ...peak("load_power"));
	const gridMax = gaugeScale(grid, ...peak("grid_power"));

	const offGrid =
		current.grid_status === "Inactive" || (current.island_status || "").startsWith("off_grid");

	let storm = { value: "Off", tone: "neutral" };
	if (current.storm_watch_enabled) {
		storm = current.storm_mode_active
			? { value: "Storm active", tone: "warning" }
			: { value: "Watching", tone: "good" };
	}

	// Usable capacity vs. rated capacity, when Tesla reports it
	const health =
		isNum(current.total_pack_energy) && current.total_pack_energy > 0 && isNum(site.nameplate_energy)
			? current.total_pack_energy / site.nameplate_energy
			: null;

	const fromGrid = Math.max(grid, 0);
	const selfPowered = load > IDLE_THRESHOLD_W ? Math.max(0, Math.min(1, 1 - fromGrid / load)) : null;

	return (
		<Widget title="Live Power">
			<div className="gauge-grid">
				<Gauge
					caption={`Battery · ${direction(battery, "Discharging", "Charging")}`}
					value={battery}
					min={-batteryMax}
					max={batteryMax}
					signed
					color={COLORS.battery}
					valueText={kW(battery)}
					minLabel={`-${batteryMax / 1000}`}
					maxLabel={`${batteryMax / 1000} kW`}
				/>
				<Gauge
					caption={`Solar · ${solar > IDLE_THRESHOLD_W ? "Generating" : "Idle"}`}
					value={solar}
					max={solarMax}
					color={COLORS.solar}
					valueText={kW(solar)}
					minLabel="0"
					maxLabel={`${solarMax / 1000} kW`}
				/>
				<Gauge
					caption="House"
					value={load}
					max={loadMax}
					color={COLORS.home}
					valueText={kW(load)}
					minLabel="0"
					maxLabel={`${loadMax / 1000} kW`}
				/>
				<Gauge
					caption={`Grid · ${direction(grid, "Importing", "Exporting")}`}
					value={grid}
					min={-gridMax}
					max={gridMax}
					signed
					color={COLORS.grid}
					valueText={kW(grid)}
					minLabel={`-${gridMax / 1000}`}
					maxLabel={`${gridMax / 1000} kW`}
				/>
				<Gauge
					caption="Powerwall Level"
					value={pct}
					max={100}
					color={batteryColor(pct)}
					valueText={`${pct.toFixed(0)}%`}
					minLabel="0"
					maxLabel="100%"
				/>
			</div>

			<div className="status-tiles">
				<StatusTile
					label="Grid status"
					value={offGrid ? "Off grid" : current.grid_status ? "Active" : "Unknown"}
					tone={offGrid ? "critical" : current.grid_status ? "good" : "neutral"}
				/>
				<StatusTile
					label="Battery backup"
					value={offGrid ? "Powering home" : "Standby"}
					tone={offGrid ? "warning" : "good"}
				/>
				<StatusTile label="Storm mode" value={storm.value} tone={storm.tone} />
				{selfPowered !== null && (
					<StatusTile label="Off-grid share now" value={`${Math.round(selfPowered * 100)}%`} />
				)}
			</div>

			{health !== null && (
				<div className="health">
					<div className="self-powered-label">
						<span>Battery health · {kWh(current.total_pack_energy)} of {kWh(site.nameplate_energy)} rated</span>
						<strong>{Math.round(health * 100)}%</strong>
					</div>
					<div className="health-bar" aria-hidden="true">
						{Array.from({ length: 25 }, (_, i) => (
							<span key={i} className={i < Math.round(health * 25) ? "on" : ""} />
						))}
					</div>
				</div>
			)}
		</Widget>
	);
}

function Last24hWidget({ last24h }) {
	const { series, bucket_ms: bucketMs, totals } = last24h;
	const bucketHours = bucketMs / 3600000;
	const formatTime = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

	// Running net grid energy: imports push it up, exports pull it down
	let net = 0;
	const netSeries = series.map((d) => {
		net += (d.grid_power || 0) * bucketHours;
		return { t: d.recorded_at, v: net };
	});
	const pick = (key) => series.map((d) => ({ t: d.recorded_at, v: d[key] }));
	const netTotal = totals.grid_imported - totals.grid_exported;

	const cards = [
		{
			key: "solar",
			label: "Solar",
			value: kWh(totals.solar_generated),
			sub: "generated",
			color: COLORS.solar,
			data: pick("solar_power"),
			format: kW,
		},
		{
			key: "home",
			label: "House",
			value: kWh(totals.home_usage),
			sub: "used",
			color: COLORS.home,
			data: pick("load_power"),
			format: kW,
		},
		{
			key: "grid",
			label: "Net meter",
			value: `${netTotal > 0 ? "+" : ""}${kWh(netTotal)}`,
			sub: `${kWh(totals.grid_imported)} in · ${kWh(totals.grid_exported)} out`,
			color: COLORS.grid,
			data: netSeries,
			format: (wh) => kWh(wh, 2),
		},
		{
			key: "battery",
			label: "Battery",
			value: `${kWh(totals.battery_discharged)} out`,
			sub: `${kWh(totals.battery_charged)} charged · line = charge %`,
			color: COLORS.battery,
			data: pick("percentage_charged"),
			format: (v) => `${v.toFixed(0)}%`,
		},
	];

	return (
		<Widget title="Last 24 Hours">
			<div className="spark-cards">
				{cards.map((card) => (
					<div key={card.key} className="spark-card">
						<div className="spark-card-head">
							<div className="dash-stat-label">
								<span className="chart-legend-swatch" style={{ background: card.color }} />
								{card.label}
							</div>
							<div className="spark-card-value">{card.value}</div>
						</div>
						<div className="dash-stat-sub">{card.sub}</div>
						<Sparkline
							data={card.data}
							color={card.color}
							gapMs={bucketMs * 2.5}
							formatValue={card.format}
							formatTime={formatTime}
						/>
					</div>
				))}
			</div>
			{totals.covered_hours < 23 && (
				<p className="widget-footnote">
					Based on {totals.covered_hours.toFixed(1)} h of recorded readings so far
				</p>
			)}
		</Widget>
	);
}

function EnergySourcesWidget({ energy }) {
	const data = energy.map((e) => {
		const date = new Date(`${e.date}T12:00:00`);
		return {
			label: date.toLocaleDateString([], { month: "numeric", day: "numeric" }),
			title: date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
			solar: e.home_from_solar || 0,
			battery: e.home_from_battery || 0,
			grid: e.home_from_grid || 0,
		};
	});

	return (
		<Widget title="Home Powered By">
			{data.length === 0 ? (
				<p className="widget-empty">Daily totals will appear after the first history sync</p>
			) : (
				<ColumnChart
					stacked
					data={data}
					series={[
						{ key: "solar", label: "Solar", color: COLORS.solar },
						{ key: "battery", label: "Battery", color: COLORS.battery },
						{ key: "grid", label: "Grid", color: COLORS.grid },
					]}
					formatY={(v) => `${Math.round(v / 1000)} kWh`}
					formatValue={(v) => kWh(v)}
				/>
			)}
		</Widget>
	);
}

function SystemStatusWidget({ current }) {
	const offGrid =
		current.grid_status === "Inactive" || (current.island_status || "").startsWith("off_grid");
	const mode = MODE_LABELS[current.operation_mode] || current.operation_mode || "Unknown";

	let stormValue = "Disabled";
	let stormTone = "neutral";
	if (current.storm_watch_enabled) {
		stormValue = current.storm_mode_active ? "Storm active" : "Enabled";
		stormTone = current.storm_mode_active ? "warning" : "good";
	}

	return (
		<Widget title="System Status">
			<div className="status-rows">
				<StatusRow
					label="Grid"
					value={offGrid ? "Off grid (backup)" : current.grid_status ? "Connected" : "Unknown"}
					tone={offGrid ? "critical" : current.grid_status ? "good" : "neutral"}
				/>
				<StatusRow label="Operation mode" value={mode} tone="neutral" />
				<StatusRow
					label="Backup reserve"
					value={isNum(current.backup_reserve_percent) ? `${current.backup_reserve_percent}%` : "—"}
					tone="neutral"
				/>
				<StatusRow label="Storm Watch" value={stormValue} tone={stormTone} />
				{current.backup_capable !== null && (
					<StatusRow
						label="Backup capable"
						value={current.backup_capable ? "Yes" : "No"}
						tone={current.backup_capable ? "good" : "warning"}
					/>
				)}
				{current.grid_services_active !== null && (
					<StatusRow
						label="Grid services (VPP)"
						value={current.grid_services_active ? "Active" : "Inactive"}
						tone="neutral"
					/>
				)}
			</div>
		</Widget>
	);
}

function TodaySoFarWidget({ today }) {
	const [showTable, setShowTable] = useState(false);
	const { totals } = today;
	const timeOf = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

	const usage = totals.home_usage || 0;
	const selfPowered = usage > 0 ? Math.max(0, 1 - (totals.home_from_grid || 0) / usage) : null;
	const solarOffset = usage > 0 ? (totals.solar_generated || 0) / usage : null;

	const hourly = today.hourly.map((h) => {
		const start = new Date(h.t);
		return {
			label: start.toLocaleTimeString([], { hour: "numeric" }),
			title: `${timeOf(h.t)} – ${timeOf(h.t + 3600000)}`,
			home: h.home_usage,
			solar: h.solar_generated,
		};
	});

	// Be clear about where the numbers come from
	let source;
	if (today.source === "tesla") {
		source = `Tesla's daily total (synced ${timeOf(today.tesla_synced_at)}) plus live readings since`;
	} else if (today.first_reading_at && today.first_reading_at - today.since > 30 * 60000) {
		source = `From recorded readings since ${timeOf(today.first_reading_at)} — earlier usage isn't included`;
	} else {
		source = "From recorded readings";
	}

	return (
		<Widget
			title="Today So Far"
			actions={<TableToggle showTable={showTable} onToggle={() => setShowTable(!showTable)} />}
		>
			<div className="today-hero">
				<div className="today-hero-item">
					<div className="dash-stat-label">
						<span className="chart-legend-swatch" style={{ background: COLORS.home }} />
						Home usage since 12:00 AM
					</div>
					<div className="today-hero-value">{kWh(usage, 2)}</div>
				</div>
				<div className="today-hero-item">
					<div className="dash-stat-label">
						<span className="chart-legend-swatch" style={{ background: COLORS.solar }} />
						Solar generated since 12:00 AM
					</div>
					<div className="today-hero-value">{kWh(totals.solar_generated, 2)}</div>
				</div>
			</div>

			<div className="stat-grid stat-grid-4">
				<Stat
					label="Grid"
					swatch={COLORS.grid}
					value={`${kWh(totals.grid_imported)} in`}
					sub={`${kWh(totals.grid_exported)} exported`}
				/>
				<Stat
					label="Battery"
					swatch={COLORS.battery}
					value={`${kWh(totals.battery_discharged)} out`}
					sub={`${kWh(totals.battery_charged)} charged`}
				/>
				<Stat
					label="Self-powered"
					value={selfPowered === null ? "—" : `${Math.round(selfPowered * 100)}%`}
					sub="of home usage off-grid"
				/>
				<Stat
					label="Solar offset"
					value={solarOffset === null ? "—" : `${Math.round(solarOffset * 100)}%`}
					sub="solar vs. home usage"
				/>
			</div>

			<h4 className="widget-subheading">By hour</h4>
			{hourly.length === 0 ? (
				<p className="widget-empty">Hourly bars appear once readings are recorded today</p>
			) : showTable ? (
				<TableView
					columns={["Hour", "Home usage", "Solar generated"]}
					rows={[...hourly].reverse().map((h) => [h.title, kWh(h.home, 2), kWh(h.solar, 2)])}
				/>
			) : (
				<ColumnChart
					data={hourly}
					height={180}
					series={[
						{ key: "home", label: "Home usage", color: COLORS.home },
						{ key: "solar", label: "Solar generated", color: COLORS.solar },
					]}
					formatY={(v) => `${(v / 1000).toFixed(v < 1000 && v > 0 ? 2 : 0)} kWh`}
					formatValue={(v) => kWh(v, 2)}
				/>
			)}
			<p className="widget-footnote">{source}. Hourly bars use recorded readings.</p>
		</Widget>
	);
}


function PowerHistoryWidget({ history, bucketMs, hours, onHoursChange }) {
	const [showTable, setShowTable] = useState(false);
	const data = history.map((h) => ({
		t: h.recorded_at,
		solar: h.solar_power,
		home: h.load_power,
		battery: h.battery_power,
		grid: h.grid_power,
	}));

	const series = [
		{ key: "home", label: "Home", color: COLORS.home },
		{ key: "solar", label: "Solar", color: COLORS.solar },
		{ key: "battery", label: "Battery", color: COLORS.battery },
		{ key: "grid", label: "Grid", color: COLORS.grid },
	];

	const formatTime = (t, full) => {
		const d = new Date(t);
		if (full || hours > 24) {
			return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
		}
		return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	};

	return (
		<Widget
			title="Power History"
			actions={
				<div className="widget-actions">
					<Segmented
						label="History range"
						options={HISTORY_RANGES.map((r) => ({ value: r.hours, label: r.label }))}
						value={hours}
						onChange={onHoursChange}
					/>
					<TableToggle showTable={showTable} onToggle={() => setShowTable(!showTable)} />
				</div>
			}
		>
			<p className="widget-caption">
				Battery positive = discharging · Grid positive = importing
			</p>
			{data.length < 2 ? (
				<p className="widget-empty">Collecting readings — the chart fills in as data is recorded</p>
			) : showTable ? (
				<TableView
					columns={["Time", "Home", "Solar", "Battery", "Grid"]}
					rows={[...data].reverse().map((d) => [
						formatTime(d.t, true),
						...["home", "solar", "battery", "grid"].map((k) => (isNum(d[k]) ? kW(d[k]) : "—")),
					])}
				/>
			) : (
				<LineChart
					data={data}
					series={series}
					height={280}
					gapMs={bucketMs * 2.5}
					formatY={(v) => `${(v / 1000).toFixed(Math.abs(v) < 1000 && v !== 0 ? 1 : 0)} kW`}
					formatValue={(v) => kW(v)}
					formatTime={formatTime}
				/>
			)}
		</Widget>
	);
}

function ChargeHistoryWidget({ history, bucketMs, hours, reserve }) {
	const data = history.map((h) => ({ t: h.recorded_at, charge: h.percentage_charged }));
	const formatTime = (t, full) => {
		const d = new Date(t);
		if (full || hours > 24) return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric" });
		return d.toLocaleTimeString([], { hour: "numeric" });
	};

	return (
		<Widget title="Charge Level">
			{data.length < 2 ? (
				<p className="widget-empty">Collecting readings…</p>
			) : (
				<LineChart
					data={data}
					series={[{ key: "charge", label: "Charge", color: COLORS.battery }]}
					yDomain={[0, 100]}
					gapMs={bucketMs * 2.5}
					area
					referenceLines={isNum(reserve) && reserve > 0 ? [{ value: reserve, label: `Reserve ${reserve}%` }] : []}
					formatY={(v) => `${v}%`}
					formatValue={(v) => `${v.toFixed(1)}%`}
					formatTime={formatTime}
				/>
			)}
		</Widget>
	);
}

function DailyEnergyWidget({ energy, days, onDaysChange }) {
	const [showTable, setShowTable] = useState(false);
	const data = energy.map((e) => {
		const date = new Date(`${e.date}T12:00:00`);
		return {
			label: date.toLocaleDateString([], { month: "numeric", day: "numeric" }),
			title: date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
			home: e.home_usage || 0,
			solar: e.solar_generated || 0,
			imported: e.grid_imported || 0,
			exported: e.grid_exported || 0,
		};
	});

	return (
		<Widget
			title="Daily Energy"
			actions={
				<div className="widget-actions">
					<Segmented
						label="Days shown"
						options={ENERGY_RANGES.map((d) => ({ value: d, label: `${d}d` }))}
						value={days}
						onChange={onDaysChange}
					/>
					<TableToggle showTable={showTable} onToggle={() => setShowTable(!showTable)} />
				</div>
			}
		>
			{data.length === 0 ? (
				<p className="widget-empty">Daily totals will appear after the first history sync</p>
			) : showTable ? (
				<TableView
					columns={["Date", "Home", "Solar", "Grid in", "Grid out"]}
					rows={[...data].reverse().map((d) => [
						d.title,
						kWh(d.home),
						kWh(d.solar),
						kWh(d.imported),
						kWh(d.exported),
					])}
				/>
			) : (
				<ColumnChart
					data={data}
					series={[
						{ key: "home", label: "Home usage", color: COLORS.home },
						{ key: "solar", label: "Solar generated", color: COLORS.solar },
					]}
					formatY={(v) => `${Math.round(v / 1000)} kWh`}
					formatValue={(v) => kWh(v)}
				/>
			)}
		</Widget>
	);
}

function ConditionsWidget({ weather, outages, collector }) {
	const tempC = weather?.outdoor_temp_c;

	return (
		<Widget title="Conditions & Outages">
			<div className="stat-grid stat-grid-2">
				<Stat
					label="Outdoor temp"
					value={isNum(tempC) ? `${Math.round((tempC * 9) / 5 + 32)}°F` : "—"}
					sub={isNum(tempC) ? `${tempC.toFixed(1)}°C` : collector.weather_enabled ? "Unavailable" : "Set SITE_LATITUDE/LONGITUDE"}
				/>
				<Stat
					label="Cloud cover"
					value={isNum(weather?.cloud_cover_percent) ? `${Math.round(weather.cloud_cover_percent)}%` : "—"}
					sub="affects solar output"
				/>
			</div>
			<p className="widget-footnote">
				Tesla's Fleet API doesn't report Powerwall battery temperature.
			</p>

			<h4 className="widget-subheading">Recent grid outages</h4>
			{outages.length === 0 ? (
				<p className="widget-empty">No outages recorded this year</p>
			) : (
				<ul className="widget-list compact">
					{outages.map((o) => (
						<li key={o.started_at} className="widget-list-item">
							<div className="widget-list-main">
								<div className="widget-list-title">
									{new Date(o.started_at).toLocaleString([], {
										month: "short",
										day: "numeric",
										year: "numeric",
										hour: "numeric",
										minute: "2-digit",
									})}
								</div>
							</div>
							<span className="widget-list-time">
								{isNum(o.duration_ms) ? formatDuration(o.duration_ms / 3600000) : "—"}
							</span>
						</li>
					))}
				</ul>
			)}
		</Widget>
	);
}

function SystemInfoWidget({ site, collector, current }) {
	const rows = [
		["Site", site.site_name],
		["Site ID", site.site_id],
		["Powerwalls", site.battery_count],
		["Capacity", isNum(site.nameplate_energy) ? kWh(site.nameplate_energy) : null],
		["Max power", isNum(site.nameplate_power) ? kW(site.nameplate_power) : null],
		["Firmware", site.firmware_version],
		["Installed", site.installation_date ? new Date(site.installation_date).toLocaleDateString() : null],
		["Time zone", site.time_zone],
		["Utility", site.utility],
		["Solar", site.has_solar === null ? null : site.has_solar ? "Yes" : "No"],
		[
			"Off-grid EV reserve",
			isNum(site.off_grid_ev_reserve_percent) ? `${site.off_grid_ev_reserve_percent}%` : null,
		],
		["Last reading", current ? formatAgo(current.recorded_at) : null],
		["Polling", `Every ${collector.poll_interval_minutes} min, kept ${collector.retention_days} days`],
	].filter(([, value]) => value !== null && value !== undefined && value !== "");

	return (
		<Widget title="System Info">
			<dl className="info-grid">
				{rows.map(([label, value]) => (
					<div key={label} className="info-item">
						<dt>{label}</dt>
						<dd>{value}</dd>
					</div>
				))}
			</dl>

			{(site.batteries.length > 0 || site.gateways.length > 0) && (
				<div className="chart-table">
					<table className="logs-table">
						<thead>
							<tr>
								<th>Component</th>
								<th>Serial</th>
								<th>Details</th>
							</tr>
						</thead>
						<tbody>
							{site.gateways.map((g) => (
								<tr key={`g-${g.serial_number}`}>
									<td>{g.part_name || "Gateway"}</td>
									<td>{g.serial_number || "—"}</td>
									<td>
										{g.firmware_version ? `Firmware ${g.firmware_version}` : ""}
										{g.is_active === false ? " · inactive" : ""}
									</td>
								</tr>
							))}
							{site.batteries.map((b, i) => (
								<tr key={`b-${b.serial_number || i}`}>
									<td>{b.part_name || "Powerwall"}</td>
									<td>{b.serial_number || "—"}</td>
									<td>
										{[
											isNum(b.nameplate_energy) && kWh(b.nameplate_energy),
											isNum(b.nameplate_max_discharge_power) &&
												`${kW(b.nameplate_max_discharge_power)} max discharge`,
										]
											.filter(Boolean)
											.join(" · ")}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</Widget>
	);
}

// ---------- page ----------

// Every widget the dashboard can show, in default order with default widths (12-column grid)
const WIDGETS = [
	{ id: "history", title: "Power History", span: 12 },
	{ id: "live", title: "Live Power", span: 8 },
	{ id: "last24h", title: "Last 24 Hours", span: 4 },
	{ id: "today", title: "Today So Far", span: 8 },
	{ id: "battery", title: "Battery", span: 4 },
	{ id: "status", title: "System Status", span: 4 },
	{ id: "charge", title: "Charge Level", span: 4 },
	{ id: "conditions", title: "Conditions & Outages", span: 4 },
	{ id: "tasks", title: "Upcoming Tasks", span: 6 },
	{ id: "logs", title: "Recent Executions", span: 6 },
	{ id: "daily", title: "Daily Energy", span: 6 },
	{ id: "sources", title: "Home Powered By", span: 6 },
	{ id: "info", title: "System Info", span: 12 },
];

function NoReadings({ title }) {
	return (
		<Widget title={title}>
			<p className="widget-empty">No readings yet — check that you're authenticated.</p>
		</Widget>
	);
}

function Dashboard({ tasks, onNavigate }) {
	const [data, setData] = useState(null);
	const [error, setError] = useState(null);
	const [loading, setLoading] = useState(true);
	const [hours, setHours] = useState(24);
	const [days, setDays] = useState(14);
	const [editing, setEditing] = useState(false);
	const layout = useDashboardLayout(WIDGETS);

	const load = useCallback(async () => {
		try {
			const response = await api.getDashboard(hours, days);
			setData(response.data);
			setError(null);
		} catch (err) {
			setError(err.response?.data?.error || "Failed to load dashboard");
		} finally {
			setLoading(false);
		}
	}, [hours, days]);

	useEffect(() => {
		load();
		const interval = setInterval(load, 60000);
		return () => clearInterval(interval);
	}, [load]);

	if (loading) {
		return (
			<div className="loading-container">
				<div className="loading-spinner"></div>
				<p>Loading dashboard...</p>
			</div>
		);
	}

	if (error && !data) {
		return <div className="alert alert-error">{error}</div>;
	}

	const { current, collector } = data;
	const stale =
		current && Date.now() - current.recorded_at > collector.poll_interval_minutes * 3 * 60000;

	const renderWidget = (id) => {
		switch (id) {
			case "history":
				return (
					<PowerHistoryWidget
						history={data.history}
						bucketMs={data.history_bucket_ms}
						hours={hours}
						onHoursChange={setHours}
					/>
				);
			case "live":
				return current ? (
					<LivePowerWidget current={current} site={data.site} daySeries={data.last_24h.series} />
				) : (
					<NoReadings title="Live Power" />
				);
			case "last24h":
				return <Last24hWidget last24h={data.last_24h} />;
			case "today":
				return <TodaySoFarWidget today={data.today} />;
			case "battery":
				return current ? (
					<BatteryWidget current={current} nameplateEnergy={data.site.nameplate_energy} />
				) : (
					<NoReadings title="Battery" />
				);
			case "status":
				return current ? <SystemStatusWidget current={current} /> : <NoReadings title="System Status" />;
			case "charge":
				return (
					<ChargeHistoryWidget
						history={data.history}
						bucketMs={data.history_bucket_ms}
						hours={hours}
						reserve={current?.backup_reserve_percent}
					/>
				);
			case "conditions":
				return <ConditionsWidget weather={data.weather} outages={data.outages} collector={collector} />;
			case "tasks":
				return <UpcomingTasks tasks={tasks} onViewAll={() => onNavigate("tasks")} />;
			case "logs":
				return <RecentLogs logs={data.recent_logs} onViewAll={() => onNavigate("logs")} />;
			case "daily":
				return <DailyEnergyWidget energy={data.energy} days={days} onDaysChange={setDays} />;
			case "sources":
				return <EnergySourcesWidget energy={data.energy} />;
			case "info":
				return <SystemInfoWidget site={data.site} collector={collector} current={current} />;
			default:
				return null;
		}
	};

	const items = layout.visibleOrder.map((id) => ({
		id,
		title: WIDGETS.find((w) => w.id === id).title,
		span: layout.spanOf(id),
		node: renderWidget(id),
	}));

	return (
		<div className="dashboard">
			<div className="section-header">
				<h2>{data.site.site_name || "Powerwall"} Dashboard</h2>
				<div className="filter-controls">
					{current && (
						<small className={stale ? "dashboard-stale" : "dashboard-updated"}>
							{stale ? "⚠ " : ""}Updated {formatAgo(current.recorded_at)}
						</small>
					)}
					<button className="btn btn-secondary" onClick={load}>
						🔄 Refresh
					</button>
					<button
						className={`btn ${editing ? "btn-primary" : "btn-secondary"}`}
						onClick={() => setEditing(!editing)}
					>
						{editing ? "✓ Done" : "⚙ Customize"}
					</button>
				</div>
			</div>

			{editing && (
				<div className="customize-bar">
					<p className="customize-hint">
						Drag widgets to rearrange them (or use ◀ ▶), pick a width, or hide what you don't need.
						Changes save automatically.
					</p>
					<div className="customize-hidden">
						<span className="dash-stat-label">Hidden:</span>
						{layout.hidden.length === 0 ? (
							<span className="dash-stat-sub">none</span>
						) : (
							layout.hidden.map((id) => (
								<button key={id} className="chip" onClick={() => layout.show(id)}>
									+ {WIDGETS.find((w) => w.id === id).title}
								</button>
							))
						)}
						<button className="widget-link customize-reset" onClick={layout.reset}>
							Reset to default layout
						</button>
					</div>
				</div>
			)}

			{error && <div className="alert alert-error">{error}</div>}
			{layout.saveError && <div className="alert alert-error">{layout.saveError}</div>}
			{collector.last_error && (
				<div className="alert alert-error">Latest reading failed: {collector.last_error}</div>
			)}

			{items.length === 0 ? (
				<div className="empty-state">
					<div className="empty-icon">📈</div>
					<h3>All widgets are hidden</h3>
					<p>Use Customize to bring some back</p>
				</div>
			) : (
				<WidgetGrid
					items={items}
					editing={editing}
					onReorder={layout.reorderVisible}
					onMove={layout.move}
					onHide={layout.hide}
					onSpanChange={layout.setSpan}
				/>
			)}
		</div>
	);
}

export default Dashboard;
