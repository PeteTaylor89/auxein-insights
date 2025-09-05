import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import {tasksService, blocksService, api} from '@vineyard/shared';
import SlidingTaskForm from '../components/SlidingTaskForm';
import AppBar from '../components/AppBar';

function Tasks() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [blocks, setBlocks] = useState({});
  const [blocksArray, setBlocksArray] = useState([]); // Add this for the form
  const [users, setUsers] = useState([]); // Add this for the form
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [taskToClose, setTaskToClose] = useState(null);
  const [closeFormData, setCloseFormData] = useState({
    completion_date: new Date().toISOString().split('T')[0],
    completion_notes: ''
  });
  
  // Add these new state variables for the task form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);

  useEffect(() => {
    loadTasksAndBlocks();
    getCurrentLocation(); // Add this
    loadUsers(); // Add this
  }, []);

  // Add this function to get current location
  const getCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('Could not get location:', error.message);
        }
      );
    }
  };

  // Add this function to load users
  const loadUsers = async () => {
    try {
      // You'll need to implement this based on your user service
      // const usersData = await userService.getUsers();
      // setUsers(usersData);
      
      // For now, setting empty array - replace with actual user loading logic
      setUsers([]);
    } catch (err) {
      console.warn('Could not load users:', err);
    }
  };

  const loadTasksAndBlocks = async () => {
    try {
      setLoading(true);
      
      // Get all tasks (without company filter since the model doesn't have company_id)
      const allTasks = await tasksService.getAllTasks();
      
      // Load blocks to get names and filter tasks
      const blocksData = await blocksService.getCompanyBlocks();
      const blocksMap = {};
      const companyBlockIds = [];
      const blocksForForm = []; // Add this for the form
      
      if (blocksData.blocks) {
        blocksData.blocks.forEach(block => {
          blocksMap[block.id] = block;
          companyBlockIds.push(block.id);
          // Add this for the form
          blocksForForm.push({
            properties: {
              id: block.id,
              block_name: block.block_name,
              variety: block.variety || 'Unknown',
            },
            geometry: block.geometry,
          });
        });
      }
      
      // Filter tasks to only show those from company blocks
      const companyTasks = allTasks.filter(task => 
        companyBlockIds.includes(task.block_id)
      );
      
      // Filter for open tasks only
      const openTasks = companyTasks.filter(task => task.status !== 'completed');
      setTasks(openTasks);
      setBlocks(blocksMap);
      setBlocksArray(blocksForForm); // Add this
      
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  // Add this function to handle task creation
  const handleTaskSubmit = async (newTaskData) => {
    try {
      await tasksService.createTask(newTaskData);
      // Reload tasks after creation
      await loadTasksAndBlocks();
    } catch (err) {
      console.error('Error creating task:', err);
      throw err; // Re-throw so the form can handle the error
    }
  };

  const handleCloseTask = (task) => {
    setTaskToClose(task);
    setCloseFormData({
      completion_date: new Date().toISOString().split('T')[0],
      completion_notes: ''
    });
    setShowCloseDialog(true);
  };

  const handleSubmitClose = async () => {
    if (!taskToClose) return;
    
    try {
      // Create update object with completion data
      const updateData = {
        status: 'completed',
        completion_date: closeFormData.completion_date
      };
      
      // Add completion notes to the description if provided
      if (closeFormData.completion_notes) {
        updateData.description = taskToClose.description 
          ? `${taskToClose.description}\n\nCompletion Notes: ${closeFormData.completion_notes}`
          : `Completion Notes: ${closeFormData.completion_notes}`;
      }
      
      await tasksService.updateTask(taskToClose.id, updateData);
      
      setShowCloseDialog(false);
      setTaskToClose(null);
      
      // Reload tasks
      loadTasksAndBlocks();
    } catch (err) {
      console.error('Error closing task:', err);
      alert('Failed to close task');
    }
  };

  const getPriorityClass = (priority) => {
    switch (priority) {
      case 'urgent':
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
        return 'low';
      default:
        return 'low';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NZ', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  return (
    <div className="tasks-page">
      <AppBar/>
      <div className="page-header">
        <h1>Tasks</h1>
        {/* Add the create task button */}
        <div className="header-buttons">
          <button
            className="create-task-button"
            onClick={() => setShowTaskForm(true)}
          >
            + New Task
          </button>
        </div>
      </div>

      <div className="tasks-content">
        {loading ? (
          <div className="loading-state">Loading tasks...</div>
        ) : error ? (
          <div className="error-state">{error}</div>
        ) : tasks.length === 0 ? (
          <div className="empty-state">
            <p>No open tasks</p>
            <button
              onClick={() => setShowTaskForm(true)}
              className="create-button"
            >
              Create Your First Task
            </button>
            <button onClick={() => navigate('/maps')} className="create-button secondary">
              Create from Map
            </button>
          </div>
        ) : (
          <div className="content-container">
            <div className="container-title">Open Tasks ({tasks.length})</div>
            <div className="task-list">
              {tasks.map(task => (
                <div key={task.id} className="task-item">
                  <div className="task-header">
                    <div className="task-title">{task.title}</div>
                  </div>
                  <div className='task-details'>
                    <div className="task-date">{task.due_date ? `Due: ${formatDate(task.due_date)}` : 'No due date'}</div>
                    <div className="task-block">Block: {blocks[task.block_id]?.block_name || `Block ${task.block_id}`}</div>
                    {task.description && (<div className="task-description">{task.description}</div>)}
                    <div className="task-meta">
                      <span className={`task-priority ${getPriorityClass(task.priority)}`}>{task.priority} priority</span>
                      <span className="task-type">{task.task_type}</span>
                    </div>
                  </div>
                    <button 
                        className="close-task-btn"
                        onClick={() => handleCloseTask(task)}
                      >
                        Close Task
                    </button>
  
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Close Task Dialog */}
      {showCloseDialog && taskToClose && (
        <div className="dialog-overlay">
          <div className="close-dialog">
            <h3>Close Task</h3>
            <div className="task-info">
              <p><strong>Task:</strong> {taskToClose.title}</p>
            </div>
            
            <div className="form-group">
              <label htmlFor="completion_date">Completion Date</label>
              <input
                type="date"
                id="completion_date"
                value={closeFormData.completion_date}
                onChange={(e) => setCloseFormData(prev => ({
                  ...prev,
                  completion_date: e.target.value
                }))}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="completion_notes">Additional Notes (Optional)</label>
              <textarea
                id="completion_notes"
                value={closeFormData.completion_notes}
                onChange={(e) => setCloseFormData(prev => ({
                  ...prev,
                  completion_notes: e.target.value
                }))}
                rows="3"
                placeholder="Add any completion notes..."
              />
            </div>
            
            <div className="dialog-actions">
              <button 
                className="cancel-button"
                onClick={() => {
                  setShowCloseDialog(false);
                  setTaskToClose(null);
                }}
              >
                Cancel
              </button>
              <button 
                className="submit-button"
                onClick={handleSubmitClose}
              >
                Mark as Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add the SlidingTaskForm */}
      <SlidingTaskForm
        isOpen={showTaskForm}
        onClose={() => setShowTaskForm(false)}
        blocks={blocksArray}
        users={users}
        currentLocation={currentLocation}
        user={user}
        onSubmit={handleTaskSubmit}
      />

      <MobileNavigation />

      <style jsx>{`
        .tasks-page {
          min-height: 100vh;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
        }

        .page-header {
          padding: 1rem;
          padding-top: 70px;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .page-header h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: #111827;
        }

        /* Add styles for the header buttons */
        .header-buttons { 
          display: flex; 
          align-items: center; 
          gap: 0.5rem; 
        }
        
        .create-task-button {
          background: #446145; 
          color: white; 
          border: none; 
          padding: 0.75rem 1rem;
          border-radius: 8px; 
          font-size: 0.875rem; 
          font-weight: 600; 
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .create-task-button:hover { 
          background: #374532; 
        }

        .tasks-content {
          flex: 1;
          padding: 1rem;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          padding-bottom: 80px;
        }

        .content-container {
          background: white;
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .container-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #f3f4f6;
        }
        .task-details {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 1rem;
          font-size: 0.85rem;
          color: #4b5563;
        }
        .task-details > div,
        .task-details > span {
          margin-bottom: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .task-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .task-item {
          padding: 1.3rem;
          border-radius: 8px;
          background-color: #f8fafc;
          border-left: 4px solid #e5e7eb;
          transition: all 0.2s;
        }

        .task-item:hover {
          background-color: #f1f5f9;
        }
          
        .task-details > div {
          margin-bottom: 8px;
        }
          
        .task-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .task-title {
          font-weight: 600;
          font-size: 1rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .close-task-btn {
          background: #446145;
          color: white;
          border: none;
          padding: 0.375rem 0.75rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          margin-left: auto; /* pushes it to the far right within the flex row */
        }

        .close-task-btn:hover {
          background: #388E3C;
        }

        .task-date {
          font-size: 0.75rem;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .task-block {
          font-size: 0.875rem;
          color: #4b5563;
          margin-bottom: 0.5rem;
        }

        .task-description {
          font-size: 0.875rem;
          margin-bottom: 0.75rem;
          color: #4b5563;
        }

        .task-meta {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .task-priority {
          display: inline-block;
          font-size: 0.75rem;
          padding: 0.15rem 0.5rem;
          border-radius: 999px;
          font-weight: 500;
        }

        .task-priority.high {
          background-color: #fee2e2;
          color: #dc2626;
        }

        .task-priority.medium {
          background-color: #fef3c7;
          color: #d97706;
        }

        .task-priority.low {
          background-color: #dbeafe;
          color: #2563eb;
        }

        .task-type {
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: capitalize;
        }

        .loading-state, .error-state, .empty-state {
          text-align: center;
          padding: 3rem;
          color: #6b7280;
        }

        .empty-state { 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          gap: 1rem; 
        }

        .create-button {
          background: #446145;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .create-button:hover {
          background: #374532;
        }

        .create-button.secondary { 
          background: #3b82f6; 
        }
        
        .create-button.secondary:hover { 
          background: #2563eb; 
        }

        /* Dialog styles */
        .dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          z-index: 1000;
        }

        .close-dialog {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }

        .close-dialog h3 {
          margin: 0 0 1rem;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .task-info {
          background: #f8fafc;
          padding: 0.75rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
          font-size: 0.875rem;
        }

        .form-group {
          margin-bottom: 1.25rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          font-size: 0.875rem;
          color: #374151;
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 1rem;
          transition: all 0.2s;
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .dialog-actions {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid #f3f4f6;
        }

        .cancel-button, .submit-button {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cancel-button {
          background-color: #f3f4f6;
          color: #4b5563;
        }

        .cancel-button:hover {
          background-color: #e5e7eb;
        }

        .submit-button {
          background-color: #446145;
          color: white;
        }

        .submit-button:hover {
          background-color: #388E3C;
        }

        @media (max-width: 768px) {
          .page-header { 
            flex-direction: column; 
            align-items: flex-start; 
            gap: 1rem; 
          }
          
          .header-buttons { 
            width: 100%; 
            justify-content: flex-start; 
          }
        }
      `}</style>
    </div>
  );
}

export default Tasks;