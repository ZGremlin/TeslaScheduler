import React, { useEffect, useRef, useState } from "react";

const PAD = { top: 12, right: 16, bottom: 28, left: 48 };

// Track an element's rendered width so the SVG can draw at true pixel size
function useWidth() {
	const ref = useRef(null);
	const [width, setWidth] = useState(0);

	useEffect(() => {
		if (!ref.current) return;
		const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
		observer.observe(ref.current);
		return () => observer.disconnect();
	}, []);

	return [ref, width];
}

// Round tick values to clean numbers covering [min, max]
function niceTicks(min, max, count = 4) {
	if (min === max) {
		min -= 1;
		max += 1;
	}
	const rawStep = (max - min) / count;
	const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
	const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep);
	const start = Math.floor(min / step) * step;
	// Always end on a tick at or above max so marks never overrun the top gridline
	const ticks = [];
	for (let v = start; ticks.length < 20; v += step) {
		ticks.push(Math.round(v * 1000) / 1000);
		if (v >= max - step * 1e-9) break;
	}
	return ticks;
}

function Legend({ series }) {
	if (series.length < 2) return null;
	return (
		<div className="chart-legend">
			{series.map((s) => (
				<span key={s.key} className="chart-legend-item">
					<span className="chart-legend-swatch" style={{ background: s.color }} />
					{s.label}
				</span>
			))}
		</div>
	);
}

function Tooltip({ x, width, title, rows }) {
	// Flip to the left of the cursor near the right edge
	const flip = x > width - 170;
	return (
		<div
			className="chart-tooltip"
			style={flip ? { right: width - x + 12 } : { left: x + 12 }}
			role="status"
		>
			<div className="chart-tooltip-title">{title}</div>
			{rows.map((row) => (
				<div key={row.label} className="chart-tooltip-row">
					<span className="chart-legend-swatch" style={{ background: row.color }} />
					<span className="chart-tooltip-label">{row.label}</span>
					<span className="chart-tooltip-value">{row.value}</span>
				</div>
			))}
		</div>
	);
}

/**
 * Time-series line chart with a hover crosshair.
 * data: [{ t: ms, [series.key]: number|null }]; a gap longer than gapMs breaks the line.
 */
