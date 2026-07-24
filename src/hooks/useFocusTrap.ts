import { useEffect, useRef } from 'react'

export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    previousFocus.current = document.activeElement as HTMLElement
    
    // Focus the first focusable element in the container
    const container = containerRef.current
    if (container) {
      const focusable = container.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable) {
        setTimeout(() => focusable.focus(), 50)
      }
    }

    return () => {
      // Restore focus when trap deactivates
      if (previousFocus.current && previousFocus.current.focus) {
        previousFocus.current.focus()
      }
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const container = containerRef.current
      if (!container) return
      
      const focusableElements = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusableElements.length === 0) return
      
      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active])

  return containerRef
}
