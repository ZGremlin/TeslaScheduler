import React, { useRef, useState } from "react";
import { SPANS } from "./useDashboardLayout";

/**
 * Lays widgets out on the 12-column grid. In edit mode each widget can be dragged to a new
 * position (the grid reflows live while dragging), moved with arrow buttons, resized or hidden.
 * items: [{ id, title, span, node }] in display order.
 */
function WidgetGrid({ items, editing, onReorder, onMove, onHide, onSpanChange }) {
	const [dragId, setDragId] = useState(null);
	const [preview, setPreview] = useState(null); // order shown while a drag is in progress
	const lastTarget = useRef(null);

	const byId = Object.fromEntries(items.map((item) => [item.id, item]));
	const ids = preview || items.map((item) => item.id);

	const handleDragStart = (event, id) => {
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", id); // required for Firefox to start the drag
		setDragId(id);
	};

	const handleDragOver = (event, overId) => {
		if (!dragId) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		if (overId === dragId) return;

		// Full-width widgets split top/bottom; narrower ones split left/right
		const rect = event.currentTarget.getBoundingClientRect();
		const fullRow = rect.width > event.currentTarget.parentElement.clientWidth * 0.9;
		const after = fullRow
			? event.clientY > rect.top + rect.height / 2
			: event.clientX > rect.left + rect.width / 2;

		// Only react when the cursor crosses into a new half, so the reflow doesn't oscillate
		const target = `${overId}:${after}`;
		if (lastTarget.current === target) return;
		lastTarget.current = target;

		const next = ids.filter((id) => id !== dragId);
		next.splice(next.indexOf(overId) + (after ? 1 : 0), 0, dragId);
		if (next.join() !== ids.join()) setPreview(next);
	};

	const finishDrag = () => {
		if (preview && preview.join() !== items.map((item) => item.id).join()) {
			onReorder(preview);
		}
		setPreview(null);
		setDragId(null);
		lastTarget.current = null;
	};

	return (
		<div className={`dashboard-grid ${editing ? "editing" : ""}`}>
			{ids.map((id, index) => {
				const item = byId[id];
				if (!item) return null;

				return (
					<div
						key={id}
						className={`widget-slot span-${item.span} ${dragId === id ? "dragging" : ""}`}
						draggable={editing}
						onDragStart={editing ? (event) => handleDragStart(event, id) : undefined}
						onDragOver={editing ? (event) => handleDragOver(event, id) : undefined}
						onDrop={editing ? (event) => event.preventDefault() : undefined}
						onDragEnd={editing ? finishDrag : undefined}
					>
						{editing && (
							<div className="slot-toolbar">
								<span className="slot-handle" aria-hidden="true" title="Drag to move">
									⠿
								</span>
								<span className="slot-title">{item.title}</span>
								<button
									className="slot-btn"
									onClick={() => onMove(id, -1)}
									disabled={index === 0}
									aria-label={`Move ${item.title} earlier`}
									title="Move earlier"
								>
									◀
								</button>
								<button
									className="slot-btn"
									onClick={() => onMove(id, 1)}
									disabled={index === ids.length - 1}
									aria-label={`Move ${item.title} later`}
									title="Move later"
								>
									▶
								</button>
								<select
									className="slot-select"
									value={item.span}
									onChange={(event) => onSpanChange(id, Number(event.target.value))}
									aria-label={`${item.title} width`}
								>
									{SPANS.map((span) => (
										<option key={span.value} value={span.value}>
											{span.label}
										</option>
									))}
								</select>
								<button className="slot-btn" onClick={() => onHide(id)} title="Hide widget">
									Hide
								</button>
							</div>
						)}
						{item.node}
					</div>
				);
			})}
		</div>
	);
}

export default WidgetGrid;