export function LineChart({
	data,
	series,
	height = 220,
	gapMs,
	yDomain,
	formatY,
	formatValue,
	formatTime,
	referenceLines = [],
	area = false,
}) {
	const [ref, width] = useWidth();
	const [hoverIndex, setHoverIndex] = useState(null);

	const innerW = Math.max(width - PAD.left - PAD.right, 1);
	const innerH = height - PAD.top - PAD.bottom;

	const values = data.flatMap((d) => series.map((s) => d[s.key])).filter((v) => v != null);
	const refValues = referenceLines.map((r) => r.value);
	const [minY, maxY] = yDomain || [
		Math.min(0, ...values, ...refValues),
		Math.max(0, ...values, ...refValues),
	];
	const ticks = yDomain ? niceTicks(yDomain[0], yDomain[1]) : niceTicks(minY, maxY);
	const lo = Math.min(ticks[0], minY);
	const hi = Math.max(ticks[ticks.length - 1], maxY);

	const t0 = data.length ? data[0].t : 0;
	const t1 = data.length ? data[data.length - 1].t : 1;
	const x = (t) => PAD.left + (t1 === t0 ? innerW / 2 : ((t - t0) / (t1 - t0)) * innerW);
	const y = (v) => PAD.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH;

	const buildPath = (key) => {
		let d = "";
		let prev = null;
		data.forEach((point) => {
			const v = point[key];
			if (v == null) {
				prev = null;
				return;
			}
			const broken = !prev || (gapMs && point.t - prev.t > gapMs);
			d += `${broken ? "M" : "L"}${x(point.t).toFixed(1)},${y(v).toFixed(1)}`;
			prev = point;
		});
		return d;
	};

	const xTicks = data.length > 1 ? [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + (t1 - t0) * f) : [];

	const handleMove = (event) => {
		if (!data.length) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const px = event.clientX - rect.left;
		const t = t0 + ((px - PAD.left) / innerW) * (t1 - t0);
		let best = 0;
		data.forEach((d, i) => {
			if (Math.abs(d.t - t) < Math.abs(data[best].t - t)) best = i;
		});
		setHoverIndex(best);
	};

	const hovered = hoverIndex != null ? data[hoverIndex] : null;

	return (
		<div className="chart">
			<Legend series={series} />
			<div className="chart-plot" ref={ref} style={{ height }}>
				{width > 0 && (
					<svg
						width={width}
						height={height}
						onMouseMove={handleMove}
						onMouseLeave={() => setHoverIndex(null)}
					>
						{ticks.map((tick) => (
							<g key={tick}>
								<line
									className={tick === 0 ? "chart-baseline" : "chart-grid"}
									x1={PAD.left}
									x2={PAD.left + innerW}
									y1={y(tick)}
									y2={y(tick)}
								/>
								<text className="chart-axis-label" x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
									{formatY(tick)}
								</text>
							</g>
						))}
						{xTicks.map((t, i) => (
							<text
								key={i}
								className="chart-axis-label"
								x={x(t)}
								y={height - 8}
								textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
							>
								{formatTime(t)}
							</text>
						))}
						{referenceLines.map((r) => (
							<g key={r.label}>
								<line
									className="chart-reference"
									x1={PAD.left}
									x2={PAD.left + innerW}
									y1={y(r.value)}
									y2={y(r.value)}
								/>
								<text className="chart-axis-label" x={PAD.left + innerW} y={y(r.value) - 6} textAnchor="end">
									{r.label}
								</text>
							</g>
						))}
						{series.map((s) => {
							const path = buildPath(s.key);
							return (
								<g key={s.key}>
									{/* Wash only under an unbroken line; gaps would close the shape wrongly */}
									{area && path && path.lastIndexOf("M") === 0 && (
										<path
											d={`${path}L${x(t1)},${y(Math.max(lo, 0))}L${x(t0)},${y(Math.max(lo, 0))}Z`}
											fill={s.color}
											opacity={0.1}
										/>
									)}
									<path d={path} className="chart-line" stroke={s.color} />
								</g>
							);
						})}
						{hovered && (
							<g>
								<line
									className="chart-crosshair"
									x1={x(hovered.t)}
									x2={x(hovered.t)}
									y1={PAD.top}
									y2={PAD.top + innerH}
								/>
								{series.map(
									(s) =>
										hovered[s.key] != null && (
											<circle
												key={s.key}
												className="chart-dot"
												cx={x(hovered.t)}
												cy={y(hovered[s.key])}
												r={4}
												fill={s.color}
											/>
										),
								)}
							</g>
						)}
					</svg>
				)}
				{hovered && (
					<Tooltip
						x={x(hovered.t)}
						width={width}
						title={formatTime(hovered.t, true)}
						rows={series.map((s) => ({
							label: s.label,
							color: s.color,
							value: hovered[s.key] == null ? "—" : formatValue(hovered[s.key], s),
						}))}
					/>
				)}
			</div>
		</div>
	);
}

/**
 * Column chart, one group (or stack) per category.
 * data: [{ label, title, [series.key]: number }]
 * stacked: series stack bottom-up in one column, separated by a 2px surface gap.
 */
