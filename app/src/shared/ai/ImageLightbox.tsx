import { useEffect, useCallback } from 'react'

interface ImageLightboxProps {
  src: string
  alt: string
  onClose: () => void
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      className="image-lightbox-overlay"
      onClick={onClose}
    >
      <div
        className="image-lightbox-content"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={src} alt={alt} className="image-lightbox-img" />
        <button
          type="button"
          className="image-lightbox-close"
          onClick={onClose}
          title="Close"
        >
          &times;
        </button>
      </div>

      <style>{`
        .image-lightbox-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }

        .image-lightbox-content {
          position: relative;
          max-width: 90vw;
          max-height: 90vh;
        }

        .image-lightbox-img {
          max-width: 100%;
          max-height: 85vh;
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }

        .image-lightbox-close {
          position: absolute;
          top: -12px;
          right: -12px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: white;
          color: #334155;
          font-size: 1.2rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .image-lightbox-close:hover {
          background: #f1f5f9;
        }
      `}</style>
    </div>
  )
}
