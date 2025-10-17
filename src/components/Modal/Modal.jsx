import { useEffect } from 'react';
import './Modal.css';

/**
 * Modal Component
 * Accessible modal dialog with backdrop
 *
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Modal open state
 * @param {Function} props.onClose - Close handler
 * @param {React.ReactNode} props.children - Modal content
 * @param {string} [props.title] - Modal title
 * @param {string} [props.size='md'] - Modal size (sm, md, lg, xl, full)
 * @param {boolean} [props.closeOnBackdrop=true] - Close on backdrop click
 * @param {boolean} [props.closeOnEscape=true] - Close on Escape key
 * @param {boolean} [props.showCloseButton=true] - Show close button
 * @param {string} [props.emotion] - Emotion theme
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <Modal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Confirm Action"
 *   emotion="Joy"
 * >
 *   <p>Are you sure?</p>
 *   <Button onClick={handleConfirm}>Confirm</Button>
 * </Modal>
 */
export const Modal = ({
  isOpen,
  onClose,
  children,
  title,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
  emotion,
  className = '',
  ...props
}) => {
  // Handle Escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalClasses = [
    'modal__content',
    `modal__content--${size}`,
    emotion && `modal__content--emotion-${emotion.toLowerCase()}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className="modal" onClick={handleBackdropClick}>
      <div className="modal__backdrop" />

      <div className={modalClasses} role="dialog" aria-modal="true" {...props}>
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="modal__header">
            {title && <h2 className="modal__title">{title}</h2>}
            {showCloseButton && (
              <button
                className="modal__close"
                onClick={onClose}
                aria-label="Close modal"
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="modal__body">
          {children}
        </div>
      </div>
    </div>
  );
};

/**
 * ModalFooter Component
 * Pre-styled footer for modal actions
 */
export const ModalFooter = ({ children, className = '', ...props }) => (
  <div className={`modal__footer ${className}`} {...props}>
    {children}
  </div>
);

export default Modal;