export function ColumnChart({ data, series, height = 220, formatY, formatValue, stacked = false }) {
	const [ref, width] = useWidth();
	const [hoverIndex, setHoverIndex] = useState(null);

	const innerW = Math.max(width - PAD.left - PAD.right, 1);
	const innerH = height - PAD.top - PAD.bottom;

	const total = (d) => series.reduce((sum, s) => sum + Math.max(d[s.key] || 0, 0), 0);
	const maxV = stacked
		? Math.max(0, ...data.map(total))
		: Math.max(0, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));
	const ticks = niceTicks(0, maxV || 1);
	const hi = ticks[ticks.length - 1];
	const y = (v) => PAD.top + innerH - (v / hi) * innerH;

	const band = innerW / Math.max(data.length, 1);
	const gap = 2;
	const columns = stacked ? 1 : series.length;
	const barW = Math.max(Math.min(24, (band * 0.7 - gap * (columns - 1)) / columns), 2);
	const groupW = barW * columns + gap * (columns - 1);

	// Segment from v0 up to v1; only the topmost segment gets the 4px rounded data-end
	const columnPath = (x0, v0, v1, roundTop, gapBelow) => {
		const top = y(v1);
		const bottom = y(v0) - (gapBelow ? gap : 0);
		if (bottom - top <= 0) return "";
		const r = roundTop ? Math.min(4, barW / 2, bottom - top) : 0;
		return `M${x0},${bottom}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barW - r}Q${x0 + barW},${top} ${x0 + barW},${top + r}V${bottom}Z`;
	};

	const renderMarks = (d, gx) => {
		if (!stacked) {
			return series.map((s, si) =>
				d[s.key] > 0 ? (
					<path key={s.key} d={columnPath(gx + si * (barW + gap), 0, d[s.key], true, false)} fill={s.color} />
				) : null,
			);
		}
		const visible = series.filter((s) => d[s.key] > 0);
		let base = 0;
		return visible.map((s, si) => {
			const path = columnPath(gx, base, base + d[s.key], si === visible.length - 1, si > 0);
			base += d[s.key];
			return path ? <path key={s.key} d={path} fill={s.color} /> : null;
		});
	};

	// Thin out x labels so they don't collide
	const labelEvery = Math.ceil(data.length / Math.max(Math.floor(innerW / 48), 1));
	const hovered = hoverIndex != null ? data[hoverIndex] : null;

	return (
		<div className="chart">
			<Legend series={series} />
			<div className="chart-plot" ref={ref} style={{ height }}>
				{width > 0 && (
					<svg width={width} height={height} onMouseLeave={() => setHoverIndex(null)}>
						{ticks.map((tick) => (
							<g key={tick}>
								<line
									className={tick === 0 ? "chart-baseline" : "chart-grid"}
									x1={PAD.left}
									x2={PAD.left + innerW}
									y1={y(tick)}
									y2={y(tick)}
								/>
								<text className="chart-axis-label" x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
									{formatY(tick)}
								</text>
							</g>
						))}
						{data.map((d, i) => {
							const gx = PAD.left + band * i + (band - groupW) / 2;
							return (
								<g key={d.label} onMouseEnter={() => setHoverIndex(i)}>
									{/* Full-height hit target, larger than the marks */}
									<rect
										x={PAD.left + band * i}
										y={PAD.top}
										width={band}
										height={innerH}
										className={hoverIndex === i ? "chart-hover-band" : "chart-hit"}
									/>
									{renderMarks(d, gx)}
									{i % labelEvery === 0 && (
										<text
											className="chart-axis-label"
											x={PAD.left + band * i + band / 2}
											y={height - 8}
											textAnchor="middle"
										>
											{d.label}
										</text>
									)}
								</g>
							);
						})}
					</svg>
				)}
				{hovered && (
					<Tooltip
						x={PAD.left + band * hoverIndex + band / 2}
						width={width}
						title={hovered.title}
						rows={[
							// Stacks list top segment first, matching what the eye sees
							...(stacked ? [...series].reverse() : series).map((s) => ({
								label: s.label,
								color: s.color,
								value: formatValue(hovered[s.key] || 0, s),
							})),
							...(stacked
								? [{ label: "Total", color: "transparent", value: formatValue(total(hovered)) }]
								: []),
						]}
					/>
				)}
			</div>
		</div>
	);
}

// Gauge geometry: a 240° arc with 0° pointing straight up
const GAUGE_START = -120;
const GAUGE_END = 120;

