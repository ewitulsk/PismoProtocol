import React from 'react';

type NotificationType = 'success' | 'error' | 'info';

interface NotificationPopupProps {
  message: string;
  type: NotificationType;
  digest?: string;
  onClose: () => void;
}


const SUI_EXPLORER_BASE_URL = process.env.NEXT_PUBLIC_SUI_EXPLORER_BASE_URL; 

const NotificationPopup: React.FC<NotificationPopupProps> = ({
  message,
  type,
  digest,
  onClose,
}) => {
  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'info':
      default:
        return 'bg-blue-500';
    }
  };

  const getTextColor = () => {
    return 'text-white';
  };

  return (
    <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg max-w-sm z-50 ${getBackgroundColor()} ${getTextColor()}`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold">{message}</p>
          {digest && (
            <a
              href={`${SUI_EXPLORER_BASE_URL}${digest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm mt-1 underline hover:text-opacity-80 break-all"
            >
              View on Explorer: {digest.substring(0, 6)}...{digest.substring(digest.length - 4)}
            </a>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-4 text-lg font-bold leading-none hover:opacity-75"
          aria-label="Close notification"
        >
          &times;
        </button>
      </div>
    </div>
  );
};

export default NotificationPopup; 