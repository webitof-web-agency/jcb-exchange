'use client';

import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export type DropdownItem = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'danger' | 'warning' | 'success' | 'default';
  disabled?: boolean;
};

type PortalActionDropdownProps = {
  items: DropdownItem[];
  trigger?: ReactNode;
  align?: 'right' | 'left';
};

export default function PortalActionDropdown({
  items,
  trigger,
  align = 'right',
}: PortalActionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const calculatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = Math.min(items.length * 38 + 16, 280);

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    const top = openUp ? rect.top - dropdownHeight - 4 : rect.bottom + 4;

    if (align === 'right') {
      const right = Math.max(8, window.innerWidth - rect.right);
      setCoords({ top, right });
    } else {
      const left = Math.max(8, rect.left);
      setCoords({ top, left });
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen) {
      calculatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => calculatePosition();
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center justify-center rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none cursor-pointer"
      >
        {trigger || <MoreVertical className="h-5 w-5" />}
      </button>

      {isOpen &&
        coords &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              ...(coords.right !== undefined ? { right: `${coords.right}px` } : { left: `${coords.left}px` }),
            }}
            className="z-[99999] min-w-[170px] max-w-[240px] rounded-xl border border-gray-100 bg-white p-1.5 shadow-2xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item, idx) => {
              const variantClass =
                item.variant === 'danger'
                  ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                  : item.variant === 'warning'
                  ? 'text-amber-700 hover:bg-amber-50 hover:text-amber-800'
                  : item.variant === 'success'
                  ? 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950';

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                    item.onClick();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${variantClass}`}
                >
                  {item.icon && <span className="shrink-0">{item.icon}</span>}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