function polar(cx, cy, r, deg) {
	const rad = (deg * Math.PI) / 180;
	return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

function arcPath(cx, cy, r, fromDeg, toDeg) {
	const [a0, a1] = fromDeg <= toDeg ? [fromDeg, toDeg] : [toDeg, fromDeg];
	if (a1 - a0 < 0.01) return "";
	const [x0, y0] = polar(cx, cy, r, a0);
	const [x1, y1] = polar(cx, cy, r, a1);
	return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/**
 * Radial gauge for a single live value.
 * signed: zero sits at the top and the arc grows left (negative) or right (positive).
 */
export function Gauge({ value, min = 0, max, color, valueText, caption, minLabel, maxLabel, signed = false }) {
	const size = 160;
	const cx = size / 2;
	const cy = size / 2 + 6;
	const r = 62;

	const clamp = (v) => Math.max(min, Math.min(max, v));
	const toDeg = (v) => GAUGE_START + ((clamp(v) - min) / (max - min || 1)) * (GAUGE_END - GAUGE_START);
	const fromDeg = signed ? toDeg(0) : GAUGE_START;
	const valueDeg = toDeg(value || 0);
	const [lx, ly] = polar(cx, cy, r, GAUGE_START);
	const [rx] = polar(cx, cy, r, GAUGE_END);

	return (
		<div className="gauge" role="img" aria-label={`${caption}: ${valueText}`}>
			<svg viewBox={`0 0 ${size} ${size - 14}`} className="gauge-svg">
				<path d={arcPath(cx, cy, r, GAUGE_START, GAUGE_END)} className="gauge-track" />
				{signed && <line x1={cx} x2={cx} y1={cy - r - 9} y2={cy - r + 9} className="gauge-zero" />}
				<path d={arcPath(cx, cy, r, fromDeg, valueDeg)} className="gauge-value" stroke={color} />
				<text x={cx} y={cy + 4} textAnchor="middle" className="gauge-text">
					{valueText}
				</text>
				<text x={lx} y={ly + 18} textAnchor="middle" className="chart-axis-label">
					{minLabel}
				</text>
				<text x={rx} y={ly + 18} textAnchor="middle" className="chart-axis-label">
					{maxLabel}
				</text>
			</svg>
			<div className="gauge-caption">{caption}</div>
		</div>
	);
}

/**
 * Axis-less trend line with a hover readout, for stat cards.
 * data: [{ t, v }]
 */
export function Sparkline({ data, color, height = 72, formatValue, formatTime, gapMs }) {
	const [ref, width] = useWidth();
	const [hoverIndex, setHoverIndex] = useState(null);

	const points = data.filter((d) => d.v != null);
	const enough = points.length >= 2;

	// Keep the measured container mounted so the width observer stays attached
	if (!enough) {
		return (
			<div className="sparkline" ref={ref} style={{ height }}>
				<div className="sparkline-empty">Not enough readings yet</div>
			</div>
		);
	}

	const values = points.map((d) => d.v);
	const lo = Math.min(0, ...values);
	const hi = Math.max(0, ...values);
	const t0 = points[0].t;
	const t1 = points[points.length - 1].t;
	const pad = 4;
	const x = (t) => pad + ((t - t0) / (t1 - t0 || 1)) * (width - pad * 2);
	const y = (v) => pad + (1 - (v - lo) / (hi - lo || 1)) * (height - pad * 2);

	let line = "";
	points.forEach((p, i) => {
		const broken = i === 0 || (gapMs && p.t - points[i - 1].t > gapMs);
		line += `${broken ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
	});
	const unbroken = line.lastIndexOf("M") === 0;

	const handleMove = (event) => {
		const px = event.clientX - event.currentTarget.getBoundingClientRect().left;
		let best = 0;
		points.forEach((p, i) => {
			if (Math.abs(x(p.t) - px) < Math.abs(x(points[best].t) - px)) best = i;
		});
		setHoverIndex(best);
	};

	const hovered = hoverIndex != null ? points[hoverIndex] : null;

	return (
		<div className="sparkline" ref={ref} style={{ height }}>
			{width > 0 && (
				<svg width={width} height={height} onMouseMove={handleMove} onMouseLeave={() => setHoverIndex(null)}>
					{lo < 0 && <line className="chart-baseline" x1={0} x2={width} y1={y(0)} y2={y(0)} />}
					{unbroken && (
						<path
							d={`${line}L${x(t1)},${y(Math.max(lo, 0))}L${x(t0)},${y(Math.max(lo, 0))}Z`}
							fill={color}
							opacity={0.1}
						/>
					)}
					<path d={line} className="chart-line" stroke={color} />
					{hovered && (
						<>
							<line className="chart-crosshair" x1={x(hovered.t)} x2={x(hovered.t)} y1={0} y2={height} />
							<circle className="chart-dot" cx={x(hovered.t)} cy={y(hovered.v)} r={4} fill={color} />
						</>
					)}
				</svg>
			)}
			{hovered && (
				<div className="sparkline-readout">
					{formatValue(hovered.v)} · {formatTime(hovered.t)}
				</div>
			)}
		</div>
	);
}
