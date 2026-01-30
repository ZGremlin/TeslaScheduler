import React, { useState, useEffect } from 'react';
import * as api from '../services/api';

function ExecutionLogs({ tasks }) {
  const [logs, setLogs] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, [selectedTaskId]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const response = await api.getLogs(selectedTaskId);
      setLogs(response.data);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getTaskName = (taskId) => {
    const task = tasks.find((t) => t.id === taskId);
    return task ? task.name : `Task #${taskId}`;
  };

  const getStatusBadge = (status) => {
    if (status === 'success') {
      return <span className="status-badge status-success">✓ Success</span>;
    }
    return <span className="status-badge status-error">✗ Failed</span>;
  };

  return (
    <div className="execution-logs">
      <div className="section-header">
        <h2>Execution Logs</h2>
        <div className="filter-controls">
          <select
            value={selectedTaskId || ''}
            onChange={(e) => setSelectedTaskId(e.target.value ? parseInt(e.target.value) : null)}
            className="filter-select"
          >
            <option value="">All Tasks</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.name}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={loadLogs}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>No Execution Logs</h3>
          <p>Task execution history will appear here</p>
        </div>
      ) : (
        <div className="logs-table-container">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Task</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <div className="log-datetime">
                      <div>{new Date(log.executed_at).toLocaleDateString()}</div>
                      <div className="log-time">
                        {new Date(log.executed_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong>{getTaskName(log.task_id)}</strong>
                  </td>
                  <td>{getStatusBadge(log.status)}</td>
                  <td>
                    {log.error_message ? (
                      <span className="error-message">{log.error_message}</span>
                    ) : (
                      <span className="success-message">Executed successfully</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ExecutionLogs;
