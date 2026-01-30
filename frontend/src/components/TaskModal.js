import React, { useState, useEffect } from 'react';

function TaskModal({ task, onSave, onClose }) {
  const [name, setName] = useState('');
  const [time, setTime] = useState('');
  const [mode, setMode] = useState('self_powered');
  const [backupReserve, setBackupReserve] = useState(20);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (task) {
      setName(task.name);
      setTime(task.time);
      setMode(task.mode);
      setBackupReserve(task.backup_reserve);
      setEnabled(!!task.enabled);
    }
  }, [task]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!name || !time) {
      alert('Name and time are required');
      return;
    }

    onSave({
      name,
      time,
      mode,
      backup_reserve: parseInt(backupReserve),
      enabled: enabled ? 1 : 0,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{task ? 'Edit Task' : 'Create New Task'}</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="name">Task Name *</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Morning Solar Mode"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="time">Execution Time *</label>
                <input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
                <small>Daily execution time (24-hour format)</small>
              </div>

              <div className="form-group">
                <label htmlFor="mode">Operation Mode *</label>
                <select
                  id="mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  required
                >
                  <option value="self_powered">Self-Powered</option>
                  <option value="time_based_control">Time-Based Control</option>
                </select>
                <small>Powerwall operation mode to set</small>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="backup_reserve">
                Backup Reserve: {backupReserve}%
              </label>
              <input
                id="backup_reserve"
                type="range"
                min="0"
                max="100"
                step="5"
                value={backupReserve}
                onChange={(e) => setBackupReserve(e.target.value)}
                className="range-slider"
              />
              <div className="range-labels">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
              <small>Minimum battery charge to reserve for backup power</small>
            </div>

            {task && (
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  <span>Task Enabled</span>
                </label>
              </div>
            )}

            <div className="info-box">
              <strong>Mode Descriptions:</strong>
              <ul>
                <li><strong>Self-Powered:</strong> Maximizes solar self-consumption. Battery charges from solar and discharges to meet home power needs.</li>
                <li><strong>Time-Based Control:</strong> Optimizes for time-of-use rates. Battery charges during off-peak and discharges during peak hours.</li>
              </ul>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {task ? 'Update Task' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TaskModal;
