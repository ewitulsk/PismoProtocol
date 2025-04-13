import React from 'react';

interface NotificationPopupProps {
  message: string;
  onClose: () => void;
  isVisible: boolean;
}

const NotificationPopup: React.FC<NotificationPopupProps> = ({ message, onClose, isVisible }) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-[#2a2a2a] p-6 rounded-lg shadow-xl text-white max-w-sm mx-auto text-center">
        <p className="mb-4">{message}</p>
        <button
          onClick={onClose}
          className="bg-[#1a1a1a] hover:bg-[#1e0a33] text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default NotificationPopup;
