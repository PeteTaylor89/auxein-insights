// maps-v2/components/shared/StatusBar.jsx — Bottom status messages
export default function StatusBar({ message }) {
  if (!message) return null;
  return (
    <div className="v2-status-bar">
      {message}
    </div>
  );
}
