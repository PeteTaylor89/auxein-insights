// src/components/InstallPrompt.jsx
import { useState, useEffect } from 'react';

function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      // Show our custom install prompt
      setShowPrompt(true);
    });
  }, []);

  const handleInstallClick = () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      // Clear the saved prompt since it can't be used again
      setDeferredPrompt(null);
      setShowPrompt(false);
    });
  };

  if (!showPrompt) return null;

  return (
    <div className="install-prompt">
      <p>Install Vineyard Management for better experience</p>
      <div className="install-buttons">
        <button onClick={() => setShowPrompt(false)} className="cancel-button">
          Not now
        </button>
        <button onClick={handleInstallClick} className="install-button">
          Install
        </button>
      </div>
    </div>
  );
}

export default InstallPrompt;