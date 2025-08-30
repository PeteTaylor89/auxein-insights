// src/components/widgets/TasksWidget.jsx
import { Link } from 'react-router-dom';

function TasksWidget() {
  // Dummy data
  const tasks = [
    { id: 1, title: 'Pruning Block A', priority: 'high', due: '2025-05-20' },
    { id: 2, title: 'Irrigation Check', priority: 'medium', due: '2025-05-18' }
  ];
  
  return (
    <div className="widget tasks-widget">
      <div className="widget-header">
        <h3>Upcoming Tasks</h3>
        <Link to="/tasks" className="widget-action">View All</Link>
      </div>
      
      <div className="tasks-list">
        {tasks.map(task => (
          <div key={task.id} className={`task-item priority-${task.priority}`}>
            <div className="task-icon">✓</div>
            <div className="task-content">
              <div className="task-title">{task.title}</div>
              <div className="task-due">Due: {task.due}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TasksWidget;