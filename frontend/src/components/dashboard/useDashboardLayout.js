import { useCallback, useEffect, useState } from "react";
import * as api from "../../services/api";

export const SPANS = [
	{ value: 4, label: "⅓ width" },
	{ value: 6, label: "½ width" },
	{ value: 8, label: "⅔ width" },
	{ value: 12, label: "Full width" },
];

const VALID_SPANS = SPANS.map((s) => s.value);

function defaultLayout(widgets) {
	return { order: widgets.map((w) => w.id), hidden: [], spans: {} };
}

// Fit a saved layout to the current widget list: drop unknown ids, append widgets added since
function normalize(saved, widgets) {
	const known = new Set(widgets.map((w) => w.id));
	const order = (saved.order || []).filter((id) => known.has(id));
	widgets.forEach((w) => {
		if (!order.includes(w.id)) order.push(w.id);
	});

	const spans = {};
	Object.entries(saved.spans || {}).forEach(([id, span]) => {
		if (known.has(id) && VALID_SPANS.includes(span)) spans[id] = span;
	});

	return {
		order,
		hidden: (saved.hidden || []).filter((id) => known.has(id)),
		spans,
	};
}

/**
 * Widget order, visibility and width, saved on the server so every device shares one layout.
 * widgets: [{ id, title, span }] in default order.
 */
export function useDashboardLayout(widgets) {
	const [layout, setLayout] = useState(() => defaultLayout(widgets));
	const [saveError, setSaveError] = useState(null);

	useEffect(() => {
		api
			.getDashboardLayout()
			.then((response) => {
				if (response.data.layout) setLayout(normalize(response.data.layout, widgets));
			})
			.catch(() => {
				// Keep the default layout if the saved one can't be loaded
			});
		// Widget definitions are static; load once
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const update = useCallback((next) => {
		setLayout(next);
		api
			.saveDashboardLayout(next)
			.then(() => setSaveError(null))
			.catch((err) => setSaveError(err.response?.data?.error || "Couldn't save the layout"));
	}, []);

	const spanOf = (id) => layout.spans[id] ?? widgets.find((w) => w.id === id)?.span ?? 12;
	const visibleOrder = layout.order.filter((id) => !layout.hidden.includes(id));

	// Apply a new order of the visible widgets; hidden ones keep their slots for when they return
	const reorderVisible = (nextVisible) => {
		let i = 0;
		const order = layout.order.map((id) => (layout.hidden.includes(id) ? id : nextVisible[i++]));
		update({ ...layout, order });
	};

	const move = (id, delta) => {
		const next = [...visibleOrder];
		const from = next.indexOf(id);
		const to = from + delta;
		if (from < 0 || to < 0 || to >= next.length) return;
		[next[from], next[to]] = [next[to], next[from]];
		reorderVisible(next);
	};

	return {
		visibleOrder,
		hidden: layout.hidden,
		spanOf,
		saveError,
		reorderVisible,
		move,
		hide: (id) => update({ ...layout, hidden: [...layout.hidden, id] }),
		show: (id) => update({ ...layout, hidden: layout.hidden.filter((h) => h !== id) }),
		setSpan: (id, span) => update({ ...layout, spans: { ...layout.spans, [id]: span } }),
		reset: () => update(defaultLayout(widgets)),
	};
}
